-- Fixes the "85 synced but 0 rows written" bug (2026-09-13). The dedup
-- indexes from post_deploy_14 were PARTIAL (`where external_id is not
-- null`) — Postgres can't use a partial index as an implicit ON CONFLICT
-- target unless the ON CONFLICT clause repeats the exact same WHERE
-- predicate, which PostgREST's upsert (onConflict=user_id,external_id) has
-- no way to express. Every upsert in ekonomi-sync silently failed with
-- "no unique or exclusion constraint matching the ON CONFLICT specification"
-- — an error the edge function never checked for (also fixed, see
-- ekonomi-sync/index.ts).
--
-- Fix: a genuine (non-partial) UNIQUE CONSTRAINT works as an ON CONFLICT
-- target, and achieves the same practical effect anyway — Postgres never
-- treats two NULLs as equal in a unique constraint, so any number of
-- hand-logged rows (external_id IS NULL) still coexist freely; only rows
-- that share an actual external_id value collide, which is exactly the
-- dedup guarantee we want.
drop index if exists public.income_logs_external_id_uidx;
drop index if exists public.expense_logs_external_id_uidx;

alter table public.income_logs
  add constraint income_logs_user_external_id_key unique (user_id, external_id);
alter table public.expense_logs
  add constraint expense_logs_user_external_id_key unique (user_id, external_id);
