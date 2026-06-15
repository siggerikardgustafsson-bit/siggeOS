-- ============================================================================
-- PHASE 1 · 01 · RLS hardening for personal (owner-only) tables
-- ----------------------------------------------------------------------------
-- For every listed table that exists AND has a `user_id` column:
--   * enable RLS
--   * drop ALL existing policies (unknown names included)
--   * create the canonical owner-only set (select/insert/update/delete),
--     all asserting auth.uid() = user_id, with WITH CHECK on insert/update so
--     a client can never write a row owned by someone else.
-- Tables without user_id are SKIPPED with a NOTICE (review manually) so the
-- migration never fails on a schema assumption.
--
-- Excludes: strava_tokens, google_tokens (file 02 — service-role only),
--           training_exercises (file 03 — owned via parent session),
--           exercise_library family (file 04 — shared reference data).
-- Verified pre-migration: anon already reads 0 rows from all of these, i.e. RLS
-- is already on. This migration STANDARDISES and guarantees correct policies
-- (notably WITH CHECK) regardless of the current ad-hoc state.
-- ============================================================================

do $$
declare
  t   text;
  pol record;
  personal_tables text[] := array[
    -- training / health
    'training_sessions','personal_records','run_personal_records',
    'health_logs','supplement_logs','nutrition_logs','meal_logs',
    -- journal / social / memory
    'journal_entries','social_interactions','friends',
    -- study
    'study_sessions','courses','course_exams','learning_goals','study_tasks',
    'study_task_deadlines','tenta_sessions','course_materials','exam_old_files',
    -- economy
    'income_logs','expense_logs','fixed_costs','assets','net_worth_history',
    -- work
    'projects','project_tasks','erik_tasks','erik_payments','erik_contact_log','pa_shifts',
    -- calendar
    'mandatory_sessions','schedule_events',
    -- experiences / dashboard
    'trips','adventures','side_quests','skill_logs','daily_scores','tier_snapshots',
    -- jarvis / settings
    'jarvis_insights','jarvis_conversations','user_settings'
  ];
begin
  foreach t in array personal_tables loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=t) then
      raise notice 'PHASE1 skip: table public.% does not exist', t;
      continue;
    end if;

    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=t and column_name='user_id') then
      raise notice 'PHASE1 WARNING: public.% has no user_id column — left untouched, review manually', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for pol in select policyname from pg_policies
               where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      t||'_sel_own', t);
    execute format(
      'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
      t||'_ins_own', t);
    execute format(
      'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t||'_upd_own', t);
    execute format(
      'create policy %I on public.%I for delete using (auth.uid() = user_id)',
      t||'_del_own', t);

    raise notice 'PHASE1 ok: % hardened (owner-only RLS)', t;
  end loop;
end $$;
