// ============================================================================
// Personalization layer (Phase 5)
// ----------------------------------------------------------------------------
// Central, read-only foundation that future systems (Tier Engine, Maxx Score,
// Jarvis, onboarding, custom modules) can build on. It does NOT change any
// score/tier/Jarvis behaviour — it only reads the profile and exposes a
// normalized user context.
//
//   getUserProfile(userId?)   -> the full profiles row (or null)
//   getUserContext(userId?)   -> normalized context object (the Context Engine)
//   getLifeStage(profileOrId?)-> life_stage string (or null)
//   getPrimaryGoals(profileOrId?) -> { primary, secondary }
//   buildUserContext(profile) -> pure, synchronous context builder
//   computeAge(birthDate)     -> integer age from a date
// ============================================================================
import { supabase } from './supabase'
import { getProfileCompleteness } from './profileCompleteness'

// Neutral fallback used everywhere a user's name is needed but not yet set.
// Replaces the old hardcoded "Sigge" so a brand-new user is never addressed as
// someone else (Phase 16).
export const DEFAULT_DISPLAY_NAME = 'användaren'

// ── option vocabularies (shared by the Profile UI + future onboarding) ──────
export const SEX_OPTIONS = [
  { id: 'male', label: 'Man' },
  { id: 'female', label: 'Kvinna' },
  { id: 'other', label: 'Annat' },
  { id: 'prefer_not_to_say', label: 'Vill ej ange' },
]

export const LIFE_STAGES = [
  { id: 'student', label: 'Student' },
  { id: 'early_career', label: 'Tidig karriär' },
  { id: 'professional', label: 'Yrkesverksam' },
  { id: 'entrepreneur', label: 'Entreprenör' },
  { id: 'parent', label: 'Förälder' },
  { id: 'retired', label: 'Pensionär' },
]

// Role types for the optional, multi-role "Livssituation" (additive to life_stage).
export const ROLE_TYPES = [
  { id: 'study', label: 'Studie' },
  { id: 'job', label: 'Jobb' },
  { id: 'business', label: 'Eget företag' },
  { id: 'parent', label: 'Förälder' },
  { id: 'other', label: 'Annat' },
]

// Maps a multi-role "Livssituation" role type → a LIFE_STAGES id, so the new
// role-based input can drive the same profile-aware tier divisions the legacy
// single `life_stage` field does (economy thresholds + tier-profile weighting).
// 'other' intentionally maps to nothing (no economic signal).
export const ROLE_TYPE_TO_LIFE_STAGE = {
  study: 'student',
  job: 'professional',
  business: 'entrepreneur',
  parent: 'parent',
}

// Priority when a person has several active roles and a consumer needs ONE
// life-stage (e.g. tier-profile weighting): most economically-defining first.
const LIFE_STAGE_PRIORITY = ['entrepreneur', 'professional', 'parent', 'student']

// Derive the distinct, priority-ordered life stages implied by a set of active
// roles. Returns [] when no role carries an economic signal.
export function deriveLifeStagesFromRoles(roles) {
  const stages = (roles || [])
    .filter((r) => r && r.active !== false)
    .map((r) => ROLE_TYPE_TO_LIFE_STAGE[r.type])
    .filter(Boolean)
  const distinct = [...new Set(stages)]
  return distinct.sort((a, b) => LIFE_STAGE_PRIORITY.indexOf(a) - LIFE_STAGE_PRIORITY.indexOf(b))
}

// Normalize the stored life_roles JSONB into a clean array (defensive — the
// column may be missing on un-migrated rows, or hold legacy/empty values).
export function normalizeLifeRoles(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      type: r.type ?? '',
      label: typeof r.label === 'string' ? r.label : '',
      description: typeof r.description === 'string' ? r.description : '',
      active: r.active !== false, // default active
    }))
}

export const FOCUS_AREAS = [
  { id: 'fitness', label: 'Träning' },
  { id: 'career', label: 'Karriär' },
  { id: 'education', label: 'Utbildning' },
  { id: 'wealth', label: 'Ekonomi' },
  { id: 'experiences', label: 'Upplevelser' },
  { id: 'relationships', label: 'Relationer' },
  { id: 'health', label: 'Hälsa' },
  { id: 'productivity', label: 'Produktivitet' },
]

