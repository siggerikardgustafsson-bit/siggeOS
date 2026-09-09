-- ============================================================================
-- Post-deploy 02 — allow 'walk' in training_sessions.session_type
-- ----------------------------------------------------------------------------
-- The prod CHECK constraint only allowed ('gym','run','other'), but the app
-- writes 'walk' from the training UI (QuickLog/Traning) and strava-sync maps
-- Walk/Hike -> 'walk'. Every such insert has been failing silently against
-- the constraint (prod had zero walk rows despite UI support). Widen the
-- constraint to the canonical vocabulary the codebase actually uses:
-- 'gym' | 'run' | 'walk' | 'other'.
--
-- Non-destructive: strictly widens the allowed set; all existing rows
-- (gym/run/other) satisfy the new check. Reversible by re-adding the old
-- three-value constraint.
-- ============================================================================

ALTER TABLE public.training_sessions
  DROP CONSTRAINT IF EXISTS training_sessions_session_type_check;

ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_session_type_check
    CHECK (session_type = ANY (ARRAY['gym'::text, 'run'::text, 'walk'::text, 'other'::text]));
