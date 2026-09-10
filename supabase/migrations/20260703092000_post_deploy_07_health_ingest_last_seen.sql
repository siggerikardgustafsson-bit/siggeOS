-- ============================================================================
-- POST-DEPLOY · 07 · health-ingest rate-limit timestamp
-- ----------------------------------------------------------------------------
-- The health-ingest edge function is public (--no-verify-jwt) and had no
-- throttling. This adds last_ingest_at: the function stamps it after every
-- SUCCESSFUL write and rejects (429) a request whose token wrote less than
-- 30 seconds ago. Per-token, not per-IP.
--
-- Idempotent, additive, non-destructive. Owner RLS on user_settings already
-- covers the new column.
-- ============================================================================

alter table public.user_settings
  add column if not exists last_ingest_at timestamptz;

comment on column public.user_settings.last_ingest_at is 'Post-deploy 07 — timestamp of the last successful health-ingest write for this row''s token. Used for the endpoint''s 30s per-token rate limit.';
