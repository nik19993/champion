begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'coach-a@example.test', 'test', now(), '{"full_name":"Тренер А"}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'coach-b@example.test', 'test', now(), '{"full_name":"Тренер Б"}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin@example.test', 'test', now(), '{"full_name":"Адміністратор"}', now(), now());

update public.profiles set status = 'active' where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);
update public.profiles set role = 'admin' where id = '10000000-0000-0000-0000-000000000003';

insert into public.groups (id, code, age, team_suffix)
values
  ('20000000-0000-0000-0000-000000000001', 'U8A', 8, 'A'),
  ('20000000-0000-0000-0000-000000000002', 'U8B', 8, 'B')
on conflict (code) do update set id = excluded.id;

insert into public.coach_group_assignments (coach_id, group_id)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');

insert into public.audit_log (actor_id, action, entity_type)
values ('10000000-0000-0000-0000-000000000003', 'test', 'foundation');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*) from public.profiles), 1::bigint, 'coach reads only own profile');
select is((select count(*) from public.groups), 1::bigint, 'coach reads only assigned group');
select is((select code from public.groups limit 1), 'U8A', 'assigned group is U8A');
select is((select count(*) from public.coach_group_assignments), 1::bigint, 'coach reads own assignment');
select is((select count(*) from public.audit_log where entity_type = 'foundation'), 0::bigint, 'coach cannot read audit log');

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*) from public.profiles), 1::bigint, 'admin at aal1 still sees only own profile');
select is((select count(*) from public.groups), 0::bigint, 'admin at aal1 has no administrative group access');

reset role;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select is((select count(*) from public.profiles), 3::bigint, 'admin at aal2 reads all profiles');
select is(
  (select count(*) from public.groups where id in (
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002'
  )),
  2::bigint,
  'admin at aal2 reads both test groups'
);
select is((select count(*) from public.audit_log where entity_type = 'foundation'), 1::bigint, 'admin at aal2 reads audit log');

select * from finish();
rollback;
