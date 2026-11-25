set local lock_timeout = '5s';

-- A group is removed from working lists, while its history and foreign keys stay.
-- Browsers cannot bypass the checked workflow with a cascading physical DELETE.
revoke delete on public.groups from authenticated;
drop policy groups_admin_delete on public.groups;
alter policy groups_read_assigned_or_admin on public.groups using (
  (select private.is_admin()) or (is_active and (select private.has_group(id)))
);

create function private.empty_group_deletion_status(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target public.groups%rowtype; player_count integer; event_count integer; slot_count integer;
begin
  if not (select private.is_admin()) then raise exception 'MFA_REQUIRED' using errcode='42501'; end if;
  select * into target from public.groups where id=p_group_id;
  if not found then raise exception 'GROUP_NOT_FOUND' using errcode='22023'; end if;
  select count(*) into player_count from public.players p where p.is_active and (
    p.group_id=p_group_id or exists(
      select 1 from public.player_group_memberships m where m.player_id=p.id and m.group_id=p_group_id
        and (m.active_to is null or m.active_to>(now() at time zone 'Europe/Kyiv')::date)
    )
  );
  select count(*) into event_count from public.events where group_id=p_group_id and status='scheduled' and ends_at>now();
  select count(*) into slot_count from public.club_schedule_slots where group_id=p_group_id;
  return jsonb_build_object('id',target.id,'code',coalesce(target.display_code,target.code),'is_active',target.is_active,
    'player_count',player_count,'future_event_count',event_count,'weekly_slot_count',slot_count);
end; $$;
revoke all on function private.empty_group_deletion_status(uuid) from public;
grant execute on function private.empty_group_deletion_status(uuid) to authenticated,service_role;
create function public.empty_group_deletion_status(p_group_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.empty_group_deletion_status(p_group_id);
$$;
revoke all on function public.empty_group_deletion_status(uuid) from public,anon;
grant execute on function public.empty_group_deletion_status(uuid) to authenticated,service_role;

create function private.delete_empty_group(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare target public.groups%rowtype; state jsonb;
begin
  if not (select private.is_admin()) then raise exception 'MFA_REQUIRED' using errcode='42501'; end if;
  select * into target from public.groups where id=p_group_id for update;
  if not found then raise exception 'GROUP_NOT_FOUND' using errcode='22023'; end if;
  if not target.is_active then return jsonb_build_object('id',target.id,'already_deleted',true); end if;
  state := private.empty_group_deletion_status(p_group_id);
  if (state->>'player_count')::integer>0 then raise exception 'GROUP_HAS_PLAYERS' using errcode='23514'; end if;
  if (state->>'future_event_count')::integer>0 then raise exception 'GROUP_HAS_FUTURE_EVENTS' using errcode='23514'; end if;
  if (state->>'weekly_slot_count')::integer>0 then raise exception 'GROUP_HAS_WEEKLY_SCHEDULE' using errcode='23514'; end if;
  update public.coach_group_assignments set is_active=false,valid_to=(now() at time zone 'Europe/Kyiv')::date,updated_at=now()
  where group_id=p_group_id and is_active;
  update public.player_group_memberships set active_to=greatest(active_from,(now() at time zone 'Europe/Kyiv')::date),updated_by=(select auth.uid()),updated_at=now()
  where group_id=p_group_id and (active_to is null or active_to>(now() at time zone 'Europe/Kyiv')::date);
  update public.groups set is_active=false,updated_at=now() where id=p_group_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,old_values,new_values)
  values((select auth.uid()),'delete_empty_group','groups',p_group_id,to_jsonb(target),jsonb_build_object('is_active',false,'history_preserved',true));
  return jsonb_build_object('id',target.id,'already_deleted',false);
end; $$;
revoke all on function private.delete_empty_group(uuid) from public;
grant execute on function private.delete_empty_group(uuid) to authenticated,service_role;
create function public.delete_empty_group(p_group_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.delete_empty_group(p_group_id);
$$;
revoke all on function public.delete_empty_group(uuid) from public,anon;
grant execute on function public.delete_empty_group(uuid) to authenticated,service_role;

-- Serialize new participation and planning with the group lock held by deletion.
-- Closing historical memberships and cancelling events remain possible.
create function private.guard_active_group_use()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='players' then
    if not new.is_active then return new; end if;
  elsif tg_table_name='player_group_memberships' then
    if new.active_to is not null and new.active_to<=(now() at time zone 'Europe/Kyiv')::date then return new; end if;
  elsif tg_table_name='events' then
    if new.status<>'scheduled' or new.start_at+make_interval(mins=>new.duration_minutes)<=now() then return new; end if;
  elsif tg_table_name='coach_group_assignments' then
    if not new.is_active then return new; end if;
  end if;
  perform 1 from public.groups where id=new.group_id and is_active for share;
  if not found then raise exception 'GROUP_INACTIVE' using errcode='23514'; end if;
  return new;
end; $$;
revoke all on function private.guard_active_group_use() from public;
create trigger players_guard_active_group before insert or update of group_id,is_active on public.players
for each row execute function private.guard_active_group_use();
create trigger memberships_guard_active_group before insert or update of group_id,active_from,active_to on public.player_group_memberships
for each row execute function private.guard_active_group_use();
create trigger events_guard_active_group before insert or update of group_id,status,start_at,duration_minutes on public.events
for each row execute function private.guard_active_group_use();
create trigger schedule_guard_active_group before insert or update of group_id on public.club_schedule_slots
for each row execute function private.guard_active_group_use();
create trigger assignments_guard_active_group before insert or update of group_id,is_active on public.coach_group_assignments
for each row execute function private.guard_active_group_use();
