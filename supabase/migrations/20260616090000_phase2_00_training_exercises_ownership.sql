-- ============================================================================
-- PHASE 2 · 00 · training_exercises direct ownership (user_id)
-- ----------------------------------------------------------------------------
-- Phase 1 gave training_exercises parent-session-join RLS because it had no
-- user_id. Phase 2 promotes it to a first-class owned table:
--   * add user_id column
--   * backfill from training_sessions.user_id (the parent)
--   * BEFORE INSERT trigger to auto-fill user_id from the parent session
--     (DB safety net so the column is always correct even if a code path forgets,
--      and so the NOT NULL constraint is safe across rolling deploys)
--   * NOT NULL only if backfill leaves zero NULLs (else RAISE NOTICE, no failure)
--   * FK -> auth.users(id) ON DELETE CASCADE
--   * indexes (user_id, session_id, (user_id, exercise_name))
--   * switch RLS to direct user_id (drop Phase 1 parent-join policies)
-- Non-destructive: no rows are deleted; the column add + backfill preserve data.
-- ============================================================================

-- 1) add the column (nullable for now)
alter table public.training_exercises add column if not exists user_id uuid;

-- 2) backfill from the parent session
update public.training_exercises te
set user_id = s.user_id
from public.training_sessions s
where s.id = te.session_id and te.user_id is null;

-- 3) DB safety net: keep user_id in sync with the parent session on insert.
--    SECURITY DEFINER so it always reads the true parent owner; combined with the
--    RLS insert check (auth.uid() = user_id) this also rejects cross-user inserts.
create or replace function public.set_training_exercise_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    select s.user_id into new.user_id
    from public.training_sessions s
    where s.id = new.session_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_training_exercises_set_user_id on public.training_exercises;
create trigger trg_training_exercises_set_user_id
  before insert on public.training_exercises
  for each row execute function public.set_training_exercise_user_id();

-- 4) constraints (only if safe), FK, indexes
do $$
declare v_nulls bigint;
begin
  select count(*) into v_nulls from public.training_exercises where user_id is null;
  if v_nulls = 0 then
    alter table public.training_exercises alter column user_id set not null;
    raise notice 'PHASE2 ok: training_exercises.user_id set NOT NULL';
  else
    raise notice 'PHASE2 WARNING: training_exercises has % rows with NULL user_id (orphan sets, no/NULL parent) — left nullable, review manually', v_nulls;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage k
      on k.constraint_name = tc.constraint_name and k.constraint_schema = tc.constraint_schema
    where tc.table_schema='public' and tc.table_name='training_exercises'
      and tc.constraint_type='FOREIGN KEY' and k.column_name='user_id'
  ) then
    alter table public.training_exercises
      add constraint fk_training_exercises_user_id
      foreign key (user_id) references auth.users(id) on delete cascade;
    raise notice 'PHASE2 ok: training_exercises FK -> auth.users added';
  end if;
end $$;

create index if not exists idx_training_exercises_user_id        on public.training_exercises (user_id);
create index if not exists idx_training_exercises_session_id     on public.training_exercises (session_id);
create index if not exists idx_training_exercises_user_exercise  on public.training_exercises (user_id, exercise_name);

-- 5) switch RLS from parent-join (Phase 1) to direct user_id
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname='public' and tablename='training_exercises' loop
    execute format('drop policy if exists %I on public.training_exercises', pol.policyname);
  end loop;
end $$;

create policy training_exercises_sel_own on public.training_exercises
  for select using (auth.uid() = user_id);
create policy training_exercises_ins_own on public.training_exercises
  for insert with check (auth.uid() = user_id);
create policy training_exercises_upd_own on public.training_exercises
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy training_exercises_del_own on public.training_exercises
  for delete using (auth.uid() = user_id);
