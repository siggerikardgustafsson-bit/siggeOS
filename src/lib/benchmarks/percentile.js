// ============================================================================
// Percentile Engine (Phase 9, task 7)
// ----------------------------------------------------------------------------
// Reusable: given (category, metric, value, context) → a percentile (0–100) by
// looking up the benchmark dataset, resolving the right segment for the context,
// and interpolating the value over the segment's anchor table.
//
//   percentileForValue({ category, metric, value, context })
//     -> { percentile, datasetId, datasetConfidence, source, segmentFactor,
//          higherIsBetter, fallback }   (fallback:true + percentile:null when no dataset)
//
// Pure, sync, no DB. The Tier Engine consumes this via ./index.js `benchmarkTier`.
// ============================================================================
import { getDataset, BMI_OPTIMAL } from './datasets'
import { getDatasetMeta } from './registry'
import { scaleAnchors, percentileFromAnchors } from './schema'

// BMI is stored as distance-from-optimal; normalize the raw input here.
function normalizeValue(category, metric, value, context) {
  if (category === 'health' && metric === 'bmi') {
    let bmi = value
    if (bmi == null && context?.height && context?.weight) {
      bmi = context.weight / Math.pow(context.height / 100, 2)
    }
    if (bmi == null) return null
    return Math.abs(bmi - BMI_OPTIMAL)
  }
  return value
}

export function percentileForValue({ category, metric, value, context = null }) {
  const ds = getDataset(category, metric)
  const meta = getDatasetMeta(category, metric)
  if (!ds) {
    return { percentile: null, datasetId: meta?.id ?? null, datasetConfidence: null, source: null, segmentFactor: 1, higherIsBetter: true, fallback: true }
  }
  const v = normalizeValue(category, metric, value, context)
  const factor = (ds.segment ? ds.segment(context) : 1) || 1
  // Scale the segment's bar by the factor. Lower factor → lower bar → easier to
  // rank high (e.g. female strength, student economy), matching the heuristic seam.
  const anchors = scaleAnchors(ds.base, factor)
  const percentile = percentileFromAnchors(anchors, v, ds.higherIsBetter)
  return {
    percentile,
    datasetId: meta?.id ?? null,
    datasetConfidence: meta?.datasetConfidence ?? null,
    source: meta?.source ?? null,
    segmentFactor: Math.round(factor * 1000) / 1000,
    higherIsBetter: ds.higherIsBetter,
    anchorsUsed: anchors,
    fallback: false,
  }
}
