-- Synthetic records only. Execute ONLY in the separately registered champion-full-test project.
begin;
do $isolated_test_guard$
begin
  if (select count(*) from auth.users)<>3 or exists(select 1 from auth.users where id not in ('f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000003')) or exists(select 1 from public.players) or exists(select 1 from public.events) then
    raise exception 'Only an empty test application with the three dedicated synthetic Auth users may be seeded';
  end if;
end $isolated_test_guard$;
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
  ('U16A', 16, 'A', 'age'), ('U16B', 16, 'B', 'age'),
  ('U17A', 17, 'A', 'age'), ('U17B', 17, 'B', 'age'),
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
  ('50000000-0000-0000-0000-000000000002', 'Структура заняття U9–U17', 9, 17, true)
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


update public.groups set cohort_birth_year=2027-age, display_age=age, display_code=code,season='2026/2027' where group_kind='age';
insert into public.club_season_settings(id,start_year,updated_by) values(true,2026,'f0000000-0000-4000-8000-000000000001');
insert into public.group_season_history(group_id,start_year,code,birth_year,changed_by) select id,2026,code,cohort_birth_year,'f0000000-0000-4000-8000-000000000001'::uuid from public.groups where group_kind='age';
insert into public.coach_group_assignments(coach_id,group_id) select 'f0000000-0000-4000-8000-000000000002'::uuid,id from public.groups where code in('U6','U11A','U11B','Воротарі A');
insert into public.coach_group_assignments(coach_id,group_id) select 'f0000000-0000-4000-8000-000000000003'::uuid,id from public.groups where code in('U13A','U17A','Воротарі B');
insert into public.players(group_id,full_name,birth_date,birth_year,position,dominant_foot,coach_note,created_by) select g.id,'Тестовий гравець '||g.code||' '||n,make_date(coalesce(g.cohort_birth_year,2016),n+1,n*3),coalesce(g.cohort_birth_year,2016),case when n=1 then 'Півзахисник' else null end,case when n=1 then 'Права' else null end,case when n=1 then 'Вигаданий приклад: підтримує партнерів і пропонує себе для передачі.' else null end,'f0000000-0000-4000-8000-000000000001'::uuid from public.groups g cross join generate_series(1,3) n where g.code<>'U12B';
insert into public.guardians(player_id,full_name,relation,phone,created_by) select p.id,'Тестовий контакт','Тестовий опікун','0000000000','f0000000-0000-4000-8000-000000000001'::uuid from public.players p where p.group_id=(select id from public.groups where code='U11A');
insert into public.methodology_tasks(title,description,phase,level,age_from,age_to,sort_order) select 'Тестове завдання U'||age||' — відкривання','Знайти місце, де можна отримати передачу.','attack','group',age,age,age from generate_series(6,17) age;
insert into public.terminology_entries(term,definition,category) values ('Відкривання','Узгоджені рішення партнерів для створення можливості взаємодії.','Групова тактика нападу'),('Захист м’яча тілом','Рішення обмежити супернику доступ до м’яча положенням тіла.','Індивідуальна тактика нападу');
update public.venues set name='Поле 1 · синтетичне 40×60',venue_type='field' where id='30000000-0000-0000-0000-000000000001';
update public.venues set name='Поле 2 · синтетичне 40×60',venue_type='field' where id='30000000-0000-0000-0000-000000000002';
insert into public.venues(id,name,venue_type,supports_half_booking) values ('30000000-0000-0000-0000-000000000003','Природне поле · 60×90','field',true),('30000000-0000-0000-0000-000000000004','Тестовий спортивний зал','hall',true);
insert into public.inventory_items(group_id,name,quantity,damaged,lost) select id,'Тестові м’ячі',12,1,0 from public.groups;
insert into public.inventory_permissions(coach_id,group_id,can_edit_quantity,can_report_issues) select coach_id,group_id,true,true from public.coach_group_assignments;
insert into public.monthly_payments(player_id,month,status,changed_by) select id,date_trunc('month',now())::date,case when right(full_name,1)='1' then 'paid'::public.payment_status else 'unpaid'::public.payment_status end,'f0000000-0000-4000-8000-000000000001'::uuid from public.players;
insert into public.uniform_requests(player_id,number,surname_print,status,requested_by) select id,7,'ТЕСТ','requested','f0000000-0000-4000-8000-000000000001'::uuid from public.players where group_id=(select id from public.groups where code='U11A');
insert into public.uniform_request_items(request_id,catalog_item_id,size,quantity) select id,'40000000-0000-0000-0000-000000000003'::uuid,'140',1 from public.uniform_requests;
insert into public.monthly_star_themes(month,title,description,criteria) values (date_trunc('month',now())::date,'МІСЯЦЬ ТЕХНІКИ','Вигаданий приклад для перевірки нагороди.','Тестові критерії: контроль м’яча, підтримка партнерів.');
insert into public.announcements(id,title,body,starts_at,require_acknowledgement,created_by) values('70000000-0000-4000-8000-000000000001','Тестове оголошення','Усі дані у цій версії вигадані. Перевірте роботу розділів.',now()-interval '1 day',true,'f0000000-0000-4000-8000-000000000001');
insert into public.announcement_targets(announcement_id,target_type) values('70000000-0000-4000-8000-000000000001','all');


