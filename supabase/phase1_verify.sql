-- ============================================================================
-- PHASE 1 · verification (read-only). Run in the Supabase SQL editor AFTER push.
-- Nothing here mutates data.
-- ============================================================================

-- 1) Every public table: is RLS enabled, and how many policies does it have?
--    Expect: rls_enabled = true for all data tables (the exercise-catalog tables
--    are reference data but still RLS-on with a public read policy).
select c.relname              as table_name,
       c.relrowsecurity       as rls_enabled,
       count(p.policyname)    as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relrowsecurity, c.relname;

-- 2) Any public table with RLS still OFF (must be empty for data tables)
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity = false
order by 1;

-- 3) Full policy listing (sanity-check the auth.uid() = user_id predicates)
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname='public'
order by tablename, cmd, policyname;

-- 4) Token tables should have RLS on and ZERO policies (service-role only)
select tablename, count(*) as policy_count
from pg_policies
where schemaname='public' and tablename in ('strava_tokens','google_tokens')
group by tablename;

-- 5) profiles exists, has rows, and the owner is admin
select count(*) as profile_rows,
       count(*) filter (where is_admin) as admin_rows
from public.profiles;

-- 6) Phase 2 preview — any personal rows with NULL user_id (should be 0 before
--    you add NOT NULL constraints later). Add tables as needed.
select 'training_sessions' t, count(*) null_user_rows from public.training_sessions where user_id is null
union all select 'health_logs', count(*) from public.health_logs where user_id is null
union all select 'journal_entries', count(*) from public.journal_entries where user_id is null
union all select 'income_logs', count(*) from public.income_logs where user_id is null
union all select 'user_settings', count(*) from public.user_settings where user_id is null;
