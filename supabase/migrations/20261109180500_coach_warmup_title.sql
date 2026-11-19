-- Rename the first block in the two approved structures without editing its description.
do $apply$
declare
  changed_count integer;
begin
  perform set_config('lock_timeout', '3s', true);

  update public.training_structure_steps step
  set title = 'Розминка', updated_at = now()
  from (values
    ('51000000-0000-0000-0000-000000000001'::uuid, '50000000-0000-0000-0000-000000000001'::uuid, 6, 8),
    ('51000000-0000-0000-0000-000000000005'::uuid, '50000000-0000-0000-0000-000000000002'::uuid, 9, 17)
  ) as target(step_id, structure_id, age_from, age_to)
  join public.training_structures structure
    on structure.id = target.structure_id
   and structure.is_active
   and structure.age_from = target.age_from
   and structure.age_to = target.age_to
  where step.id = target.step_id
    and step.structure_id = target.structure_id
    and step.position = 1
    and not step.is_optional
    and step.title = 'Розминка й активація'
    and step.updated_at = '2026-11-09 15:47:20.343988+00'::timestamptz;

  get diagnostics changed_count = row_count;
  if changed_count <> 2 then
    raise exception 'The reviewed warm-up blocks have changed; no titles updated';
  end if;
end;
$apply$;
