-- ============================================================================
-- POST-DEPLOY · 01 · multiple life roles on profiles
-- ----------------------------------------------------------------------------
-- The single `life_stage` field (Phase 5) is too simplistic: a person can be a
-- student AND hold a job AND run a business at the same time. This adds an
-- OPTIONAL, additive `life_roles` JSONB array so a user can define multiple
-- current roles. Each element is:
--   { "type": "study|job|business|parent|other",
--     "label": "free text, e.g. Läkarprogrammet, KI",
--     "description": "short free text",
--     "active": true|false }
--
-- `life_stage` is KEPT and unchanged for backwards compatibility (all existing
-- scoring/Jarvis/benchmark logic still reads it). `life_roles` is purely
-- additive context — nothing reads it for scoring yet.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Non-destructive. RLS unchanged
-- (Phase 1 owner+admin policies already cover new columns on profiles).
-- ============================================================================

alter table public.profiles
  add column if not exists life_roles jsonb not null default '[]'::jsonb;
