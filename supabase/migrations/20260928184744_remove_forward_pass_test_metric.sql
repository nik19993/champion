do $cleanup$
declare
  replacement_metric_id uuid;
begin
  select metric.id into strict replacement_metric_id
  from public.evaluation_metrics metric
  where metric.kind = 'game_activity'
    and lower(metric.name) = lower('Лідерські якості')
    and metric.is_active
  order by metric.sort_order, metric.id
  limit 1;

  update public.game_activity_results
  set metric_id = replacement_metric_id,
      metric_name = 'Лідерські якості',
      value = '4'
  where id = '11111111-1111-4111-8111-111111111402'
     or metric_id = '11111111-1111-4111-8111-111111111402';

  delete from public.evaluation_metrics
  where id = '11111111-1111-4111-8111-111111111402'
    and kind = 'game_activity'
    and lower(name) = lower('[ТЕСТ] Успішні передачі вперед');
end;
$cleanup$;
