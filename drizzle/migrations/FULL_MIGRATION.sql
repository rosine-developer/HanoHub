-- ============================================================
-- HanoHub FULL MIGRATION — Run this once in Supabase SQL Editor
-- supabase.com/dashboard/project/inqgwvjlgwvgbmabhkcu/sql
-- ============================================================

-- MIGRATION 0000: Core schema
create type public.app_role as enum ('citizen','officer','supervisor','admin');
create type public.complaint_status as enum ('submitted','under_review','awaiting_information','in_progress','resolution_proposed','under_resolution_review','challenged','reopened','escalated','closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  area_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  province text not null, district text not null, sector text not null,
  cell text not null default '', village text not null default '',
  created_at timestamptz not null default now(),
  unique (province, district, sector, cell, village)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, description text, active boolean not null default true,
  created_at timestamptz not null default now()
);
create sequence public.complaint_ref_seq;
create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('HH-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.complaint_ref_seq')::text, 6, '0')),
  citizen_id uuid not null,
  category_id uuid not null references public.categories(id),
  area_id uuid not null references public.areas(id),
  title text not null check (char_length(title) between 5 and 150),
  description text not null check (char_length(description) between 10 and 4000),
  location_detail text,
  status complaint_status not null default 'submitted',
  assigned_officer_id uuid,
  current_level text not null default 'umudugudu' check (current_level in ('umudugudu','akagari','umurenge','akarere','intara')),
  current_leader_id uuid references auth.users(id) on delete set null,
  due_at timestamptz default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  from_status complaint_status, to_status complaint_status not null,
  actor_id uuid, note text,
  created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  author_id uuid not null, body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  uploaded_by uuid not null,
  kind text not null default 'citizen_evidence' check (kind in ('citizen_evidence','official_document','decision','resolution_evidence')),
  file_path text not null, file_name text not null, mime_type text, size_bytes int,
  version int not null default 1,
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, complaint_id uuid references public.complaints(id) on delete cascade,
  title text not null, body text, read boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid, action text not null, entity text not null, entity_id uuid, details jsonb,
  created_at timestamptz not null default now()
);
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  citizen_id uuid not null,
  reason text not null check (char_length(reason) between 10 and 2000),
  reviewer_id uuid,
  review_decision text check (review_decision in ('upheld','overruled')),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.leader_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  province text not null default '',
  district text not null default '',
  sector   text not null default '',
  cell     text not null default '',
  village  text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- GRANTS
grant select, insert, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.areas, public.categories to anon, authenticated;
grant insert, update, delete on public.areas, public.categories to authenticated;
grant select, insert, update on public.complaints to authenticated;
grant select on public.status_history to authenticated;
grant select, insert on public.messages, public.evidence to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.audit_logs to authenticated;
grant select, insert on public.challenges to authenticated;
grant update on public.challenges to authenticated;
grant select on public.leader_areas to authenticated;
grant insert, update, delete on public.leader_areas to authenticated;
grant usage on sequence public.complaint_ref_seq to authenticated;
grant all on all tables in schema public to service_role;

-- RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.areas enable row level security;
alter table public.categories enable row level security;
alter table public.complaints enable row level security;
alter table public.status_history enable row level security;
alter table public.messages enable row level security;
alter table public.evidence enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.challenges enable row level security;
alter table public.leader_areas enable row level security;

-- HELPER FUNCTIONS
create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create or replace function public.is_staff(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('officer','supervisor','admin')) $$;

create or replace function public.can_view_complaint(_cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.complaints c where c.id = _cid
    and (c.citizen_id = auth.uid() or public.is_staff(auth.uid()) or c.current_leader_id = auth.uid())) $$;

