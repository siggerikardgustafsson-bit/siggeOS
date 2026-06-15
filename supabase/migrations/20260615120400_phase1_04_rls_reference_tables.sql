-- ============================================================================
-- PHASE 1 · 04 · RLS for shared exercise-catalog (reference) tables
-- ----------------------------------------------------------------------------
-- These hold NO personal data; they are the shared exercise catalog.
--   exercise_library   : HYBRID — global defaults (user_id IS NULL, read-only to
--                        users) + per-user override rows (user_id = owner).
--   exercise_muscles   : junction exercise_id -> muscle_group (no user_id).
--   exercise_aliases   : junction exercise_id -> alias (no user_id).
--   muscle_groups      : pure taxonomy (no user_id).
--   exercise_library_with_muscles : VIEW over the above.
--
-- Goal: everyone can READ the catalog; a user may only WRITE their own library
-- rows (and the mappings of exercises they own); only admins may write GLOBAL
-- (user_id IS NULL) rows / taxonomy. This preserves today's user-extensible
-- flow (Traning.jsx creates user-owned overrides) while closing the gap where a
-- client could edit shared/global rows.
-- Requires public.is_admin() from migration 00.
-- ============================================================================

-- ── enable RLS + clear existing policies on the 4 base tables ───────────────
do $$
declare
  t   text;
  pol record;
  ref_tables text[] := array['exercise_library','exercise_muscles','exercise_aliases','muscle_groups'];
begin
  foreach t in array ref_tables loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=t) then
      raise notice 'PHASE1 skip: table public.% does not exist', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    for pol in select policyname from pg_policies
               where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

-- ── exercise_library: read global+own+admin; write own (or admin for global) ─
create policy exercise_library_sel on public.exercise_library
  for select using (user_id is null or auth.uid() = user_id or public.is_admin());
create policy exercise_library_ins on public.exercise_library
  for insert with check (auth.uid() = user_id or (user_id is null and public.is_admin()));
create policy exercise_library_upd on public.exercise_library
  for update using (auth.uid() = user_id or (user_id is null and public.is_admin()))
              with check (auth.uid() = user_id or (user_id is null and public.is_admin()));
create policy exercise_library_del on public.exercise_library
  for delete using (auth.uid() = user_id or (user_id is null and public.is_admin()));

-- ── exercise_muscles: public read; write only mappings of an owned exercise ──
create policy exercise_muscles_sel on public.exercise_muscles
  for select using (true);
create policy exercise_muscles_write on public.exercise_muscles
  for all
  using (exists (select 1 from public.exercise_library e
                 where e.id = exercise_muscles.exercise_id
                   and (e.user_id = auth.uid() or (e.user_id is null and public.is_admin()))))
  with check (exists (select 1 from public.exercise_library e
                 where e.id = exercise_muscles.exercise_id
                   and (e.user_id = auth.uid() or (e.user_id is null and public.is_admin()))));

-- ── exercise_aliases: public read; write only aliases of an owned exercise ──
create policy exercise_aliases_sel on public.exercise_aliases
  for select using (true);
create policy exercise_aliases_write on public.exercise_aliases
  for all
  using (exists (select 1 from public.exercise_library e
                 where e.id = exercise_aliases.exercise_id
                   and (e.user_id = auth.uid() or (e.user_id is null and public.is_admin()))))
  with check (exists (select 1 from public.exercise_library e
                 where e.id = exercise_aliases.exercise_id
                   and (e.user_id = auth.uid() or (e.user_id is null and public.is_admin()))));

-- ── muscle_groups: public read; admin-only write (fixed taxonomy) ───────────
create policy muscle_groups_sel on public.muscle_groups
  for select using (true);
create policy muscle_groups_write on public.muscle_groups
  for all using (public.is_admin()) with check (public.is_admin());

-- ── view: respect the querying user's RLS on the base tables ────────────────
-- Without security_invoker a view runs with the view owner's rights and can
-- bypass exercise_library's RLS (exposing other users' custom exercises).
-- Postgres 15+/this DB is 17, so security_invoker is supported.
do $$
begin
  if exists (select 1 from pg_views where schemaname='public' and viewname='exercise_library_with_muscles') then
    execute 'alter view public.exercise_library_with_muscles set (security_invoker = on)';
    raise notice 'PHASE1 ok: exercise_library_with_muscles set security_invoker=on';
  else
    raise notice 'PHASE1 skip: view exercise_library_with_muscles not found';
  end if;
end $$;
