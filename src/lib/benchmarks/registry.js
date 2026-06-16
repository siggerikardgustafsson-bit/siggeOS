// ============================================================================
// Benchmark dataset registry (Phase 9, tasks 4 & 5)
// ----------------------------------------------------------------------------
// One record per benchmark source. `datasetConfidence` is the DATASET-level
// trust (how well-grounded the underlying real-world distribution is) — this is
// DISTINCT from the profile confidence in profileCompleteness.js (how complete
// the USER's inputs are). Final tier confidence later combines the two.
//
//   provenance: 'seed-from-thresholds' = anchored to the app's existing tier
//   ladders (placeholder until a real import lands); 'reference' = anchors set
//   from published reference values; 'imported' = loaded from a dataset file/DB.
//
// `status` lets the engine prefer imported data over seed when both exist.
// ============================================================================

export const DATASET_REGISTRY = [
  // ── Strength ──
  {
    id: 'strength-standards', category: 'strength',
    metrics: ['bench', 'squat', 'deadlift', 'ohp', 'pullup', 'dip'],
    source: 'Strength standards (bodyweight-multiple)', sourceUrl: 'https://strengthlevel.com/strength-standards',
    publishedDate: '2024-01-01', datasetConfidence: 0.9, provenance: 'reference', status: 'seed',
    coverage: { sex: ['male', 'female (derived)'], age: ['all (decline modeled)'], country: ['global'], weightClass: ['multiple-normalized'] },
    notes: 'Well-established lifter standards. Female + age currently derived via scalers, not measured segments.',
  },
  // ── Conditioning ──
  {
    id: 'vo2max-norms', category: 'conditioning', metrics: ['vo2max'],
    source: 'VO2max age/sex norms (ACSM/Cooper-style)', sourceUrl: 'https://www.cooperinstitute.org',
    publishedDate: '2023-01-01', datasetConfidence: 0.88, provenance: 'reference', status: 'seed',
    coverage: { sex: ['male', 'female (derived)'], age: ['25+ decline modeled'], country: ['global'] },
    notes: 'Norm tables are real; seed uses a single base table + sex/age scalers pending per-cell import.',
  },
  {
    id: 'running-standards', category: 'conditioning', metrics: ['1k', '5k', '10k', 'half_marathon', 'marathon'],
    source: 'Recreational running time standards', sourceUrl: 'https://runninglevel.com',
    publishedDate: '2024-01-01', datasetConfidence: 0.9, provenance: 'reference', status: 'seed',
    coverage: { sex: ['male', 'female (derived)'], age: ['all (slowdown modeled)'], country: ['global'] },
    notes: 'Distance standards are well-established; 1 km is derived from 5 km.',
  },
  // ── Economy ──
  {
    id: 'income-distribution', category: 'economy', metrics: ['income'],
    source: 'Net monthly income distribution (SE-anchored)', sourceUrl: 'https://www.scb.se',
    publishedDate: '2023-01-01', datasetConfidence: 0.6, provenance: 'seed-from-thresholds', status: 'seed',
    coverage: { sex: ['all'], age: ['life-stage segmented'], country: ['SE (SEK)'], lifeStage: ['student→retired'] },
    notes: 'Coarse, single-country, life-stage scaled. Needs real per-country/age percentile import.',
  },
  {
    id: 'savings-distribution', category: 'economy', metrics: ['savings', 'net_worth'],
    source: 'Household savings & net worth distribution', sourceUrl: 'https://www.scb.se',
    publishedDate: '2023-01-01', datasetConfidence: 0.55, provenance: 'seed-from-thresholds', status: 'seed',
    coverage: { sex: ['all'], age: ['scaled'], country: ['SE (SEK)'], lifeStage: ['student→retired'] },
    notes: 'Lowest-confidence layer — wealth distributions are heavily skewed and country-specific.',
  },
  // ── Health ──
  {
    id: 'bmi-bands', category: 'health', metrics: ['bmi'],
    source: 'WHO BMI classification (risk bands)', sourceUrl: 'https://www.who.int',
    publishedDate: '2023-01-01', datasetConfidence: 0.7, provenance: 'reference', status: 'seed',
    coverage: { sex: ['all'], age: ['adult'], country: ['global'] },
    notes: 'Optimality distance from ~21.7; ignores muscle mass / body composition.',
  },
  {
    id: 'sleep-norms', category: 'health', metrics: ['sleep', 'steps'],
    source: 'Sleep duration & activity norms (NSF/CDC-style)', sourceUrl: 'https://www.sleepfoundation.org',
    publishedDate: '2023-01-01', datasetConfidence: 0.75, provenance: 'reference', status: 'seed',
    coverage: { sex: ['all'], age: ['age-adjusted'], country: ['global'] },
    notes: 'Duration-based; does not yet penalize over-sleep or weight sleep quality.',
  },
]

const _byMetric = {}
for (const d of DATASET_REGISTRY) for (const m of d.metrics) _byMetric[`${d.category}:${m}`] = d

// Lookup the registry record (metadata + confidence) for a category/metric.
export function getDatasetMeta(category, metric) {
  return _byMetric[`${category}:${metric}`] || null
}

export function datasetConfidence(category, metric) {
  return getDatasetMeta(category, metric)?.datasetConfidence ?? null
}

// Registry summary for diagnostics / a future admin view.
export function registrySummary() {
  return DATASET_REGISTRY.map((d) => ({
    id: d.id, category: d.category, metrics: d.metrics,
    datasetConfidence: d.datasetConfidence, status: d.status, provenance: d.provenance,
  }))
}
