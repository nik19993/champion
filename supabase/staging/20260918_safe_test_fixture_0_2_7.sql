-- STAGING ONLY. Synthetic, non-production fixture for the private champion-staging project.
-- The profile below has no email, no password and is banned, so it cannot sign in.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, banned_until, is_sso_user, is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  null,
  null,
  '{"provider":"none","providers":[],"staging_fixture":true}'::jsonb,
  '{"full_name":"[ТЕСТ] Тренер сценаріїв"}'::jsonb,
  now(),
  now(),
  '2126-01-01 00:00:00+00',
  false,
  false
)
on conflict (id) do update set
  email = null,
  encrypted_password = null,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  banned_until = excluded.banned_until,
  updated_at = now();

insert into public.profiles (
  id, full_name, first_name, last_name, middle_name, email,
  role, status, must_change_password
)
values (
  '11111111-1111-4111-8111-111111111111',
  '[ТЕСТ] Тренер сценаріїв',
  'Тренер',
  '[ТЕСТ]',
  'Сценаріїв',
  null,
  'coach',
  'active',
  true
)
on conflict (id) do update set
  full_name = excluded.full_name,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  middle_name = excluded.middle_name,
  email = null,
  role = 'coach',
  status = 'active',
  must_change_password = true;

do $fixture$
declare
  admin_id constant uuid := '7ccd3fbe-f705-4690-b609-6d409dd10e3a';
  coach_id constant uuid := '11111111-1111-4111-8111-111111111111';
  group_id uuid;
  venue_id uuid;
  task_id uuid;
  catalog_item_id uuid;
  activity_metric_id uuid;
