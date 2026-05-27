import { differenceInDays, parseISO, subDays, format } from 'date-fns'

// ─── DECAY ────────────────────────────────────────────────────────────────────
export function getDecayedValue(value, date, decayDays) {
  if (!date || value == null) return null
  const daysSince = differenceInDays(new Date(), parseISO(date))
  if (daysSince > decayDays) return null
  const stale = daysSince > decayDays * 0.7
  return { value, stale, daysSince }
}

// ─── TIER CALC ────────────────────────────────────────────────────────────────
// thresholds = [t50, t30, t20, t10, t5, t2_5, t1] = values required to REACH that tier
export function getTier(value, thresholds, higherIsBetter = true) {
  if (value == null) return null
  const labels = ['Botten 50%', 'Top 50%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 2.5%', 'Top 1%']
  const colors = ['#6b7280', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#06b6d4', '#ec4899', '#f59e0b']
  const glow = [false, false, false, false, false, false, false, true]

  let tier = 1
  for (let i = 0; i < thresholds.length; i++) {
    const reached = higherIsBetter ? value >= thresholds[i] : value <= thresholds[i]
    if (reached) tier = i + 2
  }

  return {
    tier,
    label: labels[tier - 1],
    color: colors[tier - 1],
    glow: glow[tier - 1],
    nextThreshold: tier < 8 ? thresholds[tier - 1] : null,
    nextLabel: tier < 8 ? labels[tier] : null,
  }
}

// ─── THRESHOLDS ───────────────────────────────────────────────────────────────

// KONDITION — VO2max (ml/kg/min), higher is better
export const VO2MAX_THRESHOLDS = [44, 49, 53, 57, 61, 65, 70]

// Löpningstider i sekunder, lower is better
export const RUN_5K_THRESHOLDS = [28 * 60, 24 * 60, 22 * 60, 20 * 60, 18 * 60 + 30, 17 * 60, 15 * 60 + 30]
export const RUN_10K_THRESHOLDS = [58 * 60, 50 * 60, 46 * 60, 42 * 60, 39 * 60, 36 * 60, 33 * 60]
export const RUN_HALF_THRESHOLDS = [2 * 3600 + 10 * 60, 1 * 3600 + 55 * 60, 1 * 3600 + 47 * 60, 1 * 3600 + 38 * 60, 1 * 3600 + 31 * 60, 1 * 3600 + 25 * 60, 1 * 3600 + 18 * 60]
export const RUN_MARA_THRESHOLDS = [4 * 3600 + 30 * 60, 4 * 3600, 3 * 3600 + 45 * 60, 3 * 3600 + 30 * 60, 3 * 3600 + 15 * 60, 3 * 3600, 2 * 3600 + 45 * 60]

// STYRKA — relativa multiplars av kroppsvikt (value = kg/BW), higher is better
export const BENCH_THRESHOLDS = [0.75, 1.0, 1.15, 1.3, 1.5, 1.65, 1.8]
export const SQUAT_THRESHOLDS = [1.0, 1.25, 1.4, 1.6, 1.75, 1.9, 2.1]
export const DEADLIFT_THRESHOLDS = [1.25, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5]
export const OHP_THRESHOLDS = [0.5, 0.65, 0.75, 0.85, 1.0, 1.1, 1.2]
export const PULLUP_THRESHOLDS = [5, 10, 13, 16, 20, 24, 28]

// SÖMN — duration (timmar), higher is better
export const SLEEP_DURATION_THRESHOLDS = [6.5, 7, 7.5, 8, 8.5, 8.5, 9]
// Sömnregelbundenhet — SD i minuter, lower is better
export const SLEEP_REGULARITY_THRESHOLDS = [60, 40, 30, 20, 15, 12, 10]

// EKONOMI — månadsnettoink (kr), higher is better
export const INCOME_THRESHOLDS = [12000, 18000, 22000, 28000, 35000, 45000, 60000]
export const SAVINGS_THRESHOLDS = [5000, 20000, 50000, 100000, 200000, 350000, 500000]

// VÄLMÅENDE — energy/mood (1-10), higher is better
export const ENERGY_THRESHOLDS = [5, 6, 7, 8, 9, 9.5, 10]
export const MOOD_THRESHOLDS = [5, 6, 7, 8, 9, 9.5, 10]
// Stress (1-10), lower is better
export const STRESS_THRESHOLDS = [7, 5, 4, 3, 2, 1.5, 1]
// Steg, higher is better
export const STEPS_THRESHOLDS = [5000, 7500, 9000, 11000, 13000, 15000, 18000]

// PLUGG — mastery % tiers (interna, ingen extern norm)
export function getStudyTier(mastery) {
  if (mastery == null) return null
  if (mastery >= 80) return { tier: 5, label: 'Expert', color: '#10b981' }
  if (mastery >= 60) return { tier: 4, label: 'Avancerad', color: '#06b6d4' }
  if (mastery >= 40) return { tier: 3, label: 'Medel', color: '#8b5cf6' }
  if (mastery >= 20) return { tier: 2, label: 'Grundläggande', color: '#3b82f6' }
  return { tier: 1, label: 'Nybörjare', color: '#6b7280' }
}

// FÄRDIGHETER — minuter per vecka snitt
export function getSkillTier(minutesPerWeek) {
  if (!minutesPerWeek || minutesPerWeek === 0) return { tier: 0, label: 'Inaktiv', color: '#374151' }
  if (minutesPerWeek >= 240) return { tier: 6, label: 'Mästare', color: '#f59e0b' }
  if (minutesPerWeek >= 120) return { tier: 5, label: 'Seriös', color: '#ec4899' }
  if (minutesPerWeek >= 60) return { tier: 4, label: 'Dedikerad', color: '#06b6d4' }
  if (minutesPerWeek >= 30) return { tier: 3, label: 'Regelbunden', color: '#10b981' }
  return { tier: 2, label: 'Nybörjare', color: '#3b82f6' }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
export function formatRunTime(seconds) {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
  return m + ':' + String(s).padStart(2, '0')
}

export function estimateVO2max(fiveKTimeSec) {
  if (!fiveKTimeSec) return null
  const minutesPer1609m = (fiveKTimeSec / 60) * (1609.344 / 5000)
  return Math.round(3.5 + (1609.344 / minutesPer1609m) * 0.1141)
}

export function calc1RM(weight, reps) {
  if (!weight || !reps) return null
  return Math.round(weight * (1 + reps / 30))
}

// Beräkna genomsnittstier för alla kategorier (returnerar 1-8)
export function calcOverallTier(tierResults) {
  const valid = tierResults.filter(t => t && t.tier)
  if (!valid.length) return null
  const avg = valid.reduce((sum, t) => sum + t.tier, 0) / valid.length
  return Math.round(avg)
}

export const TIER_NAMES = ['', 'Botten 50%', 'Top 50%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 2.5%', 'Top 1%']
export const TIER_COLORS = ['', '#6b7280', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#06b6d4', '#ec4899', '#f59e0b']
