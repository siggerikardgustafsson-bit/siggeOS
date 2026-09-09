-- ============================================================================
-- Post-deploy 04 — remember which nicotine product was logged
-- ----------------------------------------------------------------------------
-- health_logs.nicotine is a boolean, but the Hälsa UI offers snus / vape /
-- cigaretter. Picking vape or cigaretter silently became "snus" on the next
-- load. Add a nullable text column that stores the comma-joined type list;
-- `nicotine` stays as the "any nicotine that day" flag. See AUDIT.md P3-11.
--
-- Non-destructive: adds a nullable column, no data change.
-- ============================================================================

ALTER TABLE public.health_logs
  ADD COLUMN IF NOT EXISTS nicotine_type text;
