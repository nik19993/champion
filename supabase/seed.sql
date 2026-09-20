-- Structural reference data only. No children, contacts, payments, or other personal data.
insert into public.groups (code, age, team_suffix, group_kind)
values
  ('U6', 6, null, 'age'),
  ('U7', 7, null, 'age'),
  ('U8A', 8, 'A', 'age'), ('U8B', 8, 'B', 'age'),
  ('U9A', 9, 'A', 'age'), ('U9B', 9, 'B', 'age'),
  ('U10A', 10, 'A', 'age'), ('U10B', 10, 'B', 'age'),
  ('U11A', 11, 'A', 'age'), ('U11B', 11, 'B', 'age'),
  ('U12A', 12, 'A', 'age'), ('U12B', 12, 'B', 'age'),
  ('U13A', 13, 'A', 'age'), ('U13B', 13, 'B', 'age'),
  ('U14A', 14, 'A', 'age'), ('U14B', 14, 'B', 'age'),
  ('U15A', 15, 'A', 'age'), ('U15B', 15, 'B', 'age'),
  ('Воротарі A', null, 'A', 'goalkeeper'),
  ('Воротарі B', null, 'B', 'goalkeeper'),
  ('Воротарі C', null, 'C', 'goalkeeper')
on conflict (code) do update
set age = excluded.age,
    team_suffix = excluded.team_suffix,
    group_kind = excluded.group_kind,
    is_active = true;

-- Non-personal reference data for local and staging environments.
insert into public.venues (id, name, venue_type, is_active)
values
  ('30000000-0000-0000-0000-000000000001', 'Основне поле', 'field', true),
  ('30000000-0000-0000-0000-000000000002', 'Малий майданчик', 'small_pitch', true)
on conflict (id) do update set name = excluded.name, venue_type = excluded.venue_type, is_active = excluded.is_active;

insert into public.uniform_catalog_items (id, name, sizes, sort_order, is_active)
values
  ('40000000-0000-0000-0000-000000000001', 'Гетри', array['Дитячі','S','M','L'], 1, true),
  ('40000000-0000-0000-0000-000000000002', 'Шорти', array['116','128','140','152','164','S','M','L'], 2, true),
  ('40000000-0000-0000-0000-000000000003', 'Футболка', array['116','128','140','152','164','S','M','L'], 3, true),
  ('40000000-0000-0000-0000-000000000004', 'Вітровка', array['116','128','140','152','164','S','M','L'], 4, true),
  ('40000000-0000-0000-0000-000000000005', 'Спортивний костюм', array['116','128','140','152','164','S','M','L'], 5, true)
on conflict (id) do update set name = excluded.name, sizes = excluded.sizes, sort_order = excluded.sort_order, is_active = excluded.is_active;

insert into public.training_structures (id, name, age_from, age_to, is_active)
values
  ('50000000-0000-0000-0000-000000000001', 'Структура заняття U6–U8', 6, 8, true),
  ('50000000-0000-0000-0000-000000000002', 'Структура заняття U9–U15', 9, 15, true)
on conflict (id) do update set name = excluded.name, age_from = excluded.age_from, age_to = excluded.age_to, is_active = excluded.is_active;

insert into public.training_structure_steps (id, structure_id, position, duration_minutes, title, description)
values
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1, 10, 'Вступна ігрова активність', 'Рухлива гра з м’ячем і позитивним емоційним початком.'),
  ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 2, 15, 'Координація та техніка', 'Короткі вправи з частими контактами з м’ячем.'),
  ('51000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 3, 25, 'Ігрове завдання', 'Навчання через малу гру та зрозуміле ігрове завдання.'),
  ('51000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', 4, 20, 'Гра', 'Вільна або тематична гра з мінімальними паузами.'),
  ('51000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000002', 1, 12, 'Підготовча частина', 'Активація, координація та технічна розминка з м’ячем.'),
  ('51000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000002', 2, 20, 'Техніко-тактичне навчання', 'Вправи, пов’язані з навчальним завданням заняття.'),
  ('51000000-0000-0000-0000-000000000007', '50000000-0000-0000-0000-000000000002', 3, 28, 'Ігрові ситуації', 'Малі та середні ігри з цільовими умовами.'),
  ('51000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000002', 4, 25, 'Тематична гра', 'Перенесення навчального завдання у наближену до матчу гру.'),
  ('51000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000002', 5, 5, 'Завершення', 'Відновлення, короткий підсумок і зворотний зв’язок.')
on conflict (id) do update set structure_id = excluded.structure_id, position = excluded.position, duration_minutes = excluded.duration_minutes, title = excluded.title, description = excluded.description;

\ir seed/20260918_methodology_content.sql
