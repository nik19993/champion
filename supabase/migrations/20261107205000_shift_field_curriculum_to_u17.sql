-- Apply the November 2026 field-player curriculum move.
-- Keep task IDs and all wording; leave goalkeeper and archived tasks in place.
-- Run only as part of the matching application release.
DO $curriculum$
DECLARE
  field_state text;
  other_before text;
  other_after text;
  policy_state text;
  moved integer;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  PERFORM set_config('TimeZone', 'UTC', true);
  PERFORM set_config('search_path', 'public, pg_catalog', true);
  LOCK TABLE public.methodology_tasks IN SHARE ROW EXCLUSIVE MODE;

  SELECT md5(string_agg(concat_ws(':', t.id, t.age_from, t.age_to,
    md5((to_jsonb(t) - ARRAY['age_from', 'age_to', 'updated_at'])::text)), ',' ORDER BY t.id))
  INTO field_state
  FROM public.methodology_tasks t
  WHERE t.is_active AND t.audience = 'field';
  IF field_state IS DISTINCT FROM '0451277d9c4ec9176dfba2373be26996' THEN
    RAISE EXCEPTION 'Field curriculum differs from the reviewed original catalogue; no tasks moved';
  END IF;

  SELECT md5(qual) INTO policy_state
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'methodology_tasks'
    AND policyname = 'tasks_staff_read' AND cmd = 'SELECT' AND roles = '{authenticated}'::name[]
    AND qual LIKE '%<= 16%';
  IF policy_state IS DISTINCT FROM '8373978de4b82dc4b1f699322732370b' THEN
    RAISE EXCEPTION 'The coach catalogue read policy has changed; no tasks moved';
  END IF;

  SELECT md5(string_agg(to_jsonb(t)::text, ',' ORDER BY t.id))
  INTO other_before
  FROM public.methodology_tasks t
  WHERE NOT (t.is_active AND t.audience = 'field');
  UPDATE public.methodology_tasks
  SET age_from = age_from + 1, age_to = age_to + 1
  WHERE is_active AND audience = 'field';
  GET DIAGNOSTICS moved = ROW_COUNT;

  SELECT md5(string_agg(concat_ws(':', t.id, t.age_from, t.age_to,
    md5((to_jsonb(t) - ARRAY['age_from', 'age_to', 'updated_at'])::text)), ',' ORDER BY t.id))
  INTO field_state
  FROM public.methodology_tasks t
  WHERE t.is_active AND t.audience = 'field';
  SELECT md5(string_agg(to_jsonb(t)::text, ',' ORDER BY t.id))
  INTO other_after
  FROM public.methodology_tasks t
  WHERE NOT (t.is_active AND t.audience = 'field');
  IF moved <> 284 OR field_state IS DISTINCT FROM 'dcb1addc72af33dceeae27e86e2fb59c'
    OR other_after IS DISTINCT FROM other_before THEN
    RAISE EXCEPTION 'Unexpected curriculum changes; the entire update was rolled back';
  END IF;

  -- Keep access limited to assigned groups and retain historical-event access.
  ALTER POLICY tasks_staff_read ON public.methodology_tasks
    USING (
      (SELECT private.is_admin())
      OR (is_active AND EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE (SELECT private.has_group(g.id))
          AND (
            (methodology_tasks.audience = 'field' AND g.group_kind = 'age'
              AND COALESCE(g.display_age, g.age) >= 6
              AND COALESCE(g.display_age, g.age) <= 17
              AND methodology_tasks.age_from = COALESCE(g.display_age, g.age)
              AND methodology_tasks.age_to = COALESCE(g.display_age, g.age))
            OR (methodology_tasks.audience = 'goalkeeper' AND g.group_kind = 'goalkeeper'
              AND methodology_tasks.goalkeeper_stage = g.team_suffix)
          )
      ))
    );
END
$curriculum$;