begin
  select id into strict group_id from public.groups where code = 'U15B';
  select id into strict venue_id from public.venues where is_active order by name limit 1;
  select id into strict task_id
  from public.methodology_tasks
  where is_active and age_from <= 15 and age_to >= 15
  order by sort_order, title
  limit 1;
  select id into strict catalog_item_id
  from public.uniform_catalog_items
  where is_active
  order by sort_order, name
  limit 1;
  select id into strict activity_metric_id
  from public.evaluation_metrics
  where kind = 'game_activity'
    and lower(name) = lower('Лідерські якості')
    and is_active
  order by sort_order, id
  limit 1;

  delete from public.announcement_targets where id = '11111111-1111-4111-8111-111111111901';
  delete from public.announcements where id = '11111111-1111-4111-8111-111111111900';
  delete from public.attendance_records where id in (
    '11111111-1111-4111-8111-111111111601',
    '11111111-1111-4111-8111-111111111602',
    '11111111-1111-4111-8111-111111111603'
  );
  delete from public.attendance_sessions where id = '11111111-1111-4111-8111-111111111600';
  delete from public.operational_items where id = '11111111-1111-4111-8111-111111111700';
  delete from public.events where id in (
    '11111111-1111-4111-8111-111111111501',
    '11111111-1111-4111-8111-111111111502',
    '11111111-1111-4111-8111-111111111503'
  );
  delete from public.physical_test_results where id = '11111111-1111-4111-8111-111111111401';
  delete from public.game_activity_results where id = '11111111-1111-4111-8111-111111111402';
  delete from public.uniform_request_items where id in (
    '11111111-1111-4111-8111-111111111351',
    '11111111-1111-4111-8111-111111111352'
  );
  delete from public.uniform_requests where id in (
    '11111111-1111-4111-8111-111111111301',
    '11111111-1111-4111-8111-111111111302'
  );
  delete from public.monthly_payments where id in (
    '11111111-1111-4111-8111-111111111251',
    '11111111-1111-4111-8111-111111111252',
    '11111111-1111-4111-8111-111111111253'
  );
  delete from public.guardians where id in (
    '11111111-1111-4111-8111-111111111211',
    '11111111-1111-4111-8111-111111111212',
    '11111111-1111-4111-8111-111111111213'
  );
  delete from public.players where id in (
    '11111111-1111-4111-8111-111111111201',
    '11111111-1111-4111-8111-111111111202',
    '11111111-1111-4111-8111-111111111203'
  );
  delete from public.inventory_items where id in (
    '11111111-1111-4111-8111-111111111801',
    '11111111-1111-4111-8111-111111111802'
  );
  delete from public.inventory_permissions where id = '11111111-1111-4111-8111-111111111850';
  delete from public.coach_group_assignments where id = '11111111-1111-4111-8111-111111111101';
  delete from public.evaluation_metrics where id = '11111111-1111-4111-8111-111111111401';

  insert into public.coach_group_assignments (
    id, coach_id, group_id, assignment_role, is_active, created_by
  ) values (
    '11111111-1111-4111-8111-111111111101', coach_id, group_id, 'lead', true, admin_id
  );

  insert into public.evaluation_metrics (
    id, kind, name, default_unit, description, sort_order, is_active, created_by, updated_by
  ) values (
    '11111111-1111-4111-8111-111111111401', 'physical_preparedness', '[ТЕСТ] Біг 20 м', 'с', 'Синтетичний показник для staging-перевірки.', 9001, true, admin_id, admin_id
  );

  insert into public.players (
    id, group_id, full_name, first_name, last_name, middle_name,
    birth_date, birth_year, position, dominant_foot, coach_note,
    is_active, external_key, created_by, updated_by
  ) values
    ('11111111-1111-4111-8111-111111111201', group_id, '[ТЕСТ] Гравець Альфа', 'Альфа', '[ТЕСТ] Гравець', null, make_date(extract(year from current_date)::int - 15, 2, 10), extract(year from current_date)::int - 15, 'Захисник', 'права', 'Лише синтетичні staging-дані.', true, 'STAGING-TEST-PLAYER-A', admin_id, admin_id),
    ('11111111-1111-4111-8111-111111111202', group_id, '[ТЕСТ] Гравець Бета', 'Бета', '[ТЕСТ] Гравець', null, make_date(extract(year from current_date)::int - 15, 5, 20), extract(year from current_date)::int - 15, 'Півзахисник', 'ліва', 'Лише синтетичні staging-дані.', true, 'STAGING-TEST-PLAYER-B', admin_id, admin_id),
    ('11111111-1111-4111-8111-111111111203', group_id, '[ТЕСТ] Гравець Гамма', 'Гамма', '[ТЕСТ] Гравець', null, make_date(extract(year from current_date)::int - 15, 8, 15), extract(year from current_date)::int - 15, 'Нападник', 'права', 'Лише синтетичні staging-дані.', true, 'STAGING-TEST-PLAYER-C', admin_id, admin_id);

  insert into public.guardians (
    id, player_id, full_name, relation, phone, email, created_by, updated_by
  ) values
    ('11111111-1111-4111-8111-111111111211', '11111111-1111-4111-8111-111111111201', '[ТЕСТ] Контакт Альфа', 'мати/батько', null, null, admin_id, admin_id),
    ('11111111-1111-4111-8111-111111111212', '11111111-1111-4111-8111-111111111202', '[ТЕСТ] Контакт Бета', 'мати/батько', null, null, admin_id, admin_id),
    ('11111111-1111-4111-8111-111111111213', '11111111-1111-4111-8111-111111111203', '[ТЕСТ] Контакт Гамма', 'мати/батько', null, null, admin_id, admin_id);

  insert into public.monthly_payments (id, player_id, month, status, changed_by) values
    ('11111111-1111-4111-8111-111111111251', '11111111-1111-4111-8111-111111111201', date_trunc('month', current_date)::date, 'paid', coach_id),
    ('11111111-1111-4111-8111-111111111252', '11111111-1111-4111-8111-111111111202', date_trunc('month', current_date)::date, 'unpaid', coach_id),
    ('11111111-1111-4111-8111-111111111253', '11111111-1111-4111-8111-111111111203', date_trunc('month', current_date)::date, 'paid', coach_id);

  insert into public.uniform_requests (
    id, player_id, number, surname_print, status, admin_note, requested_by, updated_by
  ) values
    ('11111111-1111-4111-8111-111111111301', '11111111-1111-4111-8111-111111111201', 11, 'АЛЬФА', 'requested', '[ТЕСТ] Перевірка замовлення форми.', coach_id, coach_id),
    ('11111111-1111-4111-8111-111111111302', '11111111-1111-4111-8111-111111111202', 7, 'БЕТА', 'preparing', '[ТЕСТ] Перевірка підготовки форми.', coach_id, admin_id);

  insert into public.uniform_request_items (
    id, request_id, catalog_item_id, size, quantity, actor_id
  ) values
    ('11111111-1111-4111-8111-111111111351', '11111111-1111-4111-8111-111111111301', catalog_item_id, '164', 1, coach_id),
    ('11111111-1111-4111-8111-111111111352', '11111111-1111-4111-8111-111111111302', catalog_item_id, 'M', 1, admin_id);

  insert into public.physical_test_results (
    id, player_id, measured_on, metric_id, metric_name, value, unit, source, created_by
  ) values (
    '11111111-1111-4111-8111-111111111401',
    '11111111-1111-4111-8111-111111111201',
    current_date,
    '11111111-1111-4111-8111-111111111401',
    '[ТЕСТ] Біг 20 м',
    '3.42',
    'с',
    'staging_fixture',
    admin_id
  );

  insert into public.game_activity_results (
    id, player_id, period, metric_id, metric_name, value, source, created_by
  ) values (
    '11111111-1111-4111-8111-111111111402',
    '11111111-1111-4111-8111-111111111201',
    to_char(current_date, 'YYYY-MM'),
    activity_metric_id,
    'Лідерські якості',
    '4',
    'staging_fixture',
    admin_id
  );

  insert into public.events (
    id, group_id, event_type, start_at, duration_minutes, ends_at,
    venue_id, task_id, coach_id, title, notes, organizational_need,
    coach_comment, needs_substitute, status, idempotency_key, created_by, updated_by
  ) values
    ('11111111-1111-4111-8111-111111111501', group_id, 'training', current_date - interval '1 day' + interval '15 hours', 90, current_date - interval '1 day' + interval '16 hours 30 minutes', venue_id, task_id, coach_id, '[ТЕСТ] Вчорашнє тренування', 'Синтетична подія з відвідуванням.', null, 'Відвідування внесено.', false, 'completed', '11111111-1111-4111-8111-111111112501', coach_id, coach_id),
    ('11111111-1111-4111-8111-111111111502', group_id, 'training', current_date + interval '15 hours', 90, current_date + interval '16 hours 30 minutes', venue_id, task_id, coach_id, '[ТЕСТ] Сьогоднішнє тренування', 'Синтетична подія для перевірки розділу «Сьогодні».', null, null, false, 'scheduled', '11111111-1111-4111-8111-111111112502', coach_id, coach_id),
    ('11111111-1111-4111-8111-111111111503', group_id, 'training', current_date + interval '1 day' + interval '15 hours', 90, current_date + interval '1 day' + interval '16 hours 30 minutes', venue_id, task_id, coach_id, '[ТЕСТ] Потрібна заміна тренера', 'Синтетична подія для перевірки виділення заміни.', 'Підтвердити заміну до початку заняття.', 'Тренер недоступний.', true, 'scheduled', '11111111-1111-4111-8111-111111112503', coach_id, coach_id);

  insert into public.attendance_sessions (
    id, event_id, completed_at, completed_by, idempotency_key, client_created_at
  ) values (
    '11111111-1111-4111-8111-111111111600',
    '11111111-1111-4111-8111-111111111501',
    current_date - interval '1 day' + interval '17 hours',
    coach_id,
    '11111111-1111-4111-8111-111111112600',
    current_date - interval '1 day' + interval '17 hours'
  );

  insert into public.attendance_records (id, session_id, player_id, status, note, actor_id) values
    ('11111111-1111-4111-8111-111111111601', '11111111-1111-4111-8111-111111111600', '11111111-1111-4111-8111-111111111201', 'present', null, coach_id),
    ('11111111-1111-4111-8111-111111111602', '11111111-1111-4111-8111-111111111600', '11111111-1111-4111-8111-111111111202', 'absent', '[ТЕСТ] Поважна причина.', coach_id),
    ('11111111-1111-4111-8111-111111111603', '11111111-1111-4111-8111-111111111600', '11111111-1111-4111-8111-111111111203', 'present', null, coach_id);

  insert into public.operational_items (
    id, group_id, event_id, item_type, status, title, comment, due_at,
    assigned_to, dedupe_key, created_by, updated_by
  ) values (
    '11111111-1111-4111-8111-111111111700',
    group_id,
    '11111111-1111-4111-8111-111111111503',
    'coach_substitution',
    'todo',
    '[ТЕСТ] Потрібна заміна тренера',
    'Синтетичний запис для перевірки адміністративного Плану.',
    current_date + interval '1 day' + interval '12 hours',
    null,
    'staging-test-coach-substitution',
    coach_id,
    coach_id
  );

  insert into public.inventory_items (
    id, group_id, name, quantity, damaged, lost, needed, is_active, created_by, updated_by
  ) values
    ('11111111-1111-4111-8111-111111111801', group_id, '[ТЕСТ] М’ячі', 12, 1, 0, 2, true, admin_id, coach_id),
    ('11111111-1111-4111-8111-111111111802', group_id, '[ТЕСТ] Манішки жовті', 16, 0, 1, 4, true, admin_id, coach_id);

  insert into public.inventory_permissions (
    id, coach_id, group_id, can_edit_quantity, can_report_issues, updated_by
  ) values (
    '11111111-1111-4111-8111-111111111850', coach_id, group_id, true, true, admin_id
  );

  insert into public.announcements (
    id, title, body, starts_at, ends_at, is_active,
    require_acknowledgement, created_by, updated_by
  ) values (
    '11111111-1111-4111-8111-111111111900',
    '[ТЕСТ] Оголошення для тренера',
    'Синтетичне staging-оголошення. Його можна редагувати та видаляти під час перевірки.',
    now() - interval '1 hour',
    now() + interval '14 days',
    true,
    true,
    admin_id,
    admin_id
  );

  insert into public.announcement_targets (
    id, announcement_id, target_type, coach_id, age
  ) values (
    '11111111-1111-4111-8111-111111111901',
    '11111111-1111-4111-8111-111111111900',
    'coach',
    coach_id,
    null
  );
end
$fixture$;

commit;
