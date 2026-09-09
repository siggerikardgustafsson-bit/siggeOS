-- ============================================================================
-- POST-DEPLOY · 06 · per-user health ingest token
-- ----------------------------------------------------------------------------
-- F3 — Apple Health via iOS Shortcuts. Instead of importing a multi-hundred-MB
-- export.xml (audit P1-7: crash-prone), a Shortcut POSTs a tiny JSON of the
-- day's metrics to the `health-ingest` edge function. The Shortcut can't do
-- Supabase Auth, so it authenticates with an opaque per-user token.
--
-- The token is stored on the user's own user_settings row (owner RLS already
-- covers it). It is NOT generated here — the app generates one lazily the first
-- time the user opens the Apple Health setup screen (src/lib/healthIngest.js),
-- so no token exists until the user opts in. Revoke = regenerate.
--
-- Idempotent, additive, non-destructive.
-- ============================================================================

alter table public.user_settings
  add column if not exists health_ingest_token uuid;

-- The edge function looks a user up BY this token (service role), so it must be
-- unique. Partial index so the many NULLs don't collide.
create unique index if not exists idx_user_settings_health_ingest_token
  on public.user_settings (health_ingest_token)
  where health_ingest_token is not null;

comment on column public.user_settings.health_ingest_token is 'Post-deploy 06 — opaque bearer token for the health-ingest edge function (Apple Health Shortcut). Null until the user opts in. Regenerate to revoke.';
