// ============================================================================
// Rank Up Plans Engine (Phase 10) — the ACTION layer.
// ----------------------------------------------------------------------------
// Turns scores, tiers, bottlenecks and benchmarks into *actionable* progression:
//   1. Rank Gap Engine        — current tier → next tier + the concrete gap.
//   2. Score Impact model     — "if this category gains a tier, how much does the
//                                Maxx Score move?" (pure recompute, no AI).
//   3. Opportunity Engine      — rank the +1-tier moves by score impact.
//   4. Bottleneck integration  — enrich Bottleneck Engine v2 with effort + plan.
//   5. Rank Up Plan generator  — reusable {current, target, required[], estimate}.
//   6. Rank Up Profiles        — Aggressive / Balanced / Maintenance strategies.
//   7. buildHowToImprove       — the sibling of buildWhyThisScore ("how do I
//                                improve this?" next to "why this score?").
//
// Pure functions — no DB, no React. It consumes the data the Dashboard already
// computes (each category's `tier` + `levelUp.requirements`) and the existing
// Maxx Score v2 weighting; it does NOT recompute or modify any tier.
//
// Effort/time estimates are transparent HEURISTICS (rates in EFFORT_RATES). They
// follow the same "heuristic now, dataset-ready seam" pattern as the Tier and
// Benchmark engines — a measured progression dataset can later replace the rates
// without changing any call site.
// ============================================================================
import { computeMaxxScoreV2, tierToPercentile } from './maxxScore'
import { weightsForProfile } from './tierProfiles'
import { TIER_NAMES, TIER_COLORS } from '../components/dashboard/tierUtils'

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
const round = (x) => Math.round(x * 10) / 10
const MAX_TIER = 8

// Dashboard category ids that participate in the Maxx Score (mirrors
// buildMaxxProfile's rankCats filter). plugg/skills/body are excluded there too.
export const RANKABLE_IDS = ['kondition', 'styrka', 'somn', 'ekonomi', 'halsa', 'plugg']

// ── Effort / time model ───────────────────────────────────────────────────────
// Per-category linear progression rates for the natural unit of each category's
// binding requirement. Heuristic, calibrated for an intermediate trajectory;
// `confidence` flags how trustworthy the rate is. kondition/halsa have no clean
// linear unit (time-shaved seconds / composite habit points) → effort falls back
// to a progress-curve. Replace rates with measured data later (see report §future).
export const EFFORT_RATES = {
  styrka:  { unit: 'kg', perMonth: 2.5, confidence: 0.6, drives: 'styrketräning' },
  ekonomi: { unit: 'kr', perMonth: 4000, confidence: 0.4, drives: 'sparande' }, // assumed monthly surplus
  somn:    { unit: 'h',  perMonth: 0.4, confidence: 0.5, drives: 'sömnrutin' },
  plugg:   { unit: '%',  perMonth: 12, confidence: 0.5, drives: 'studietid' },
}
// Progress-curve fallback: base months to clear a full tier-band, scaled by how
// much of the band remains and by tier difficulty (higher tiers are harder).
const CATEGORY_BASE_MONTHS = { kondition: 5, styrka: 5, ekonomi: 6, somn: 2, halsa: 2, plugg: 3 }
const tierDifficulty = (tier) => 1 + Math.max(0, (tier || 1) - 3) * 0.35

const EFFORT_BUCKETS = [
  { max: 1, bucket: 'quick', label: 'Snabb' },
  { max: 3, bucket: 'moderate', label: 'Måttlig' },
  { max: 6, bucket: 'significant', label: 'Betydande' },
  { max: Infinity, bucket: 'major', label: 'Stor' },
]
const bucketFor = (months) => (EFFORT_BUCKETS.find((b) => months <= b.max) || EFFORT_BUCKETS[3])

/**
 * Estimate the effort to clear the current tier band for a category.
 * @returns { months, bucket, label, basis, confidence }  (months null when data is missing)
 */
export function estimateEffort(catId, { progress = 0, currentTier = 1, gapValue = null, missing = false } = {}) {
  if (missing) {
    return { months: null, bucket: 'unknown', label: 'Saknar data', basis: 'needs-data', confidence: 0 }
  }
  const rate = EFFORT_RATES[catId]
  if (rate && gapValue != null && Number.isFinite(gapValue) && gapValue > 0) {
    const months = round(clamp(gapValue / rate.perMonth, 0.25, 60) * tierDifficulty(currentTier))
    const b = bucketFor(months)
    return { months, bucket: b.bucket, label: b.label, basis: `${rate.perMonth} ${rate.unit}/mån (${rate.drives})`, confidence: rate.confidence }
  }
  // Progress-curve fallback (unit-less): more progress left + higher tier = longer.
  const base = CATEGORY_BASE_MONTHS[catId] ?? 4
  const remaining = clamp(1 - (progress || 0) / 100, 0.05, 1)
  const months = round(base * remaining * tierDifficulty(currentTier))
  const b = bucketFor(months)
  return { months, bucket: b.bucket, label: b.label, basis: 'progress-kurva (ingen linjär enhet)', confidence: 0.35 }
}

