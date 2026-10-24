CREATE OR REPLACE FUNCTION public.confirm_import_job(p_job_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  job public.import_jobs%rowtype;
  item record;
  target_group_id uuid;
  existing_player public.players%rowtype;
  incoming_birth_date date;
  incoming_birth_year smallint;
  existing_value text;
  target_player_id uuid;
  target_session_id uuid;
  player_matches integer;
  preview_count integer;
  imported integer := 0;
  phase_value public.methodology_phase;
  level_value public.methodology_level;
  measured_date date;
  session_time time;
  session_temperature numeric(4, 1);
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
  from public.import_rows where import_job_id = p_job_id;
  if preview_count = 0 or preview_count <> job.total_rows then
    raise exception 'Import preview is incomplete' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.import_rows
    where import_job_id = p_job_id and (not is_valid or cardinality(errors) > 0)
  ) then
    raise exception 'Import contains invalid rows' using errcode = '22023';
  end if;

  for item in
    select * from public.import_rows
    where import_job_id = p_job_id
    order by row_number
  loop
    if job.dataset in ('physical_tests', 'game_activity') and (nullif(trim(item.payload ->> 'value'),'') is null or trim(item.payload ->> 'value') in ('-','—','–')) then
      continue;
    end if;
    if job.dataset = 'players' then
      select id into target_group_id
      from public.groups
      where upper(coalesce(display_code,code)) = upper(item.payload ->> 'group') and is_active
      for update;
      if target_group_id is null then
        raise exception 'Unknown group in row %', item.row_number using errcode = '22023';
      end if;
      select count(*) into player_matches from public.players
      where group_id=target_group_id and lower(trim(full_name))=lower(trim(item.payload->>'full_name')) and is_active;
      if player_matches > 1 then raise exception 'Ambiguous player in row %',item.row_number using errcode='22023'; end if;
      incoming_birth_date := nullif(item.payload->>'birth_date','')::date;
      incoming_birth_year := coalesce(nullif(item.payload->>'birth_year','')::smallint, extract(year from incoming_birth_date)::smallint);
      if incoming_birth_date is not null and (incoming_birth_date > current_date or incoming_birth_year <> extract(year from incoming_birth_date)::smallint) then
        raise exception 'Birth date mismatch in row %',item.row_number using errcode='22023';
      end if;
      if player_matches = 1 then
        select * into existing_player from public.players
        where group_id=target_group_id and lower(trim(full_name))=lower(trim(item.payload->>'full_name')) and is_active for update;
        if (incoming_birth_date is not null and existing_player.birth_date is not null and incoming_birth_date <> existing_player.birth_date)
          or (incoming_birth_year is not null and existing_player.birth_year is not null and incoming_birth_year <> existing_player.birth_year)
          or (incoming_birth_year is not null and existing_player.birth_date is not null and incoming_birth_year <> extract(year from existing_player.birth_date)::smallint)
          or (nullif(trim(item.payload->>'position'),'') is not null and nullif(trim(existing_player.position),'') is not null and trim(item.payload->>'position') <> trim(existing_player.position))
          or (nullif(trim(item.payload->>'dominant_foot'),'') is not null and nullif(trim(existing_player.dominant_foot),'') is not null and trim(item.payload->>'dominant_foot') <> trim(existing_player.dominant_foot)) then
          raise exception 'Existing player data conflict in row %',item.row_number using errcode='22023';
        end if;
        update public.players set birth_date=coalesce(birth_date,incoming_birth_date), birth_year=coalesce(birth_year,incoming_birth_year),
          position=coalesce(nullif(trim(position),''),nullif(trim(item.payload->>'position'),'')),
          dominant_foot=coalesce(nullif(trim(dominant_foot),''),nullif(trim(item.payload->>'dominant_foot'),'')),updated_by=(select auth.uid())
        where id=existing_player.id and (
          (birth_date is null and incoming_birth_date is not null) or (birth_year is null and incoming_birth_year is not null)
          or (nullif(trim(position),'') is null and nullif(trim(item.payload->>'position'),'') is not null)
          or (nullif(trim(dominant_foot),'') is null and nullif(trim(item.payload->>'dominant_foot'),'') is not null)
        );
      else
        if incoming_birth_year is null then raise exception 'Birth year required for new player in row %',item.row_number using errcode='22023'; end if;
        insert into public.players(group_id,full_name,birth_date,birth_year,position,dominant_foot,is_active,created_by)
        values(target_group_id,trim(item.payload->>'full_name'),incoming_birth_date,incoming_birth_year,
          nullif(trim(item.payload->>'position'),''),nullif(trim(item.payload->>'dominant_foot'),''),true,(select auth.uid()));
      end if;
    elsif job.dataset in ('physical_tests', 'game_activity') then
      select id into target_group_id
      from public.groups
      where upper(coalesce(display_code,code)) = upper(item.payload ->> 'group') and is_active
      for update;
      if target_group_id is null then
        raise exception 'Unknown group in row %', item.row_number using errcode = '22023';
      end if;

      select count(*) into player_matches
      from public.players
      where group_id = target_group_id
        and lower(full_name) = lower(item.payload ->> 'player')
        and is_active;
      if player_matches <> 1 then
        raise exception 'Player must be unique in row %', item.row_number using errcode = '22023';
      end if;
      select id into target_player_id
      from public.players
      where group_id = target_group_id
        and lower(full_name) = lower(item.payload ->> 'player')
        and is_active
      limit 1;

      if job.dataset = 'physical_tests' then
        measured_date := (item.payload ->> 'date')::date;
        session_time := nullif(item.payload ->> 'time', '')::time;
        session_temperature := replace(nullif(item.payload ->> 'temperature_c', ''), ',', '.')::numeric;

        select value into existing_value from public.physical_test_results
        where player_id=target_player_id and measured_on=measured_date
          and lower(metric_name)=lower(item.payload->>'metric') and lower(field_name)=lower(item.payload->>'field') for update;
        if found then
          if trim(existing_value)=trim(item.payload->>'value') then continue; end if;
          raise exception 'Existing physical result conflict in row %',item.row_number using errcode='22023';
        end if;

        select session.id into target_session_id
        from public.physical_test_sessions session
        where session.import_job_id = p_job_id
          and session.group_id = target_group_id
          and session.measured_on = measured_date
          and session.started_at is not distinct from session_time
        order by session.created_at
        limit 1;

        if target_session_id is null then
          insert into public.physical_test_sessions (
            group_id, measured_on, started_at, temperature_c, weather, wind,
            venue_name, surface, footwear, notes, source, import_job_id,
            created_by, updated_by
          )
          values (
            target_group_id,
            measured_date,
            session_time,
            session_temperature,
            nullif(item.payload ->> 'weather', ''),
            nullif(item.payload ->> 'wind', ''),
            nullif(item.payload ->> 'venue', ''),
            nullif(item.payload ->> 'surface', ''),
            nullif(item.payload ->> 'footwear', ''),
            nullif(item.payload ->> 'session_notes', ''),
            'import',
            p_job_id,
            (select auth.uid()),
            (select auth.uid())
          )
          returning id into target_session_id;
        end if;

        insert into public.physical_test_results (
          player_id, measured_on, metric_name, field_name, value, unit,
          session_id, source, created_by
        )
        values (
          target_player_id,
          measured_date,
          item.payload ->> 'metric',
          item.payload ->> 'field',
          item.payload ->> 'value',
          nullif(item.payload ->> 'unit', ''),
          target_session_id,
          'import',
          (select auth.uid())
        );
      else
        select value into existing_value from public.game_activity_results
        where player_id=target_player_id and period=item.payload->>'period'
          and lower(metric_name)=lower(item.payload->>'metric') for update;
        if found then
          if trim(existing_value)=trim(item.payload->>'value') then continue; end if;
          raise exception 'Existing game result conflict in row %',item.row_number using errcode='22023';
        end if;
        insert into public.game_activity_results (
          player_id, period, metric_name, value, source, created_by
        )
        values (
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
      insert into public.methodology_tasks (
        phase, level, component, title, description, age_from, age_to,
        sort_order, is_active, created_by, audience, goalkeeper_stage, context
      )
      values (
        phase_value,
        level_value,
        nullif(item.payload ->> 'component', ''),
        item.payload ->> 'title',
        nullif(item.payload ->> 'description', ''),
        (item.payload ->> 'age_from')::smallint,
        (item.payload ->> 'age_to')::smallint,
        item.row_number,
        true,
        (select auth.uid()), coalesce(nullif(item.payload ->> 'audience',''),'field'), nullif(item.payload ->> 'goalkeeper_stage',''), coalesce(nullif(item.payload ->> 'context',''),'play')
      );
    elsif job.dataset = 'terminology' then
      insert into public.terminology_entries (
        term, definition, category, source, is_active, created_by, updated_by
      )
      values (
        item.payload ->> 'term',
        item.payload ->> 'definition',
        item.payload ->> 'category',
        nullif(item.payload ->> 'source', ''),
        true,
        (select auth.uid()),
        (select auth.uid())
      )
      on conflict (term, category) do update
      set definition = excluded.definition,
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
$function$

