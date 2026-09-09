-- ============================================================================
-- POST-DEPLOY · 05 · extend the `goals` table for tracking
-- ----------------------------------------------------------------------------
-- A `goals` table already exists (created directly in the dashboard, like
-- fixed_costs — it is in no earlier migration). Current columns:
--   id, user_id, title, description, category, target_value, current_value,
--   unit, deadline, status, created_at, updated_at
-- Nothing in the app reads it yet.
--
-- This migration is ADDITIVE + idempotent: it adds the columns needed to track
-- a goal over time (direction, pin, ordering, completion stamp, a free "metric"
-- label, an optional soft link to a trip), guards the value columns with CHECK
-- constraints, and (re)asserts owner-only RLS with the canonical policy set —
-- `goals` was NOT in the Phase 1 personal-tables list, so its policies are
-- whatever was set by hand. Non-destructive: no column is dropped or renamed,
-- the free-text life goals in user_settings.goals are untouched.
--
-- The app treats the existing `category` column as the domain
-- (traning|halsa|ekonomi|plugg|resor|jobb|livet) and `deadline` as the target
-- date. See src/lib/goals.js.
-- ============================================================================

alter table public.goals add column if not exists metric         text;
alter table public.goals add column if not exists direction      text not null default 'up';
alter table public.goals add column if not exists pinned         boolean not null default false;
alter table public.goals add column if not exists linked_trip_id uuid;
alter table public.goals add column if not exists sort_order     int not null default 0;
alter table public.goals add column if not exists completed_at   timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'goals_status_chk') then
    alter table public.goals add constraint goals_status_chk
      check (status is null or status in ('active','done','paused','dropped'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'goals_direction_chk') then
    alter table public.goals add constraint goals_direction_chk
      check (direction in ('up','down'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'goals_category_chk') then
    alter table public.goals add constraint goals_category_chk
      check (category is null or category in ('traning','halsa','ekonomi','plugg','resor','jobb','livet'));
  end if;
end $$;

create index if not exists idx_goals_user_status on public.goals (user_id, status);

-- keep updated_at fresh on write
create or replace function public.goals_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists goals_touch on public.goals;
create trigger goals_touch before update on public.goals
  for each row execute function public.goals_touch_updated_at();

-- ── RLS: owner-only, canonical set (matches Phase 1 personal tables) ─────────
alter table public.goals enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='goals' loop
    execute format('drop policy if exists %I on public.goals', pol.policyname);
  end loop;
end $$;

create policy goals_sel_own on public.goals for select using (auth.uid() = user_id);
create policy goals_ins_own on public.goals for insert with check (auth.uid() = user_id);
create policy goals_upd_own on public.goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy goals_del_own on public.goals for delete using (auth.uid() = user_id);

comment on table public.goals is 'Post-deploy 05 — structured trackable goals. `category` = domain, `deadline` = target date. The free-text life goals in user_settings.goals are separate and unchanged.';
