-- Ekonomi auto-sync (Enable Banking, see EKONOMI-INTEGRATION.md) — schema for
-- linking a bank account and remembering the resulting session.
--
-- bank_link_requests: short-lived CSRF `state` tokens minted when the user
-- clicks "Koppla bankkonto" — Enable Banking's redirect has no Supabase JWT,
-- so this is how the callback (running as service-role) knows which user to
-- attribute the completed link to. Only touched by edge functions (no RLS
-- policy — deny-all for anon/authenticated is the default with RLS enabled
-- and no policy defined).
create table if not exists public.bank_link_requests (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  aspsp_name text not null,
  aspsp_country text not null,
  created_at timestamptz not null default now()
);
alter table public.bank_link_requests enable row level security;

-- bank_connections: one row per linked account. `source` on income_logs/
-- expense_logs (post_deploy_14) is scoped by this connection's sync job.
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aspsp_name text not null,
  aspsp_country text not null,
  session_id text not null,
  account_uid text not null,
  account_name text,
  valid_until timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_uid)
);
alter table public.bank_connections enable row level security;
create policy "own bank connections" on public.bank_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
