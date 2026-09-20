create or replace function private.set_event_end()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.ends_at := new.start_at + make_interval(mins => new.duration_minutes);
  return new;
end;
$$;

create trigger events_set_end before insert or update of start_at, duration_minutes on public.events
for each row execute function private.set_event_end();

create or replace function private.validate_event_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null and not (select private.is_admin()) then
      new.created_by := (select auth.uid());
      new.updated_by := (select auth.uid());
      new.coach_id := (select auth.uid());
      new.substitute_coach_id := null;
      new.status := 'scheduled';
    end if;
    new.original_start_at := null;
    new.is_rescheduled := false;
    return new;
  end if;

  if (select auth.uid()) is not null and not (select private.is_admin()) then
    if new.group_id is distinct from old.group_id
      or new.coach_id is distinct from old.coach_id
      or new.substitute_coach_id is distinct from old.substitute_coach_id
      or new.status is distinct from old.status
      or new.created_by is distinct from old.created_by then
      raise exception 'Coach cannot change administrative event fields' using errcode = '42501';
    end if;
    new.updated_by := (select auth.uid());
  end if;

  if new.start_at is distinct from old.start_at then
    new.original_start_at := coalesce(old.original_start_at, old.start_at);
    new.is_rescheduled := true;
  else
    new.original_start_at := old.original_start_at;
    new.is_rescheduled := old.is_rescheduled;
  end if;
  return new;
end;
$$;

create trigger events_00_validate_write before insert or update on public.events
for each row execute function private.validate_event_write();

