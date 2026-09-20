begin;

create index if not exists evaluation_metrics_created_by_idx
  on public.evaluation_metrics (created_by);
create index if not exists evaluation_metrics_updated_by_idx
  on public.evaluation_metrics (updated_by);

commit;
