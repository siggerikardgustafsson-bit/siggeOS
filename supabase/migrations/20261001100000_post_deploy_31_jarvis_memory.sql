-- post_deploy_31 — Jarvis long-term memory that actually stays current.
--
-- jarvis_insights had 1 402 rows (bulk-written 1–9 June), only the 20 most
-- recent reached the prompt, and chat had saved 4 since mid-June: the memory
-- was frozen. Now:
--   * archived_at: superseded insights are archived, never deleted (searchable
--     via fetch_memory_goals, hidden from MINNE).
--   * source: 'chat' | 'manual' | 'curated' | 'nightly'.
--   * jarvis-memory runs nightly (03:30 Stockholm): reads the day's chat and
--     journal and adds/updates/archives insights against the active list.
alter table public.jarvis_insights add column if not exists archived_at timestamptz;
alter table public.jarvis_insights add column if not exists source text;
create index if not exists jarvis_insights_active_idx on public.jarvis_insights (user_id) where archived_at is null;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'jarvis-memory-nightly') then
    perform cron.unschedule('jarvis-memory-nightly');
  end if;
end $$;

select cron.schedule(
  'jarvis-memory-nightly',
  '30 1 * * *',
  $$
  select net.http_post(
    url     := 'https://foctdzzbonepdzeubate.supabase.co/functions/v1/jarvis-memory',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'nightly_cron_secret' limit 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  $$
);
