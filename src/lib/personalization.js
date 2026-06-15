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
  return {
    age: computeAge(profile.birth_date),
    sex: profile.sex ?? null,
    height: profile.height_cm ?? null,
    weight: profile.weight_kg ?? null,
    lifeStage: profile.life_stage ?? null,
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