export const UNIT_SYSTEMS = [
  { id: 'metric', label: 'Metriskt (kg, cm)' },
  { id: 'imperial', label: 'Imperial (lb, ft)' },
]

export const CURRENCIES = [
  { id: 'SEK', label: 'SEK – svensk krona' },
  { id: 'EUR', label: 'EUR – euro' },
  { id: 'USD', label: 'USD – dollar' },
  { id: 'GBP', label: 'GBP – pund' },
  { id: 'NOK', label: 'NOK – norsk krona' },
  { id: 'DKK', label: 'DKK – dansk krona' },
]

export const LANGUAGES = [
  { id: 'sv', label: 'Svenska' },
  { id: 'en', label: 'English' },
]

// ── pure helpers ─────────────────────────────────────────────────────────────
export function computeAge(birthDate) {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 && age < 150 ? age : null
}

// The User Context Engine: a normalized object future systems consume.
// Shape is intentionally stable — additive changes only.
export function buildUserContext(profile) {
  if (!profile) return null
  const lifeRoles = normalizeLifeRoles(profile.life_roles)
  // Effective life stage(s) for tier divisions. The explicit legacy `life_stage`
  // field always wins (so existing users' scores never move); otherwise the new
  // multi-role "Livssituation" drives it. `lifeStages` (array) lets the economy
  // tier blend across several roles; `lifeStage` (singular) is the priority pick
  // consumers that need one value use (e.g. tier-profile weighting).
  const explicitStage = profile.life_stage ?? null
  const derivedStages = deriveLifeStagesFromRoles(lifeRoles)
  const lifeStages = explicitStage ? [explicitStage] : derivedStages
  return {
    age: computeAge(profile.birth_date),
    sex: profile.sex ?? null,
    height: profile.height_cm ?? null,
    weight: profile.weight_kg ?? null,
    lifeStage: lifeStages[0] ?? null,
    lifeStages,
    lifeRoles,
    occupation: profile.occupation ?? null,
    goals: {
      primary: profile.primary_focus ?? null,
      secondary: profile.secondary_focus ?? null,
    },
    country: profile.country ?? null,
    currency: profile.currency ?? 'SEK',
  }
}

// ── async accessors (default to the current authenticated user) ──────────────
async function resolveUserId(userId) {
  if (userId) return userId
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

export async function getUserProfile(userId) {
  const uid = await resolveUserId(userId)
  if (!uid) return null
  // maybeSingle + try/catch so callers degrade gracefully if the profiles table
  // / Phase-5 columns aren't migrated yet (returns null instead of throwing).
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    if (error) { console.warn('[personalization] profiles unavailable:', error.message); return null }
    return data
  } catch (e) {
    console.warn('[personalization] getUserProfile failed:', e?.message || e)
    return null
  }
}

export async function getUserContext(userId) {
  return buildUserContext(await getUserProfile(userId))
}

// Accepts a profile object (sync extract) OR a userId/undefined (fetches).
async function resolveProfile(profileOrId) {
  if (profileOrId && typeof profileOrId === 'object') return profileOrId
  return getUserProfile(profileOrId)
}

export async function getLifeStage(profileOrId) {
  const p = await resolveProfile(profileOrId)
  return p?.life_stage ?? null
}

export async function getPrimaryGoals(profileOrId) {
  const p = await resolveProfile(profileOrId)
  return { primary: p?.primary_focus ?? null, secondary: p?.secondary_focus ?? null }
}

// Convenience label lookups for UI.
export const labelFor = (list, id) => list.find((o) => o.id === id)?.label ?? id ?? '—'

// ============================================================================
// User Identity Context (Phase 16) — the single source of truth for "who is
// this user?" that every personalization site (Jarvis, Insights, Journal AI,
// side-quests, study tutor) reads instead of hardcoding Sigge's biography.
//
// Combines the `profiles` row (identity/body/focus/studies/roles) with the
// `user_settings` row (free-text "about me" + goals). PURE builder + async
// accessor, mirroring the rest of this module. Degrades gracefully: any
// missing piece simply becomes null/empty, never throws.
// ============================================================================

