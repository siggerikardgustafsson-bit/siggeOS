-- ============================================================================
-- PHASE 3 · verification (read-only). Run in the Supabase SQL editor AFTER push.
-- Nothing here mutates data.
-- ============================================================================

-- 1) pa_shifts / mandatory_sessions MUST have a unique on (user_id, google_event_id)
--    (expect one row each)
select con.conrelid::regclass::text as tbl, con.conname,
       (select array_agg(att.attname order by att.attname)
        from unnest(con.conkey) k
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k) as cols
from pg_constraint con
where con.conrelid in ('public.pa_shifts'::regclass, 'public.mandatory_sessions'::regclass)
  and con.contype = 'u'
order by 1;

-- 2) The OLD global unique on (google_event_id) alone must be GONE
--    (expect zero rows)
select con.conrelid::regclass::text as tbl, con.conname as leftover_global_unique
from pg_constraint con
where con.conrelid in ('public.pa_shifts'::regclass, 'public.mandatory_sessions'::regclass)
  and con.contype = 'u'
  and (select array_agg(att.attname) from unnest(con.conkey) k
       join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k) = array['google_event_id'];

-- 3) No duplicate (user_id, google_event_id) rows (expect zero)
select 'pa_shifts' t, user_id, google_event_id, count(*)
from public.pa_shifts where google_event_id is not null
group by user_id, google_event_id having count(*) > 1
union all
select 'mandatory_sessions', user_id, google_event_id, count(*)
from public.mandatory_sessions where google_event_id is not null
group by user_id, google_event_id having count(*) > 1;

-- 4) Cross-user reuse of the same google_event_id is now ALLOWED (informational).
--    Each user keeps their own row; counts >1 here are fine post-migration.
select google_event_id, count(distinct user_id) as users_sharing_event
from public.pa_shifts where google_event_id is not null
group by google_event_id having count(distinct user_id) > 1;

-- 5) OAuth token tables remain service-role only: RLS on, ZERO client policies
--    (expect rls_enabled = true and policy_count = 0)
select c.relname,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policy_count
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('strava_tokens','google_tokens');

-- 6) No public DATA table accidentally has RLS disabled (expect zero rows)
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false
order by 1;

-- 7) Ownership columns present on the synced tables (sanity for the upsert path)
select table_name, column_name, is_nullable
from information_schema.columns
where table_schema='public' and column_name='user_id'
  and table_name in ('pa_shifts','mandatory_sessions')
order by 1;
