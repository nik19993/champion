begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('14000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'star-coach-a@example.test', 'test', now(), '{"full_name":"Тренер Зірка А"}', now(), now()),
  ('14000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'star-coach-b@example.test', 'test', now(), '{"full_name":"Тренер Зірка Б"}', now(), now()),
  ('14000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'star-admin@example.test', 'test', now(), '{"full_name":"Адміністратор Зірка"}', now(), now());

update public.profiles set status = 'active'
where id in (
  '14000000-0000-0000-0000-000000000001',
  '14000000-0000-0000-0000-000000000002',
  '14000000-0000-0000-0000-000000000003'
);
update public.profiles set role = 'admin' where id = '14000000-0000-0000-0000-000000000003';

insert into public.coach_group_assignments (coach_id, group_id, assignment_role)
select '14000000-0000-0000-0000-000000000001', id, 'lead' from public.groups where code = 'U12A';
insert into public.coach_group_assignments (coach_id, group_id, assignment_role)
select '14000000-0000-0000-0000-000000000002', id, 'lead' from public.groups where code = 'U12B';

insert into public.players (id, group_id, full_name, birth_year, created_by)
select '34000000-0000-0000-0000-000000000001', id, 'Гравець Зірка А', 2014,
       '14000000-0000-0000-0000-000000000003' from public.groups where code = 'U12A';
insert into public.players (id, group_id, full_name, birth_year, created_by)
select '34000000-0000-0000-0000-000000000002', id, 'Гравець Зірка Б', 2014,
       '14000000-0000-0000-0000-000000000003' from public.groups where code = 'U12B';

select set_config(
  'champion_test.other_group_id',
  (select id::text from public.groups where code = 'U12B'),
  true
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"14000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

insert into public.monthly_star_themes (id, month, title, description, criteria, created_by)
values (
  '64000000-0000-0000-0000-000000000001', date '2026-09-01', 'Місяць техніки',
  'Працюємо над якістю технічних дій.', 'Старанність, повага та прогрес.',
  '14000000-0000-0000-0000-000000000003'
);

insert into public.player_behavior_cards (player_id, group_id, coach_id, occurred_on, reason, comment)
select '34000000-0000-0000-0000-000000000002', id,
       '14000000-0000-0000-0000-000000000002', date '2026-09-04', 'late', 'Контрольна картка іншої групи'
from public.groups where code = 'U12B';

reset role;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"14000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is(
  (select title from public.monthly_star_themes where month = date '2026-09-01'),
  'Місяць техніки',
  'coach sees the administrator-defined monthly theme'
);

select throws_ok(
  $$insert into public.player_behavior_cards (player_id, group_id, occurred_on, reason)
    values (
      '34000000-0000-0000-0000-000000000002',
      current_setting('champion_test.other_group_id')::uuid,
      date '2026-09-05',
      'late'
    )$$,
  '42501',
  null,
  'coach cannot add a behavior card in another group'
);

select lives_ok(
  $$insert into public.player_behavior_cards (id, player_id, group_id, occurred_on, reason, comment)
    select cards.id, '34000000-0000-0000-0000-000000000001', g.id, cards.occurred_on, cards.reason, cards.comment
    from public.groups g
    cross join (values
      ('74000000-0000-0000-0000-000000000001'::uuid, date '2026-09-03', 'late'::public.behavior_card_reason, null::text),
      ('74000000-0000-0000-0000-000000000002'::uuid, date '2026-09-07', 'discipline_violation'::public.behavior_card_reason, null::text),
      ('74000000-0000-0000-0000-000000000003'::uuid, date '2026-09-11', 'safety'::public.behavior_card_reason, null::text),
      ('74000000-0000-0000-0000-000000000004'::uuid, date '2026-09-15', 'other'::public.behavior_card_reason, 'Повторне порушення домовленості')
    ) as cards(id, occurred_on, reason, comment)
    where g.code = 'U12A'$$,
  'coach records behavior cards for an assigned group'
);

select throws_ok(
  $$insert into public.monthly_star_awards (month, group_id, theme_id, award_type, player_id)
    select date '2026-09-01', id, '64000000-0000-0000-0000-000000000001', 'coach_choice',
           '34000000-0000-0000-0000-000000000001'
    from public.groups where code = 'U12A'$$,
  '23514',
  'PLAYER_INELIGIBLE_FOR_MONTHLY_STAR',
  'four active cards make a player ineligible for the month'
);

select lives_ok(
  $$select public.void_behavior_card('74000000-0000-0000-0000-000000000004', 'Створено помилково')$$,
  'coach voids a mistaken card without deleting its history'
);

select throws_ok(
  $$update public.player_behavior_cards set reason = 'late'
    where id = '74000000-0000-0000-0000-000000000004'$$,
  '42501',
  'ONLY_CARD_VOIDING_IS_ALLOWED',
  'coach cannot rewrite behavior history after creation'
);

select is(
  (select count(*) from public.player_behavior_cards
   where player_id = '34000000-0000-0000-0000-000000000001'
     and month = date '2026-09-01' and not is_voided),
  3::bigint,
  'only active non-voided cards count in the month'
);

select lives_ok(
  $$insert into public.parent_contact_actions (player_id, group_id, month, comment)
    select '34000000-0000-0000-0000-000000000001', id, date '2026-09-01', 'Контакт із батьками здійснено'
    from public.groups where code = 'U12A'$$,
  'coach records the parent contact action at three cards'
);

select lives_ok(
  $$insert into public.monthly_star_awards (month, group_id, theme_id, award_type, player_id)
    select date '2026-09-01', id, '64000000-0000-0000-0000-000000000001', 'coach_choice',
           '34000000-0000-0000-0000-000000000001'
    from public.groups where code = 'U12A'$$,
  'player becomes eligible after the mistaken fourth card is voided'
);

select throws_ok(
  $$insert into public.monthly_star_awards (month, group_id, theme_id, award_type, player_id)
    select date '2026-09-01', id, '64000000-0000-0000-0000-000000000001', 'team_choice',
           '34000000-0000-0000-0000-000000000001'
    from public.groups where code = 'U12A'$$,
  '23505',
  null,
  'the same player cannot receive both monthly awards'
);

select is(
  (select count(*) from public.player_behavior_cards),
  4::bigint,
  'coach sees behavior history only for the assigned group'
);

reset role;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"14000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select is(
  (select count(*) from public.player_behavior_cards),
  5::bigint,
  'administrator sees behavior cards across all groups'
);

select * from finish();
rollback;
