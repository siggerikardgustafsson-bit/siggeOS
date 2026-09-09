-- ============================================================================
-- Post-deploy 03 — unify income_logs free-text on `description`
-- ----------------------------------------------------------------------------
-- income_logs was written with two different columns for the same thing:
--   • Ekonomi form, Jobb (Erik payments), Jarvis log_income  ->  notes
--   • QuickLog, Export (reader)                              ->  description
-- so a note typed in one place was invisible everywhere else, and Export
-- dropped every note written from Ekonomi/Jobb/Jarvis. See AUDIT.md P0-3.
--
-- `description` is the canonical column (matches expense_logs). All four write
-- paths now write `description`; this backfills the historical `notes` values
-- into it. The now-unused `notes` column is kept (marked deprecated) so this
-- migration is order-independent w.r.t. the code deploy and trivially
-- reversible; a later migration can drop it once nothing writes it.
--
-- Non-destructive: only fills empty `description` cells.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'income_logs' AND column_name = 'notes'
  ) THEN
    -- ensure the target column exists
    ALTER TABLE public.income_logs ADD COLUMN IF NOT EXISTS description text;

    UPDATE public.income_logs
      SET description = notes
      WHERE (description IS NULL OR description = '')
        AND notes IS NOT NULL AND notes <> '';

    COMMENT ON COLUMN public.income_logs.notes IS
      'DEPRECATED 2026-07-02 — use description. Kept for rollback safety; no code writes this.';
  END IF;
END $$;
