-- ============================================================================
-- PHASE 1 · 00 · profiles table + admin support
-- ----------------------------------------------------------------------------
-- Idempotent. Safe to run on the existing production DB (objects are created
-- with IF NOT EXISTS / CREATE OR REPLACE; policies are dropped before create).
-- Apply with:  supabase db push   (no Docker required for push)
-- ============================================================================

-- ── profiles: 1:1 with auth.users, identity + admin flag ────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  locale       text not null default 'sv',
  timezone     text not null default 'Europe/Stockholm',
  currency     text not null default 'SEK',
  unit_system  text not null default 'metric',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ── is_admin() — used inside RLS policies on global/reference tables ─────────
-- SECURITY DEFINER so it bypasses RLS on `profiles` when called from a policy,
-- which both avoids infinite recursion and lets it read the is_admin flag.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon, service_role;

-- ── handle_new_user — auto-create a profile row on signup ───────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── keep updated_at fresh ───────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── policies ────────────────────────────────────────────────────────────────
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin on public.profiles
  for update using (auth.uid() = id or public.is_admin())
              with check (auth.uid() = id or public.is_admin());

-- Note: no client DELETE policy. Profiles are removed via auth.users cascade only.

-- ── backfill: create a profile for every existing auth user ─────────────────
insert into public.profiles (id, display_name)
select u.id,
       coalesce(u.raw_user_meta_data->>'display_name', split_part(coalesce(u.email,''), '@', 1))
from auth.users u
on conflict (id) do nothing;

-- ── bootstrap the owner account as admin ────────────────────────────────────
-- Only affects the matching account; safe no-op if the email isn't present.
update public.profiles p
set is_admin = true
from auth.users u
where u.id = p.id
  and u.email = 'siggerikardgustafsson@gmail.com';