-- RLS POLICIES
create policy "own or staff profiles" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own roles or admin" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "read areas" on public.areas for select using (true);
create policy "admin areas" on public.areas for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "read categories" on public.categories for select using (true);
create policy "admin categories" on public.categories for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "view complaints" on public.complaints for select to authenticated using (citizen_id = auth.uid() or public.is_staff(auth.uid()) or current_leader_id = auth.uid());
create policy "citizen creates" on public.complaints for insert to authenticated with check (citizen_id = auth.uid() and status = 'submitted' and assigned_officer_id is null);
create policy "view history" on public.status_history for select to authenticated using (public.can_view_complaint(complaint_id));
create policy "view messages" on public.messages for select to authenticated using (public.can_view_complaint(complaint_id));
create policy "post messages" on public.messages for insert to authenticated with check (author_id = auth.uid() and public.can_view_complaint(complaint_id));
create policy "view evidence" on public.evidence for select to authenticated using (public.can_view_complaint(complaint_id));
create policy "add evidence" on public.evidence for insert to authenticated with check (uploaded_by = auth.uid() and public.can_view_complaint(complaint_id) and (kind = 'citizen_evidence' or public.is_staff(auth.uid())));
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "mark read" on public.notifications for update to authenticated using (user_id = auth.uid());
create policy "admin audit" on public.audit_logs for select to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor'));
create policy "view challenges" on public.challenges for select to authenticated using (citizen_id = auth.uid() or public.is_staff(auth.uid()));
create policy "citizen creates challenge" on public.challenges for insert to authenticated with check (citizen_id = auth.uid() and exists (select 1 from public.complaints c where c.id = complaint_id and c.citizen_id = auth.uid() and c.status in ('resolution_proposed','closed')));
create policy "supervisor updates challenge" on public.challenges for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "admin manages leader_areas" on public.leader_areas for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "leader views own area" on public.leader_areas for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));

-- TRIGGERS
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  insert into public.user_roles (user_id, role) values (new.id, 'citizen');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.on_complaint_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.status_history (complaint_id, to_status, actor_id, note) values (new.id, new.status, new.citizen_id, 'Complaint submitted');
  insert into public.audit_logs (actor_id, action, entity, entity_id) values (new.citizen_id, 'create', 'complaint', new.id);
  insert into public.notifications (user_id, complaint_id, title, body) values (new.citizen_id, new.id, 'Report received', 'Your report ' || new.reference || ' was submitted.');
  return new;
end $$;
create trigger complaint_created after insert on public.complaints for each row execute function public.on_complaint_created();

create or replace function public.evidence_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select coalesce(max(version),0)+1 into new.version from public.evidence where complaint_id = new.complaint_id and file_name = new.file_name;
  return new;
end $$;
create trigger evidence_version before insert on public.evidence for each row execute function public.evidence_version();

-- LEADER ROLES (add to enum)
alter type public.app_role add value if not exists 'umudugudu_leader';
alter type public.app_role add value if not exists 'akagari_leader';
alter type public.app_role add value if not exists 'umurenge_leader';
alter type public.app_role add value if not exists 'akarere_leader';
alter type public.app_role add value if not exists 'intara_leader';

-- WORKFLOW FUNCTIONS
create or replace function public.transition_complaint(_cid uuid, _to complaint_status, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints; uid uuid := auth.uid(); ok boolean := false; is_off boolean; is_sup boolean;
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;
  if _note is not null and char_length(_note) > 2000 then raise exception 'Note too long'; end if;
  is_off := public.has_role(uid,'officer');
  is_sup := public.has_role(uid,'supervisor') or public.has_role(uid,'admin');
  if is_off and (c.assigned_officer_id = uid or c.assigned_officer_id is null) then
    ok := (c.status, _to) in (('submitted','under_review'),('under_review','in_progress'),('under_review','awaiting_information'),('under_review','escalated'),('awaiting_information','under_review'),('awaiting_information','in_progress'),('in_progress','awaiting_information'),('in_progress','resolution_proposed'),('in_progress','escalated'),('reopened','in_progress'),('reopened','escalated'));
  end if;
  if not ok and is_sup then
    ok := (c.status, _to) in (('under_resolution_review','closed'),('under_resolution_review','reopened'),('challenged','reopened'),('challenged','under_resolution_review'),('escalated','in_progress'),('escalated','reopened'),('escalated','closed'));
  end if;
  if not ok and c.citizen_id = uid then
    ok := (c.status, _to) in (('resolution_proposed','under_resolution_review'));
  end if;
  if not ok then raise exception 'This action is not allowed for your role or the current status'; end if;
  update public.complaints set status = _to, updated_at = now(), assigned_officer_id = case when is_off and assigned_officer_id is null then uid else assigned_officer_id end where id = _cid;
  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note) values (_cid, c.status, _to, uid, _note);
  insert into public.audit_logs (actor_id, action, entity, entity_id, details) values (uid, 'status_change', 'complaint', _cid, jsonb_build_object('from', c.status, 'to', _to));
  if uid <> c.citizen_id then
    insert into public.notifications (user_id, complaint_id, title, body) values (c.citizen_id, _cid, 'Case ' || c.reference || ' updated', 'Status changed to ' || replace(_to::text,'_',' ') || coalesce(': ' || _note, ''));
  end if;
end $$;

