-- post_deploy_24 — personal n-of-1 experiments (Insights → Experiment).
--
-- A user changes ONE thing for a fixed period (the lever, e.g. sleep ≥ 7 h)
-- and the app compares an outcome metric against the same-length window
-- before the start. Evaluation is computed client/server-side from existing
-- logs (src/lib/experiments.js) — this table only stores the design.

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  hypothesis text,
  outcome_metric text not null,          -- key in EXPERIMENT_METRICS
  direction text not null default 'up',  -- desired change of the outcome: up | down
  lever_metric text,                     -- optional adherence metric
  lever_op text,                         -- '>=' | '<='
  lever_target numeric,
  start_date date not null default current_date,
  duration_days int not null default 14 check (duration_days between 3 and 90),
  baseline_days int not null default 14 check (baseline_days between 3 and 90),
  status text not null default 'active', -- active | done | abandoned
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experiments_direction_chk check (direction in ('up', 'down')),
  constraint experiments_lever_op_chk check (lever_op is null or lever_op in ('>=', '<=')),
  constraint experiments_status_chk check (status in ('active', 'done', 'abandoned'))
);

create index if not exists experiments_user_idx on public.experiments (user_id, start_date desc);

alter table public.experiments enable row level security;

drop policy if exists "experiments_owner_all" on public.experiments;
create policy "experiments_owner_all" on public.experiments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
