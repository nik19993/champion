begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.profiles (id, full_name, email, role, status, must_change_password)
values
  ('15000000-0000-0000-0000-000000000001', 'Тренер Для Видалення', 'delete-coach@example.test', 'coach', 'active', false),
  ('15000000-0000-0000-0000-000000000002', 'Адміністратор Видалення', 'delete-admin@example.test', 'admin', 'active', false);

insert into public.coach_group_assignments (id, coach_id, group_id, assignment_role, created_by)
select
  '25000000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000001',
  group_row.id,
  'assistant',
  '15000000-0000-0000-0000-000000000002'
from public.groups group_row
where group_row.code = 'U12A';

insert into public.events (
  id,
  group_id,
  event_type,
  start_at,
  duration_minutes,
  ends_at,
  coach_id,
  title,
  created_by,
  updated_by
)
select
  '45000000-0000-0000-0000-000000000001',
  group_row.id,
  'theory',
  now() + interval '14 days',
  60,
  now() + interval '14 days 60 minutes',
  '15000000-0000-0000-0000-000000000001',
  'Майбутня подія для перепризначення',
  '15000000-0000-0000-0000-000000000002',
  '15000000-0000-0000-0000-000000000002'
from public.groups group_row
where group_row.code = 'U12A';

select ok(
  not has_function_privilege('authenticated', 'public.finalize_coach_deletion(uuid,uuid,text)', 'execute'),
  'authenticated browser clients cannot execute the finalization function'
);

select lives_ok(
  $$select public.finalize_coach_deletion(
      '15000000-0000-0000-0000-000000000001',
      '15000000-0000-0000-0000-000000000002',
      'Контрольний тест'
    )$$,
  'server-side finalization completes atomically'
);

select is(
  (select count(*) from public.profiles where id = '15000000-0000-0000-0000-000000000001'),
  1::bigint,
  'historical coach profile remains present'
);

select ok(
  (select status = 'closed' and email is null and deleted_at is not null and deleted_by = '15000000-0000-0000-0000-000000000002'
   from public.profiles where id = '15000000-0000-0000-0000-000000000001'),
  'profile is closed and records who deleted it'
);

select ok(
  (select not is_active and valid_to is not null
   from public.coach_group_assignments where id = '25000000-0000-0000-0000-000000000001'),
  'active group assignment is ended'
);

select ok(
  (select needs_substitute and coach_id = '15000000-0000-0000-0000-000000000001'
   from public.events where id = '45000000-0000-0000-0000-000000000001'),
  'future event remains linked to historical coach and needs reassignment'
);

select is(
  (select count(*) from public.events where id = '45000000-0000-0000-0000-000000000001'),
  1::bigint,
  'future event is not deleted'
);

select is(
  (select count(*) from public.operational_items
   where event_id = '45000000-0000-0000-0000-000000000001'
     and item_type = 'coach_substitution'
     and status = 'todo'),
  1::bigint,
  'administrator plan receives a substitution task'
);

select is(
  (select count(*) from public.audit_log
   where action = 'delete_coach'
     and entity_id = '15000000-0000-0000-0000-000000000001'),
  1::bigint,
  'deletion action is written to the audit log'
);

select * from finish();
rollback;
