-- ============================================================================
-- PHASE 3 · 00 · ownership-safe Google event uniqueness
-- ----------------------------------------------------------------------------
-- pa_shifts and mandatory_sessions were upserted ON CONFLICT (google_event_id),
-- which is GLOBALLY unique. In a multi-user world that means user B syncing an
-- event that happens to share a google_event_id with user A's row would UPDATE
-- user A's row — a cross-user collision. This migration moves uniqueness to
-- (user_id, google_event_id) so each user owns their own copy.
--
-- Pairs with the edge-function change: google-calendar-sync now upserts
-- ON CONFLICT (user_id, google_event_id). Apply this migration AND redeploy the
-- function together (see PHASE3_REPORT.md §deploy order).
--
-- Safe & idempotent: guards against existing duplicate (user_id, google_event_id)
-- pairs (RAISE NOTICE, skip — no data touched). NULL google_event_id rows (the
-- manual mandatory-sessions path) are unaffected (NULLs are distinct in a unique
-- index, so multiple (user, NULL) rows remain allowed). Depends on Phase 2 having
-- set user_id NOT NULL on both tables.
-- ============================================================================

do $$
declare
  tbl       text;
  c         record;
  dup_count bigint;
  tables    text[] := array['pa_shifts','mandatory_sessions'];
begin
  foreach tbl in array tables loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=tbl) then
      raise notice 'PHASE3 skip: table public.% does not exist', tbl; continue;
    end if;

    -- Guard: existing data must not already violate the composite unique.
    execute format(
      'select count(*) from (select 1 from public.%I where google_event_id is not null '
      || 'group by user_id, google_event_id having count(*) > 1) d', tbl) into dup_count;
    if dup_count > 0 then
      raise notice 'PHASE3 WARNING: % has % duplicate (user_id, google_event_id) groups — composite unique NOT added; deduplicate manually then re-run', tbl, dup_count;
      continue;
    end if;

    -- Drop unique CONSTRAINTS that are exactly on (google_event_id).
    for c in (
      select con.conname
      from pg_constraint con
      where con.conrelid = ('public.'||tbl)::regclass and con.contype = 'u'
        and (select array_agg(att.attname order by att.attname)
             from unnest(con.conkey) k
             join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k)
            = array['google_event_id']
    ) loop
      execute format('alter table public.%I drop constraint %I', tbl, c.conname);
      raise notice 'PHASE3: dropped unique constraint % on %(google_event_id)', c.conname, tbl;
    end loop;

    -- Drop standalone unique INDEXES on (google_event_id) not backing a constraint.
    for c in (
      select ic.relname as idxname
      from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      join pg_class tc on tc.oid = i.indrelid
      join pg_namespace n on n.oid = tc.relnamespace
      where n.nspname='public' and tc.relname=tbl and i.indisunique
        and i.indnatts = 1
        and (select attname from pg_attribute where attrelid = tc.oid and attnum = i.indkey[0]) = 'google_event_id'
        and not exists (select 1 from pg_constraint con where con.conindid = i.indexrelid)
    ) loop
      execute format('drop index if exists public.%I', c.idxname);
      raise notice 'PHASE3: dropped unique index % on %(google_event_id)', c.idxname, tbl;
    end loop;

    -- Add the composite unique (idempotent) — backs ON CONFLICT (user_id, google_event_id).
    if not exists (
      select 1 from pg_constraint con
      where con.conrelid = ('public.'||tbl)::regclass and con.contype = 'u'
        and (select array_agg(att.attname order by att.attname)
             from unnest(con.conkey) k
             join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k)
            = array['google_event_id','user_id']
    ) then
      execute format('alter table public.%I add constraint %I unique (user_id, google_event_id)',
                     tbl, tbl||'_user_google_event_uniq');
      raise notice 'PHASE3 ok: % unique(user_id, google_event_id) added', tbl;
    else
      raise notice 'PHASE3 ok: % already has unique(user_id, google_event_id)', tbl;
    end if;
  end loop;
end $$;
