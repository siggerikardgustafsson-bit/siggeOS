-- post_deploy_23 — proactive weekly Jarvis report (jarvis-weekly function).
--
-- Written by the jarvis-weekly edge function (service role) every Sunday;
-- the user can read and delete their own. `focus` is the ONE measurable
-- priority the report sets — next week's report checks it against the data,
-- and the Jarvis NU context carries it daily (accountability loop).

create table if not exists public.jarvis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'weekly',
  period_start date not null,
  period_end date not null,
  content text not null,
  focus text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, period_start)
);

create index if not exists jarvis_reports_user_created_idx
  on public.jarvis_reports (user_id, created_at desc);

alter table public.jarvis_reports enable row level security;

drop policy if exists "jarvis_reports_select_own" on public.jarvis_reports;
create policy "jarvis_reports_select_own" on public.jarvis_reports
  for select using (auth.uid() = user_id);

drop policy if exists "jarvis_reports_delete_own" on public.jarvis_reports;
create policy "jarvis_reports_delete_own" on public.jarvis_reports
  for delete using (auth.uid() = user_id);

-- Sunday 18:00 UTC = 20:00 CEST / 19:00 CET. Same Vault secret as the
-- nightly tier-snapshot job (post_deploy_22).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'jarvis-weekly') then
    perform cron.unschedule('jarvis-weekly');
  end if;
end $$;

select cron.schedule(
  'jarvis-weekly',
  '0 18 * * 0',
  $$
  select net.http_post(
    url     := 'https://foctdzzbonepdzeubate.supabase.co/functions/v1/jarvis-weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'nightly_cron_secret' limit 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);
