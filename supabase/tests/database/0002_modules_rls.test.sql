begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'module-coach-a@example.test', 'test', now(), '{"full_name":"Тренер Модуль А"}', now(), now()),
  ('11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'module-coach-b@example.test', 'test', now(), '{"full_name":"Тренер Модуль Б"}', now(), now()),
  ('11000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'module-admin@example.test', 'test', now(), '{"full_name":"Адміністратор Модуль"}', now(), now());

update public.profiles set status = 'active'
where id in ('11000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000003');
update public.profiles set role = 'admin' where id = '11000000-0000-0000-0000-000000000003';

insert into public.coach_group_assignments (coach_id, group_id, assignment_role)
select '11000000-0000-0000-0000-000000000001', id, 'lead' from public.groups where code = 'U9A';
insert into public.coach_group_assignments (coach_id, group_id, assignment_role)
select '11000000-0000-0000-0000-000000000002', id, 'lead' from public.groups where code = 'U9B';

insert into public.players (id, group_id, full_name, birth_year, created_by)
select '31000000-0000-0000-0000-000000000001', id, 'Гравець А', 2017, '11000000-0000-0000-0000-000000000003' from public.groups where code = 'U9A';
insert into public.players (id, group_id, full_name, birth_year, created_by)
select '31000000-0000-0000-0000-000000000002', id, 'Гравець Б', 2017, '11000000-0000-0000-0000-000000000003' from public.groups where code = 'U9B';

insert into public.guardians (player_id, full_name, phone, created_by)
values
  ('31000000-0000-0000-0000-000000000001', 'Опікун А', null, '11000000-0000-0000-0000-000000000003'),
  ('31000000-0000-0000-0000-000000000002', 'Опікун Б', null, '11000000-0000-0000-0000-000000000003');

insert into public.monthly_payments (player_id, month, status, changed_by)
values
  ('31000000-0000-0000-0000-000000000001', date '2026-09-01', 'paid', '11000000-0000-0000-0000-000000000003'),
  ('31000000-0000-0000-0000-000000000002', date '2026-09-01', 'unpaid', '11000000-0000-0000-0000-000000000003');

insert into public.inventory_items (group_id, name, quantity, created_by)
select id, 'М’ячі тест', 10, '11000000-0000-0000-0000-000000000003' from public.groups where code in ('U9A', 'U9B');

insert into public.events (id, group_id, event_type, start_at, duration_minutes, coach_id, created_by)
select '41000000-0000-0000-0000-000000000001', id, 'training', timestamptz '2026-09-20 15:00:00+00', 60, '11000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001' from public.groups where code = 'U9A';
insert into public.events (id, group_id, event_type, start_at, duration_minutes, coach_id, created_by)
select '41000000-0000-0000-0000-000000000002', id, 'training', timestamptz '2026-09-20 17:00:00+00', 60, '11000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002' from public.groups where code = 'U9B';

insert into public.announcements (id, title, body, created_by)
values
  ('51000000-0000-0000-0000-000000000001', 'Для всіх', 'Тест', '11000000-0000-0000-0000-000000000003'),
  ('51000000-0000-0000-0000-000000000002', 'Для А', 'Тест', '11000000-0000-0000-0000-000000000003'),
  ('51000000-0000-0000-0000-000000000003', 'Для Б', 'Тест', '11000000-0000-0000-0000-000000000003');
insert into public.announcement_targets (announcement_id, target_type, coach_id)
values
  ('51000000-0000-0000-0000-000000000001', 'all', null),
  ('51000000-0000-0000-0000-000000000002', 'coach', '11000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000003', 'coach', '11000000-0000-0000-0000-000000000002');

insert into public.file_assets (owner_id, bucket, object_path, original_name, mime_type, size_bytes, scan_status, context_type, context_group_id)
select '11000000-0000-0000-0000-000000000003', 'task-documents', 'tests/u9a.pdf', 'u9a.pdf', 'application/pdf', 100, 'clean', 'test', id from public.groups where code = 'U9A';
insert into public.file_assets (owner_id, bucket, object_path, original_name, mime_type, size_bytes, scan_status, context_type, context_group_id)
select '11000000-0000-0000-0000-000000000003', 'task-documents', 'tests/u9b.pdf', 'u9b.pdf', 'application/pdf', 100, 'clean', 'test', id from public.groups where code = 'U9B';

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*) from public.players), 1::bigint, 'coach sees players only in assigned team');
select is((select full_name from public.players), 'Гравець А', 'coach sees the correct player');
select is((select count(*) from public.guardians), 1::bigint, 'coach sees guardians only for assigned players');
select is((select count(*) from public.monthly_payments), 1::bigint, 'coach sees payments only for assigned players');
select is((select count(*) from public.events), 1::bigint, 'coach sees events only for assigned team');
select is((select count(*) from public.inventory_items), 1::bigint, 'coach sees inventory only for assigned team');
select is((select count(*) from public.announcements), 2::bigint, 'coach sees all-staff and directly targeted announcements');
select is((select count(*) from public.file_assets), 1::bigint, 'coach sees clean files only for assigned team');
select is((select count(*) from public.inventory_permissions), 0::bigint, 'coach cannot see another coach permissions');

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select is((select count(*) from public.players where id in ('31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002')), 2::bigint, 'administrator with MFA sees both teams players');
select is((select count(*) from public.file_assets where object_path like 'tests/%'), 2::bigint, 'administrator with MFA sees all private file metadata');

select * from finish();
rollback;
