-- post_deploy_25 — per-request Claude API usage log (cost measurement).
--
-- One row per jarvis-chat request (summed over its tool-loop iterations) and
-- per jarvis-weekly report. The four token meters are what the bill is made
-- of; cost_usd is an ESTIMATE from list prices at write time (see
-- supabase/functions/_shared/aiUsage.ts) — the Anthropic Console is the truth.

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,            -- chat | brief | extract:<tag> | weekly
  model text not null,
  iterations int not null default 1,
  input_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage for select using (auth.uid() = user_id);

drop policy if exists "ai_usage_insert_own" on public.ai_usage;
create policy "ai_usage_insert_own" on public.ai_usage for insert with check (auth.uid() = user_id);
