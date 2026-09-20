revoke all on function public.attach_event_task_material(uuid, uuid, uuid) from public;
revoke all on function public.save_uniform_request(uuid, smallint, text, jsonb) from public;
revoke all on function public.save_attendance(uuid, uuid, timestamptz, jsonb) from public;
revoke all on function public.move_training_step(uuid, integer) from public;
revoke all on function public.move_methodology_task(uuid, integer) from public;
revoke all on function public.admin_assign_groups(uuid, uuid[]) from public;
revoke all on function public.confirm_import_job(uuid) from public;
grant execute on function public.attach_event_task_material(uuid, uuid, uuid) to authenticated;
grant execute on function public.save_uniform_request(uuid, smallint, text, jsonb) to authenticated;
grant execute on function public.save_attendance(uuid, uuid, timestamptz, jsonb) to authenticated;
grant execute on function public.move_training_step(uuid, integer) to authenticated;
grant execute on function public.move_methodology_task(uuid, integer) to authenticated;
grant execute on function public.admin_assign_groups(uuid, uuid[]) to authenticated;
grant execute on function public.confirm_import_job(uuid) to authenticated;

revoke all on function private.profile_name_sync() from public;
revoke all on function private.player_in_my_group(uuid) from public;
revoke all on function private.event_in_my_group(uuid) from public;
revoke all on function private.has_assigned_age(integer) from public;
revoke all on function private.inventory_allowed(uuid, text) from public;
revoke all on function private.can_read_announcement(uuid) from public;
revoke all on function private.set_event_end() from public;
revoke all on function private.validate_event_write() from public;
revoke all on function private.record_event_reschedule() from public;
revoke all on function private.prevent_event_conflict() from public;
revoke all on function private.prevent_event_delete_with_attendance() from public;
revoke all on function private.validate_inventory_write() from public;
revoke all on function private.record_inventory_adjustments() from public;
revoke all on function private.validate_uniform_request_write() from public;
revoke all on function private.validate_uniform_catalog_write() from public;
revoke all on function private.validate_payment_write() from public;
revoke all on function private.validate_operational_write() from public;
revoke all on function private.validate_file_asset_write() from public;
revoke all on function private.audit_change() from public;
revoke all on function private.can_read_file_asset(uuid) from public;
revoke all on function private.can_read_storage_object(text, text) from public;
grant execute on function private.player_in_my_group(uuid) to authenticated;
grant execute on function private.event_in_my_group(uuid) to authenticated;
grant execute on function private.has_assigned_age(integer) to authenticated;
grant execute on function private.inventory_allowed(uuid, text) to authenticated;
grant execute on function private.can_read_announcement(uuid) to authenticated;
grant execute on function private.can_read_storage_object(text, text) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'venues','players','guardians','uniform_catalog_items','uniform_requests','methodology_tasks',
    'terminology_entries','training_structures','training_structure_steps','events','attendance_sessions',
    'attendance_records','operational_items','inventory_items','announcements','import_jobs'
  ] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'monthly_payments','uniform_catalog_items','uniform_requests','uniform_request_items','events','attendance_sessions','attendance_records',
    'operational_items','inventory_items','inventory_permissions','coach_group_assignments','profiles','file_assets','export_jobs'
  ] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.audit_change()', table_name, table_name);
  end loop;
end;
$$;

create or replace view public.task_usage with (security_invoker = true) as
select e.group_id, e.task_id, count(*)::integer as usage_count, max(e.start_at) as last_used_at
from public.events e
where e.task_id is not null and e.status <> 'cancelled'
group by e.group_id, e.task_id;
