-- Prep for automatic bank-transaction sync (research: EKONOMI-INTEGRATION.md,
-- 2026-09-12). Additive only — nothing reads these yet. `source` follows the
-- same convention as skill_logs.source ('anki_sync' etc): null/absent means
-- hand-logged, a tagged value means auto-synced, so a future sync job can
-- safely delete-then-insert its OWN rows without ever touching what the user
-- typed in manually. `external_id` is the bank's own transaction id — the
-- dedup key once a sync exists (a re-run must never double-count a charge).
alter table public.income_logs  add column if not exists source text;
alter table public.income_logs  add column if not exists external_id text;
alter table public.expense_logs add column if not exists source text;
alter table public.expense_logs add column if not exists external_id text;

-- One row per bank transaction id per user — the actual dedup guarantee
-- (partial index so hand-logged rows, external_id null, are unaffected).
create unique index if not exists income_logs_external_id_uidx
  on public.income_logs (user_id, external_id) where external_id is not null;
create unique index if not exists expense_logs_external_id_uidx
  on public.expense_logs (user_id, external_id) where external_id is not null;
