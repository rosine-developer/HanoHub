create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 150),
  body text not null check (char_length(body) between 5 and 4000),
  published boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;
create policy "anyone reads published" on public.announcements for select using (published = true or public.has_role(auth.uid(),'admin'));
create policy "admin writes" on public.announcements for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- Communication Officer + Higher Authority roles
alter type public.app_role add value if not exists 'comms_officer';
alter type public.app_role add value if not exists 'higher_authority';
