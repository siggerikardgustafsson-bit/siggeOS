-- ============================================================================
-- PHASE 2 · verification (read-only). Run in the Supabase SQL editor AFTER push.
-- Every query below should return ZERO rows unless noted. Nothing here mutates.
-- ============================================================================

-- 1) Owned tables MISSING a user_id column (expect: none)
with owned(t) as (values
  ('training_sessions'),('training_exercises'),('personal_records'),('run_personal_records'),
  ('health_logs'),('supplement_logs'),('nutrition_logs'),('meal_logs'),
  ('journal_entries'),('social_interactions'),('friends'),
  ('study_sessions'),('courses'),('course_exams'),('learning_goals'),('study_tasks'),
  ('study_task_deadlines'),('tenta_sessions'),('course_materials'),('exam_old_files'),
  ('income_logs'),('expense_logs'),('fixed_costs'),('assets'),('net_worth_history'),
  ('projects'),('project_tasks'),('erik_tasks'),('erik_payments'),('erik_contact_log'),('pa_shifts'),
  ('mandatory_sessions'),('schedule_events'),
  ('trips'),('adventures'),('side_quests'),('skill_logs'),('daily_scores'),('tier_snapshots'),
  ('jarvis_insights'),('jarvis_conversations'),('user_settings'),
  ('strava_tokens'),('google_tokens'))
select o.t as table_missing_user_id
from owned o
where not exists (select 1 from information_schema.columns c
                  where c.table_schema='public' and c.table_name=o.t and c.column_name='user_id');

-- 2) Owned tables whose user_id is still NULLABLE (expect: none, unless a NOTICE
--    flagged ambiguous ownership during migration)
select c.table_name
from information_schema.columns c
where c.table_schema='public' and c.column_name='user_id' and c.is_nullable='YES'
  and c.table_name in (
    'training_sessions','training_exercises','personal_records','run_personal_records',
    'health_logs','supplement_logs','nutrition_logs','meal_logs','journal_entries',
    'social_interactions','friends','study_sessions','courses','course_exams','learning_goals',
    'study_tasks','study_task_deadlines','tenta_sessions','course_materials','exam_old_files',
    'income_logs','expense_logs','fixed_costs','assets','net_worth_history','projects',
    'project_tasks','erik_tasks','erik_payments','erik_contact_log','pa_shifts','mandatory_sessions',
    'schedule_events','trips','adventures','side_quests','skill_logs','daily_scores','tier_snapshots',
    'jarvis_insights','jarvis_conversations','user_settings','strava_tokens','google_tokens')
order by 1;

-- 3) Owned tables with NO leading-user_id index (expect: none)
with owned(t) as (values
  ('training_sessions'),('training_exercises'),('personal_records'),('run_personal_records'),
  ('health_logs'),('supplement_logs'),('nutrition_logs'),('meal_logs'),('journal_entries'),
  ('social_interactions'),('friends'),('study_sessions'),('courses'),('course_exams'),
  ('learning_goals'),('study_tasks'),('study_task_deadlines'),('tenta_sessions'),
  ('course_materials'),('exam_old_files'),('income_logs'),('expense_logs'),('fixed_costs'),
  ('assets'),('net_worth_history'),('projects'),('project_tasks'),('erik_tasks'),
  ('erik_payments'),('erik_contact_log'),('pa_shifts'),('mandatory_sessions'),('schedule_events'),
  ('trips'),('adventures'),('side_quests'),('skill_logs'),('daily_scores'),('tier_snapshots'),
  ('jarvis_insights'),('jarvis_conversations'),('user_settings'),('strava_tokens'),('google_tokens'))
select o.t as table_without_user_id_index
from owned o
where not exists (
  select 1 from pg_index i
  join pg_class tc on tc.oid = i.indrelid
  join pg_namespace n on n.oid = tc.relnamespace
  where n.nspname='public' and tc.relname = o.t
    and (select attname from pg_attribute where attrelid = tc.oid and attnum = i.indkey[0]) = 'user_id'
);

-- 4) Owned tables MISSING a FK on user_id -> auth.users (expect: none)
with owned(t) as (values
  ('training_sessions'),('training_exercises'),('health_logs'),('journal_entries'),
  ('income_logs'),('expense_logs'),('study_sessions'),('user_settings'),
  ('strava_tokens'),('google_tokens'))   -- representative sample; extend as needed
select o.t as table_without_user_fk
from owned o
where not exists (
  select 1 from information_schema.table_constraints tc
  join information_schema.key_column_usage k
    on k.constraint_name = tc.constraint_name and k.constraint_schema = tc.constraint_schema
  where tc.table_schema='public' and tc.table_name=o.t
    and tc.constraint_type='FOREIGN KEY' and k.column_name='user_id');

-- 5) training_exercises rows whose user_id does NOT match the parent session
--    (expect: 0 — the trigger + backfill keep them consistent)
select count(*) as training_exercises_owner_mismatch
from public.training_exercises te
join public.training_sessions s on s.id = te.session_id
where te.user_id is distinct from s.user_id;

-- 6) Any public table with RLS disabled (expect: none for data tables)
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false
order by 1;

-- 7) Token tables must still be service-role only (RLS on, 0 client policies)
select tablename, count(*) as policy_count
from pg_policies where schemaname='public' and tablename in ('strava_tokens','google_tokens')
group by tablename;   -- expect policy_count = 0 (or no rows)

-- 8) Reference tables: global rows still present & readable; overrides user-scoped
select
  (select count(*) from public.exercise_library where user_id is null)     as global_exercises,
  (select count(*) from public.exercise_library where user_id is not null) as user_override_exercises;

-- 9) Per-table NULL user_id counts (expect all 0) — quick scan of the big ones
select 'training_exercises' t, count(*) n from public.training_exercises where user_id is null
union all select 'training_sessions', count(*) from public.training_sessions where user_id is null
union all select 'health_logs',       count(*) from public.health_logs       where user_id is null
union all select 'journal_entries',   count(*) from public.journal_entries   where user_id is null
union all select 'personal_records',  count(*) from public.personal_records  where user_id is null
union all select 'income_logs',       count(*) from public.income_logs       where user_id is null
union all select 'expense_logs',      count(*) from public.expense_logs      where user_id is null
order by n desc, t;
