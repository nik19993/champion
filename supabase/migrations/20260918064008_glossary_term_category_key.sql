-- The approved glossary intentionally uses one term in both attacking and
-- defending set-play sections, with different definitions in each context.
alter table public.terminology_entries
  drop constraint if exists terminology_entries_term_key;

alter table public.terminology_entries
  add constraint terminology_entries_term_category_key unique (term, category);
