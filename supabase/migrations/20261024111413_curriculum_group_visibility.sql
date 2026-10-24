drop policy tasks_staff_read on public.methodology_tasks;
create policy tasks_staff_read on public.methodology_tasks for select to authenticated using (
 (select private.is_admin()) or (is_active and exists (
 select 1 from public.groups g where (select private.has_group(g.id)) and
 ((audience='field' and g.group_kind='age' and coalesce(g.display_age,g.age) between 6 and 16
   and age_from=coalesce(g.display_age,g.age) and age_to=coalesce(g.display_age,g.age))
 or (audience='goalkeeper' and g.group_kind='goalkeeper' and goalkeeper_stage=g.team_suffix))
 )));


