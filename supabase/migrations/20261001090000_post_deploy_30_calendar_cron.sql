-- post_deploy_30 — Google Calendar sync on a schedule (was manual only).
-- 06:30 and 18:30 Stockholm (CEST): google-calendar-sync?action=cron syncs PA
-- shifts and obligatoriska moment for every connected user. The function is
-- deployed with --no-verify-jwt and checks x-cron-secret itself.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'calendar-sync-2x') then
    perform cron.unschedule('calendar-sync-2x');
  end if;
end $$;

select cron.schedule(
  'calendar-sync-2x',
  '30 4,16 * * *',
  $$
  select net.http_post(
    url     := 'https://foctdzzbonepdzeubate.supabase.co/functions/v1/google-calendar-sync?action=cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'nightly_cron_secret' limit 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
