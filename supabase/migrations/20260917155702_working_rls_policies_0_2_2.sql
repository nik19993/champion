-- Row-level security is enabled on every exposed table.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'venues','players','guardians','physical_test_results','game_activity_results','monthly_payments',
    'uniform_catalog_items','uniform_requests','uniform_request_items','methodology_tasks','terminology_entries',
    'training_structures','training_structure_steps','events','attendance_sessions','attendance_records',
    'operational_items','file_assets','player_photos','event_materials','methodology_materials','inventory_items',
    'inventory_permissions','inventory_adjustments','announcements','announcement_targets','announcement_reads',
    'import_jobs','import_rows','export_jobs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

-- Shared helpers and school structure.
create policy venues_staff_read on public.venues for select to authenticated using ((select private.is_active_user()) and (is_active or (select private.is_admin())));
create policy venues_admin_all on public.venues for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Players, contacts and evaluations.
create policy players_read_group on public.players for select to authenticated using ((select private.is_admin()) or (select private.has_group(group_id)));
create policy players_admin_all on public.players for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy guardians_read_group on public.guardians for select to authenticated using ((select private.is_admin()) or (select private.player_in_my_group(player_id)));
create policy guardians_admin_all on public.guardians for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy physical_tests_read_group on public.physical_test_results for select to authenticated using ((select private.is_admin()) or (select private.player_in_my_group(player_id)));
create policy physical_tests_admin_all on public.physical_test_results for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy game_activity_read_group on public.game_activity_results for select to authenticated using ((select private.is_admin()) or (select private.player_in_my_group(player_id)));
create policy game_activity_admin_all on public.game_activity_results for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy payments_read_group on public.monthly_payments for select to authenticated using ((select private.is_admin()) or (select private.player_in_my_group(player_id)));
create policy payments_coach_insert on public.monthly_payments for insert to authenticated with check ((select private.player_in_my_group(player_id)) and changed_by = (select auth.uid()));
create policy payments_coach_update on public.monthly_payments for update to authenticated using ((select private.player_in_my_group(player_id))) with check ((select private.player_in_my_group(player_id)) and changed_by = (select auth.uid()));
create policy payments_admin_all on public.monthly_payments for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Uniform.
create policy uniform_catalog_staff_read on public.uniform_catalog_items for select to authenticated using ((select private.is_active_user()));
create policy uniform_catalog_admin_all on public.uniform_catalog_items for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy uniform_requests_read_group on public.uniform_requests for select to authenticated using ((select private.is_admin()) or (select private.player_in_my_group(player_id)));
create policy uniform_requests_coach_insert on public.uniform_requests for insert to authenticated with check ((select private.player_in_my_group(player_id)) and requested_by = (select auth.uid()));
create policy uniform_requests_coach_update on public.uniform_requests for update to authenticated using ((select private.player_in_my_group(player_id))) with check ((select private.player_in_my_group(player_id)));
create policy uniform_requests_admin_all on public.uniform_requests for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy uniform_items_read_group on public.uniform_request_items for select to authenticated using ((select private.is_admin()) or exists (select 1 from public.uniform_requests r where r.id = request_id and (select private.player_in_my_group(r.player_id))));
create policy uniform_items_coach_all on public.uniform_request_items for all to authenticated
using (exists (select 1 from public.uniform_requests r where r.id = request_id and r.status in ('not_ordered', 'requested') and (select private.player_in_my_group(r.player_id))))
with check (exists (select 1 from public.uniform_requests r where r.id = request_id and r.status in ('not_ordered', 'requested') and (select private.player_in_my_group(r.player_id))));
create policy uniform_items_admin_all on public.uniform_request_items for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Plan, events and attendance.
create policy events_read_group on public.events for select to authenticated using ((select private.is_admin()) or (select private.has_group(group_id)));
create policy events_coach_insert on public.events for insert to authenticated with check ((select private.has_group(group_id)) and coach_id = (select auth.uid()) and created_by = (select auth.uid()));
create policy events_coach_update on public.events for update to authenticated using ((select private.has_group(group_id)) and coach_id = (select auth.uid())) with check ((select private.has_group(group_id)) and coach_id = (select auth.uid()));
create policy events_coach_delete on public.events for delete to authenticated using ((select private.has_group(group_id)) and coach_id = (select auth.uid()));
create policy events_admin_all on public.events for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy attendance_sessions_read_group on public.attendance_sessions for select to authenticated using ((select private.is_admin()) or (select private.event_in_my_group(event_id)));
create policy attendance_sessions_admin_all on public.attendance_sessions for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy attendance_records_read_group on public.attendance_records for select to authenticated using ((select private.is_admin()) or exists (select 1 from public.attendance_sessions s where s.id = session_id and (select private.event_in_my_group(s.event_id))));
create policy attendance_records_admin_all on public.attendance_records for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy operational_read_group_or_admin on public.operational_items for select to authenticated using ((select private.is_admin()) or (select private.has_group(group_id)));
create policy operational_coach_insert on public.operational_items for insert to authenticated with check ((select private.has_group(group_id)) and created_by = (select auth.uid()) and status = 'todo');
create policy operational_coach_update on public.operational_items for update to authenticated using ((select private.has_group(group_id)) and created_by = (select auth.uid())) with check ((select private.has_group(group_id)) and created_by = (select auth.uid()));
create policy operational_coach_delete on public.operational_items for delete to authenticated using ((select private.has_group(group_id)) and created_by = (select auth.uid()) and status = 'todo');
create policy operational_admin_all on public.operational_items for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Methodology.
create policy tasks_staff_read on public.methodology_tasks for select to authenticated using ((select private.is_admin()) or (is_active and exists (select 1 from generate_series(age_from::integer, age_to::integer) as ages(age) where (select private.has_assigned_age(ages.age)))));
create policy tasks_admin_all on public.methodology_tasks for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy terms_staff_read on public.terminology_entries for select to authenticated using ((select private.is_admin()) or ((select private.is_active_user()) and is_active));
create policy terms_admin_all on public.terminology_entries for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy structures_staff_read on public.training_structures for select to authenticated using ((select private.is_admin()) or (is_active and exists (select 1 from generate_series(age_from::integer, age_to::integer) as ages(age) where (select private.has_assigned_age(ages.age)))));
create policy structures_admin_all on public.training_structures for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy structure_steps_staff_read on public.training_structure_steps for select to authenticated using ((select private.is_admin()) or exists (select 1 from public.training_structures s where s.id = structure_id and s.is_active and exists (select 1 from generate_series(s.age_from::integer, s.age_to::integer) as ages(age) where (select private.has_assigned_age(ages.age)))));
create policy structure_steps_admin_all on public.training_structure_steps for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy methodology_materials_staff_read on public.methodology_materials for select to authenticated using ((select private.is_admin()) or exists (select 1 from generate_series(age_from::integer, age_to::integer) as ages(age) where (select private.has_assigned_age(ages.age))));
create policy methodology_materials_coach_insert on public.methodology_materials for insert to authenticated with check (added_by = (select auth.uid()) and age_from = age_to and (select private.has_assigned_age(age_from)));
create policy methodology_materials_admin_all on public.methodology_materials for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy event_materials_read_group on public.event_materials for select to authenticated using ((select private.is_admin()) or (select private.event_in_my_group(event_id)));
create policy event_materials_coach_insert on public.event_materials for insert to authenticated with check ((select private.event_in_my_group(event_id)) and actor_id = (select auth.uid()));
create policy event_materials_admin_all on public.event_materials for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Files and photos.
create policy file_assets_authorized_read on public.file_assets for select to authenticated using ((select private.can_read_file_asset(id)));
create policy file_assets_owner_insert on public.file_assets for insert to authenticated with check (
  owner_id = (select auth.uid()) and (
    (select private.is_admin())
    or (
      bucket = 'task-documents'
      and context_group_id is not null
      and context_age is not null
      and (select private.has_group(context_group_id))
      and exists (select 1 from public.groups g where g.id = context_group_id and g.age = context_age)
    )
  )
);
create policy file_assets_owner_delete_unvalidated on public.file_assets for delete to authenticated
using (owner_id = (select auth.uid()) and scan_status in ('pending', 'rejected'));
create policy file_assets_admin_all on public.file_assets for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy player_photos_read_group on public.player_photos for select to authenticated using ((select private.is_admin()) or (select private.player_in_my_group(player_id)));
create policy player_photos_admin_all on public.player_photos for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Inventory.
create policy inventory_read_group on public.inventory_items for select to authenticated using ((select private.is_admin()) or (select private.has_group(group_id)));
create policy inventory_coach_insert on public.inventory_items for insert to authenticated with check ((select private.inventory_allowed(group_id, 'quantity')));
create policy inventory_coach_update on public.inventory_items for update to authenticated using ((select private.has_group(group_id))) with check ((select private.has_group(group_id)));
create policy inventory_admin_all on public.inventory_items for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy inventory_permissions_own_or_admin on public.inventory_permissions for select to authenticated using (coach_id = (select auth.uid()) or (select private.is_admin()));
create policy inventory_permissions_admin_all on public.inventory_permissions for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy inventory_adjustments_admin_read on public.inventory_adjustments for select to authenticated using ((select private.is_admin()));

-- Announcements.
create policy announcements_targeted_read on public.announcements for select to authenticated using ((select private.can_read_announcement(id)));
create policy announcements_admin_all on public.announcements for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy announcement_targets_admin_read on public.announcement_targets for select to authenticated using ((select private.is_admin()));
create policy announcement_targets_admin_all on public.announcement_targets for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy announcement_reads_own on public.announcement_reads for select to authenticated using (profile_id = (select auth.uid()) or (select private.is_admin()));
create policy announcement_reads_own_insert on public.announcement_reads for insert to authenticated with check (profile_id = (select auth.uid()) and (select private.can_read_announcement(announcement_id)));
create policy announcement_reads_admin_all on public.announcement_reads for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Administrative jobs.
create policy import_jobs_admin_all on public.import_jobs for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy import_rows_admin_all on public.import_rows for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy export_jobs_admin_all on public.export_jobs for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
