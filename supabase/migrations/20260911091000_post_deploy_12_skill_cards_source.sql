-- post_deploy_12: skill_logs gets `cards` (raw Anki review count) and `source`.
-- Additive, idempotent.
--
-- `cards`  — a row contributes EITHER cards or minutes, never double-counted
--            (Dashboard.jsx sums `cards` regardless of activity_type, and
--            `minutes` only for rows where cards IS NULL).
-- `source` — lets the skill-ingest edge function safely re-sync a day
--            (delete-then-insert only ITS OWN rows, source='anki_sync')
--            without touching what the user logged by hand in Journal
--            (source is null there, same pattern as health_logs.source).
alter table public.skill_logs add column if not exists cards  integer;
alter table public.skill_logs add column if not exists source text;

comment on column public.skill_logs.cards is
  'Raw Anki cards reviewed that day for this skill (from skill-ingest). Mutually exclusive with minutes on the same row.';
comment on column public.skill_logs.source is
  'Who wrote this row: null = logged by hand in Journal, ''anki_sync'' = skill-ingest edge function.';
