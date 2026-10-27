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
  created_at timestamptz not null default now(),
  unique (province, district, sector)
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

grant select, insert, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.areas, public.categories to anon, authenticated;
grant insert, update, delete on public.areas, public.categories to authenticated;
grant select, insert, update on public.complaints to authenticated;
grant select on public.status_history to authenticated;
grant select, insert on public.messages, public.evidence to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.audit_logs to authenticated;
grant usage on sequence public.complaint_ref_seq to authenticated;
grant all on all tables in schema public to service_role;

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

create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;
create or replace function public.is_staff(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('officer','supervisor','admin')) $$;
create or replace function public.can_view_complaint(_cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.complaints c where c.id = _cid and (c.citizen_id = auth.uid() or public.is_staff(auth.uid()))) $$;

create policy "own or staff profiles" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own roles or admin" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "read areas" on public.areas for select using (true);
create policy "admin areas" on public.areas for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "read categories" on public.categories for select using (true);
create policy "admin categories" on public.categories for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "view complaints" on public.complaints for select to authenticated using (citizen_id = auth.uid() or public.is_staff(auth.uid()));
create policy "citizen creates" on public.complaints for insert to authenticated with check (citizen_id = auth.uid() and status = 'submitted' and assigned_officer_id is null);
create policy "view history" on public.status_history for select to authenticated using (public.can_view_complaint(complaint_id));
create policy "view messages" on public.messages for select to authenticated using (public.can_view_complaint(complaint_id));
create policy "post messages" on public.messages for insert to authenticated with check (author_id = auth.uid() and public.can_view_complaint(complaint_id));
create policy "view evidence" on public.evidence for select to authenticated using (public.can_view_complaint(complaint_id));
create policy "add evidence" on public.evidence for insert to authenticated with check (uploaded_by = auth.uid() and public.can_view_complaint(complaint_id)
  and (kind = 'citizen_evidence' or public.is_staff(auth.uid())));
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "mark read" on public.notifications for update to authenticated using (user_id = auth.uid());
create policy "admin audit" on public.audit_logs for select to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor'));

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

insert into public.categories (name, description) values
 ('Roads & Infrastructure','Damaged roads, bridges, drainage'),
 ('Water Supply','Water shortages, broken pipes'),
 ('Waste Management','Uncollected waste, illegal dumping'),
 ('Street Lighting','Broken or missing streetlights'),
 ('Electricity','Power outages, unsafe lines'),
 ('Public Services','Delays or poor service at public offices');
insert into public.areas (province, district, sector) values
 ('Kigali City','Gasabo','Kimironko'),('Kigali City','Gasabo','Remera'),('Kigali City','Kicukiro','Niboye'),
 ('Kigali City','Nyarugenge','Nyamirambo'),('Southern Province','Huye','Ngoma'),('Northern Province','Musanze','Muhoza'),
 ('Eastern Province','Rwamagana','Kigabiro'),('Western Province','Rubavu','Gisenyi');

create policy "upload evidence" on storage.objects for insert to authenticated with check (bucket_id = 'evidence' and public.can_view_complaint(((storage.foldername(name))[1])::uuid));
create policy "read evidence" on storage.objects for select to authenticated using (bucket_id = 'evidence' and public.can_view_complaint(((storage.foldername(name))[1])::uuid));