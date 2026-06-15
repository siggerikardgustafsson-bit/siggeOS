// ============================================================================
// Maxx Score v2 (Phase 7) — weighted, bottleneck-aware scoring + Why-This-Score.
// ----------------------------------------------------------------------------
// v1 was pure weakest-link (Maxx Score = min category tier). v2 blends a
// profile-WEIGHTED percentile with the weakest link, so balance is rewarded but
// a single weak category still drags the headline (bottlenecks stay meaningful).
//
// Pure functions — no DB, no React. Consumed by Dashboard's buildMaxxProfile.
// ============================================================================
import { TIER_NAMES, TIER_COLORS } from '../components/dashboard/tierUtils'

export const SCORE_VERSION = 'v2'

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

// Tier (1..8) → percentile (higher = better). Mirrors the tier labels:
// T1 bottom50, T2 ~50th, … T8 ~top 1%.
const TIER_PCT = [0, 25, 50, 70, 80, 90, 95, 97.5, 99]
export function tierToPercentile(tier) {
  if (!tier) return 0
  return TIER_PCT[clamp(Math.round(tier), 1, 8)]
}
export function percentileToTier(p) {
  let tier = 1
  for (let t = 1; t <= 8; t++) if (p >= TIER_PCT[t]) tier = t
  return tier
}

/**
 * Weighted, bottleneck-aware Maxx Score.
 * @param rankCats [{ id, name, tier:{tier}, levelUp? }] — ranking categories only
 * @param weights  { [categoryId]: number } from a tier profile (default neutral)
 */
export function computeMaxxScoreV2(rankCats, weights = {}) {
  const cats = (rankCats || []).filter((c) => c?.tier?.tier)
  if (!cats.length) return null

  const contributions = cats.map((c) => ({
    id: c.id, name: c.name, tier: c.tier.tier,
    percentile: tierToPercentile(c.tier.tier),
    weight: weights[c.id] ?? 1,
  }))
  const totalW = contributions.reduce((s, c) => s + c.weight, 0) || 1
  const weightedSum = contributions.reduce((s, c) => s + c.percentile * c.weight, 0)
  const weightedPct = weightedSum / totalW
  const weightedTier = percentileToTier(weightedPct)
  const minTier = Math.min(...cats.map((c) => c.tier.tier))

  // Blend: reward balance (weighted) but keep the weakest link influential.
  const headlineTier = clamp(Math.round(0.55 * weightedTier + 0.45 * minTier), 1, 8)

  contributions.forEach((c) => {
    c.contribution = weightedSum > 0 ? Math.round(((c.percentile * c.weight) / weightedSum) * 100) : 0
  })

  return {
    tier: headlineTier,
    label: TIER_NAMES[headlineTier],
    color: TIER_COLORS[headlineTier] || '#6b7280',
    weightedPercentile: Math.round(weightedPct * 10) / 10,
    weightedTier,
    minTier,
    contributions,
  }
}

/**
 * Bottleneck Engine v2 — which categories hold the score back, the estimated
 * impact of raising each by one tier, and the rank-up opportunity. Sorted worst-first.
 * Output is JSON-friendly for future Jarvis consumption.
 */
export function detectBottlenecksV2(rankCats, headlineTier, weights = {}) {
  const cats = (rankCats || []).filter((c) => c?.tier?.tier)
  if (!cats.length) return []
  const totalW = cats.reduce((s, x) => s + (weights[x.id] ?? 1), 0) || 1
  return cats
    .filter((c) => c.tier.tier <= headlineTier)
    .map((c) => {
      const tier = c.tier.tier
      const weight = weights[c.id] ?? 1
      const jump = tierToPercentile(Math.min(tier + 1, 8)) - tierToPercentile(tier)
      return {
        id: c.id, name: c.name, tier, weight,
        impact: Math.round(((jump * weight) / totalW) * 10) / 10, // est. weighted-percentile gain at +1 tier
        opportunity: tier < 8 ? `T${tier} → T${tier + 1}` : 'maxad',
        progressPct: c.levelUp?.progressPct ?? null,
      }
    })
    .sort((a, b) => a.tier - b.tier || b.impact - a.impact)
}

/**
 * Why-This-Score — structured, per-category breakdown. thresholdsUsed /
 * profileFactors / fallback / reason come straight from the Tier Engine result
 * (present when the category tier was computed via tierEngine; null otherwise).
 */
export function buildWhyThisScore(score, rankCats) {
  if (!score) return null
  return {
    version: SCORE_VERSION,
    model: 'weighted percentile (0.55) blended with weakest-link (0.45)',
    headline: { tier: score.tier, label: score.label, weightedPercentile: score.weightedPercentile, minTier: score.minTier },
    categories: score.contributions.map((c) => {
      const t = (rankCats || []).find((r) => r.id === c.id)?.tier
      return {
        id: c.id, name: c.name,
        tier: c.tier, percentile: c.percentile, weight: c.weight, contribution: c.contribution,
        thresholdsUsed: t?.thresholds ?? null,
        profileFactors: t?.factors ?? null,
        fallback: t?.fallback ?? null,
        reason: t?.reason ?? null,
      }
    }),
  }
}
