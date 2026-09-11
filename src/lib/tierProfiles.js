// ============================================================================
// Tier Profiles (Phase 6) — DATA ONLY. Default category-weight presets that
// Maxx Score v2 uses to weight categories per user.
//
// Keys map to the Dashboard category ids (kondition/styrka/halsa/plugg/
// ekonomi/fardigheter). Weights are relative multipliers (1 = neutral).
//
// 'halsa' = merged Sömn+Hälsa (user call 2026-09-11) — its weight below is
// the average of the old separate somn/valmaende weights per profile, so
// relative emphasis across profiles carries over unchanged.
// ============================================================================

export const TIER_PROFILES = {
  student: {
    label: 'Student',
    blurb: 'Studier och vanor väger tyngst.',
    weights: { kondition: 1.0, styrka: 1.0, halsa: 1.2, plugg: 1.6, ekonomi: 0.8, fardigheter: 1.0 },
  },
  fitness: {
    label: 'Fitness Focus',
    blurb: 'Kondition och styrka prioriteras.',
    weights: { kondition: 1.6, styrka: 1.6, halsa: 1.1, plugg: 0.6, ekonomi: 0.6, fardigheter: 0.8 },
  },
  career: {
    label: 'Career Focus',
    blurb: 'Karriär och ekonomi i fokus.',
    weights: { kondition: 0.8, styrka: 0.8, halsa: 1.0, plugg: 1.2, ekonomi: 1.6, fardigheter: 1.3 },
  },
  entrepreneur: {
    label: 'Entrepreneur',
    blurb: 'Ekonomi, energi och produktivitet.',
    weights: { kondition: 0.8, styrka: 0.8, halsa: 1.05, plugg: 1.0, ekonomi: 1.8, fardigheter: 1.3 },
  },
  balanced: {
    label: 'Balanced',
    blurb: 'Alla områden väger lika.',
    weights: { kondition: 1.0, styrka: 1.0, halsa: 1.0, plugg: 1.0, ekonomi: 1.0, fardigheter: 1.0 },
  },
}

export const DEFAULT_TIER_PROFILE = 'balanced'

export function getTierProfile(id) {
  return TIER_PROFILES[id] || TIER_PROFILES[DEFAULT_TIER_PROFILE]
}

export function weightsForProfile(id) {
  return getTierProfile(id).weights
}

// Suggest a tier profile from a user context (primary_focus first, then life_stage).
// Suggestion only — nothing is applied automatically.
export function suggestTierProfile(context) {
  const focus = context?.goals?.primary
  if (focus === 'fitness' || focus === 'health') return 'fitness'
  if (focus === 'wealth' || focus === 'career') return 'career'
  if (focus === 'education') return 'student'
  const stage = context?.lifeStage
  if (stage === 'student') return 'student'
  if (stage === 'entrepreneur') return 'entrepreneur'
  if (stage === 'professional' || stage === 'early_career') return 'career'
  return DEFAULT_TIER_PROFILE
}
