begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('13000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'evaluation-coach@example.test', 'test', now(), '{"full_name":"Тренер Оцінювання"}', now(), now()),
  ('13000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'evaluation-admin@example.test', 'test', now(), '{"full_name":"Адміністратор Оцінювання"}', now(), now());

update public.profiles set status = 'active'
where id in ('13000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002');
update public.profiles set role = 'admin' where id = '13000000-0000-0000-0000-000000000002';

insert into public.coach_group_assignments (coach_id, group_id, assignment_role)
select '13000000-0000-0000-0000-000000000001', id, 'lead'
from public.groups where code = 'U11A';

insert into public.players (id, group_id, full_name, birth_year, created_by)
select '33000000-0000-0000-0000-000000000001', id, 'Гравець Оцінювання', 2015,
       '13000000-0000-0000-0000-000000000002'
from public.groups where code = 'U11A';

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.evaluation_metrics (id, kind, name, default_unit, sort_order, created_by)
    values ('63000000-0000-0000-0000-000000000001', 'physical_preparedness', 'Біг 20 м QA', 'с', 990,
            '13000000-0000-0000-0000-000000000002')$$,
  'administrator creates a physical-preparedness test'
);

select lives_ok(
  $$insert into public.evaluation_metrics (id, kind, name, sort_order, created_by)
    values ('63000000-0000-0000-0000-000000000002', 'game_activity', 'Рішення з м’ячем QA', 991,
            '13000000-0000-0000-0000-000000000002')$$,
  'administrator creates a game-activity component'
);

insert into public.evaluation_metrics (id, kind, name, sort_order, is_active, created_by)
values ('63000000-0000-0000-0000-000000000003', 'physical_preparedness', 'Неактивний тест QA', 992, false,
        '13000000-0000-0000-0000-000000000002');

select lives_ok(
  $$insert into public.physical_test_results (player_id, measured_on, metric_name, value, created_by)
    values ('33000000-0000-0000-0000-000000000001', date '2026-09-18', 'біг 20 м qa', '4.21',
            '13000000-0000-0000-0000-000000000002')$$,
  'an active catalog metric is accepted by the result trigger'
);

select is(
  (select metric_name from public.physical_test_results where player_id = '33000000-0000-0000-0000-000000000001'),
  'Біг 20 м QA',
  'the trigger stores the canonical metric name'
);

select is(
  (select unit from public.physical_test_results where player_id = '33000000-0000-0000-0000-000000000001'),
  'с',
  'the trigger applies the catalog default unit'
);

select throws_ok(
  $$insert into public.physical_test_results (player_id, measured_on, metric_name, value, created_by)
    values ('33000000-0000-0000-0000-000000000001', date '2026-09-19', 'Рішення з м’ячем QA', '3',
            '13000000-0000-0000-0000-000000000002')$$,
  '23503',
  'EVALUATION_METRIC_NOT_FOUND: Рішення з м’ячем QA',
  'a game-activity component cannot be used as a physical test'
);

reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is(
  (select count(*) from public.evaluation_metrics where name like '% QA'),
  2::bigint,
  'coach sees active catalog entries but not inactive ones'
);

select is(
  (select count(*) from public.physical_test_results where player_id = '33000000-0000-0000-0000-000000000001'),
  1::bigint,
  'coach sees a result for an assigned player'
);

select throws_ok(
  $$insert into public.evaluation_metrics (kind, name) values ('game_activity', 'Заборонено QA')$$,
  '42501',
  null,
  'coach cannot add catalog entries'
);

select * from finish();
rollback;
