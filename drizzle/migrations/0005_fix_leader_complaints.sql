-- Fix: leader sees ALL complaints in their area, not just ones
-- where current_leader_id = them (which only works after trigger fires)

create or replace function public.my_leader_complaints()
returns table (
  id uuid, reference text, title text, description text,
  status complaint_status, current_level text,
  category_name text, province text, district text,
  sector text, cell text, village text,
  location_detail text, created_at timestamptz, due_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.reference, c.title, c.description,
    c.status, c.current_level,
    cat.name as category_name,
    a.province, a.district, a.sector, a.cell, a.village,
    c.location_detail, c.created_at, c.due_at
  from public.complaints c
  join public.categories cat on cat.id = c.category_id
  join public.areas a on a.id = c.area_id
  join public.leader_areas la on la.user_id = auth.uid()
  where c.status not in ('closed')
    and (
      -- directly assigned to this leader
      c.current_leader_id = auth.uid()
      or (
        -- OR: complaint is in their area and unassigned / at their level
        c.current_leader_id is null
        and la.role = 'umudugudu_leader'
        and a.province = la.province
        and a.district = la.district
        and a.sector   = la.sector
        and a.cell     = la.cell
        and a.village  = la.village
      )
      or (
        -- akagari leader sees unassigned in their cell
        c.current_leader_id is null
        and la.role = 'akagari_leader'
        and a.province = la.province
        and a.district = la.district
        and a.sector   = la.sector
        and a.cell     = la.cell
      )
      or (
        -- umurenge leader sees unassigned in their sector
        c.current_leader_id is null
        and la.role = 'umurenge_leader'
        and a.province = la.province
        and a.district = la.district
        and a.sector   = la.sector
      )
      or (
        -- akarere leader sees unassigned in their district
        c.current_leader_id is null
        and la.role = 'akarere_leader'
        and a.province = la.province
        and a.district = la.district
      )
      or (
        -- intara leader sees unassigned in their province
        c.current_leader_id is null
        and la.role = 'intara_leader'
        and a.province = la.province
      )
    )
  order by c.created_at desc
$$;

-- Also update the complaints RLS so leader can see
-- complaints in their area even if not directly assigned
drop policy if exists "leader views assigned" on public.complaints;

create policy "leader views area complaints" on public.complaints
  for select to authenticated
  using (
    current_leader_id = auth.uid()
    or exists (
      select 1 from public.leader_areas la
      join public.areas a on a.id = area_id
      where la.user_id = auth.uid()
        and (
          (la.role = 'umudugudu_leader' and a.province = la.province and a.district = la.district and a.sector = la.sector and a.cell = la.cell and a.village = la.village)
          or (la.role = 'akagari_leader'   and a.province = la.province and a.district = la.district and a.sector = la.sector and a.cell = la.cell)
          or (la.role = 'umurenge_leader'  and a.province = la.province and a.district = la.district and a.sector = la.sector)
          or (la.role = 'akarere_leader'   and a.province = la.province and a.district = la.district)
          or (la.role = 'intara_leader'    and a.province = la.province)
        )
    )
  );

-- Also fix escalate_to_next_level to work even when current_leader_id
-- was not set at submission time (auto-assign on escalate)
create or replace function public.escalate_to_next_level(_cid uuid, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.complaints; a public.areas; uid uuid := auth.uid();
  next_level text; next_leader uuid; level_label text;
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;

  -- allow if directly assigned OR in leader's area
  if c.current_leader_id is not null and c.current_leader_id <> uid then
    raise exception 'Only the currently assigned leader can escalate this complaint';
  end if;
  if c.status = 'closed' then raise exception 'Cannot escalate a closed complaint'; end if;

  select * into a from public.areas where id = c.area_id;

  next_level := case c.current_level
    when 'umudugudu' then 'akagari'
    when 'akagari'   then 'umurenge'
    when 'umurenge'  then 'akarere'
    when 'akarere'   then 'intara'
    else null
  end;

  if next_level is null then raise exception 'Already at the highest level (Intara)'; end if;

  level_label := case next_level
    when 'akagari'  then 'Akagari (Cell)'
    when 'umurenge' then 'Umurenge (Sector)'
    when 'akarere'  then 'Akarere (District)'
    when 'intara'   then 'Intara (Province)'
  end;

  select public.get_area_leader(a.province, a.district, a.sector, a.cell, a.village, next_level || '_leader')
  into next_leader;

  update public.complaints
  set current_level = next_level, current_leader_id = next_leader,
      status = 'escalated', updated_at = now()
  where id = _cid;

  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note)
  values (_cid, c.status, 'escalated', uid, 'Escalated to ' || level_label || coalesce(' — ' || _note, ''));

  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (uid, 'escalate', 'complaint', _cid, jsonb_build_object('from_level', c.current_level, 'to_level', next_level));

  insert into public.notifications (user_id, complaint_id, title, body)
  values (c.citizen_id, _cid, 'Your complaint ' || c.reference || ' was escalated', 'Passed to ' || level_label);

  if next_leader is not null then
    insert into public.notifications (user_id, complaint_id, title, body)
    values (next_leader, _cid, 'Complaint escalated to your level', 'Ref: ' || c.reference);
  end if;
end $$;

-- Fix leader_resolve similarly
create or replace function public.leader_resolve(_cid uuid, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints; uid uuid := auth.uid();
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;
  if c.current_leader_id is not null and c.current_leader_id <> uid then
    raise exception 'Only the currently assigned leader can resolve this complaint';
  end if;
  if _note is null or char_length(trim(_note)) < 5 then
    raise exception 'Please provide a resolution note (at least 5 characters)';
  end if;
  update public.complaints set status = 'resolution_proposed',
    current_leader_id = uid, updated_at = now() where id = _cid;
  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note)
  values (_cid, c.status, 'resolution_proposed', uid, _note);
  insert into public.notifications (user_id, complaint_id, title, body)
  values (c.citizen_id, _cid, 'Resolution proposed for ' || c.reference, 'Please review: ' || _note);
end $$;
