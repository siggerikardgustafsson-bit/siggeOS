// ============================================================================
// Tier Profiles (Phase 6) — DATA ONLY. Default category-weight presets that a
// FUTURE Maxx Score v2 can use to weight categories per user. Nothing consumes
// these yet — the Maxx Score is unchanged this phase.
//
// Keys map to the Dashboard category ids (kondition/styrka/somn/plugg/ekonomi/
// valmaende/fardigheter). Weights are relative multipliers (1 = neutral).
// ============================================================================

export const TIER_PROFILES = {
  student: {
    label: 'Student',
    blurb: 'Studier och vanor väger tyngst.',
    weights: { kondition: 1.0, styrka: 1.0, somn: 1.2, plugg: 1.6, ekonomi: 0.8, valmaende: 1.2, fardigheter: 1.0 },
  },
  fitness: {
    label: 'Fitness Focus',
    blurb: 'Kondition och styrka prioriteras.',
    weights: { kondition: 1.6, styrka: 1.6, somn: 1.2, plugg: 0.6, ekonomi: 0.6, valmaende: 1.0, fardigheter: 0.8 },
  },
  career: {
    label: 'Career Focus',
    blurb: 'Karriär och ekonomi i fokus.',
    weights: { kondition: 0.8, styrka: 0.8, somn: 1.0, plugg: 1.2, ekonomi: 1.6, valmaende: 1.0, fardigheter: 1.3 },
  },
  entrepreneur: {
    label: 'Entrepreneur',
    blurb: 'Ekonomi, energi och produktivitet.',
    weights: { kondition: 0.8, styrka: 0.8, somn: 1.0, plugg: 1.0, ekonomi: 1.8, valmaende: 1.1, fardigheter: 1.3 },
  },
  balanced: {
    label: 'Balanced',
    blurb: 'Alla områden väger lika.',
    weights: { kondition: 1.0, styrka: 1.0, somn: 1.0, plugg: 1.0, ekonomi: 1.0, valmaende: 1.0, fardigheter: 1.0 },
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
