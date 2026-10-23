-- UNAPPLIED. Administrator-only, version-checked content operations.
begin;
create function private.archive_content(p_dataset text,p_rows jsonb,p_all boolean default false)
returns integer language plpgsql security definer set search_path='' as $$
declare target_table text; expected_count integer; matched_count integer; actual_count integer;
begin
  if (select auth.uid()) is null or not (select private.is_admin()) then raise exception 'Administrator MFA required' using errcode='42501'; end if;
  target_table := case p_dataset when 'tasks' then 'methodology_tasks' when 'terminology' then 'terminology_entries' else null end;
  if target_table is null or p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'INVALID_CONTENT_REQUEST' using errcode='22023'; end if;
  select count(*),count(distinct id) into expected_count,matched_count from jsonb_to_recordset(p_rows) as r(id uuid,updated_at timestamptz);
  if expected_count<>matched_count or exists(select 1 from jsonb_to_recordset(p_rows) as r(id uuid,updated_at timestamptz) where id is null or updated_at is null) then
    raise exception 'INVALID_CONTENT_REQUEST' using errcode='22023'; end if;
  -- Serialize with ordinary writes too, not only with other bulk RPC calls.
  execute format('lock table public.%I in share row exclusive mode',target_table);
  execute format('select count(*) from public.%I t join jsonb_to_recordset($1) as r(id uuid,updated_at timestamptz) on t.id=r.id and t.updated_at=r.updated_at where t.is_active',target_table) into matched_count using p_rows;
  execute format('select count(*) from public.%I where is_active',target_table) into actual_count;
  if matched_count<>expected_count or (coalesce(p_all,false) and actual_count<>expected_count) then raise exception 'CONTENT_CHANGED_RELOAD' using errcode='40001'; end if;
  execute format('update public.%I t set is_active=false,updated_by=$2 where t.id in (select id from jsonb_to_recordset($1) as r(id uuid)) and t.is_active',target_table) using p_rows,(select auth.uid());
  get diagnostics matched_count = row_count;
  if matched_count<>expected_count then raise exception 'CONTENT_CHANGED_RELOAD' using errcode='40001'; end if;
  return matched_count;
end; $$;
create function public.archive_content(p_dataset text,p_rows jsonb,p_all boolean default false)
returns integer language sql security invoker set search_path='' as $$select private.archive_content(p_dataset,p_rows,p_all)$$;

create function private.replace_content_import(p_job_id uuid,p_expected_rows jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare job public.import_jobs%rowtype;
begin
  if (select auth.uid()) is null or not (select private.is_admin()) then raise exception 'Administrator MFA required' using errcode='42501'; end if;
  select * into job from public.import_jobs where id=p_job_id and created_by=(select auth.uid()) for update;
  if job.id is null or job.dataset not in ('tasks','terminology') or job.status<>'previewed' then raise exception 'INVALID_CONTENT_IMPORT' using errcode='22023'; end if;
  perform private.archive_content(job.dataset,p_expected_rows,true);
  -- The existing validated import runs in the SAME transaction. Any invalid
  -- row, missing row, duplicate, or FK error rolls the archival back as well.
  return public.confirm_import_job(p_job_id);
end; $$;
create function public.replace_content_import(p_job_id uuid,p_expected_rows jsonb)
returns integer language sql security invoker set search_path='' as $$select private.replace_content_import(p_job_id,p_expected_rows)$$;
revoke all on function private.archive_content(text,jsonb,boolean),public.archive_content(text,jsonb,boolean),private.replace_content_import(uuid,jsonb),public.replace_content_import(uuid,jsonb) from public,anon;
grant execute on function private.archive_content(text,jsonb,boolean),public.archive_content(text,jsonb,boolean),private.replace_content_import(uuid,jsonb),public.replace_content_import(uuid,jsonb) to authenticated;
-- Retired tasks remain visible through an event in the coach's assigned group.
create policy tasks_historical_group_read on public.methodology_tasks for select to authenticated using (
  exists(select 1 from public.events e where e.task_id=methodology_tasks.id and (select private.has_group(e.group_id)))
);
commit;
