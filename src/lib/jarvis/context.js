// ============================================================================
// Jarvis Intelligence Layer v2 (Phase 11) — Context Builder.
// ----------------------------------------------------------------------------
// A reusable, PURE projection that gathers everything Jarvis needs to *reason*
// about the user — profile, goals, life stage, category tiers, percentiles,
// bottlenecks, rank-up plans, completeness and confidence — into one object.
//
//   ⚠️ Jarvis ANALYZES; it does NOT calculate scores. This layer only CONSUMES
//   artifacts the scoring system already produced (the Dashboard's `maxxProfile`
//   = computeMaxxScoreV2 + detectBottlenecksV2 + buildRankUpLayer +
//   buildWhyThisScore + personalization). No tier or score is recomputed here —
//   the objective scoring system remains authoritative.
//
// Primary entry point: getJarvisUserContext({ profile, categories, maxxProfile }).
// ============================================================================
import { TIER_NAMES } from '../../components/dashboard/tierUtils'
import { tierToPercentile } from '../maxxScore'
import { datasetConfidence } from '../benchmarks'
import { suggestTierProfile } from '../tierProfiles'

// Dashboard category id → (benchmark category, representative metric) for the
// dataset-confidence lookup that qualifies a percentile statement. plugg is an
// internal mastery scale with no external benchmark (intentionally absent).
export const DASH_BENCHMARK = {
  kondition: { category: 'conditioning', metric: 'vo2max' },
  styrka: { category: 'strength', metric: 'bench' },
  ekonomi: { category: 'economy', metric: 'savings' },
  somn: { category: 'health', metric: 'sleep' },
  halsa: { category: 'health', metric: 'sleep' },
}

// Persona descriptor (task 5) — life stage + primary focus → a label Jarvis can
// use for tone/framing. Reuses suggestTierProfile's mapping so the persona is
// consistent with the weighting the scoring system already chose. This DOES NOT
// change any score — it only names the user's situation.
const PERSONA_LABELS = {
  student: 'student',
  fitness: 'fitness-fokuserad',
  career: 'karriär-fokuserad',
  entrepreneur: 'entreprenör',
  balanced: 'balanserad',
}
export function describePersona(profile) {
  const ctx = {
    goals: { primary: profile?.primary_focus, secondary: profile?.secondary_focus },
    lifeStage: profile?.life_stage,
  }
  const tierProfileId = suggestTierProfile(ctx)
  // Explicit life-stage refinements (professional/entrepreneur read through to a label).
  let id = tierProfileId
  if (profile?.life_stage === 'professional' && id === 'career') id = 'career'
  if (profile?.life_stage === 'entrepreneur') id = 'entrepreneur'
  return {
    id,
    label: PERSONA_LABELS[id] || 'balanserad',
    lifeStage: profile?.life_stage ?? null,
    primaryFocus: profile?.primary_focus ?? null,
    secondaryFocus: profile?.secondary_focus ?? null,
    weightProfile: tierProfileId, // the tier profile that drove the weighting (unchanged)
  }
}

function projectProfile(profile) {
  if (!profile) return { present: false }
  const age = profile.birth_date ? Math.floor((Date.now() - new Date(profile.birth_date)) / (365.25 * 864e5)) : null
  return {
    present: true,
    age,
    sex: profile.sex ?? null,
    height: profile.height_cm ?? null,
    weight: profile.weight_kg ?? null,
    lifeStage: profile.life_stage ?? null,
    occupation: profile.occupation ?? null,
    country: profile.country ?? null,
    goals: { primary: profile.primary_focus ?? null, secondary: profile.secondary_focus ?? null },
  }
}

