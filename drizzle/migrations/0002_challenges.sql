-- Challenges: citizen formally disputes a proposed or closed resolution
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  citizen_id uuid not null,
  reason text not null check (char_length(reason) between 10 and 2000),
  -- supervisor review outcome
  reviewer_id uuid,
  review_decision text check (review_decision in ('upheld','overruled')),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;
grant select, insert on public.challenges to authenticated;
grant update on public.challenges to authenticated;

-- Citizens can see their own; staff can see all
create policy "view challenges" on public.challenges for select to authenticated
  using (citizen_id = auth.uid() or public.is_staff(auth.uid()));

-- Only the complaint owner can create a challenge when status is 'resolution_proposed' or 'closed'
create policy "citizen creates challenge" on public.challenges for insert to authenticated
  with check (
    citizen_id = auth.uid()
    and exists (
      select 1 from public.complaints c
      where c.id = complaint_id
        and c.citizen_id = auth.uid()
        and c.status in ('resolution_proposed', 'closed')
    )
  );

-- Supervisors/admins can update (to record review decision)
create policy "supervisor updates challenge" on public.challenges for update to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- Add transition: citizen challenges → sets complaint status to 'challenged'
create or replace function public.submit_challenge(_cid uuid, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.complaints;
  uid uuid := auth.uid();
  chid uuid;
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;
  if c.citizen_id <> uid then raise exception 'Not your complaint'; end if;
  if c.status not in ('resolution_proposed', 'closed') then
    raise exception 'You can only challenge a proposed or closed resolution';
  end if;
  if _reason is null or char_length(_reason) < 10 then
    raise exception 'Please provide a detailed reason (at least 10 characters)';
  end if;

  insert into public.challenges (complaint_id, citizen_id, reason)
  values (_cid, uid, _reason)
  returning id into chid;

  update public.complaints set status = 'challenged', updated_at = now() where id = _cid;

  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note)
  values (_cid, c.status, 'challenged', uid, 'Citizen submitted a challenge: ' || left(_reason, 200));

  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (uid, 'challenge', 'complaint', _cid, jsonb_build_object('challenge_id', chid));

  -- notify staff
  insert into public.notifications (user_id, complaint_id, title, body)
  select ur.user_id, _cid, 'Challenge submitted on ' || c.reference,
         'A citizen has challenged the resolution. Please review.'
  from public.user_roles ur
  where ur.role in ('supervisor', 'admin');

  return chid;
end $$;

-- Supervisor reviews a challenge
create or replace function public.review_challenge(
  _challenge_id uuid,
  _decision text,   -- 'upheld' or 'overruled'
  _note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  ch public.challenges;
  c public.complaints;
  uid uuid := auth.uid();
  new_status complaint_status;
begin
  if not (public.has_role(uid, 'supervisor') or public.has_role(uid, 'admin')) then
    raise exception 'Only supervisors or admins can review challenges';
  end if;
  if _decision not in ('upheld', 'overruled') then
    raise exception 'Decision must be upheld or overruled';
  end if;

  select * into ch from public.challenges where id = _challenge_id for update;
  if not found then raise exception 'Challenge not found'; end if;
  if ch.review_decision is not null then raise exception 'Challenge already reviewed'; end if;

  select * into c from public.complaints where id = ch.complaint_id;

  -- upheld → reopen the complaint; overruled → close it
  new_status := case when _decision = 'upheld' then 'reopened'::complaint_status else 'closed'::complaint_status end;

  update public.challenges
  set reviewer_id = uid, review_decision = _decision, review_note = _note, reviewed_at = now()
  where id = _challenge_id;

  update public.complaints set status = new_status, updated_at = now() where id = ch.complaint_id;

  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note)
  values (ch.complaint_id, 'challenged', new_status, uid,
          'Challenge ' || _decision || coalesce(': ' || _note, ''));

  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (uid, 'challenge_review', 'complaint', ch.complaint_id,
          jsonb_build_object('decision', _decision, 'challenge_id', _challenge_id));

  insert into public.notifications (user_id, complaint_id, title, body)
  values (c.citizen_id, c.id, 'Your challenge on ' || c.reference || ' was reviewed',
          'Decision: ' || _decision || coalesce(' — ' || _note, ''));
end $$;

revoke execute on function public.submit_challenge(uuid, text) from public, anon;
revoke execute on function public.review_challenge(uuid, text, text) from public, anon;
grant execute on function public.submit_challenge(uuid, text) to authenticated;
grant execute on function public.review_challenge(uuid, text, text) to authenticated;

-- Admin helper: list all users with profile + roles
create or replace function public.list_users()
returns table (
  id uuid, email text, full_name text, phone text,
  roles app_role[], created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    au.id,
    au.email,
    coalesce(p.full_name, '') as full_name,
    p.phone,
    coalesce(array_agg(ur.role order by ur.role) filter (where ur.role is not null), '{}') as roles,
    au.created_at
  from auth.users au
  left join public.profiles p on p.id = au.id
  left join public.user_roles ur on ur.user_id = au.id
  group by au.id, au.email, p.full_name, p.phone, au.created_at
  order by au.created_at desc
$$;

-- Admin: set a role for a user (upsert)
create or replace function public.set_user_role(_user_id uuid, _role app_role, _grant boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only admins can manage roles';
  end if;
  if _grant then
    insert into public.user_roles (user_id, role) values (_user_id, _role)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = _user_id and role = _role;
    -- always keep citizen role
    insert into public.user_roles (user_id, role) values (_user_id, 'citizen')
    on conflict (user_id, role) do nothing;
  end if;
end $$;

revoke execute on function public.list_users() from public, anon;
revoke execute on function public.set_user_role(uuid, app_role, boolean) from public, anon;
grant execute on function public.list_users() to authenticated;
grant execute on function public.set_user_role(uuid, app_role, boolean) to authenticated;

-- Stats function for the analytics dashboard
create or replace function public.complaint_stats()
returns table (
  status complaint_status,
  count bigint
)
language sql stable security definer set search_path = public as $$
  select status, count(*) from public.complaints group by status order by count desc
$$;

create or replace function public.complaints_by_category()
returns table (name text, count bigint)
language sql stable security definer set search_path = public as $$
  select cat.name, count(c.id) from public.categories cat
  left join public.complaints c on c.category_id = cat.id
  group by cat.name order by count desc
$$;

create or replace function public.complaints_over_time()
returns table (month text, count bigint)
language sql stable security definer set search_path = public as $$
  select to_char(date_trunc('month', created_at), 'Mon YYYY') as month, count(*)
  from public.complaints
  group by date_trunc('month', created_at)
  order by date_trunc('month', created_at)
$$;

revoke execute on function public.complaint_stats() from public, anon;
revoke execute on function public.complaints_by_category() from public, anon;
revoke execute on function public.complaints_over_time() from public, anon;
grant execute on function public.complaint_stats() to authenticated;
grant execute on function public.complaints_by_category() to authenticated;
grant execute on function public.complaints_over_time() to authenticated;