create or replace function public.assign_complaint(_cid uuid, _officer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints; uid uuid := auth.uid();
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;
  if not public.has_role(_officer,'officer') then raise exception 'User is not an officer'; end if;
  if not (public.has_role(uid,'supervisor') or public.has_role(uid,'admin') or (public.has_role(uid,'officer') and _officer = uid and c.assigned_officer_id is null)) then raise exception 'Not allowed to assign this case'; end if;
  update public.complaints set assigned_officer_id = _officer, updated_at = now() where id = _cid;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details) values (uid, 'assign', 'complaint', _cid, jsonb_build_object('officer', _officer));
  insert into public.notifications (user_id, complaint_id, title, body) values (_officer, _cid, 'Case assigned', 'You were assigned case ' || c.reference);
end $$;

create or replace function public.list_officers()
returns table (id uuid, full_name text) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name from public.profiles p join public.user_roles r on r.user_id = p.id and r.role = 'officer' where public.is_staff(auth.uid()) order by p.full_name $$;

create or replace function public.submit_challenge(_cid uuid, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.complaints; uid uuid := auth.uid(); chid uuid;
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;
  if c.citizen_id <> uid then raise exception 'Not your complaint'; end if;
  if c.status not in ('resolution_proposed','closed') then raise exception 'You can only challenge a proposed or closed resolution'; end if;
  if _reason is null or char_length(_reason) < 10 then raise exception 'Please provide a detailed reason (at least 10 characters)'; end if;
  insert into public.challenges (complaint_id, citizen_id, reason) values (_cid, uid, _reason) returning id into chid;
  update public.complaints set status = 'challenged', updated_at = now() where id = _cid;
  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note) values (_cid, c.status, 'challenged', uid, 'Citizen submitted a challenge: ' || left(_reason, 200));
  insert into public.audit_logs (actor_id, action, entity, entity_id, details) values (uid, 'challenge', 'complaint', _cid, jsonb_build_object('challenge_id', chid));
  insert into public.notifications (user_id, complaint_id, title, body) select ur.user_id, _cid, 'Challenge submitted on ' || c.reference, 'A citizen has challenged the resolution.' from public.user_roles ur where ur.role in ('supervisor','admin');
  return chid;
end $$;

create or replace function public.review_challenge(_challenge_id uuid, _decision text, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare ch public.challenges; c public.complaints; uid uuid := auth.uid(); new_status complaint_status;
begin
  if not (public.has_role(uid,'supervisor') or public.has_role(uid,'admin')) then raise exception 'Only supervisors or admins can review challenges'; end if;
  if _decision not in ('upheld','overruled') then raise exception 'Decision must be upheld or overruled'; end if;
  select * into ch from public.challenges where id = _challenge_id for update;
  if not found then raise exception 'Challenge not found'; end if;
  if ch.review_decision is not null then raise exception 'Challenge already reviewed'; end if;
  select * into c from public.complaints where id = ch.complaint_id;
  new_status := case when _decision = 'upheld' then 'reopened'::complaint_status else 'closed'::complaint_status end;
  update public.challenges set reviewer_id = uid, review_decision = _decision, review_note = _note, reviewed_at = now() where id = _challenge_id;
  update public.complaints set status = new_status, updated_at = now() where id = ch.complaint_id;
  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note) values (ch.complaint_id, 'challenged', new_status, uid, 'Challenge ' || _decision || coalesce(': ' || _note, ''));
  insert into public.notifications (user_id, complaint_id, title, body) values (c.citizen_id, c.id, 'Your challenge on ' || c.reference || ' was reviewed', 'Decision: ' || _decision || coalesce(' — ' || _note, ''));
end $$;

