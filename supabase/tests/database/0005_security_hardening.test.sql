begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p', 'v', 'm')
      and (
        has_table_privilege('anon', relation.oid, 'SELECT')
        or has_table_privilege('anon', relation.oid, 'INSERT')
        or has_table_privilege('anon', relation.oid, 'UPDATE')
        or has_table_privilege('anon', relation.oid, 'DELETE')
        or has_table_privilege('anon', relation.oid, 'TRUNCATE')
        or has_table_privilege('anon', relation.oid, 'REFERENCES')
        or has_table_privilege('anon', relation.oid, 'TRIGGER')
      )
  ),
  0::bigint,
  'anonymous users have no Data API table or view privileges'
);

select is(
  (
    select count(*)
    from pg_proc function_row
    join pg_namespace namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and has_function_privilege('anon', function_row.oid, 'EXECUTE')
  ),
  0::bigint,
  'anonymous users cannot execute public application functions'
);

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p', 'v', 'm')
      and (
        has_table_privilege('authenticated', relation.oid, 'TRUNCATE')
        or has_table_privilege('authenticated', relation.oid, 'REFERENCES')
        or has_table_privilege('authenticated', relation.oid, 'TRIGGER')
      )
  ),
  0::bigint,
  'signed-in users have no elevated relation privileges'
);

select ok(
  has_table_privilege('authenticated', 'public.task_usage', 'SELECT'),
  'signed-in staff can read the task usage view through RLS'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
  and not has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.audit_log', 'DELETE'),
  'audit log is read-only for signed-in users'
);

select ok(
  not has_table_privilege('authenticated', 'public.inventory_adjustments', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_adjustments', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_adjustments', 'DELETE'),
  'inventory adjustment history is read-only for signed-in users'
);

select is(
  (
    select count(*)
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
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
  ),
  0::bigint,
  'every public foreign key has a covering index'
);

select * from finish();
rollback;
