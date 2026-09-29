-- post_deploy_28 — employments: per-job pay model instead of hardcoded rates.
--
-- Each employment ("tjänst") owns its pay rules; pa_shifts point at one.
-- Pay is computed live from the rules by src/lib/pay.js (browser + server
-- bundle), so editing a rate re-prices every shift of that job at once.
--
-- ob_rules: [{label, kr, days:[0-6] (0=sön), from:'HH:MM', to:'HH:MM',
--             holiday?:bool, exclusive?:bool}]
--   A rule matches an hour when (holiday ? the date is a storhelg : weekday
--   in days) and the hour is inside from–to (to <= from crosses midnight).
--   ob_mode 'sum' adds every matching rule, 'highest' takes the largest.
--   An exclusive rule that matches wins alone (storhelg in the old model).
-- jour_*: on a 'sov' shift, hours inside the jour window are paid jour_rate
--   instead of hourly_rate; jour_ob says whether OB is added on top.
-- match_keywords: calendar event titles containing any of these become
--   shifts of this employment (was hardcoded in google-calendar-sync).

create table if not exists public.employments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  employer text,
  kind text not null default 'hourly' check (kind in ('hourly', 'monthly')),
  hourly_rate numeric,
  monthly_salary numeric,
  ob_rules jsonb not null default '[]'::jsonb,
  ob_mode text not null default 'sum' check (ob_mode in ('sum', 'highest')),
  jour_rate numeric,
  jour_from text default '22:00',
  jour_to text default '06:00',
  jour_ob boolean not null default false,
  holiday_pay_pct numeric not null default 0,
  tax_rate numeric not null default 0.30 check (tax_rate >= 0 and tax_rate < 1),
  match_keywords text[] not null default '{}',
  is_default boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employments_user_idx on public.employments (user_id);

alter table public.employments enable row level security;
drop policy if exists "employments_owner_all" on public.employments;
create policy "employments_owner_all" on public.employments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.pa_shifts
  add column if not exists employment_id uuid references public.employments(id) on delete set null;
create index if not exists pa_shifts_employment_idx on public.pa_shifts (employment_id);

-- Seed: every user with shifts gets the model that used to be hardcoded in
-- Jobb.jsx (Humana / Vårdföretagarna 2025-2027), reproduced exactly
-- (sum mode, storhelg exclusive, OB on jour hours), and all shifts link to it.
insert into public.employments
  (user_id, name, employer, hourly_rate, ob_rules, ob_mode, jour_rate, jour_from, jour_to, jour_ob,
   holiday_pay_pct, tax_rate, match_keywords, is_default, notes)
select distinct s.user_id, 'Personlig assistent', 'Humana', 149.00,
  '[
    {"label":"OB kväll","kr":25.87,"days":[0,1,2,3,4,5,6],"from":"18:00","to":"22:00"},
    {"label":"OB natt","kr":52.41,"days":[0,1,2,3,4,5,6],"from":"22:00","to":"06:00"},
    {"label":"OB helg","kr":64.64,"days":[0,6],"from":"00:00","to":"24:00"},
    {"label":"OB storhelg","kr":129.39,"holiday":true,"exclusive":true,"from":"00:00","to":"24:00"}
  ]'::jsonb,
  'sum', 41.08, '22:00', '06:00', true, 0, 0.30,
  array['assistanstid', 'hos hw'], true,
  'Förifylld från den gamla hårdkodade modellen. Kontrollera mot lönespec.'
from public.pa_shifts s
where not exists (select 1 from public.employments e where e.user_id = s.user_id);

update public.pa_shifts s set employment_id = e.id
from public.employments e
where e.user_id = s.user_id and e.is_default and s.employment_id is null;
