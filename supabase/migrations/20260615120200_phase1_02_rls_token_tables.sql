-- ============================================================================
-- PHASE 1 · 02 · OAuth token tables — service-role ONLY
-- ----------------------------------------------------------------------------
-- strava_tokens / google_tokens hold OAuth access+refresh tokens. They are only
-- ever read/written by edge functions (strava-sync, google-calendar-sync), which
-- use the service-role key and bypass RLS. No client code queries them.
--
-- Therefore: enable RLS and create NO client policies. With RLS enabled and no
-- policy, the anon/authenticated roles are denied all access (deny-by-default),
-- while service_role continues to work. This is stricter than owner-only and
-- ensures access/refresh tokens can never be read by any browser client.
-- ============================================================================

do $$
declare
  t   text;
  pol record;
  token_tables text[] := array['strava_tokens','google_tokens'];
begin
  foreach t in array token_tables loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=t) then
      raise notice 'PHASE1 skip: table public.% does not exist', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Drop every existing policy so no client (anon/authenticated) retains access.
    for pol in select policyname from pg_policies
               where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    raise notice 'PHASE1 ok: % locked to service-role only (RLS on, no client policy)', t;
  end loop;
end $$;
