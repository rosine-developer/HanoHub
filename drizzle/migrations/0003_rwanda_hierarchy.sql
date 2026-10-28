-- ============================================================
-- Rwanda Administrative Hierarchy
-- Intara (Province) → Akarere (District) → Umurenge (Sector)
--   → Akagari (Cell) → Umudugudu (Village)
-- ============================================================

-- 1. Extend the areas table with cell and village
alter table public.areas add column if not exists cell text not null default '';
alter table public.areas add column if not exists village text not null default '';

-- Drop old unique constraint and add new one covering all 5 levels
alter table public.areas drop constraint if exists areas_province_district_sector_key;
alter table public.areas add constraint areas_unique_full
  unique (province, district, sector, cell, village);

-- 2. Add new leader roles to the app_role enum
-- (Postgres requires adding enum values one at a time)
alter type public.app_role add value if not exists 'umudugudu_leader';
alter type public.app_role add value if not exists 'akagari_leader';
alter type public.app_role add value if not exists 'umurenge_leader';
alter type public.app_role add value if not exists 'akarere_leader';
alter type public.app_role add value if not exists 'intara_leader';

-- 3. Leader area assignments
-- Each leader is assigned to ONE area at ONE level
create table if not exists public.leader_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  -- which area they are responsible for (all columns at their level must match)
  province text not null default '',
  district text not null default '',
  sector   text not null default '',
  cell     text not null default '',
  village  text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.leader_areas enable row level security;
grant select on public.leader_areas to authenticated;
grant insert, update, delete on public.leader_areas to authenticated;

create policy "admin manages leader_areas" on public.leader_areas
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "leader views own area" on public.leader_areas
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

-- 4. Update complaints table: track current responsible level
alter table public.complaints add column if not exists
  current_level text not null default 'umudugudu'
  check (current_level in ('umudugudu','akagari','umurenge','akarere','intara'));

alter table public.complaints add column if not exists
  current_leader_id uuid references auth.users(id) on delete set null;

-- 5. Helper: get the leader for a given area at a given level
create or replace function public.get_area_leader(
  _province text, _district text, _sector text, _cell text, _village text,
  _level text
) returns uuid
language sql stable security definer set search_path = public as $$
  select la.user_id
  from public.leader_areas la
  where la.role = _level::app_role
    and (_level = 'intara'    and la.province = _province)
     or (_level = 'akarere'   and la.province = _province and la.district = _district)
     or (_level = 'umurenge'  and la.province = _province and la.district = _district and la.sector = _sector)
     or (_level = 'akagari'   and la.province = _province and la.district = _district and la.sector = _sector and la.cell = _cell)
     or (_level = 'umudugudu' and la.province = _province and la.district = _district and la.sector = _sector and la.cell = _cell and la.village = _village)
  limit 1
$$;

-- 6. Auto-assign complaint to umudugudu leader on creation
create or replace function public.auto_assign_leader() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a public.areas;
  leader_id uuid;
begin
  select * into a from public.areas where id = new.area_id;
  if not found then return new; end if;

  -- find umudugudu leader for this village
  select public.get_area_leader(a.province, a.district, a.sector, a.cell, a.village, 'umudugudu_leader')
  into leader_id;

  if leader_id is not null then
    new.current_leader_id := leader_id;
    new.current_level := 'umudugudu';
    -- notify the leader
    insert into public.notifications (user_id, complaint_id, title, body)
    values (leader_id, new.id,
            'New complaint in your Umudugudu',
            'Ref: ' || new.reference || ' — ' || new.title);
  end if;
  return new;
end $$;

drop trigger if exists auto_assign_leader on public.complaints;
create trigger auto_assign_leader
  before insert on public.complaints
  for each row execute function public.auto_assign_leader();

-- 7. Escalation function: leader passes complaint to next level
create or replace function public.escalate_to_next_level(_cid uuid, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.complaints;
  a public.areas;
  uid uuid := auth.uid();
  next_level text;
  next_leader uuid;
  level_label text;
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;

  -- only the current assigned leader can escalate
  if c.current_leader_id <> uid then
    raise exception 'Only the currently assigned leader can escalate this complaint';
  end if;

  if c.status = 'closed' then
    raise exception 'Cannot escalate a closed complaint';
  end if;

  select * into a from public.areas where id = c.area_id;

  -- determine next level
  next_level := case c.current_level
    when 'umudugudu' then 'akagari'
    when 'akagari'   then 'umurenge'
    when 'umurenge'  then 'akarere'
    when 'akarere'   then 'intara'
    else null
  end;

  if next_level is null then
    raise exception 'This complaint is already at the highest level (Intara)';
  end if;

  level_label := case next_level
    when 'akagari'   then 'Akagari (Cell)'
    when 'umurenge'  then 'Umurenge (Sector)'
    when 'akarere'   then 'Akarere (District)'
    when 'intara'    then 'Intara (Province)'
  end;

  -- find the leader at the next level
  select public.get_area_leader(a.province, a.district, a.sector, a.cell, a.village,
    next_level || '_leader')
  into next_leader;

  -- update complaint
  update public.complaints
  set current_level = next_level,
      current_leader_id = next_leader,
      status = 'escalated',
      updated_at = now()
  where id = _cid;

  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note)
  values (_cid, c.status, 'escalated', uid,
          'Escalated to ' || level_label || coalesce(' — ' || _note, ''));

  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (uid, 'escalate', 'complaint', _cid,
          jsonb_build_object('from_level', c.current_level, 'to_level', next_level));

  -- notify citizen
  insert into public.notifications (user_id, complaint_id, title, body)
  values (c.citizen_id, _cid,
          'Your complaint ' || c.reference || ' was escalated',
          'It has been passed to the ' || level_label || ' level.');

  -- notify next leader if found
  if next_leader is not null then
    insert into public.notifications (user_id, complaint_id, title, body)
    values (next_leader, _cid,
            'Complaint escalated to your level',
            'Ref: ' || c.reference || ' — ' || c.title);
  end if;
