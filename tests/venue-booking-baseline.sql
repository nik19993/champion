-- Synthetic auth and supporting tables; venue/event schema and event triggers
-- are loaded from the actual versioned migrations by the verification script.
create schema auth; create schema private; create schema extensions;
create role anon; create role authenticated;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
grant usage on schema auth, private, public to authenticated;
grant execute on function auth.jwt(),auth.uid() to authenticated;
create table public.profiles(id uuid primary key,role text,status text);
create table public.groups(id uuid primary key default gen_random_uuid(),code text);
create table public.coach_group_assignments(coach_id uuid,group_id uuid,is_active boolean default true);
create table public.methodology_tasks(id uuid primary key);
create type public.event_type as enum ('training','oblast','ukraine','tournament','theory');
create table public.operational_items(group_id uuid,event_id uuid,item_type text,status text,title text,comment text,due_at timestamptz,dedupe_key text,created_by uuid,updated_by uuid);
create function private.is_active_user() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=(select auth.uid()) and status='active')$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$select coalesce((select auth.jwt()->>'aal'),'aal1')='aal2' and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and status='active')$$;
create function private.has_group(g uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.coach_group_assignments a join public.profiles p on p.id=a.coach_id where a.coach_id=(select auth.uid()) and a.group_id=g and a.is_active and p.status='active')$$;
