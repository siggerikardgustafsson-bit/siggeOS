// ============================================================================
// Profile Completeness & Tier Confidence engine (Phase 8)
// ----------------------------------------------------------------------------
// Turns a raw `profiles` row into the signals the UI needs to ACTIVATE the
// personalization infra built in Phases 5–7:
//
//   getProfileCompleteness(profile)   -> { pct, missing[], missingCritical[], status }
//   getMissingCriticalFields(profile) -> [{ key, label }]
//   getPersonalizationStatus(pct)     -> { id, label, ... }  (Fully/Mostly/Basic/Fallback)
//   calculateTierConfidence(cat, p)   -> 0..100  per ranking category
//   getCategoryConfidences(profile)   -> { strength, conditioning, economy, health }
//   getFallbackCategories(profile)    -> which categories run on fallback thresholds
//   buildPersonalizationSummary(p)    -> the bundle Dashboard / Why-This-Score consume
//
// PURE + sync (no DB, no React) so it can run in the Dashboard, the Profile page,
// onboarding, and node tests. It does NOT change any tier/score value — it only
// measures how personalized the inputs are (task 6: "Do not modify tiers. Only
// calculate confidence."). Reads the SAME `profiles` columns Phase 5 added, so a
// missing/empty column simply lowers completeness (graceful degradation).
// ============================================================================

const round = (x) => Math.round(x)

// Friendly labels (Swedish — matches the Profile page / onboarding copy).
export const FIELD_LABELS = {
  birth_date: 'Ålder',
  sex: 'Kön',
  country: 'Land',
  height_cm: 'Längd',
  weight_kg: 'Vikt',
  target_weight_kg: 'Målvikt',
  life_stage: 'Livsfas',
  occupation: 'Sysselsättning',
  primary_focus: 'Primärt fokus',
  secondary_focus: 'Sekundärt fokus',
}

// Fields that count toward completeness. `critical` = directly feeds Tier Engine
// v2 / Maxx Score v2 (weight 2); the rest enrich personalization (weight 1).
export const COMPLETENESS_FIELDS = [
  { key: 'birth_date',       weight: 2, critical: true },  // → age (strength/cond/health/economy)
  { key: 'sex',              weight: 2, critical: true },  // → strength + conditioning grading
  { key: 'weight_kg',        weight: 2, critical: true },  // → strength multiple + BMI
  { key: 'height_cm',        weight: 2, critical: true },  // → BMI / health
  { key: 'life_stage',       weight: 2, critical: true },  // → economy ladder
  { key: 'target_weight_kg', weight: 1, critical: false }, // → weight-goal health tier
  { key: 'occupation',       weight: 1, critical: false },
  { key: 'country',          weight: 1, critical: false },
  { key: 'primary_focus',    weight: 1, critical: false }, // → tier profile weighting
  { key: 'secondary_focus',  weight: 1, critical: false },
]

export const CRITICAL_FIELDS = COMPLETENESS_FIELDS.filter((f) => f.critical).map((f) => f.key)

// Which profile fields each ranking category actually consumes in tierEngine.js.
// (Used for both confidence and "is this category on fallback?".)
export const CATEGORY_PROFILE_FIELDS = {
  strength:     ['sex', 'birth_date', 'weight_kg'],
  conditioning: ['sex', 'birth_date'],
  economy:      ['life_stage', 'birth_date'],
  health:       ['birth_date', 'height_cm', 'weight_kg'],
}

// A field is "filled" when present and non-empty. 0 is a valid number; '' is not.
export function isFilled(profile, key) {
  if (!profile) return false
  const v = profile[key]
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'number') return !Number.isNaN(v)
  return true
}

// ── personalization status tiers (task 5) ───────────────────────────────────
export const PERSONALIZATION_STATUS = [
  { id: 'fully',    label: 'Fullt personaliserad',  min: 85, color: '#10b981' },
  { id: 'mostly',   label: 'Mestadels personaliserad', min: 60, color: '#06b6d4' },
  { id: 'basic',    label: 'Grundläggande',         min: 30, color: '#f59e0b' },
  { id: 'fallback', label: 'Fallback-läge',         min: 0,  color: '#6b7280' },
]

export function getPersonalizationStatus(pct) {
  const p = Number.isFinite(pct) ? pct : 0
  return PERSONALIZATION_STATUS.find((s) => p >= s.min) || PERSONALIZATION_STATUS[PERSONALIZATION_STATUS.length - 1]
}

