begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('12000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'integrity-coach@example.test', 'test', now(), '{"full_name":"Тренер Цілісність"}', now(), now()),
  ('12000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'integrity-admin@example.test', 'test', now(), '{"full_name":"Адміністратор Цілісність"}', now(), now());

update public.profiles set status = 'active'
where id in ('12000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000002');
update public.profiles set role = 'admin' where id = '12000000-0000-0000-0000-000000000002';

insert into public.coach_group_assignments (coach_id, group_id, assignment_role)
select '12000000-0000-0000-0000-000000000001', id, 'lead'
from public.groups where code = 'U10A';

insert into public.players (id, group_id, full_name, birth_year, created_by)
select '32000000-0000-0000-0000-000000000001', id, 'Гравець Цілісність', 2016,
       '12000000-0000-0000-0000-000000000002'
from public.groups where code = 'U10A';

insert into public.inventory_items (id, group_id, name, quantity, created_by)
select '62000000-0000-0000-0000-000000000001', id, 'М’ячі цілісність', 8,
       '12000000-0000-0000-0000-000000000002'
from public.groups where code = 'U10A';

insert into public.inventory_permissions (coach_id, group_id, can_edit_quantity, can_report_issues)
select '12000000-0000-0000-0000-000000000001', id, true, true
from public.groups where code = 'U10A';

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select lives_ok(
  $$select public.save_uniform_request(
    '32000000-0000-0000-0000-000000000001',
    8::smallint,
    'ЦІЛІСНІСТЬ',
    '[{"catalog_item_id":"40000000-0000-0000-0000-000000000003","size":"140"}]'::jsonb
  )$$,
  'coach saves a complete uniform request atomically'
);

select is(
  (select status from public.uniform_requests where player_id = '32000000-0000-0000-0000-000000000001'),
  'requested'::public.uniform_status,
  'uniform request receives the requested status'
);

reset role;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
update public.uniform_requests set status = 'preparing'
where player_id = '32000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select throws_ok(
  $$select public.save_uniform_request(
    '32000000-0000-0000-0000-000000000001',
    9::smallint,
    'ЗМІНА',
    '[]'::jsonb
  )$$,
  '42501',
  'Uniform request is locked',
  'coach cannot modify a preparing uniform request'
);

select throws_ok(
  $$update public.inventory_items set is_active = false
    where id = '62000000-0000-0000-0000-000000000001'$$,
  '42501',
  'Coach cannot change administrative inventory fields',
  'coach cannot deactivate an inventory catalog position'
);

select lives_ok(
  $$insert into public.events (
      id, group_id, event_type, start_at, duration_minutes, coach_id, created_by, status
    )
    select '42000000-0000-0000-0000-000000000001', id, 'training',
           timestamptz '2026-10-03 15:00:00+00', 60,
           '12000000-0000-0000-0000-000000000002',
           '12000000-0000-0000-0000-000000000002', 'completed'
    from public.groups where code = 'U10A'$$,
  'coach creates an event with server-managed administrative fields'
);

select is(
  (select coach_id from public.events where id = '42000000-0000-0000-0000-000000000001'),
  '12000000-0000-0000-0000-000000000001'::uuid,
  'event trigger forces the authenticated coach'
);

select lives_ok(
  $$update public.events set start_at = timestamptz '2026-10-03 16:00:00+00'
    where id = '42000000-0000-0000-0000-000000000001'$$,
  'coach reschedules own event'
);

select is(
  (select original_start_at from public.events where id = '42000000-0000-0000-0000-000000000001'),
  timestamptz '2026-10-03 15:00:00+00',
  'database preserves the original event time'
);

select is(
  (select is_rescheduled from public.events where id = '42000000-0000-0000-0000-000000000001'),
  true,
  'database marks the event as rescheduled'
);

select is(
  (select count(*) from public.operational_items where event_id = '42000000-0000-0000-0000-000000000001' and item_type = 'reschedule'),
  1::bigint,
  'rescheduling creates an operational item automatically'
);

insert into public.file_assets (
  id, owner_id, bucket, object_path, original_name, mime_type, size_bytes,
  scan_status, context_type, context_group_id, context_age
)
select '72000000-0000-0000-0000-000000000001',
       '12000000-0000-0000-0000-000000000002', 'task-documents',
       '12000000-0000-0000-0000-000000000001/pending.pdf', 'pending.pdf',
       'application/pdf', 100, 'clean', 'event_task_material', id, 10
from public.groups where code = 'U10A';

select is(
  (select scan_status from public.file_assets where id = '72000000-0000-0000-0000-000000000001'),
  'pending'::public.file_scan_status,
  'client cannot mark a new file as clean'
);

update public.file_assets set scan_status = 'clean'
where id = '72000000-0000-0000-0000-000000000001';

select is(
  (select scan_status from public.file_assets where id = '72000000-0000-0000-0000-000000000001'),
  'pending'::public.file_scan_status,
  'client cannot promote a pending file'
);

select * from finish();
rollback;
