-- ============================================================================
-- POST-DEPLOY · 08 · goal baseline (start value)
-- ----------------------------------------------------------------------------
-- Progress on a goal was measured from zero: bench 80kg toward a 100kg goal
-- read as "80%". That is wrong — you don't start from an empty bar. This adds
-- start_value (the metric/manual value when the goal was set) and baseline_date
-- so progress is (current - start) / (target - start), clamped to 0..1.
--
-- Existing rows get NULL start_value; the client lazily backfills it on next
-- load (resolves the metric now, or copies current_value for manual goals).
--
-- Idempotent, additive, non-destructive. Owner RLS on `goals` already covers
-- the new columns.
-- ============================================================================

alter table public.goals
  add column if not exists start_value numeric;

alter table public.goals
  add column if not exists baseline_date date;

comment on column public.goals.start_value is 'Post-deploy 08 — metric/current value when the goal was created. Progress is measured from here, not from zero.';
comment on column public.goals.baseline_date is 'Post-deploy 08 — the date start_value was captured.';
