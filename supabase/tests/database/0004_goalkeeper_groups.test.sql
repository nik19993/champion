begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('13000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'goalkeeper-coach@example.test', 'test', now(), '{"full_name":"Тренер воротарів"}', now(), now()),
  ('13000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'goalkeeper-admin@example.test', 'test', now(), '{"full_name":"Адміністратор воротарів"}', now(), now());

update public.profiles
set status = 'active'
where id in (
  '13000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000002'
);
update public.profiles
set role = 'admin'
where id = '13000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select lives_ok(
  $$select public.admin_assign_groups(
    '13000000-0000-0000-0000-000000000001',
    array(select id from public.groups where code in ('Воротарі A', 'Воротарі B') order by code)
  )$$,
  'administrator assigns one goalkeeper coach to multiple goalkeeper groups'
);

insert into public.announcements (
  id, title, body, starts_at, is_active, created_by, updated_by
) values (
  '73000000-0000-0000-0000-000000000001',
  'Оголошення для воротарів',
  'Тест групового одержувача',
  now(),
  true,
  '13000000-0000-0000-0000-000000000002',
  '13000000-0000-0000-0000-000000000002'
);

insert into public.announcement_targets (announcement_id, target_type, group_id)
select '73000000-0000-0000-0000-000000000001', 'group', id
from public.groups where code = 'Воротарі A';

insert into public.methodology_sections (
  id, title, description, sort_order, is_active, created_by, updated_by
) values (
  '74000000-0000-0000-0000-000000000001',
  'Робота тренера воротарів',
  'Загальні методичні матеріали',
  10,
  true,
  '13000000-0000-0000-0000-000000000002',
  '13000000-0000-0000-0000-000000000002'
);

reset role;

insert into public.players (id, group_id, full_name, birth_year, created_by)
select '33000000-0000-0000-0000-000000000001', id, 'Воротар тестовий', 2015,
       '13000000-0000-0000-0000-000000000002'
from public.groups where code = 'Воротарі A';

insert into public.events (id, group_id, event_type, start_at, duration_minutes, coach_id, title, created_by)
select '43000000-0000-0000-0000-000000000001', id, 'training',
       timestamptz '2026-10-10 14:00:00+00', 60,
       '13000000-0000-0000-0000-000000000001', 'Гра на виходах',
       '13000000-0000-0000-0000-000000000001'
from public.groups where code = 'Воротарі A';

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*) from public.groups), 2::bigint, 'goalkeeper coach sees both assigned groups');
select is((select count(*) from public.groups where age is null and group_kind = 'goalkeeper'), 2::bigint, 'goalkeeper groups do not impersonate an age category');
select is((select count(*) from public.players), 1::bigint, 'goalkeeper coach sees players in the assigned goalkeeper group');
select is((select title from public.events), 'Гра на виходах', 'goalkeeper coach sees the goalkeeper training event');
select is((select count(*) from public.announcements where id = '73000000-0000-0000-0000-000000000001'), 1::bigint, 'goalkeeper coach sees an announcement targeted to an assigned goalkeeper group');
select is((select count(*) from public.methodology_sections where id = '74000000-0000-0000-0000-000000000001'), 1::bigint, 'goalkeeper coach sees the active general methodology section');

select * from finish();
rollback;
