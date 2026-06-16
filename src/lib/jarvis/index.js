// ============================================================================
// Jarvis Intelligence Layer v2 (Phase 11) — public surface + optional loader.
// ----------------------------------------------------------------------------
// Re-exports the context builder + reasoning tools, and provides an OPTIONAL
// async loader that assembles a Jarvis context from PERSISTED data (the latest
// tier_snapshot the scoring system already wrote + the profile row).
//
//   ⚠️ The loader does NOT recompute tiers from raw metrics. It reads the tiers
//   the scoring system persisted and runs the SAME authoritative engines
//   (computeMaxxScoreV2 / detectBottlenecksV2 / buildRankUpLayer / personalization)
//   that the Dashboard runs — Jarvis consumes the objective systems, it does not
//   define a parallel scoring math. Best-effort: returns null on any failure so
//   Jarvis degrades to its existing lean context.
// ============================================================================
import { TIER_NAMES } from '../../components/dashboard/tierUtils'
import { computeMaxxScoreV2, detectBottlenecksV2, buildWhyThisScore, SCORE_VERSION } from '../maxxScore'
import { buildRankUpLayer } from '../rankUp'
import { weightsForProfile, suggestTierProfile } from '../tierProfiles'
import {
  buildPersonalizationSummary, calculateTierConfidence, isCategoryFallback, DASH_CATEGORY_MAP,
} from '../profileCompleteness'
import { getJarvisUserContext } from './context'

export * from './context'
export * from './reason'

// Snapshot columns → Dashboard category id + display name.
const SNAPSHOT_CATS = [
  { col: 'kondition', id: 'kondition', name: 'Kondition' },
  { col: 'styrka', id: 'styrka', name: 'Styrka' },
  { col: 'somn', id: 'somn', name: 'Sömn' },
  { col: 'ekonomi', id: 'ekonomi', name: 'Ekonomi' },
  { col: 'valmående', id: 'halsa', name: 'Hälsa' },
  { col: 'plugg', id: 'plugg', name: 'Studier' },
]

/**
 * Reconstruct a Dashboard-shaped `maxxProfile` (+ categories) from a persisted
 * tier_snapshot row, so the Jarvis context can be built off-Dashboard. Tiers are
 * READ from the snapshot (not recomputed); everything else routes through the
 * authoritative engines. Returns { categories, maxxProfile } or null.
 */
export function reconstructFromSnapshot(snapshotRow, profile = null) {
  if (!snapshotRow) return null
  const categories = SNAPSHOT_CATS
    .map(({ col, id, name }) => {
      const tier = snapshotRow[col]
      if (tier == null) return null
      return { id, name, hasData: true, tier: { tier, label: TIER_NAMES[tier] || `T${tier}` } }
    })
    .filter(Boolean)
  if (!categories.length) return null

  // Phase-8 confidence/fallback per category (does not touch the tier).
  const hasDataMap = {}
  for (const c of categories) {
    const key = DASH_CATEGORY_MAP[c.id]
    if (!key) continue
    hasDataMap[key] = true
    c.confidence = calculateTierConfidence(key, profile, true)
    c.usingFallback = isCategoryFallback(key, profile)
    c.percentile = undefined // filled by the context projector via tierToPercentile
  }
  const personalization = buildPersonalizationSummary(profile, hasDataMap)

  // rankCats == the rankable categories (matches buildMaxxProfile's filter).
  const rankCats = categories.filter((c) => !['kropp', 'fardigheter'].includes(c.id))
  // Pick the weighting profile the scoring system would (no DB singleton import).
  const profileId = suggestTierProfile({ goals: { primary: profile?.primary_focus }, lifeStage: profile?.life_stage })
  const weights = weightsForProfile(profileId)

  const score = computeMaxxScoreV2(rankCats, weights) // authoritative fn, persisted tiers → no new math
  if (!score) return null
  const bottlenecksV2 = detectBottlenecksV2(rankCats, score.tier, weights)
  const rankUp = buildRankUpLayer(rankCats, { profileId, score, bottlenecksV2 })

  const maxxProfile = {
    tier: { tier: score.tier, label: score.label, color: score.color },
    weightedPercentile: score.weightedPercentile,
    minTier: score.minTier,
    tierProfile: profileId,
    scoreVersion: SCORE_VERSION,
    bottlenecksV2,
    rankUp,
    whyThisScore: buildWhyThisScore(score, rankCats, personalization),
    personalization,
    reconstructed: true, // flag: built from a snapshot for analysis, not the live Dashboard object
  }
  return { categories, maxxProfile }
}

/**
 * Load a Jarvis context for a user from persisted data.
 * @param supabase an authed supabase client, @param userId the user id,
 * @param getProfile optional async (userId) → profile row (defaults to none).
 * @returns the Jarvis context object, or null (caller keeps its lean context).
 */
export async function loadJarvisContext({ supabase, userId, getProfile = null } = {}) {
  if (!supabase || !userId) return null
  try {
    const [{ data: snap }, profile] = await Promise.all([
      supabase
        .from('tier_snapshots')
        .select('date,kondition,styrka,plugg,ekonomi,somn,valmående')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getProfile ? getProfile(userId) : Promise.resolve(null),
    ])
    const built = reconstructFromSnapshot(snap, profile)
    if (!built) return null
    return getJarvisUserContext({ profile, categories: built.categories, maxxProfile: built.maxxProfile })
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('loadJarvisContext failed:', e?.message || e)
    return null
  }
}
