-- Keep the approved two structures and their shared blocks; update only the warm-ups.
do $apply$
declare
  changed_count integer;
begin
  perform set_config('lock_timeout', '3s', true);

  update public.training_structure_steps step
  set title = $copy$Розминка й активація$copy$,
      description = replacement.new_description,
      updated_at = now()
  from (values
    ($copy$51000000-0000-0000-0000-000000000001$copy$::uuid, $copy$50000000-0000-0000-0000-000000000001$copy$::uuid, 6, 8, $copy$2026-11-06T12:25:56.82306+00:00$copy$::timestamptz,
      $copy$Підготовча частина. Рухлива гра без м’ячів або з одним, кількома чи багатьма м’ячами. Способи гри з м’ячем: ногами, руками або з поєднанням гри руками й ногами. Гра спрямована на розігрів, активацію та позитивний емоційний початок заняття.$copy$,
      $copy$Розминка у формі рухливої гри. Тренер добирає прості правила, щоб усі діти активно рухалися й мали змогу приймати прості ігрові рішення. Гра може бути без м’яча, з одним, кількома або багатьма м’ячами. Залежно від правил діти грають руками, ногами або поєднують обидва способи.$copy$),
    ($copy$51000000-0000-0000-0000-000000000005$copy$::uuid, $copy$50000000-0000-0000-0000-000000000002$copy$::uuid, 9, 17, $copy$2026-11-06T12:25:56.82306+00:00$copy$::timestamptz,
      $copy$Підготовча частина. Рухлива гра без м’ячів або з одним, кількома чи багатьма м’ячами. Способи гри з м’ячем: ногами, руками або з поєднанням гри руками й ногами. Організація та правила рухливої гри підкреслюють ігрові взаємодії або рішення, важливі для розв’язання завдання заняття.$copy$,
      $copy$9–12 років:
Основою розминки є рухлива гра, переважно з одним або кількома м’ячами. Тренер може додавати елементи організованої розминки та технічну активацію. Технічна активація — це короткі вправи з м’ячем, зокрема без прямої протидії суперника. Вправи організовують так, щоб гравці не чекали в черзі й якомога частіше торкалися м’яча.

13–17 років:
Спочатку — організована динамічна розминка з поступовим підвищенням інтенсивності. М’язова активація готує м’язи й суглоби до навантаження. Функціональна активація готує гравців до темпу й переміщень основної частини. Під час технічної активації гравці виконують вправи з м’ячем, у яких застосовують технічні прийоми, потрібні для вирішення завдання тренування. До розминки також входить рухлива гра або естафета, пов’язана із завданням тренування.$copy$)
  ) as replacement(step_id, structure_id, age_from, age_to, before_updated_at, before_description, new_description)
  join public.training_structures structure
    on structure.id = replacement.structure_id
   and structure.is_active
   and structure.age_from = replacement.age_from
   and structure.age_to = replacement.age_to
  where step.id = replacement.step_id
    and step.structure_id = replacement.structure_id
    and step.position = 1
    and not step.is_optional
    and step.title = $copy$Рухлива гра — розігрів та активація$copy$
    and step.updated_at = replacement.before_updated_at
    and step.description = replacement.before_description;

  get diagnostics changed_count = row_count;
  if changed_count <> 2 then
    raise exception 'The reviewed warm-up blocks have changed; no content updated';
  end if;
end;
$apply$;
