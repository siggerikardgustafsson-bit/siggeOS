-- Fixes a naming collision found while building the actual sync (2026-09-13):
-- income_logs ALREADY had a `source` column — it's the income-category field
-- (PA-jobb / Erik Norling / CSN / …), populated by the manual logging form.
-- post_deploy_14's `add column if not exists source text` on income_logs was
-- therefore a silent no-op there (harmless, but useless for its intended
-- purpose — provenance tagging). expense_logs' `source` addition was fine
-- (no prior column), but kept in lockstep here for one consistent name
-- across both tables rather than two different provenance-column names.
alter table public.income_logs  add column if not exists sync_origin text;
alter table public.expense_logs add column if not exists sync_origin text;
comment on column public.income_logs.sync_origin is 'Provenance tag for auto-synced rows (e.g. ''enable_banking'') — null means hand-logged. NOT the income category (see the pre-existing `source` column for that).';
comment on column public.expense_logs.sync_origin is 'Provenance tag for auto-synced rows (e.g. ''enable_banking'') — null means hand-logged.';
