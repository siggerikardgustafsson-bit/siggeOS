-- ============================================================================
-- PHASE 1 · 03 · RLS for training_exercises (owned via parent session)
-- ----------------------------------------------------------------------------
-- training_exercises has no user_id column (inserts only set session_id); each
-- row is owned indirectly via training_sessions.session_id -> training_sessions.user_id.
-- Policies are written as an EXISTS check against the parent session's owner.
-- (If a user_id column is ever added later, switch to a direct owner policy.)
--
-- This also makes the existing client-side bulk updates safe automatically:
-- e.g. Traning.jsx renames training_exercises by exercise_id with no owner
-- filter — RLS now restricts those writes to rows whose parent session is the
-- caller's, so they can never touch another user's rows.
-- ============================================================================

do $$
declare
  has_uid boolean;
  pol record;
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='training_exercises') then
    raise notice 'PHASE1 skip: table public.training_exercises does not exist';
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='training_exercises' and column_name='user_id'
  ) into has_uid;

  alter table public.training_exercises enable row level security;

  for pol in select policyname from pg_policies
             where schemaname='public' and tablename='training_exercises' loop
    execute format('drop policy if exists %I on public.training_exercises', pol.policyname);
  end loop;

  if has_uid then
    create policy training_exercises_sel_own on public.training_exercises
      for select using (auth.uid() = user_id);
    create policy training_exercises_ins_own on public.training_exercises
      for insert with check (auth.uid() = user_id);
    create policy training_exercises_upd_own on public.training_exercises
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
    create policy training_exercises_del_own on public.training_exercises
      for delete using (auth.uid() = user_id);
    raise notice 'PHASE1 ok: training_exercises hardened (direct user_id)';
  else
    create policy training_exercises_sel_own on public.training_exercises
      for select using (exists (
        select 1 from public.training_sessions s
        where s.id = training_exercises.session_id and s.user_id = auth.uid()));
    create policy training_exercises_ins_own on public.training_exercises
      for insert with check (exists (
        select 1 from public.training_sessions s
        where s.id = training_exercises.session_id and s.user_id = auth.uid()));
    create policy training_exercises_upd_own on public.training_exercises
      for update using (exists (
        select 1 from public.training_sessions s
        where s.id = training_exercises.session_id and s.user_id = auth.uid()))
      with check (exists (
        select 1 from public.training_sessions s
        where s.id = training_exercises.session_id and s.user_id = auth.uid()));
    create policy training_exercises_del_own on public.training_exercises
      for delete using (exists (
        select 1 from public.training_sessions s
        where s.id = training_exercises.session_id and s.user_id = auth.uid()));
    raise notice 'PHASE1 ok: training_exercises hardened (parent-session join)';
  end if;
end $$;