end $$;

-- 8. Leader resolves complaint (marks as resolution_proposed)
create or replace function public.leader_resolve(_cid uuid, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.complaints;
  uid uuid := auth.uid();
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;

  if c.current_leader_id <> uid then
    raise exception 'Only the currently assigned leader can resolve this complaint';
  end if;
  if _note is null or char_length(trim(_note)) < 5 then
    raise exception 'Please provide a resolution note (at least 5 characters)';
  end if;

  update public.complaints
  set status = 'resolution_proposed', updated_at = now()
  where id = _cid;

  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note)
  values (_cid, c.status, 'resolution_proposed', uid, _note);

  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (uid, 'resolve', 'complaint', _cid, jsonb_build_object('note', _note));

  insert into public.notifications (user_id, complaint_id, title, body)
  values (c.citizen_id, _cid,
          'Resolution proposed for ' || c.reference,
          'A leader has proposed a resolution. Please review: ' || _note);
end $$;

-- 9. RPC: get complaints assigned to the calling leader
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
  where c.current_leader_id = auth.uid()
    and c.status not in ('closed')
  order by c.created_at desc
$$;

-- 10. RPC: admin assigns a leader to an area
create or replace function public.assign_leader_area(
  _user_id uuid,
  _role app_role,
  _province text default '',
  _district text default '',
  _sector text default '',
  _cell text default '',
  _village text default ''
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only admins can assign leader areas';
  end if;
  insert into public.leader_areas (user_id, role, province, district, sector, cell, village)
  values (_user_id, _role, _province, _district, _sector, _cell, _village)
  on conflict (user_id, role) do update
    set province = _province, district = _district, sector = _sector,
        cell = _cell, village = _village;
end $$;

-- 11. RPC: get own leader area assignment
create or replace function public.my_leader_area()
returns table (role app_role, province text, district text, sector text, cell text, village text)
language sql stable security definer set search_path = public as $$
  select role, province, district, sector, cell, village
  from public.leader_areas
  where user_id = auth.uid()
$$;

revoke execute on function public.escalate_to_next_level(uuid, text) from public, anon;
revoke execute on function public.leader_resolve(uuid, text) from public, anon;
revoke execute on function public.my_leader_complaints() from public, anon;
revoke execute on function public.assign_leader_area(uuid, app_role, text, text, text, text, text) from public, anon;
revoke execute on function public.my_leader_area() from public, anon;

grant execute on function public.escalate_to_next_level(uuid, text) to authenticated;
grant execute on function public.leader_resolve(uuid, text) to authenticated;
grant execute on function public.my_leader_complaints() to authenticated;
grant execute on function public.assign_leader_area(uuid, app_role, text, text, text, text, text) to authenticated;
grant execute on function public.my_leader_area() to authenticated;

-- 12. Update RLS on complaints so leaders can see their assigned cases
create policy "leader views assigned" on public.complaints
  for select to authenticated
  using (current_leader_id = auth.uid());

-- 13. Seed some sample Rwanda areas with full hierarchy
-- (These are examples — admin can add more via the admin panel)
insert into public.areas (province, district, sector, cell, village) values
  ('Kigali City', 'Gasabo', 'Kimironko', 'Bibare', 'Gisimenti'),
  ('Kigali City', 'Gasabo', 'Kimironko', 'Bibare', 'Nyagasambu'),
  ('Kigali City', 'Gasabo', 'Kimironko', 'Kibagabaga', 'Kabeza'),
  ('Kigali City', 'Gasabo', 'Remera',    'Rukiri I',   'Amahoro'),
  ('Kigali City', 'Gasabo', 'Remera',    'Rukiri I',   'Kacyiru'),
  ('Kigali City', 'Kicukiro','Niboye',   'Gahanga',    'Rugarama'),
  ('Kigali City', 'Nyarugenge','Nyamirambo','Fatima',  'Agaciro'),
  ('Southern Province','Huye','Ngoma',   'Butare',     'Kabutare'),
  ('Northern Province','Musanze','Muhoza','Cyabararika','Rukundo'),
  ('Eastern Province','Rwamagana','Kigabiro','Gahengeri','Umucyo'),
  ('Western Province','Rubavu','Gisenyi','Amahoro',    'Inzira')
on conflict do nothing;
