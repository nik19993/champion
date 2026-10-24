-- Approved calendar removal: cancel the coach's own event without losing history.
-- TEST/CANDIDATE ONLY. Do not apply to the working project without release approval.
-- Existing ownership RLS and all other administrative-field restrictions remain.
begin;

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
      or (new.status is distinct from old.status and not (
        new.status = 'cancelled' and old.status in ('scheduled', 'completed')
        and old.coach_id = (select auth.uid())
        and (select private.has_group(old.group_id))
        and exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'coach' and p.status = 'active')
      ))
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

commit;
