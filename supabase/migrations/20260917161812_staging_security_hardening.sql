-- The project is staff-only. Supabase's project defaults grant broad Data API
-- privileges, so reset them before applying the application's least-privilege
-- access matrix. RLS remains the row-level authority.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon;

-- New application objects must be granted deliberately in future migrations.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- Foundation tables.
grant select, insert, update, delete on
  public.profiles,
  public.groups,
  public.coach_group_assignments
to authenticated;
grant select on public.audit_log to authenticated;

-- Working modules: authenticated users receive only the operations consumed by
-- the application. Table RLS and the database triggers narrow these operations
-- further by role, assigned group, MFA level, and workflow state.
grant select on
  public.venues,
  public.players,
  public.guardians,
  public.physical_test_results,
  public.game_activity_results,
  public.monthly_payments,
  public.uniform_catalog_items,
  public.uniform_requests,
  public.uniform_request_items,
  public.methodology_tasks,
  public.terminology_entries,
  public.training_structures,
  public.training_structure_steps,
  public.events,
  public.attendance_sessions,
  public.attendance_records,
  public.operational_items,
  public.file_assets,
  public.player_photos,
  public.event_materials,
  public.methodology_materials,
  public.inventory_items,
  public.inventory_permissions,
  public.inventory_adjustments,
  public.announcements,
  public.announcement_targets,
  public.announcement_reads,
  public.import_jobs,
  public.import_rows,
  public.export_jobs,
  public.task_usage
to authenticated;

grant insert, update, delete on
  public.venues,
  public.players,
  public.guardians,
  public.physical_test_results,
  public.game_activity_results,
  public.monthly_payments,
  public.uniform_catalog_items,
  public.uniform_requests,
  public.uniform_request_items,
  public.methodology_tasks,
  public.terminology_entries,
  public.training_structures,
  public.training_structure_steps,
  public.events,
  public.attendance_sessions,
  public.attendance_records,
  public.operational_items,
  public.file_assets,
  public.player_photos,
  public.event_materials,
  public.methodology_materials,
  public.inventory_items,
  public.inventory_permissions,
  public.announcements,
  public.announcement_targets,
  public.announcement_reads,
  public.import_jobs,
  public.import_rows,
  public.export_jobs
to authenticated;

-- Every public SECURITY DEFINER RPC performs its own active-user, role, group,
-- and (for administrators) aal2 checks. Anonymous callers must never reach them.
grant execute on function public.complete_password_change() to authenticated;
grant execute on function public.attach_event_task_material(uuid, uuid, uuid) to authenticated;
grant execute on function public.save_uniform_request(uuid, smallint, text, jsonb) to authenticated;
grant execute on function public.save_attendance(uuid, uuid, timestamptz, jsonb) to authenticated;
grant execute on function public.move_training_step(uuid, integer) to authenticated;
grant execute on function public.move_methodology_task(uuid, integer) to authenticated;
grant execute on function public.admin_assign_groups(uuid, uuid[]) to authenticated;
grant execute on function public.confirm_import_job(uuid) to authenticated;
grant execute on function public.attach_event_material(uuid, uuid) to authenticated;

-- Foreign-key indexes protect deletes/updates of referenced rows and keep the
-- group-scoped RLS joins responsive as real data grows. Index names are stable
-- and collision-resistant, including for long constraint names.
do $$
declare
  fk record;
  index_name text;
begin
  for fk in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      constraint_row.conname as constraint_name,
      string_agg(quote_ident(attribute.attname), ', ' order by key_column.ordinality) as columns_sql
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join lateral unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality) on true
    join pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = key_column.attnum
    where constraint_row.contype = 'f'
      and namespace.nspname = 'public'
      and not exists (
        select 1
        from pg_index existing_index
        where existing_index.indrelid = constraint_row.conrelid
          and existing_index.indisvalid
          and (existing_index.indkey::smallint[])[0:cardinality(constraint_row.conkey) - 1]
              @> constraint_row.conkey
      )
    group by namespace.nspname, relation.relname, constraint_row.conname
  loop
    index_name := left(fk.table_name || '_' || fk.constraint_name, 54)
      || '_' || substr(md5(fk.schema_name || '.' || fk.table_name || '.' || fk.constraint_name), 1, 8);

    execute format(
      'create index if not exists %I on %I.%I (%s)',
      index_name,
      fk.schema_name,
      fk.table_name,
      fk.columns_sql
    );
  end loop;
end;
$$;
