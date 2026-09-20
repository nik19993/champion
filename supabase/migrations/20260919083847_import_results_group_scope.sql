begin;

create index if not exists players_group_lower_name_active_idx
  on public.players (group_id, lower(full_name))
  where is_active;

create or replace function public.confirm_import_job(p_job_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  job public.import_jobs%rowtype;
  item record;
  target_group_id uuid;
  target_player_id uuid;
  player_matches integer;
  preview_count integer;
  imported integer := 0;
  phase_value public.methodology_phase;
  level_value public.methodology_level;
begin
  if not (select private.is_admin()) then
    raise exception 'Administrator MFA required' using errcode = '42501';
  end if;

  select * into job
  from public.import_jobs
  where id = p_job_id and created_by = (select auth.uid())
  for update;

  if job.id is null or job.status <> 'previewed' then
    raise exception 'Import job is not ready' using errcode = '22023';
  end if;

  select count(*) into preview_count
  from public.import_rows
  where import_job_id = p_job_id;

  if preview_count = 0 or preview_count <> job.total_rows then
    raise exception 'Import preview is incomplete' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.import_rows
    where import_job_id = p_job_id
      and (not is_valid or cardinality(errors) > 0)
  ) then
    raise exception 'Import contains invalid rows' using errcode = '22023';
  end if;

  for item in
    select * from public.import_rows
    where import_job_id = p_job_id
    order by row_number
  loop
    if job.dataset = 'players' then
      select id into target_group_id
      from public.groups
      where upper(code) = upper(item.payload ->> 'group') and is_active;

      if target_group_id is null then
        raise exception 'Unknown group in row %', item.row_number using errcode = '22023';
      end if;

      if exists (
        select 1 from public.players
        where group_id = target_group_id
          and lower(full_name) = lower(item.payload ->> 'full_name')
          and is_active
      ) then
        raise exception 'Duplicate player in row %', item.row_number using errcode = '23505';
      end if;

      insert into public.players(
        group_id, full_name, birth_year, position, is_active, created_by
      ) values (
        target_group_id,
        item.payload ->> 'full_name',
        (item.payload ->> 'birth_year')::smallint,
        nullif(item.payload ->> 'position', ''),
        true,
        (select auth.uid())
      );
    elsif job.dataset in ('physical_tests', 'game_activity') then
      select id into target_group_id
      from public.groups
      where upper(code) = upper(item.payload ->> 'group') and is_active;

      if target_group_id is null then
        raise exception 'Unknown group in row %', item.row_number using errcode = '22023';
      end if;

      select count(*) into player_matches
      from public.players
      where group_id = target_group_id
        and lower(full_name) = lower(item.payload ->> 'player')
        and is_active;

      if player_matches <> 1 then
        raise exception 'Player must be unique in group in row %', item.row_number
          using errcode = '22023';
      end if;

      select id into target_player_id
      from public.players
      where group_id = target_group_id
        and lower(full_name) = lower(item.payload ->> 'player')
        and is_active
      limit 1;

      if job.dataset = 'physical_tests' then
        if exists (
          select 1 from public.physical_test_results
          where player_id = target_player_id
            and measured_on = (item.payload ->> 'date')::date
            and lower(metric_name) = lower(item.payload ->> 'metric')
        ) then
          raise exception 'Duplicate physical test in row %', item.row_number
            using errcode = '23505';
        end if;

        insert into public.physical_test_results(
          player_id, measured_on, metric_name, value, unit, source, created_by
        ) values (
          target_player_id,
          (item.payload ->> 'date')::date,
          item.payload ->> 'metric',
          item.payload ->> 'value',
          nullif(item.payload ->> 'unit', ''),
          'import',
          (select auth.uid())
        );
      else
        if exists (
          select 1 from public.game_activity_results
          where player_id = target_player_id
            and period = item.payload ->> 'period'
            and lower(metric_name) = lower(item.payload ->> 'metric')
        ) then
          raise exception 'Duplicate game activity result in row %', item.row_number
            using errcode = '23505';
        end if;

        insert into public.game_activity_results(
          player_id, period, metric_name, value, source, created_by
        ) values (
          target_player_id,
          item.payload ->> 'period',
          item.payload ->> 'metric',
          item.payload ->> 'value',
          'import',
          (select auth.uid())
        );
      end if;
    elsif job.dataset = 'tasks' then
      phase_value := case
        when lower(item.payload ->> 'phase') in ('defence', 'захист')
          or lower(item.payload ->> 'phase') like '%зах%'
          then 'defence'::public.methodology_phase
        else 'attack'::public.methodology_phase
      end;
      level_value := case
        when lower(item.payload ->> 'level') in ('team', 'командна')
          or lower(item.payload ->> 'level') like '%команд%'
          then 'team'::public.methodology_level
        when lower(item.payload ->> 'level') in ('group', 'групова')
          or lower(item.payload ->> 'level') like '%груп%'
          then 'group'::public.methodology_level
        else 'individual'::public.methodology_level
      end;

      if exists (
        select 1 from public.methodology_tasks
        where phase = phase_value
          and level = level_value
          and lower(title) = lower(item.payload ->> 'title')
          and age_from = (item.payload ->> 'age_from')::smallint
          and age_to = (item.payload ->> 'age_to')::smallint
          and is_active
      ) then
        raise exception 'Duplicate methodology task in row %', item.row_number
          using errcode = '23505';
      end if;

      insert into public.methodology_tasks(
        phase, level, component, title, description, age_from, age_to,
        sort_order, is_active, created_by
      ) values (
        phase_value,
        level_value,
        nullif(item.payload ->> 'component', ''),
        item.payload ->> 'title',
        nullif(item.payload ->> 'description', ''),
        (item.payload ->> 'age_from')::smallint,
        (item.payload ->> 'age_to')::smallint,
        item.row_number,
        true,
        (select auth.uid())
      );
    elsif job.dataset = 'terminology' then
      insert into public.terminology_entries(
        term, definition, category, source, is_active, created_by, updated_by
      ) values (
        item.payload ->> 'term',
        item.payload ->> 'definition',
        item.payload ->> 'category',
        nullif(item.payload ->> 'source', ''),
        true,
        (select auth.uid()),
        (select auth.uid())
      )
      on conflict (term, category) do update set
        definition = excluded.definition,
        source = excluded.source,
        is_active = true,
        updated_by = (select auth.uid());
    else
      raise exception 'Unsupported import dataset' using errcode = '22023';
    end if;

    imported := imported + 1;
  end loop;

  update public.import_jobs
  set status = 'completed',
      confirmed_by = (select auth.uid()),
      confirmed_at = now(),
      updated_at = now()
  where id = p_job_id;

  return imported;
end;
$$;

commit;
