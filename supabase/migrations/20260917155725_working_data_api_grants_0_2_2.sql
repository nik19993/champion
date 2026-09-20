-- Minimal grants; RLS remains authoritative.
grant select on public.venues, public.players, public.guardians, public.physical_test_results, public.game_activity_results,
  public.monthly_payments, public.uniform_catalog_items, public.uniform_requests, public.uniform_request_items,
  public.methodology_tasks, public.terminology_entries, public.training_structures, public.training_structure_steps,
  public.events, public.attendance_sessions, public.attendance_records, public.operational_items, public.file_assets,
  public.player_photos, public.event_materials, public.methodology_materials, public.inventory_items,
  public.inventory_permissions, public.inventory_adjustments, public.announcements, public.announcement_targets,
  public.announcement_reads, public.import_jobs, public.import_rows, public.export_jobs, public.task_usage to authenticated;

grant insert, update, delete on public.venues, public.players, public.guardians, public.physical_test_results,
  public.game_activity_results, public.monthly_payments, public.uniform_catalog_items, public.uniform_requests,
  public.uniform_request_items, public.methodology_tasks, public.terminology_entries, public.training_structures,
  public.training_structure_steps, public.events, public.attendance_sessions, public.attendance_records,
  public.operational_items, public.file_assets, public.player_photos, public.event_materials,
  public.methodology_materials, public.inventory_items, public.inventory_permissions, public.announcements,
  public.announcement_targets, public.announcement_reads, public.import_jobs, public.import_rows,
  public.export_jobs to authenticated;

grant usage, select on all sequences in schema public to authenticated;

revoke all on public.venues, public.players, public.guardians, public.physical_test_results, public.game_activity_results,
  public.monthly_payments, public.uniform_catalog_items, public.uniform_requests, public.uniform_request_items,
  public.methodology_tasks, public.terminology_entries, public.training_structures, public.training_structure_steps,
  public.events, public.attendance_sessions, public.attendance_records, public.operational_items, public.file_assets,
  public.player_photos, public.event_materials, public.methodology_materials, public.inventory_items,
  public.inventory_permissions, public.inventory_adjustments, public.announcements, public.announcement_targets,
  public.announcement_reads, public.import_jobs, public.import_rows, public.export_jobs from anon;
