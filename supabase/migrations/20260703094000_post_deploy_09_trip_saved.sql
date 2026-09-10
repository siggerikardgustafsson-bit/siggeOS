-- ============================================================================
-- POST-DEPLOY · 09 · trip savings progress
-- ----------------------------------------------------------------------------
-- trips.budget_sek says what a trip costs but there was no sense of "how close
-- am I to affording it". saved_sek is a manual "avsatt hittills" figure shown
-- as a progress bar on planned/idea trips, with a pace hint toward departure.
--
-- Idempotent, additive, non-destructive. Owner RLS on `trips` already covers
-- the new column.
-- ============================================================================

alter table public.trips
  add column if not exists saved_sek numeric;

comment on column public.trips.saved_sek is 'Post-deploy 09 — kr set aside so far toward this trip''s budget_sek. Manual, shown as a savings progress bar on planned/idea trips.';
