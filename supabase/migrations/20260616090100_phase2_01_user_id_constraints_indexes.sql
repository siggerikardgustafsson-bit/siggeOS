-- ============================================================================
-- PHASE 2 · 01 · user_id backfill + constraints + indexes (all owned tables)
-- ----------------------------------------------------------------------------
-- For every listed table that exists AND has a user_id column, in order:
--   a) NULL audit + SAFE backfill
--        - if the table has exactly one distinct existing owner -> fill NULLs with it
--        - else if the whole system has exactly one auth user      -> fill with it
--        - else RAISE NOTICE and DO NOT touch the rows (no destructive guess)
--   b) FK user_id -> auth.users(id) ON DELETE CASCADE  (only if none exists)
--   c) NOT NULL                                        (only if zero NULLs remain)
--   d) indexes: composite (user_id,date)/(user_id,course_id)/(user_id,created_at)
--      where those columns exist, plus a leading-user_id index guarantee
-- Non-destructive: never deletes rows; never overwrites a non-NULL user_id;
-- never forces NOT NULL while NULLs remain. Existing FKs are left as-is.
--
-- Excludes: training_exercises (file 00), and the shared exercise-catalog tables
-- exercise_library / exercise_muscles / exercise_aliases / muscle_groups whose
-- global rows intentionally have NULL user_id (must NOT be made NOT NULL).
-- ============================================================================

do $$
declare
  t            text;
  v_user_count int;
  v_single     uuid;       -- system-wide sole owner, if exactly one auth user
  v_nulls      bigint;
  v_distinct   bigint;
  v_owner      uuid;
  v_fill       uuid;
  has_date     boolean;
  has_created  boolean;
  has_course   boolean;
  leads_uid    boolean;
  owned_tables text[] := array[
    'training_sessions','personal_records','run_personal_records',
    'health_logs','supplement_logs','nutrition_logs','meal_logs',
    'journal_entries','social_interactions','friends',
    'study_sessions','courses','course_exams','learning_goals','study_tasks',
    'study_task_deadlines','tenta_sessions','course_materials','exam_old_files',
    'income_logs','expense_logs','fixed_costs','assets','net_worth_history',
    'projects','project_tasks','erik_tasks','erik_payments','erik_contact_log','pa_shifts',
    'mandatory_sessions','schedule_events',
    'trips','adventures','side_quests','skill_logs','daily_scores','tier_snapshots',
    'jarvis_insights','jarvis_conversations','user_settings',
    'strava_tokens','google_tokens'
  ];
begin
  select count(*) into v_user_count from auth.users;
  if v_user_count = 1 then select id into v_single from auth.users; end if;

  foreach t in array owned_tables loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=t) then
      raise notice 'PHASE2 skip: table public.% does not exist', t; continue;
    end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=t and column_name='user_id') then
      raise notice 'PHASE2 WARNING: public.% has no user_id column — skipped', t; continue;
    end if;

    -- (a) NULL audit + safe backfill -----------------------------------------
    execute format('select count(*) from public.%I where user_id is null', t) into v_nulls;
    if v_nulls > 0 then
      execute format('select count(distinct user_id), max(user_id) from public.%I where user_id is not null', t)
        into v_distinct, v_owner;
      if v_distinct = 1 then
        v_fill := v_owner;
      elsif v_distinct = 0 and v_single is not null then
        v_fill := v_single;
      else
        v_fill := null;
      end if;

      if v_fill is not null then
        execute format('update public.%I set user_id = %L where user_id is null', t, v_fill);
        raise notice 'PHASE2 backfill: % NULL rows in % -> owner %', v_nulls, t, v_fill;
      else
        raise notice 'PHASE2 WARNING: % has % NULL user_id rows with ambiguous ownership — NOT backfilled, NOT NULL will be skipped', t, v_nulls;
      end if;
    end if;

    -- (b) FK -> auth.users (only if none on user_id) -------------------------
    if not exists (
      select 1 from information_schema.table_constraints tc
      join information_schema.key_column_usage k
        on k.constraint_name = tc.constraint_name and k.constraint_schema = tc.constraint_schema
      where tc.table_schema='public' and tc.table_name=t
        and tc.constraint_type='FOREIGN KEY' and k.column_name='user_id'
    ) then
      execute format('alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
                     t, 'fk_'||t||'_user_id');
      raise notice 'PHASE2 ok: FK %_user_id added', t;
    end if;

    -- (c) NOT NULL (only if clean) -------------------------------------------
    execute format('select count(*) from public.%I where user_id is null', t) into v_nulls;
    if v_nulls = 0 then
      execute format('alter table public.%I alter column user_id set not null', t);
    else
      raise notice 'PHASE2: % retains % NULL user_id rows — left nullable', t, v_nulls;
    end if;

    -- (d) indexes -------------------------------------------------------------
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='date')       into has_date;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='created_at') into has_created;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='course_id')  into has_course;

    if has_date then
      execute format('create index if not exists %I on public.%I (user_id, date desc)', 'idx_'||t||'_user_date', t);
    elsif has_created then
      execute format('create index if not exists %I on public.%I (user_id, created_at desc)', 'idx_'||t||'_user_created', t);
    end if;
    if has_course then
      execute format('create index if not exists %I on public.%I (user_id, course_id)', 'idx_'||t||'_user_course', t);
    end if;

    -- guarantee at least one leading-user_id index without redundant bloat
    select exists (
      select 1 from pg_index i
      join pg_class tc on tc.oid = i.indrelid
      join pg_namespace n on n.oid = tc.relnamespace
      where n.nspname='public' and tc.relname=t and i.indnatts >= 1
        and (select attname from pg_attribute where attrelid = tc.oid and attnum = i.indkey[0]) = 'user_id'
    ) into leads_uid;
    if not leads_uid then
      execute format('create index if not exists %I on public.%I (user_id)', 'idx_'||t||'_user_id', t);
    end if;

    raise notice 'PHASE2 ok: % constraints+indexes ensured', t;
  end loop;
end $$;
