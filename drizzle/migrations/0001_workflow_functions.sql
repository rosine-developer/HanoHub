create or replace function public.transition_complaint(_cid uuid, _to complaint_status, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints; uid uuid := auth.uid(); ok boolean := false;
  is_off boolean; is_sup boolean;
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;
  if _note is not null and char_length(_note) > 2000 then raise exception 'Note too long'; end if;
  is_off := public.has_role(uid,'officer');
  is_sup := public.has_role(uid,'supervisor') or public.has_role(uid,'admin');

  if is_off and (c.assigned_officer_id = uid or c.assigned_officer_id is null) then
    ok := (c.status, _to) in (
      ('submitted','under_review'), ('under_review','in_progress'), ('under_review','awaiting_information'),
      ('under_review','escalated'), ('awaiting_information','under_review'), ('awaiting_information','in_progress'),
      ('in_progress','awaiting_information'), ('in_progress','resolution_proposed'), ('in_progress','escalated'),
      ('reopened','in_progress'), ('reopened','escalated'));
  end if;
  if not ok and is_sup then
    ok := (c.status, _to) in (
      ('under_resolution_review','closed'), ('under_resolution_review','reopened'),
      ('challenged','reopened'), ('challenged','under_resolution_review'),
      ('escalated','in_progress'), ('escalated','reopened'), ('escalated','closed'));
  end if;
  if not ok and c.citizen_id = uid then
    ok := (c.status, _to) in (('resolution_proposed','under_resolution_review'));
  end if;
  if not ok then raise exception 'This action is not allowed for your role or the current status'; end if;

  update public.complaints set status = _to, updated_at = now(),
    assigned_officer_id = case when is_off and assigned_officer_id is null then uid else assigned_officer_id end
  where id = _cid;
  insert into public.status_history (complaint_id, from_status, to_status, actor_id, note) values (_cid, c.status, _to, uid, _note);
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
    values (uid, 'status_change', 'complaint', _cid, jsonb_build_object('from', c.status, 'to', _to));
  if uid <> c.citizen_id then
    insert into public.notifications (user_id, complaint_id, title, body)
      values (c.citizen_id, _cid, 'Case ' || c.reference || ' updated', 'Status changed to ' || replace(_to::text,'_',' ') || coalesce(': ' || _note, ''));
  end if;
end $$;

create or replace function public.assign_complaint(_cid uuid, _officer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints; uid uuid := auth.uid();
begin
  select * into c from public.complaints where id = _cid for update;
  if not found then raise exception 'Complaint not found'; end if;
  if not public.has_role(_officer,'officer') then raise exception 'User is not an officer'; end if;
  if not (public.has_role(uid,'supervisor') or public.has_role(uid,'admin')
          or (public.has_role(uid,'officer') and _officer = uid and c.assigned_officer_id is null)) then
    raise exception 'Not allowed to assign this case';
  end if;
  update public.complaints set assigned_officer_id = _officer, updated_at = now() where id = _cid;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
    values (uid, 'assign', 'complaint', _cid, jsonb_build_object('officer', _officer));
  insert into public.notifications (user_id, complaint_id, title, body)
    values (_officer, _cid, 'Case assigned', 'You were assigned case ' || c.reference);
end $$;

revoke execute on function public.transition_complaint(uuid, complaint_status, text) from public, anon;
revoke execute on function public.assign_complaint(uuid, uuid) from public, anon;
grant execute on function public.transition_complaint(uuid, complaint_status, text) to authenticated;
grant execute on function public.assign_complaint(uuid, uuid) to authenticated;

create or replace function public.list_officers()
returns table (id uuid, full_name text) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name from public.profiles p join public.user_roles r on r.user_id = p.id and r.role = 'officer'
  where public.is_staff(auth.uid()) order by p.full_name $$;
grant execute on function public.list_officers() to authenticated;