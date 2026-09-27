begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

select is(
  (select count(*) from public.groups where code in ('U16A', 'U16B', 'U17A', 'U17B')),
  4::bigint,
  'all four new U16 and U17 groups exist'
);

select is(
  (select count(*) from public.groups where group_kind = 'age' and is_active),
  22::bigint,
  'the active age-group catalog now covers U6 through U17'
);

select throws_ok(
  $$insert into public.groups (code, age, team_suffix, group_kind)
    values ('U18A', 18, 'A', 'age')$$,
  '23514',
  null,
  'the supported range stops at U17 without a hidden U15 cap'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name in ('coach_note_author_id', 'coach_note_author_name', 'coach_note_updated_at')
  ),
  3::bigint,
  'player characteristics keep author and update metadata'
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('15000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'u16-coach@example.test', 'test', now(), '{"full_name":"Тренер U16"}', now(), now()),
  ('15000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'u17-admin@example.test', 'test', now(), '{"full_name":"Адміністратор U17"}', now(), now());

update public.profiles
set role = 'coach', status = 'active'
where id = '15000000-0000-0000-0000-000000000001';

update public.profiles
set role = 'admin', status = 'active'
where id = '15000000-0000-0000-0000-000000000002';

insert into public.coach_group_assignments (coach_id, group_id, assignment_role, created_by)
select '15000000-0000-0000-0000-000000000001', id, 'lead', '15000000-0000-0000-0000-000000000002'
from public.groups
where code = 'U16A';

insert into public.players (id, group_id, full_name, birth_year, created_by)
select '35000000-0000-0000-0000-000000000001', id, 'Гравець U16A', 2010,
       '15000000-0000-0000-0000-000000000002'
from public.groups
where code = 'U16A';

insert into public.players (id, group_id, full_name, birth_year, created_by)
select '35000000-0000-0000-0000-000000000002', id, 'Гравець U16B', 2010,
       '15000000-0000-0000-0000-000000000002'
from public.groups
where code = 'U16B';

insert into public.announcements (id, title, body, starts_at, created_by)
values (
  '65000000-0000-0000-0000-000000000001',
  'Оголошення U16',
  'Перевірка вікової адресації U16.',
  now() - interval '1 minute',
  '15000000-0000-0000-0000-000000000002'
);

insert into public.announcement_targets (announcement_id, target_type, age)
values ('65000000-0000-0000-0000-000000000001', 'age', 16);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"15000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is(
  (select count(*) from public.players),
  1::bigint,
  'coach sees players only in the assigned U16A group'
);

select lives_ok(
  $$insert into public.events (
      group_id, event_type, start_at, duration_minutes, ends_at, coach_id, title, created_by
    )
    select id, 'training', timestamptz '2026-10-01 15:00:00+00', 60,
           timestamptz '2026-10-01 16:00:00+00',
           '15000000-0000-0000-0000-000000000001', 'Тренування U16A',
           '15000000-0000-0000-0000-000000000001'
    from public.groups where code = 'U16A'$$,
  'coach can create a calendar event for U16A'
);

select is(
  (select count(*) from public.announcements where id = '65000000-0000-0000-0000-000000000001'),
  1::bigint,
  'coach assigned to U16 sees an age-targeted announcement'
);

select ok(
  (select count(*) > 0 from public.methodology_tasks where 16 between age_from and age_to),
  'coach assigned to U16 receives the senior methodology baseline'
);

select ok(
  (select count(*) > 0 from public.training_structures where 16 between age_from and age_to),
  'coach assigned to U16 receives a training structure'
);

select lives_ok(
  $$select public.save_player_coach_note(
      '35000000-0000-0000-0000-000000000001',
      'Уважний у роботі з м’ячем, стабільно виконує домовленості.'
    )$$,
  'assigned coach saves a short player characteristic'
);

select is(
  (select coach_note from public.players where id = '35000000-0000-0000-0000-000000000001'),
  'Уважний у роботі з м’ячем, стабільно виконує домовленості.',
  'the characteristic is stored as plain optional text'
);

select is(
  (select coach_note_author_id from public.players where id = '35000000-0000-0000-0000-000000000001'),
  '15000000-0000-0000-0000-000000000001'::uuid,
  'the last author id is stored'
);

select is(
  (select coach_note_author_name from public.players where id = '35000000-0000-0000-0000-000000000001'),
  'Тренер U16',
  'the last author name is stored for readable history'
);

select ok(
  (select coach_note_updated_at is not null from public.players where id = '35000000-0000-0000-0000-000000000001'),
  'the last update timestamp is stored'
);

select throws_ok(
  $$select public.save_player_coach_note(
      '35000000-0000-0000-0000-000000000002',
      'Недоступна характеристика іншої групи.'
    )$$,
  '42501',
  'PLAYER_COACH_NOTE_PERMISSION_DENIED',
  'coach cannot change a characteristic in another group'
);

reset role;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"15000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select is(
  (select coach_note from public.players where id = '35000000-0000-0000-0000-000000000001'),
  'Уважний у роботі з м’ячем, стабільно виконує домовленості.',
  'administrator can review the coach characteristic'
);

select throws_ok(
  $$select public.save_player_coach_note(
      '35000000-0000-0000-0000-000000000001',
      'Адміністратор не повинен редагувати це поле.'
    )$$,
  '42501',
  'PLAYER_COACH_NOTE_PERMISSION_DENIED',
  'administrator cannot author a coach characteristic'
);

select lives_ok(
  $$insert into public.physical_test_results (
      player_id, measured_on, metric_id, field_id, value, created_by
    )
    select
      '35000000-0000-0000-0000-000000000001',
      date '2026-10-02',
      metric.id,
      field.id,
      '1',
      '15000000-0000-0000-0000-000000000002'
    from public.evaluation_metrics metric
    join public.evaluation_metric_fields field on field.metric_id = metric.id and field.is_active
    where metric.kind = 'physical_preparedness'
      and metric.is_active
      and metric.age_from = 13
      and metric.age_to = 17
    order by metric.sort_order, field.sort_order
    limit 1$$,
  'an administrator can record an older-battery physical result for U16'
);

select is(
  (select count(*) from public.physical_test_results where player_id = '35000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the U16 physical result is persisted'
);

select * from finish();
rollback;
