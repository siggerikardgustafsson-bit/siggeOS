import { differenceInDays, parseISO } from 'date-fns'

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

// SÖMN — duration (timmar), higher is better.
// [T2..T8] — a strict ladder. The old table repeated 8.5 at T6/T7, which made
// T6 unreachable and jumped 8.5h straight from T5 to T7.
export const SLEEP_DURATION_THRESHOLDS = [6.5, 7, 7.25, 7.5, 8, 8.5, 9]
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

// Canonical tier palette. Numeric keys so `TIER_COLORS[n]` works exactly like
// the old array. This used to exist as six drifting local copies across the
// dashboard components (AUDIT.md P2-9) — import from here, never re-declare.
export const TIER_COLORS = {
  0: 'rgba(255,255,255,0.18)',
  1: 'rgba(255,255,255,0.75)',
  2: '#4f8ef7',
  3: '#a78bfa',
  4: '#fbbf24',
  5: '#34d399',
  6: '#22d3ee',
  7: '#f472b6',
  8: '#fbbf24',
}

// SVG path per category icon — also previously duplicated across three files
// with divergent key sets (AUDIT.md P2-9). This is the superset.
export const CAT_PATHS = {
  kondition: 'M13 10V3L4 14h7v7l9-11h-7z',
  styrka: 'M6 4v16M18 4v16M3 8h4m10 0h4M3 16h4m10 0h4',
  kropp: 'M12 3a4 4 0 100 8 4 4 0 000-8zM6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2',
  somn: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
  plugg: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  ekonomi: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  halsa: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  valmående: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  maxx: 'M13 2L3 14h7l-1 8 12-14h-7l-1-6z',
  fardigheter: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
}