// ── completeness (task 1) ────────────────────────────────────────────────────
export function getProfileCompleteness(profile) {
  const totalWeight = COMPLETENESS_FIELDS.reduce((s, f) => s + f.weight, 0)
  let filledWeight = 0
  const filledKeys = []
  const missing = []
  for (const f of COMPLETENESS_FIELDS) {
    if (isFilled(profile, f.key)) {
      filledWeight += f.weight
      filledKeys.push(f.key)
    } else {
      missing.push({ key: f.key, label: FIELD_LABELS[f.key] || f.key, critical: f.critical })
    }
  }
  const pct = totalWeight ? round((filledWeight / totalWeight) * 100) : 0
  const missingCritical = missing.filter((m) => m.critical)
  return {
    pct,
    filledWeight,
    totalWeight,
    filledKeys,
    missing,
    missingCritical,
    status: getPersonalizationStatus(pct),
    isEmpty: filledKeys.length === 0,
    isComplete: missing.length === 0,
  }
}

export function getMissingCriticalFields(profile) {
  return CRITICAL_FIELDS
    .filter((key) => !isFilled(profile, key))
    .map((key) => ({ key, label: FIELD_LABELS[key] || key }))
}

// ── tier confidence (task 6) ─────────────────────────────────────────────────
// Confidence = how trustworthy this category's tier is given profile quality.
// Even with no profile the tier is still meaningful (it uses calibrated fallback
// thresholds), so confidence floors at BASE rather than 0. Filling the category's
// profile fields raises it toward 100. We do NOT touch the tier itself.
const CONFIDENCE_BASE = 55

// Categories with NO profile dependency are internally normalized (e.g. study /
// wellbeing / skills) — their tier is fully defined without a profile.
export const PROFILE_INDEPENDENT_CATEGORIES = ['study', 'plugg', 'wellbeing', 'valmaende', 'skills', 'fardigheter']

// Economic roles in the multi-role "Livssituation" that imply a life stage and
// therefore personalize the economy tier (mirrors ROLE_TYPE_TO_LIFE_STAGE in
// personalization.js — kept local to avoid an import cycle).
const ECONOMIC_ROLE_TYPES = new Set(['study', 'job', 'business', 'parent'])
export function hasActiveEconomicRole(profile) {
  const roles = profile?.life_roles
  return Array.isArray(roles) && roles.some((r) => r && r.active !== false && ECONOMIC_ROLE_TYPES.has(r.type))
}

// `life_stage` for the economy category is satisfied by EITHER the legacy single
// field OR an active economic role, since both now personalize the economy tier.
function isCategoryFieldFilled(profile, category, key) {
  if (category === 'economy' && key === 'life_stage' && hasActiveEconomicRole(profile)) return true
  return isFilled(profile, key)
}

export function calculateTierConfidence(category, profile, hasData = true) {
  if (!hasData) return 0 // no underlying metric → nothing to be confident about
  const fields = CATEGORY_PROFILE_FIELDS[category]
  if (!fields) return 100 // profile-independent category — fully defined w/o profile
  const filled = fields.filter((k) => isCategoryFieldFilled(profile, category, k)).length
  const frac = fields.length ? filled / fields.length : 0
  return round(CONFIDENCE_BASE + (100 - CONFIDENCE_BASE) * frac)
}

// A category is "on fallback logic" when none of its profile inputs are present
// (Tier Engine factors all collapse to 1 → identical to the static thresholds).
export function isCategoryFallback(category, profile) {
  const fields = CATEGORY_PROFILE_FIELDS[category]
  if (!fields) return false
  return fields.every((k) => !isCategoryFieldFilled(profile, category, k))
}

export function getCategoryConfidences(profile, hasDataMap = {}) {
  const out = {}
  for (const cat of Object.keys(CATEGORY_PROFILE_FIELDS)) {
    out[cat] = calculateTierConfidence(cat, profile, hasDataMap[cat] !== false)
  }
  return out
}

export function getFallbackCategories(profile) {
  return Object.keys(CATEGORY_PROFILE_FIELDS).filter((cat) => isCategoryFallback(cat, profile))
}

// ── one bundle for Dashboard + Why-This-Score (tasks 7, 8) ───────────────────
export function buildPersonalizationSummary(profile, hasDataMap = {}) {
  const completeness = getProfileCompleteness(profile)
  const confidences = getCategoryConfidences(profile, hasDataMap)
  const fallbackCategories = getFallbackCategories(profile)
  const vals = Object.values(confidences)
  const overallConfidence = vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
  return {
    completeness: completeness.pct,
    status: completeness.status,
    missingCritical: completeness.missingCritical,
    confidences,
    overallConfidence,
    fallbackCategories,
    isPersonalized: completeness.pct >= 60,
  }
}

// Map a Dashboard category id → the engine category key for confidence lookup.
export const DASH_CATEGORY_MAP = {
  kondition: 'conditioning',
  styrka: 'strength',
  ekonomi: 'economy',
  somn: 'health',
  halsa: 'health',
}