create or replace function public.list_users()
returns table (id uuid, email text, full_name text, phone text, roles app_role[], created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select au.id, au.email, coalesce(p.full_name,'') as full_name, p.phone,
    coalesce(array_agg(ur.role order by ur.role) filter (where ur.role is not null), '{}') as roles, au.created_at
  from auth.users au left join public.profiles p on p.id = au.id left join public.user_roles ur on ur.user_id = au.id
  group by au.id, au.email, p.full_name, p.phone, au.created_at order by au.created_at desc $$;

create or replace function public.set_user_role(_user_id uuid, _role app_role, _grant boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _grant then insert into public.user_roles (user_id, role) values (_user_id, _role) on conflict (user_id, role) do nothing;
  else delete from public.user_roles where user_id = _user_id and role = _role;
    insert into public.user_roles (user_id, role) values (_user_id, 'citizen') on conflict (user_id, role) do nothing;
  end if;
end $$;

create or replace function public.complaint_stats() returns table (status complaint_status, count bigint)
language sql stable security definer set search_path = public as $$ select status, count(*) from public.complaints group by status order by count desc $$;

create or replace function public.complaints_by_category() returns table (name text, count bigint)
language sql stable security definer set search_path = public as $$
  select cat.name, count(c.id) from public.categories cat left join public.complaints c on c.category_id = cat.id group by cat.name order by count desc $$;

create or replace function public.complaints_over_time() returns table (month text, count bigint)
language sql stable security definer set search_path = public as $$
  select to_char(date_trunc('month', created_at),'Mon YYYY') as month, count(*) from public.complaints group by date_trunc('month', created_at) order by date_trunc('month', created_at) $$;

create or replace function public.get_area_leader(_province text, _district text, _sector text, _cell text, _village text, _level text) returns uuid
language sql stable security definer set search_path = public as $$
  select la.user_id from public.leader_areas la
  where (la.role = _level::app_role)
    and ((_level = 'intara_leader' and la.province = _province)
      or (_level = 'akarere_leader' and la.province = _province and la.district = _district)
      or (_level = 'umurenge_leader' and la.province = _province and la.district = _district and la.sector = _sector)
      or (_level = 'akagari_leader' and la.province = _province and la.district = _district and la.sector = _sector and la.cell = _cell)
      or (_level = 'umudugudu_leader' and la.province = _province and la.district = _district and la.sector = _sector and la.cell = _cell and la.village = _village))
  limit 1 $$;

create or replace function public.auto_assign_leader() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.areas; leader_id uuid;
begin
  select * into a from public.areas where id = new.area_id;
  if not found then return new; end if;
  select public.get_area_leader(a.province, a.district, a.sector, a.cell, a.village, 'umudugudu_leader') into leader_id;
  if leader_id is not null then
    new.current_leader_id := leader_id;
    new.current_level := 'umudugudu';
    insert into public.notifications (user_id, complaint_id, title, body) values (leader_id, new.id, 'New complaint in your Umudugudu', 'Ref: ' || new.reference || ' — ' || new.title);
  end if;
  return new;
end $$;
create trigger auto_assign_leader before insert on public.complaints for each row execute function public.auto_assign_leader();

create or replace function public.escalate_to_next_level(_cid uuid, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints; a public.areas; uid uuid := auth.uid(); next_level text; next_leader uuid; level_label text;
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;
  if c.current_leader_id <> uid then raise exception 'Only the currently assigned leader can escalate this complaint'; end if;
  if c.status = 'closed' then raise exception 'Cannot escalate a closed complaint'; end if;
  select * into a from public.areas where id = c.area_id;
  next_level := case c.current_level when 'umudugudu' then 'akagari' when 'akagari' then 'umurenge' when 'umurenge' then 'akarere' when 'akarere' then 'intara' else null end;
  if next_level is null then raise exception 'Already at the highest level (Intara)'; end if;
  level_label := case next_level when 'akagari' then 'Akagari (Cell)' when 'umurenge' then 'Umurenge (Sector)' when 'akarere' then 'Akarere (District)' when 'intara' then 'Intara (Province)' end;
  select public.get_area_leader(a.province, a.district, a.sector, a.cell, a.village, next_level || '_leader') into next_leader;
  update public.complaints set current_level = next_level, current_leader_id = next_leader, status = 'escalated', updated_at = now() where id = _cid;
  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note) values (_cid, c.status, 'escalated', uid, 'Escalated to ' || level_label || coalesce(' — ' || _note, ''));
  insert into public.notifications (user_id, complaint_id, title, body) values (c.citizen_id, _cid, 'Your complaint ' || c.reference || ' was escalated', 'Passed to ' || level_label);
  if next_leader is not null then insert into public.notifications (user_id, complaint_id, title, body) values (next_leader, _cid, 'Complaint escalated to your level', 'Ref: ' || c.reference); end if;
end $$;

create or replace function public.leader_resolve(_cid uuid, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints; uid uuid := auth.uid();
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;
  if c.current_leader_id <> uid then raise exception 'Only the currently assigned leader can resolve this complaint'; end if;
  if _note is null or char_length(trim(_note)) < 5 then raise exception 'Please provide a resolution note (at least 5 characters)'; end if;
  update public.complaints set status = 'resolution_proposed', updated_at = now() where id = _cid;
  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note) values (_cid, c.status, 'resolution_proposed', uid, _note);
  insert into public.notifications (user_id, complaint_id, title, body) values (c.citizen_id, _cid, 'Resolution proposed for ' || c.reference, 'Please review: ' || _note);
end $$;

create or replace function public.my_leader_complaints()
returns table (id uuid, reference text, title text, description text, status complaint_status, current_level text, category_name text, province text, district text, sector text, cell text, village text, location_detail text, created_at timestamptz, due_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.reference, c.title, c.description, c.status, c.current_level, cat.name, a.province, a.district, a.sector, a.cell, a.village, c.location_detail, c.created_at, c.due_at
  from public.complaints c join public.categories cat on cat.id = c.category_id join public.areas a on a.id = c.area_id
  where c.current_leader_id = auth.uid() and c.status not in ('closed') order by c.created_at desc $$;

create or replace function public.assign_leader_area(_user_id uuid, _role app_role, _province text default '', _district text default '', _sector text default '', _cell text default '', _village text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Only admins can assign leader areas'; end if;
  insert into public.leader_areas (user_id, role, province, district, sector, cell, village) values (_user_id, _role, _province, _district, _sector, _cell, _village)
  on conflict (user_id, role) do update set province = _province, district = _district, sector = _sector, cell = _cell, village = _village;
end $$;

create or replace function public.my_leader_area()
returns table (role app_role, province text, district text, sector text, cell text, village text)
language sql stable security definer set search_path = public as $$
  select role, province, district, sector, cell, village from public.leader_areas where user_id = auth.uid() $$;

-- GRANT all RPCs
grant execute on function public.transition_complaint(uuid, complaint_status, text) to authenticated;
grant execute on function public.assign_complaint(uuid, uuid) to authenticated;
grant execute on function public.list_officers() to authenticated;
grant execute on function public.submit_challenge(uuid, text) to authenticated;
grant execute on function public.review_challenge(uuid, text, text) to authenticated;
grant execute on function public.list_users() to authenticated;
grant execute on function public.set_user_role(uuid, app_role, boolean) to authenticated;
grant execute on function public.complaint_stats() to authenticated;
grant execute on function public.complaints_by_category() to authenticated;
grant execute on function public.complaints_over_time() to authenticated;
grant execute on function public.escalate_to_next_level(uuid, text) to authenticated;
grant execute on function public.leader_resolve(uuid, text) to authenticated;
grant execute on function public.my_leader_complaints() to authenticated;
grant execute on function public.assign_leader_area(uuid, app_role, text, text, text, text, text) to authenticated;
grant execute on function public.my_leader_area() to authenticated;

-- SEED DATA
insert into public.categories (name, description) values
  ('Roads & Infrastructure','Damaged roads, bridges, drainage'),
  ('Water Supply','Water shortages, broken pipes'),
  ('Waste Management','Uncollected waste, illegal dumping'),
  ('Street Lighting','Broken or missing streetlights'),
  ('Electricity','Power outages, unsafe lines'),
  ('Public Services','Delays or poor service at public offices');

insert into public.areas (province, district, sector, cell, village) values
  ('Kigali City','Gasabo','Kimironko','Bibare','Gisimenti'),
  ('Kigali City','Gasabo','Kimironko','Bibare','Nyagasambu'),
  ('Kigali City','Gasabo','Kimironko','Kibagabaga','Kabeza'),
  ('Kigali City','Gasabo','Remera','Rukiri I','Amahoro'),
  ('Kigali City','Gasabo','Remera','Rukiri I','Kacyiru'),
  ('Kigali City','Kicukiro','Niboye','Gahanga','Rugarama'),
  ('Kigali City','Nyarugenge','Nyamirambo','Fatima','Agaciro'),
  ('Southern Province','Huye','Ngoma','Butare','Kabutare'),
  ('Northern Province','Musanze','Muhoza','Cyabararika','Rukundo'),
  ('Eastern Province','Rwamagana','Kigabiro','Gahengeri','Umucyo'),
  ('Western Province','Rubavu','Gisenyi','Amahoro','Inzira')
on conflict do nothing;

-- STORAGE: create evidence bucket (run separately if this fails)
insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false) on conflict do nothing;
create policy "upload evidence" on storage.objects for insert to authenticated with check (bucket_id = 'evidence' and public.can_view_complaint(((storage.foldername(name))[1])::uuid));
create policy "read evidence" on storage.objects for select to authenticated using (bucket_id = 'evidence' and public.can_view_complaint(((storage.foldername(name))[1])::uuid));
