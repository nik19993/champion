create or replace function private.profile_name_sync()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if nullif(trim(coalesce(new.first_name, '')), '') is not null
     or nullif(trim(coalesce(new.last_name, '')), '') is not null then
    new.full_name = trim(concat_ws(' ', nullif(trim(new.last_name), ''), nullif(trim(new.first_name), ''), nullif(trim(new.middle_name), '')));
  end if;
  return new;
end;
$$;

create trigger profiles_sync_name before insert or update of first_name, last_name, middle_name on public.profiles
for each row execute function private.profile_name_sync();

create or replace function public.complete_password_change()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set must_change_password = false, updated_at = now() where id = (select auth.uid());
end;
$$;

revoke all on function public.complete_password_change() from public;
grant execute on function public.complete_password_change() to authenticated;

create or replace function private.player_in_my_group(requested_player_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.players p
    where p.id = requested_player_id and (select private.has_group(p.group_id))
  );
$$;

create or replace function private.event_in_my_group(requested_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = requested_event_id and (select private.has_group(e.group_id))
  );
$$;

create or replace function private.has_assigned_age(requested_age integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_active_user()) and exists (
    select 1 from public.coach_group_assignments a
    join public.groups g on g.id = a.group_id
    where a.coach_id = (select auth.uid()) and a.is_active and g.age = requested_age
  );
$$;

create or replace function private.inventory_allowed(requested_group_id uuid, permission_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or exists (
    select 1 from public.inventory_permissions p
    where p.coach_id = (select auth.uid()) and p.group_id = requested_group_id
      and (select private.has_group(requested_group_id))
      and ((permission_name = 'quantity' and p.can_edit_quantity) or (permission_name = 'issues' and p.can_report_issues))
  );
$$;

create or replace function private.can_read_announcement(requested_announcement_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or ((select private.is_active_user()) and exists (
    select 1 from public.announcement_targets t
    where t.announcement_id = requested_announcement_id
      and (
        t.target_type = 'all'
        or (t.target_type = 'coach' and t.coach_id = (select auth.uid()))
        or (t.target_type = 'age' and (select private.has_assigned_age(t.age)))
      )
  ));
$$;
