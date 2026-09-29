-- post_deploy_21 — scheduled Strava sync (every 3h).
--
-- pg_cron fires pg_net → strava-sync?action=cron with an x-cron-secret header.
-- The secret is generated HERE, inside the database, and stored in Vault — it
-- never exists in git or in function env. strava-sync reads it back through a
-- service-role-only RPC to authenticate the call.
--
-- Requires strava-sync deployed with --no-verify-jwt (the cron call carries no
-- user JWT; every other action still authenticates the user itself).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Sync bookkeeping, written by both manual and scheduled syncs.
alter table public.strava_tokens
  add column if not exists last_sync_at timestamptz,
  add column if not exists last_sync_status text;

-- Random shared secret, created once.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'strava_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'strava_cron_secret');
  end if;
end $$;

create or replace function public.get_strava_cron_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'strava_cron_secret' limit 1
$$;

revoke all on function public.get_strava_cron_secret() from public, anon, authenticated;
grant execute on function public.get_strava_cron_secret() to service_role;

-- (Re)schedule. Minute 17 to stay off the top-of-hour rush.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'strava-sync-3h') then
    perform cron.unschedule('strava-sync-3h');
  end if;
end $$;

select cron.schedule(
  'strava-sync-3h',
  '17 */3 * * *',
  $$
  select net.http_post(
    url     := 'https://foctdzzbonepdzeubate.supabase.co/functions/v1/strava-sync?action=cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'strava_cron_secret' limit 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