insert into public.events(id,group_id,event_type,start_at,duration_minutes,venue_id,venue_part,coach_id,created_by,title,organizational_need,coach_comment,task_id) values
('71000000-0000-4000-8000-000000000001',(select id from groups where code='U11A'),'training',((timezone('Europe/Kyiv',now())::date)::text||' 16:00 Europe/Kyiv')::timestamptz,60,'30000000-0000-0000-0000-000000000001','left','f0000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000002','Тестове тренування U11A','Підготувати тестові манішки.','Перевірити наявність тестових м’ячів.',(select id from methodology_tasks where age_from=11 limit 1)),
('71000000-0000-4000-8000-000000000002',(select id from groups where code='U13A'),'training',((timezone('Europe/Kyiv',now())::date)::text||' 16:00 Europe/Kyiv')::timestamptz,60,'30000000-0000-0000-0000-000000000001','right','f0000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-000000000003','Тестове тренування U13A',null,null,(select id from methodology_tasks where age_from=13 limit 1)),
('71000000-0000-4000-8000-000000000003',(select id from groups where code='U11B'),'training',((timezone('Europe/Kyiv',now())::date)::text||' 17:30 Europe/Kyiv')::timestamptz,60,'30000000-0000-0000-0000-000000000003','whole','f0000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000002','Тестове тренування U11B',null,null,null),
('71000000-0000-4000-8000-000000000004',(select id from groups where code='U17A'),'theory',((timezone('Europe/Kyiv',now())::date)::text||' 18:00 Europe/Kyiv')::timestamptz,45,'30000000-0000-0000-0000-000000000004','left','f0000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-000000000003','Тестове заняття у залі',null,null,null);
insert into public.physical_test_sessions(group_id,measured_on,weather,venue_name,created_by) select g.id,d::date,'Тестові умови','Тестове поле','f0000000-0000-4000-8000-000000000002'::uuid from groups g cross join unnest(array['2025-10-01','2026-04-01','2026-10-01']) d where g.code='U11A';
insert into public.physical_test_results(player_id,measured_on,metric_name,value,unit,source,created_by,metric_id,field_id,field_name,session_id) select p.id,s.measured_on,m.name,(4.5+(extract(month from s.measured_on)::int%3)*0.1)::text,f.unit,'Вигаданий приклад','f0000000-0000-4000-8000-000000000002'::uuid,m.id,f.id,f.label,s.id from players p join groups g on g.id=p.group_id join physical_test_sessions s on s.group_id=g.id cross join evaluation_metrics m join evaluation_metric_fields f on f.metric_id=m.id and f.is_active where g.code='U11A' and m.kind='physical_preparedness' and m.is_active and m.age_from<=11 and m.age_to>=11;
insert into public.game_activity_results(player_id,period,metric_name,value,source,created_by,metric_id) select p.id,d,m.name,(6+(extract(month from d::date)::int%3))::text,'Вигаданий приклад','f0000000-0000-4000-8000-000000000002'::uuid,m.id from players p join groups g on g.id=p.group_id cross join unnest(array['2025-10-01','2026-04-01','2026-10-01']) d cross join evaluation_metrics m where g.code='U11A' and m.kind<>'physical_preparedness' and m.is_active;
insert into public.methodology_sections(title,description,sort_order,created_by) values('Тестові матеріали','Розділ для перевірки завантаження та відкриття файлів.',1,'f0000000-0000-4000-8000-000000000001');
commit;