// Pure builder: (profile, settings) -> normalized identity object.
export function buildIdentityContext(profile, settings) {
  const p = profile || {}
  const s = settings || {}
  const g = s.goals || {}
  const ctx = buildUserContext(p) || {}

  const displayName =
    (typeof s.display_name === 'string' && s.display_name.trim()) ||
    (typeof p.display_name === 'string' && p.display_name.trim()) ||
    null

  const activeRoles = (ctx.lifeRoles || []).filter((r) => r.active)

  return {
    displayName,                                  // null when unset (use DEFAULT_DISPLAY_NAME for copy)
    hasName: !!displayName,
    aboutMe: (typeof s.about_me === 'string' && s.about_me.trim()) || null,
    age: ctx.age ?? null,
    sex: ctx.sex ?? null,
    country: p.country ?? null,
    city: p.city ?? null,
    occupation: p.occupation ?? null,
    lifeStage: p.life_stage ?? null,
    lifeRoles: ctx.lifeRoles || [],
    activeRoles,
    studies: {
      program: p.study_program ?? null,
      institution: p.study_institution ?? null,
    },
    goals: {
      primaryFocus: p.primary_focus ?? null,
      secondaryFocus: p.secondary_focus ?? null,
      oneYear: g.one_year ?? null,
      threeYear: g.three_year ?? null,
      tenYear: g.ten_year ?? null,
      monthlyIncome: g.monthly_income_goal ?? null,
      bodyWeight: g.body_weight_goal ?? g.target_weight ?? null,
    },
    currency: ctx.currency ?? 'SEK',
    completeness: getProfileCompleteness(p).pct,
  }
}

// Render the identity as a compact Swedish prompt block that AI prompt sites
// can interpolate. Only includes lines that have data — a sparse profile yields
// a short block rather than a wall of "okänt".
export function identityToPromptLines(identity) {
  if (!identity) return []
  const lines = []
  const name = identity.displayName || DEFAULT_DISPLAY_NAME
  lines.push(`Namn: ${name}`)
  if (identity.age) lines.push(`Ålder: ${identity.age}`)
  if (identity.occupation) lines.push(`Sysselsättning: ${identity.occupation}`)
  if (identity.lifeStage) lines.push(`Livsfas: ${labelFor(LIFE_STAGES, identity.lifeStage)}`)
  if (identity.activeRoles?.length) {
    lines.push('Roller: ' + identity.activeRoles.map((r) => {
      const type = labelFor(ROLE_TYPES, r.type)
      return [r.label || type, r.description].filter(Boolean).join(' – ')
    }).join('; '))
  }
  if (identity.studies?.program) {
    lines.push('Studier: ' + [identity.studies.program, identity.studies.institution].filter(Boolean).join(', '))
  }
  if (identity.country) lines.push(`Land: ${identity.country}`)
  if (identity.goals?.primaryFocus) lines.push(`Primärt fokus: ${labelFor(FOCUS_AREAS, identity.goals.primaryFocus)}`)
  if (identity.goals?.oneYear) lines.push(`1-årsmål: ${identity.goals.oneYear}`)
  if (identity.goals?.threeYear) lines.push(`3-årsmål: ${identity.goals.threeYear}`)
  if (identity.goals?.monthlyIncome) lines.push(`Inkomstmål: ${identity.goals.monthlyIncome} kr/mån`)
  if (identity.aboutMe) lines.push(`Om: ${identity.aboutMe}`)
  return lines
}

export function identityToPrompt(identity) {
  return identityToPromptLines(identity).join('\n')
}

// Async accessor: fetches profile + user_settings for the current (or given)
// user and returns the normalized identity. Never throws — returns a minimal
// identity ({ displayName: null, ... }) if the tables aren't reachable.
export async function getUserIdentityContext(userId) {
  const uid = await resolveUserId(userId)
  if (!uid) return buildIdentityContext(null, null)
  try {
    const [profile, settingsRes] = await Promise.all([
      getUserProfile(uid),
      supabase.from('user_settings').select('display_name,about_me,goals').eq('user_id', uid).maybeSingle(),
    ])
    return buildIdentityContext(profile, settingsRes?.data || null)
  } catch (e) {
    console.warn('[personalization] getUserIdentityContext failed:', e?.message || e)
    return buildIdentityContext(null, null)
  }
}