// ── 1. Rank Gap Engine ────────────────────────────────────────────────────────
// Pick the binding (hardest-to-clear) unmet requirement: a missing one first,
// else the lowest-progress one. Mirrors Dashboard.makeLevelUp's primary logic.
function bindingRequirement(reqs) {
  const unmet = (reqs || []).filter((r) => !r.met)
  if (!unmet.length) return null
  return unmet.find((r) => r.missing) || [...unmet].sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0))[0]
}

/**
 * Current tier → next tier + the concrete gap for one category.
 * Consumes the Dashboard category's `tier` and `levelUp.requirements`.
 * @returns null when the category has no tier.
 */
export function computeRankGap(category) {
  const tier = category?.tier?.tier ?? null
  if (!tier) return null
  const atMax = tier >= MAX_TIER
  const nextTier = atMax ? MAX_TIER : tier + 1
  const reqs = category?.levelUp?.requirements || []
  const gaps = reqs
    .filter((r) => !r.met)
    .map((r) => ({
      label: r.label,
      current: r.current ?? null,
      target: r.target ?? null,
      gapLabel: r.gapLabel || null,
      gapValue: numericGap(r),
      progress: r.progress ?? null,
      missing: !!r.missing,
    }))
  const binding = bindingRequirement(reqs)
  return {
    id: category.id,
    name: category.name,
    currentTier: tier,
    currentLabel: TIER_NAMES[tier] || `T${tier}`,
    nextTier,
    nextLabel: TIER_NAMES[nextTier] || `T${nextTier}`,
    atMax,
    headlineGap: atMax ? 'Maxad' : binding?.gapLabel || `T${tier} → T${nextTier}`,
    bindingMetric: binding?.label || null,
    gaps,
    progressPct: category?.levelUp?.progressPct ?? null,
  }
}

// Numeric magnitude of a requirement gap (unit-agnostic; abs so lower-is-better
// running times yield a positive distance). null when either side is missing.
function numericGap(r) {
  if (r?.met) return 0
  if (r?.current == null || r?.target == null) return null
  const g = Math.abs(Number(r.target) - Number(r.current))
  return Number.isFinite(g) ? g : null
}

// ── 2. Score Impact model ─────────────────────────────────────────────────────
/**
 * If `catId` gains `tierDelta` tier(s), how much does the Maxx Score move?
 * Pure recompute through the EXISTING weighting (computeMaxxScoreV2) — no AI.
 * @returns { headlineBefore, headlineAfter, headlineDelta, weightedBefore, weightedAfter, weightedDelta, percentileDelta }
 */
export function estimateScoreImpact(rankCats, weights, catId, tierDelta = 1) {
  const base = computeMaxxScoreV2(rankCats, weights)
  if (!base) return null
  const bumped = rankCats.map((c) =>
    c.id === catId
      ? { ...c, tier: { ...c.tier, tier: Math.min((c.tier?.tier || 1) + tierDelta, MAX_TIER) } }
      : c
  )
  const after = computeMaxxScoreV2(bumped, weights)
  const cat = rankCats.find((c) => c.id === catId)
  const fromTier = cat?.tier?.tier || 1
  const toTier = Math.min(fromTier + tierDelta, MAX_TIER)
  return {
    id: catId,
    headlineBefore: base.tier,
    headlineAfter: after.tier,
    headlineDelta: after.tier - base.tier,
    weightedBefore: base.weightedPercentile,
    weightedAfter: after.weightedPercentile,
    weightedDelta: round(after.weightedPercentile - base.weightedPercentile),
    // Raw percentile the category itself gains (before weighting) — useful for UI copy.
    percentileDelta: round(tierToPercentile(toTier) - tierToPercentile(fromTier)),
  }
}

// ── 3 + 4. Opportunity Engine (+ bottleneck enrichment) ───────────────────────
function effortForCategory(category, gap) {
  const binding = gap ? bindingRequirement(category?.levelUp?.requirements || []) : null
  return estimateEffort(category.id, {
    progress: gap?.progressPct ?? category?.levelUp?.progressPct ?? 0,
    currentTier: category?.tier?.tier ?? 1,
    gapValue: binding ? numericGap(binding) : null,
    missing: !!binding?.missing,
  })
}

