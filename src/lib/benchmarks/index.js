// ============================================================================
// Benchmark Engine + Tier Engine adapter (Phase 9, tasks 2 & 6)
// ----------------------------------------------------------------------------
// Public surface:
//   getStrengthBenchmark / getConditioningBenchmark / getEconomyBenchmark /
//   getHealthBenchmark   - resolve the dataset (anchors + metadata) for a context
//   getBenchmark(cat, metric, ctx)  - generic resolver
//   benchmarkTier(cat, metric, value, ctx)  - the ADAPTER:
//       value → benchmark dataset → percentile → tier  (or null → caller falls
//       back to its heuristic). Returns a tierEngine-compatible result object.
//   enableBenchmarks(bool) / benchmarksEnabled()  - opt-in toggle (DEFAULT OFF)
//
// Compatibility: the seed datasets are anchored to the app's existing tier
// thresholds, so when enabled the neutral lookup reproduces today's tiers. The
// toggle defaults OFF so production behaviour is byte-identical until real
// datasets are imported & validated — flip it on per-call or globally to adopt.
// ============================================================================
import { TIER_NAMES, TIER_COLORS } from '../../components/dashboard/tierUtils'
import { getDataset } from './datasets'
import { getDatasetMeta, datasetConfidence } from './registry'
import { tierFromPercentile } from './schema'
import { percentileForValue } from './percentile'

export { percentileForValue } from './percentile'
export { DATASET_REGISTRY, getDatasetMeta, datasetConfidence, registrySummary } from './registry'
export { getDataset } from './datasets'

// ── global opt-in flag (default OFF for compatibility) ───────────────────────
let _enabled = false
export function enableBenchmarks(on = true) { _enabled = !!on }
export function benchmarksEnabled() { return _enabled }

// ── dataset resolvers (task 2) ───────────────────────────────────────────────
export function getBenchmark(category, metric, context = null) {
  const ds = getDataset(category, metric)
  const meta = getDatasetMeta(category, metric)
  if (!ds) return null
  return {
    category, metric,
    higherIsBetter: ds.higherIsBetter,
    unit: ds.unit,
    anchors: ds.base,
    segmentFactor: (ds.segment ? ds.segment(context) : 1) || 1,
    datasetId: meta?.id ?? null,
    datasetConfidence: meta?.datasetConfidence ?? null,
    source: meta?.source ?? null,
    coverage: meta?.coverage ?? null,
    status: meta?.status ?? null,
    notes: ds.notes,
  }
}

export const getStrengthBenchmark     = (metric, context) => getBenchmark('strength', metric, context)
export const getConditioningBenchmark = (metric, context) => getBenchmark('conditioning', metric, context)
export const getEconomyBenchmark      = (metric, context) => getBenchmark('economy', metric, context)
export const getHealthBenchmark       = (metric, context) => getBenchmark('health', metric, context)

// ── the Tier Engine integration adapter (task 6) ─────────────────────────────
// value → benchmark dataset → percentile → tier. Returns a result shaped like
// tierEngine's `build()` output so it is a drop-in for the heuristic path; or
// null when there's no dataset or no value, so the caller keeps its heuristic.
export function benchmarkTier(category, metric, value, context = null) {
  if (value == null) return null
  const res = percentileForValue({ category, metric, value, context })
  if (res.fallback || res.percentile == null) return null
  const t = tierFromPercentile(res.percentile)
  return {
    ...t, // tier, label, color, percentile
    metric, value,
    source: 'benchmark',
    datasetId: res.datasetId,
    datasetConfidence: res.datasetConfidence,
    percentile: res.percentile,
    segmentFactor: res.segmentFactor,
    higherIsBetter: res.higherIsBetter,
    fallback: false,
    thresholds: res.anchorsUsed,
    factors: { segment: res.segmentFactor },
    reason: `${metric}=${value} → percentil ${res.percentile} (dataset ${res.datasetId}, tillförlitlighet ${Math.round((res.datasetConfidence ?? 0) * 100)}%) → T${t.tier} (${t.label}).`,
    notes: `benchmark: ${res.source}`,
  }
}

// Tier meta passthrough (so callers needn't import tierUtils for labels).
export function tierMeta(tier) {
  return { tier, label: TIER_NAMES[tier], color: TIER_COLORS[tier] || '#6b7280' }
}
