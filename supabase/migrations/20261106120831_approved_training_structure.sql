-- Session caps and optional coach exercises are separate from per-block timing.
-- Nullable block timing lets coaches dose exercises without a mandatory template time.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.training_structures
  add column max_duration_minutes integer
  check (max_duration_minutes between 1 and 180);

alter table public.training_structure_steps
  alter column duration_minutes drop not null,
  add column is_optional boolean not null default false;

comment on column public.training_structures.max_duration_minutes is
  'Club session upper limit including preparation, all blocks, rest, discussion and conclusion.';
comment on column public.training_structure_steps.duration_minutes is
  'Optional indicative block duration; NULL means the coach sets timing during planning.';
comment on column public.training_structure_steps.is_optional is
  'Exercise used as needed in any part of the session, rather than a required final block.';
