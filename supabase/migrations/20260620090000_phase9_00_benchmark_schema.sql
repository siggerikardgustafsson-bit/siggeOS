-- ============================================================================
-- PHASE 9 · 00 · benchmark dataset schema
-- ----------------------------------------------------------------------------
-- Storage architecture for real-world benchmark percentile datasets so the Tier
-- Engine can move from heuristics to imported distributions. Additive +
-- idempotent + non-destructive. Reference data (public-readable, like the
-- exercise_library family) — NOT per-user, so no user_id / owner policies.
--
-- The app currently reads SEED datasets from src/lib/benchmarks/datasets.js; a
-- future importer writes rows here and a loader reads them, preferring rows with
-- status='imported' over the in-app seed. No app code reads these tables yet.
-- ============================================================================

-- One row per (source × metric × segment).
create table if not exists public.benchmark_datasets (
  id                 uuid primary key default gen_random_uuid(),
  category           text not null,                 -- strength|conditioning|economy|health
  metric             text not null,                 -- bench|vo2max|income|bmi|...
  sex                text,                           -- male|female|null(=all)
  age_min            int,
  age_max            int,
  weight_class       int,                            -- kg bodyweight ceiling, null=normalized
  country            text,                           -- ISO/region, null=global
  life_stage         text,                           -- for economy datasets
  higher_is_better   boolean not null default true,
  unit               text,
  source             text not null,
  source_url         text,
  published_date     date,
  dataset_confidence numeric not null default 0.5,   -- 0..1 dataset-level trust
  provenance         text not null default 'imported', -- reference|seed-from-thresholds|imported
  status             text not null default 'imported', -- seed|imported|deprecated
  coverage           jsonb,
  created_at         timestamptz not null default now()
);

-- Percentile anchor rows for a dataset: (percentile, value).
create table if not exists public.benchmark_percentiles (
  id          bigint generated always as identity primary key,
  dataset_id  uuid not null references public.benchmark_datasets(id) on delete cascade,
  percentile  numeric not null,                      -- 0..100
  value       numeric not null
);

create index if not exists idx_benchmark_datasets_lookup
  on public.benchmark_datasets (category, metric, status);
create index if not exists idx_benchmark_percentiles_dataset
  on public.benchmark_percentiles (dataset_id, percentile);

-- RLS: enable + public read-only (anon + authenticated). No write policy →
-- only the service role (imports/admin) can write. Mirrors the reference-table
-- pattern already used for exercise_library.
alter table public.benchmark_datasets    enable row level security;
alter table public.benchmark_percentiles enable row level security;

drop policy if exists "benchmark_datasets public read"    on public.benchmark_datasets;
drop policy if exists "benchmark_percentiles public read" on public.benchmark_percentiles;
create policy "benchmark_datasets public read"    on public.benchmark_datasets    for select using (true);
create policy "benchmark_percentiles public read" on public.benchmark_percentiles for select using (true);

comment on table public.benchmark_datasets is 'Phase 9 — benchmark percentile datasets (reference data). App reads seed from src/lib/benchmarks until rows are imported here.';
comment on column public.benchmark_datasets.dataset_confidence is '0..1 dataset-level trust — DISTINCT from profile completeness confidence.';