/**
 * One opportunity per rankable category that isn't maxed: the +1-tier move with
 * its score impact, concrete gap and effort estimate. Sorted by the chosen
 * Rank Up Profile (default 'balanced'). Each carries `.priority` (1-based rank).
 */
export function buildOpportunities(rankCats, weights, { profile = 'balanced' } = {}) {
  const cats = (rankCats || []).filter((c) => c?.tier?.tier)
  if (!cats.length) return []
  const minTier = Math.min(...cats.map((c) => c.tier.tier))
  const opps = cats
    .filter((c) => c.tier.tier < MAX_TIER)
    .map((c) => {
      const gap = computeRankGap(c)
      const impact = estimateScoreImpact(cats, weights, c.id, 1)
      const effort = effortForCategory(c, gap)
      const decayWarning = !!c.decayWarning
      const atRisk = decayWarning || c.tier.tier === minTier
      return {
        id: c.id,
        name: c.name,
        currentTier: c.tier.tier,
        nextTier: gap.nextTier,
        gap,
        effort,
        decayWarning, // actively falling (stale data) — the maintenance priority
        atRisk,       // decaying OR the weakest link (could drop the headline)
        scoreImpact: impact?.weightedDelta ?? 0, // weighted-percentile gain
        headlineDelta: impact?.headlineDelta ?? 0, // whole-score tier move (0 or 1)
        percentileDelta: impact?.percentileDelta ?? 0,
        // Concise, UI-ready one-liner, e.g. "Styrka: +12 kg → +4.2 poäng".
        summary: `${c.name}: ${gap.headlineGap}${impact ? ` → +${impact.weightedDelta} poäng` : ''}`,
      }
    })
  return prioritizeOpportunities(opps, profile)
}

/**
 * Bottleneck integration (task 4): take Bottleneck Engine v2 output
 * (detectBottlenecksV2) and enrich every bottleneck with next tier + effort +
 * its rank-up plan, without re-detecting anything.
 */
export function enrichBottlenecks(bottlenecksV2, rankCats, weights) {
  return (bottlenecksV2 || []).map((b) => {
    const cat = (rankCats || []).find((c) => c.id === b.id)
    const gap = cat ? computeRankGap(cat) : null
    const effort = cat ? effortForCategory(cat, gap) : null
    return {
      ...b,
      nextTier: Math.min((b.tier || 1) + 1, MAX_TIER),
      effort, // { months, bucket, label, basis, confidence }
      gap,
      plan: cat ? buildRankUpPlan(cat, { rankCats, weights }) : null,
    }
  })
}

// ── 5. Rank Up Plan generator ─────────────────────────────────────────────────
/**
 * Reusable plan structure for one category:
 *   { id, name, currentTier, targetTier, required[], estimatedMonths, effort,
 *     scoreImpact, atMax }
 * `required` is a list of concrete steps derived from the unmet requirements.
 */
export function buildRankUpPlan(category, { rankCats = null, weights = null } = {}) {
  const gap = computeRankGap(category)
  if (!gap) return null
  const effort = effortForCategory(category, gap)
  const impact = rankCats && weights ? estimateScoreImpact(rankCats, weights, category.id, 1) : null
  const required = gap.gaps.map((g) => ({
    metric: g.label,
    step: g.missing ? `Logga ${g.label.toLowerCase()}` : `${g.label}: ${g.gapLabel || 'höj'}`,
    target: g.target,
    targetLabel: targetLabelFor(category, g),
    done: false,
  }))
  return {
    id: gap.id,
    name: gap.name,
    currentTier: gap.currentTier,
    currentLabel: gap.currentLabel,
    targetTier: gap.nextTier,
    targetLabel: gap.nextLabel,
    atMax: gap.atMax,
    headlineGap: gap.headlineGap,
    required,
    estimatedMonths: effort.months,
    estimateLabel: estimateLabel(effort),
    effort,
    scoreImpact: impact?.weightedDelta ?? null,
    headlineDelta: impact?.headlineDelta ?? null,
    color: TIER_COLORS[gap.nextTier] || '#6b7280',
  }
}

function targetLabelFor(category, g) {
  // Prefer the requirement's own formatted target label when the Dashboard provided one.
  const req = (category?.levelUp?.requirements || []).find((r) => r.label === g.label)
  return req?.targetLabel ?? (g.target != null ? String(g.target) : null)
}

function estimateLabel(effort) {
  if (effort?.months == null) return 'Logga data först'
  const m = effort.months
  if (m < 1) return '~några veckor'
  if (m < 1.5) return '~1 månad'
  return `~${Math.round(m)} månader`
}

