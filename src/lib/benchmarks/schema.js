// ============================================================================
// Benchmark schema & percentile primitives (Phase 9)
// ----------------------------------------------------------------------------
// Defines the STORAGE SHAPE for real-world benchmark datasets and the math that
// turns a (metric, value, context) into a percentile and then a tier. This is
// the foundation the Tier Engine can consume INSTEAD of hardcoded heuristics —
// without rewriting it (see ./index.js `benchmarkTier`).
//
// Storage shape (mirrors supabase/migrations/..phase9_00_benchmark_schema.sql):
//   dataset    = { id, category, metric, sex, age_min, age_max, weight_class,
//                  country, source, source_url, published_date,
//                  dataset_confidence, coverage, higher_is_better }
//   percentile = { dataset_id, percentile, value }   // many per dataset
//
// In-app, a dataset's percentile rows are an ANCHOR TABLE: [{ p, v }] sorted by
// percentile. `percentileFromAnchors` interpolates a value to a percentile;
// `tierFromPercentile` maps that to the existing 1–8 tier ladder.
// ============================================================================
import { TIER_NAMES, TIER_COLORS } from '../../components/dashboard/tierUtils'

const round = (x) => Math.round(x * 100) / 100

// The tier↔percentile anchors implied by the app's tier labels
// (T1 bottom50 … T8 top1%). IDENTICAL to maxxScore.TIER_PCT — single source of
// truth for the "what percentile is each tier" question.
export const TIER_PCT = [0, 25, 50, 70, 80, 90, 95, 97.5, 99]

// The percentiles the existing 7-element threshold arrays (tiers 2–8) sit at.
export const THRESHOLD_PERCENTILES = [50, 70, 80, 90, 95, 97.5, 99]

export function percentileToTier(p) {
  let tier = 1
  for (let t = 1; t <= 8; t++) if (p >= TIER_PCT[t]) tier = t
  return tier
}

export function tierFromPercentile(p) {
  const tier = percentileToTier(p)
  return { tier, label: TIER_NAMES[tier], color: TIER_COLORS[tier] || '#6b7280', percentile: Math.round(p * 10) / 10 }
}

// ── segmentation buckets (for storage + future imports) ──────────────────────
export const AGE_RANGES = [
  { id: '18-29', min: 18, max: 29 }, { id: '30-39', min: 30, max: 39 },
  { id: '40-49', min: 40, max: 49 }, { id: '50-59', min: 50, max: 59 },
  { id: '60-69', min: 60, max: 69 }, { id: '70+', min: 70, max: 200 },
]
export function ageToRange(age) {
  if (age == null) return null
  return AGE_RANGES.find((r) => age >= r.min && age <= r.max)?.id ?? null
}

// Strength raw-weight datasets are usually segmented by bodyweight class (kg).
export const WEIGHT_CLASSES = [59, 66, 74, 83, 93, 105, 120, 999]
export function weightToClass(kg) {
  if (kg == null) return null
  return WEIGHT_CLASSES.find((c) => kg <= c) ?? null
}

// ── anchor-table helpers ─────────────────────────────────────────────────────
// Turn a legacy 7-value threshold array (tiers 2–8) into a percentile anchor
// table, optionally prepending low-end anchors for better sub-median resolution.
export function anchorsFromThresholds(thresholds, lowAnchors = []) {
  const main = thresholds.map((v, i) => ({ p: THRESHOLD_PERCENTILES[i], v }))
  return [...lowAnchors, ...main].sort((a, b) => a.p - b.p)
}

// Scale every anchor value by a factor (segment derivation for the seed; real
// imports replace this with measured per-segment anchors).
export function scaleAnchors(anchors, factor) {
  if (!factor || factor === 1) return anchors
  return anchors.map((a) => ({ p: a.p, v: round(a.v * factor) }))
}

// Interpolate a value to a percentile over a monotonic anchor table.
// `higherIsBetter=false` for metrics where a lower value is better (run times,
// BMI distance). Clamps to the first/last anchor percentile outside the range.
export function percentileFromAnchors(anchors, value, higherIsBetter = true) {
  if (value == null || !anchors?.length) return null
  const a = [...anchors].sort((x, y) => x.p - y.p)
  const first = a[0], last = a[a.length - 1]
  if (higherIsBetter) {
    if (value <= first.v) return first.p
    if (value >= last.v) return last.p
  } else {
    if (value >= first.v) return first.p
    if (value <= last.v) return last.p
  }
  for (let i = 0; i < a.length - 1; i++) {
    const lo = a[i], hi = a[i + 1]
    const inside = higherIsBetter ? value >= lo.v && value <= hi.v : value <= lo.v && value >= hi.v
    if (inside) {
      const span = hi.v - lo.v
      const frac = span === 0 ? 0 : (value - lo.v) / span
      return Math.round((lo.p + frac * (hi.p - lo.p)) * 10) / 10
    }
  }
  return last.p
}
