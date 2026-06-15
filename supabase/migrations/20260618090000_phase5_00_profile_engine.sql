-- ============================================================================
-- PHASE 5 · 00 · Profile Engine — extend profiles for personalization
-- ----------------------------------------------------------------------------
-- Adds identity / body / life-context / preference / goal-focus fields to the
-- profiles table (created in Phase 1). All columns are NULLABLE so existing rows
-- and the handle_new_user trigger keep working unchanged. RLS is unchanged
-- (Phase 1 owner+admin policies already cover the new columns).
--
-- Does NOT change scoring, tiers, Jarvis, onboarding, or user_settings. Age is
-- derived from birth_date in the app (not stored — it would go stale).
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded CHECK constraints.
-- ============================================================================

-- ── identity ────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists first_name        text;
alter table public.profiles add column if not exists last_name         text;
alter table public.profiles add column if not exists birth_date        date;
alter table public.profiles add column if not exists sex               text;
alter table public.profiles add column if not exists country           text;
alter table public.profiles add column if not exists city              text;
-- (display_name, avatar_url, locale [=language], timezone already exist from Phase 1)

-- ── body ────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists height_cm         numeric;
alter table public.profiles add column if not exists weight_kg         numeric;   -- optional profile baseline; health_logs remains the time-series source of truth
alter table public.profiles add column if not exists target_weight_kg  numeric;

-- ── life context ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists life_stage        text;
alter table public.profiles add column if not exists occupation        text;
alter table public.profiles add column if not exists study_program     text;
alter table public.profiles add column if not exists study_institution text;

-- ── preferences ──────────────────────────────────────────────────────────────
-- (currency [=preferred_currency], unit_system already exist from Phase 1)
alter table public.profiles add column if not exists theme_prefs       jsonb not null default '{}'::jsonb;  -- foundation for future cross-device theme sync (ThemeContext still uses localStorage today)

-- ── goals / focus ────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists primary_focus     text;
alter table public.profiles add column if not exists secondary_focus   text;

-- ── value constraints (guarded so re-runs don't error) ───────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_sex_chk') then
    alter table public.profiles add constraint profiles_sex_chk
      check (sex is null or sex in ('male','female','other','prefer_not_to_say'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_life_stage_chk') then
    alter table public.profiles add constraint profiles_life_stage_chk
      check (life_stage is null or life_stage in ('student','early_career','professional','entrepreneur','parent','retired'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_primary_focus_chk') then
    alter table public.profiles add constraint profiles_primary_focus_chk
      check (primary_focus is null or primary_focus in ('fitness','career','education','wealth','experiences','relationships','health','productivity'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_secondary_focus_chk') then
    alter table public.profiles add constraint profiles_secondary_focus_chk
      check (secondary_focus is null or secondary_focus in ('fitness','career','education','wealth','experiences','relationships','health','productivity'));
  end if;
end $$;

-- ── conservative backfill: seed display_name from user_settings if missing ───
-- (Non-destructive; only fills NULL/empty. Numeric goal fields are NOT cast here
--  to avoid errors on free-text values — migrate those later if desired.)
update public.profiles p
set display_name = us.display_name
from public.user_settings us
where us.user_id = p.id
  and coalesce(p.display_name, '') = ''
  and coalesce(us.display_name, '') <> '';

-- ── avatar storage bucket + policies (for avatar upload) ─────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read of avatars; authenticated users may write only within their own
-- top-level folder (path = "<user_id>/...").
drop policy if exists "avatars_public_read"  on storage.objects;
drop policy if exists "avatars_user_insert"  on storage.objects;
drop policy if exists "avatars_user_update"  on storage.objects;
drop policy if exists "avatars_user_delete"  on storage.objects;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars_user_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_user_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_user_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
