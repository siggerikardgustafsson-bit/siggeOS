-- ============================================================================
-- PHASE 7 · 00 · score versioning
-- ----------------------------------------------------------------------------
-- Tags rows with the scoring model that produced them so historical scores stay
-- interpretable when the tier/score model evolves. Additive + idempotent.
-- Existing rows keep score_version = NULL → interpret as 'v1' (pre-Maxx-Score-v2,
-- weakest-link). New Dashboard writes set 'v2'. Old history is NOT rewritten.
--
-- Safe before deploy too: the Dashboard's tier_snapshots upsert is fire-and-forget
-- (.catch), so if this migration hasn't run yet, writing score_version simply
-- no-ops instead of breaking the Dashboard.
-- ============================================================================
alter table public.tier_snapshots add column if not exists score_version text;
alter table public.daily_scores   add column if not exists score_version text;

comment on column public.tier_snapshots.score_version is 'Scoring model that produced this snapshot (NULL/v1 = weakest-link, v2 = weighted+bottleneck). Set by the Dashboard.';
comment on column public.daily_scores.score_version   is 'Scoring model version; NULL = pre-versioning (v1).';