// One normalized record per rankable category, merging the tier (consumed), the
// tier→percentile band, the Phase-8 profile confidence + fallback flag, and the
// Phase-9 dataset confidence for that category's benchmark.
function projectCategories(categories, whyByCat) {
  return (categories || [])
    .filter((c) => c?.tier?.tier)
    .map((c) => {
      const tier = c.tier.tier
      const percentile = c.percentile ?? tierToPercentile(tier)
      const bench = DASH_BENCHMARK[c.id]
      const dsConf = bench ? datasetConfidence(bench.category, bench.metric) : null
      const why = whyByCat?.[c.id] || null
      return {
        id: c.id,
        name: c.name,
        tier,
        tierLabel: TIER_NAMES[tier] || `T${tier}`,
        percentile, // population band the tier maps to (T1≈25 … T8≈99)
        topPercent: Math.max(0, Math.round(100 - percentile)), // "top X%"
        hasData: !!c.hasData,
        profileConfidence: c.confidence ?? null, // Phase 8 — input completeness
        usingFallback: c.usingFallback ?? why?.usingFallback ?? null,
        datasetConfidence: dsConf, // Phase 9 — distribution trust (null = no external benchmark)
        benchmarkCategory: bench?.category ?? null,
        reason: why?.reason ?? null, // tierEngine explanation string (metric=value → T..)
        factors: why?.profileFactors ?? null,
        composite: c.composite ?? null, // Phase 14 — Studier formal/skills breakdown (null for others)
      }
    })
}

/**
 * Build the Jarvis user-context object.
 * @param profile      a `profiles` row (or null) — identity/body/life/goals.
 * @param categories   the Dashboard category array (tiers already computed).
 * @param maxxProfile  the Dashboard maxxProfile (authoritative score + bottlenecks
 *                     + rankUp + whyThisScore + personalization). CONSUMED, never recomputed.
 * @returns a structured context Jarvis can reason over (see fields below).
 */
export function getJarvisUserContext({ profile = null, categories = [], maxxProfile = null } = {}) {
  const why = maxxProfile?.whyThisScore || null
  const whyByCat = {}
  for (const c of why?.categories || []) whyByCat[c.id] = c
  const personalization = maxxProfile?.personalization || null
  const rankUp = maxxProfile?.rankUp || null

  const cats = projectCategories(categories, whyByCat)
  const byId = {}
  for (const c of cats) byId[c.id] = c

  return {
    meta: {
      source: maxxProfile ? 'maxxProfile' : 'partial',
      scoreOwner: 'scoring-system', // Jarvis consumes; it never owns the score.
      generatedFor: 'jarvis',
    },
    profile: projectProfile(profile),
    persona: describePersona(profile),
    // Authoritative score — CONSUMED straight from the scoring system.
    score: maxxProfile
      ? {
          tier: maxxProfile.tier?.tier ?? null,
          label: maxxProfile.tier?.label ?? null,
          weightedPercentile: maxxProfile.weightedPercentile ?? null,
          minTier: maxxProfile.minTier ?? null,
          tierProfile: maxxProfile.tierProfile ?? null,
          version: maxxProfile.scoreVersion ?? null,
        }
      : null,
    completeness: personalization
      ? {
          pct: personalization.completeness ?? null,
          status: personalization.status?.label ?? null,
          overallConfidence: personalization.overallConfidence ?? null,
          missingCritical: (personalization.missingCritical || []).map((m) => m.label),
          fallbackCategories: personalization.fallbackCategories || [],
        }
      : null,
    categories: cats,
    byId,
    // Bottlenecks — prefer the rank-up-enriched list (carries effort + plan), else
    // the raw Bottleneck Engine v2 output. Both are sorted worst-first by the engine.
    bottlenecks: rankUp?.bottlenecks?.length ? rankUp.bottlenecks : maxxProfile?.bottlenecksV2 || [],
    rankUp: rankUp
      ? {
          profile: rankUp.rankUpProfile ?? null,
          topOpportunity: rankUp.topOpportunity ?? null,
          opportunities: rankUp.opportunities ?? [],
          plans: rankUp.plans ?? [],
          howToImprove: rankUp.howToImprove ?? null,
          gaps: rankUp.gaps ?? [],
        }
      : null,
  }
}
