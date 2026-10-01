-- post_deploy_32 — workout templates (Träning → Mallar).
-- A template is a named list of exercises with planned sets; starting one
-- opens the live workout (ActiveWorkout.jsx) that is filled in set by set.
-- exercises: [{exercise_id, name, sets:int, reps:text (target, e.g. "8-10")}]
create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  notes text,
  exercises jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workout_templates_user_idx on public.workout_templates (user_id);

alter table public.workout_templates enable row level security;
drop policy if exists "workout_templates_owner_all" on public.workout_templates;
create policy "workout_templates_owner_all" on public.workout_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
