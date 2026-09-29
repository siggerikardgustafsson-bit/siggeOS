-- post_deploy_27 — web push reminders (push-notify function).
--
-- push_subscriptions: one row per device that enabled notifications
-- (Settings → Notiser). notification_log: one row per (user, kind, day) sent,
-- so an hourly job can never send the same reminder twice.
-- The job runs hourly; push-notify decides what is due in Stockholm time.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions_owner_all" on public.push_subscriptions;
create policy "push_subscriptions_owner_all" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  day date not null,
  title text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, day)
);
alter table public.notification_log enable row level security;
drop policy if exists "notification_log_select_own" on public.notification_log;
create policy "notification_log_select_own" on public.notification_log
  for select using (auth.uid() = user_id);

do $$
begin
  if exists (select 1 from cron.job where jobname = 'push-notify-hourly') then
    perform cron.unschedule('push-notify-hourly');
  end if;
end $$;

select cron.schedule(
  'push-notify-hourly',
  '2 * * * *',
  $$
  select net.http_post(
    url     := 'https://foctdzzbonepdzeubate.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'nightly_cron_secret' limit 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
