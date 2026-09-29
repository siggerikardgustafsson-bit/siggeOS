-- post_deploy_22 — nightly server-side tier_snapshots (tier-snapshot function).
--
-- Same pattern as post_deploy_21: secret generated in-DB, kept in Vault, read
-- back by the function through a service-role-only RPC.
-- 21:45 UTC = 23:45 CEST / 22:45 CET — UTC and Stockholm share the date then.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'nightly_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'nightly_cron_secret');
  end if;
end $$;

create or replace function public.get_nightly_cron_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'nightly_cron_secret' limit 1
$$;

revoke all on function public.get_nightly_cron_secret() from public, anon, authenticated;
grant execute on function public.get_nightly_cron_secret() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'tier-snapshot-nightly') then
    perform cron.unschedule('tier-snapshot-nightly');
  end if;
end $$;

select cron.schedule(
  'tier-snapshot-nightly',
  '45 21 * * *',
  $$
  select net.http_post(
    url     := 'https://foctdzzbonepdzeubate.supabase.co/functions/v1/tier-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'nightly_cron_secret' limit 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