// ── 6. Rank Up Profiles ───────────────────────────────────────────────────────
// Strategies for ORDERING opportunities. Architecture only — nothing applies a
// profile automatically; the Dashboard/Jarvis pick one. Each `weigh` scores an
// opportunity higher = do-sooner.
export const RANK_UP_PROFILES = {
  aggressive: {
    label: 'Aggressiv',
    blurb: 'Maximera Maxx Score-tillväxt — ignorerar hur jobbigt det är.',
    weigh: (o) => o.scoreImpact + (o.headlineDelta > 0 ? 40 : 0),
  },
  balanced: {
    label: 'Balanserad',
    blurb: 'Mix av poängtillväxt och genomförbarhet.',
    weigh: (o) => (o.scoreImpact + (o.headlineDelta > 0 ? 25 : 0)) / Math.sqrt(Math.max(1, o.effort?.months ?? 4)),
  },
  maintenance: {
    label: 'Underhåll',
    blurb: 'Skydda nuvarande rank — prioritera det som aktivt riskerar att falla.',
    // Actively-decaying categories first, then the weakest link; cheap holds win ties.
    weigh: (o) => (o.decayWarning ? 120 : 0) + (o.atRisk ? 40 : 0) - o.currentTier * 4 + ((o.effort?.months ?? 99) <= 2 ? 15 : 0),
  },
}
export const DEFAULT_RANK_UP_PROFILE = 'balanced'

export function getRankUpProfile(id) {
  return RANK_UP_PROFILES[id] || RANK_UP_PROFILES[DEFAULT_RANK_UP_PROFILE]
}

export function prioritizeOpportunities(opps, profileId = DEFAULT_RANK_UP_PROFILE) {
  const profile = getRankUpProfile(profileId)
  return [...opps]
    .map((o) => ({ ...o, priorityScore: round(profile.weigh(o)) }))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.scoreImpact - a.scoreImpact)
    .map((o, i) => ({ ...o, priority: i + 1 }))
}

// ── 7. buildHowToImprove — sibling of buildWhyThisScore ───────────────────────
/**
 * The "How do I improve this?" payload, designed to sit next to buildWhyThisScore.
 * JSON-friendly for a future Jarvis ("explain my fastest rank-up path").
 * @param score  the computeMaxxScoreV2 result (for the headline)
 */
export function buildHowToImprove(score, rankCats, weights, { profile = DEFAULT_RANK_UP_PROFILE } = {}) {
  const cats = (rankCats || []).filter((c) => c?.tier?.tier)
  if (!cats.length) return null
  const opportunities = buildOpportunities(cats, weights, { profile })
  const plans = cats.map((c) => buildRankUpPlan(c, { rankCats: cats, weights })).filter(Boolean)
  const top = opportunities[0] || null
  return {
    version: 'v1',
    model: 'rank-gap + score-impact (current weighting) + heuristic effort',
    profile,
    profileLabel: getRankUpProfile(profile).label,
    headline: score
      ? {
          tier: score.tier,
          nextTier: Math.min((score.tier || 1) + 1, MAX_TIER),
          fastestPath: top ? `${top.name} (${top.gap.headlineGap})` : null,
          biggestImpact: opportunities.length
            ? [...opportunities].sort((a, b) => b.scoreImpact - a.scoreImpact)[0]?.name ?? null
            : null,
        }
      : null,
    topOpportunities: opportunities.slice(0, 3),
    opportunities,
    plans,
  }
}

// ── Dashboard data-layer aggregate ────────────────────────────────────────────
/**
 * Single entry point the Dashboard attaches to maxxProfile. Bundles the whole
 * action layer so the existing UI can read small indicators without recomputing.
 * @param score the computeMaxxScoreV2 result, @param bottlenecksV2 detectBottlenecksV2 output
 */
export function buildRankUpLayer(rankCats, { profileId = 'balanced', rankUpProfile = DEFAULT_RANK_UP_PROFILE, score = null, bottlenecksV2 = [] } = {}) {
  const cats = (rankCats || []).filter((c) => c?.tier?.tier)
  if (!cats.length) return null
  const weights = weightsForProfile(profileId)
  const opportunities = buildOpportunities(cats, weights, { profile: rankUpProfile })
  const plans = cats.map((c) => buildRankUpPlan(c, { rankCats: cats, weights })).filter(Boolean)
  const gaps = cats.map((c) => computeRankGap(c)).filter(Boolean)
  return {
    rankUpProfile,
    gaps,
    opportunities,
    topOpportunity: opportunities[0] || null,
    plans,
    bottlenecks: enrichBottlenecks(bottlenecksV2, cats, weights),
    howToImprove: buildHowToImprove(score, cats, weights, { profile: rankUpProfile }),
  }
}