create or replace function private.record_event_reschedule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.start_at is distinct from old.start_at then
    insert into public.operational_items(group_id, event_id, item_type, status, title, comment, due_at, dedupe_key, created_by, updated_by)
    values (new.group_id, new.id, 'reschedule', 'todo', 'Подію перенесено', old.start_at::text || ' → ' || new.start_at::text, new.start_at, new.id::text || ':reschedule:' || gen_random_uuid()::text, (select auth.uid()), (select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger events_record_reschedule after update of start_at on public.events
for each row execute function private.record_event_reschedule();

create or replace function private.prevent_event_conflict()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  conflict_record record;
begin
  if new.status <> 'scheduled' then return new; end if;
  select e.id, g.code, v.name as venue_name, e.start_at, e.ends_at,
         case when e.coach_id = new.coach_id then 'тренер' else 'поле' end as resource_type
  into conflict_record
  from public.events e
  join public.groups g on g.id = e.group_id
  left join public.venues v on v.id = e.venue_id
  where e.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and e.status = 'scheduled'
    and e.start_at < new.start_at + make_interval(mins => new.duration_minutes)
    and e.ends_at > new.start_at
    and (e.coach_id = new.coach_id or (new.venue_id is not null and e.venue_id = new.venue_id))
  order by e.start_at
  limit 1;
  if found then
    raise exception 'EVENT_CONFLICT: % зайнятий; команда %, % — %', conflict_record.resource_type, conflict_record.code, conflict_record.start_at, conflict_record.ends_at using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger events_prevent_conflict before insert or update of start_at, duration_minutes, venue_id, coach_id, status on public.events
for each row execute function private.prevent_event_conflict();

create or replace function private.prevent_event_delete_with_attendance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.attendance_sessions s where s.event_id = old.id) then
    raise exception 'Подію з присутністю не можна видалити. Змініть її стан на скасовану.' using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger events_guard_delete before delete on public.events
for each row execute function private.prevent_event_delete_with_attendance();

create or replace function private.validate_inventory_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or (select private.is_admin()) then return new; end if;
  if tg_op = 'INSERT' then
    if not (select private.inventory_allowed(new.group_id, 'quantity')) then raise exception 'Inventory quantity permission denied' using errcode = '42501'; end if;
    if (new.damaged > 0 or new.lost > 0 or new.needed > 0) and not (select private.inventory_allowed(new.group_id, 'issues')) then raise exception 'Inventory issues permission denied' using errcode = '42501'; end if;
    new.is_active := true;
    new.created_by := (select auth.uid());
    new.updated_by := (select auth.uid());
  else
    if new.group_id is distinct from old.group_id
      or new.is_active is distinct from old.is_active
      or new.created_by is distinct from old.created_by then
      raise exception 'Coach cannot change administrative inventory fields' using errcode = '42501';
    end if;
    if (new.name is distinct from old.name or new.quantity is distinct from old.quantity) and not (select private.inventory_allowed(new.group_id, 'quantity')) then raise exception 'Inventory quantity permission denied' using errcode = '42501'; end if;
    if (new.damaged is distinct from old.damaged or new.lost is distinct from old.lost or new.needed is distinct from old.needed) and not (select private.inventory_allowed(new.group_id, 'issues')) then raise exception 'Inventory issues permission denied' using errcode = '42501'; end if;
    new.updated_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger inventory_validate_write before insert or update on public.inventory_items
for each row execute function private.validate_inventory_write();

create or replace function private.record_inventory_adjustments()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.quantity is distinct from old.quantity then insert into public.inventory_adjustments(item_id, field_name, old_value, new_value, actor_id) values (new.id, 'quantity', old.quantity, new.quantity, (select auth.uid())); end if;
  if new.damaged is distinct from old.damaged then insert into public.inventory_adjustments(item_id, field_name, old_value, new_value, actor_id) values (new.id, 'damaged', old.damaged, new.damaged, (select auth.uid())); end if;
  if new.lost is distinct from old.lost then insert into public.inventory_adjustments(item_id, field_name, old_value, new_value, actor_id) values (new.id, 'lost', old.lost, new.lost, (select auth.uid())); end if;
  if new.needed is distinct from old.needed then insert into public.inventory_adjustments(item_id, field_name, old_value, new_value, actor_id) values (new.id, 'needed', old.needed, new.needed, (select auth.uid())); end if;
  return new;
end;
$$;

create trigger inventory_record_adjustment after update on public.inventory_items
for each row execute function private.record_inventory_adjustments();

create or replace function private.validate_uniform_request_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if (select private.is_admin()) then new.updated_by := (select auth.uid()); return new; end if;
  if not (select private.player_in_my_group(new.player_id)) then raise exception 'Uniform request permission denied' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and new.player_id is distinct from old.player_id then raise exception 'Uniform player cannot be changed' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and old.status in ('preparing', 'issued') then raise exception 'Uniform request is locked for the coach' using errcode = '42501'; end if;
  if new.status not in ('not_ordered', 'requested') then raise exception 'Coach cannot set administrative uniform status' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and new.admin_note is distinct from old.admin_note then raise exception 'Coach cannot edit administrator note' using errcode = '42501'; end if;
  new.updated_by := (select auth.uid());
  if tg_op = 'INSERT' then new.requested_by := (select auth.uid()); end if;
  return new;
end;
$$;

create trigger uniform_request_validate before insert or update on public.uniform_requests
for each row execute function private.validate_uniform_request_write();

create or replace function private.validate_uniform_catalog_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if not (select private.is_admin()) then raise exception 'Administrator MFA required' using errcode = '42501'; end if;
  new.updated_by := (select auth.uid());
  if tg_op = 'INSERT' then new.created_by := (select auth.uid()); end if;
  return new;
end;
$$;

create trigger uniform_catalog_validate before insert or update on public.uniform_catalog_items
for each row execute function private.validate_uniform_catalog_write();

create or replace function private.validate_payment_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.player_id is distinct from old.player_id or new.month is distinct from old.month) then
    raise exception 'Payment identity cannot be changed' using errcode = '42501';
  end if;
  new.changed_by := (select auth.uid());
  new.changed_at := now();
  return new;
end;
$$;

create trigger payment_validate_write before insert or update on public.monthly_payments
for each row execute function private.validate_payment_write();

create or replace function private.validate_operational_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or (select private.is_admin()) then return new; end if;
  if new.event_id is not null and not exists (
    select 1 from public.events e where e.id = new.event_id and e.group_id = new.group_id
  ) then
    raise exception 'Operational item event does not belong to group' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'todo';
    new.assigned_to := null;
    new.created_by := (select auth.uid());
    new.updated_by := (select auth.uid());
  else
    if new.group_id is distinct from old.group_id
      or new.event_id is distinct from old.event_id
      or new.item_type is distinct from old.item_type
      or new.status is distinct from old.status
      or new.assigned_to is distinct from old.assigned_to
      or new.created_by is distinct from old.created_by
      or new.dedupe_key is distinct from old.dedupe_key then
      raise exception 'Coach cannot change administrative operational fields' using errcode = '42501';
    end if;
    new.updated_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger operational_validate_write before insert or update on public.operational_items
for each row execute function private.validate_operational_write();
