// ============================================================================
// Language skill scoring — shared between Dashboard.jsx (Färdigheter tier)
// and Plugg's Språk tab (stats display), so both always agree.
//
// Two real, never-estimated signals feed everything here: Anki cards reviewed
// (skill_logs.cards, written by the skill-ingest auto-sync) and logged
// non-Anki minutes (CI or "Allmänt"). A row contributes to ONE bucket only —
// cards if set, else minutes — so nothing is double-counted.
//
// languageBlend() — a rolling weekly average, for the honest "X kort/v · Y
//   min/v" DISPLAY breakdown only. Not the tier source (see below).
// languageXP()/xpTier() — the actual TIER source (user call 2026-09-11): a
//   decaying point total since you started, not a plain weekly snapshot —
//   "counts everything, but you lose it if you don't keep the routine up".
//   Every day's cards+CI minutes convert to XP (using the same cards:minutes
//   ratio as the weekly targets below, so the two stay calibrated against
//   each other) and get added to a running total that decays by half every
//   XP_HALF_LIFE_DAYS of complete inactivity (leaky-bucket / exponentially-
//   weighted sum — the standard shape for "recent sustained effort", just
//   with a much longer memory than the 7-90d windows every other category in
//   the app uses). XP_THRESHOLDS are DERIVED, not guessed: the steady-state
//   XP a language reaches if practiced exactly at each weekly minute target
//   forever, under that decay rate — so a nonstop Mästare-pace routine tops
//   out right at the Mästare threshold, not below or wildly above it.
// ============================================================================
export const CARDS_TARGET_PER_WEEK = 700   // ≈100 cards/day — a starting guess, tune once real data exists
export const MINUTES_TARGET_PER_WEEK = 240 // matches the old T6 ("Mästare") weekly-minutes threshold
export const LANGUAGE_SKILLS = ['spanish', 'serbian', 'german']
export const LANGUAGE_LABELS = { spanish: 'Spanska', serbian: 'Serbiska', german: 'Tyska' }

export const XP_HALF_LIFE_DAYS = 14  // user call — a 2-week total pause halves your points
export const XP_LOOKBACK_DAYS = 90   // 90/14 ≈ 6.4 half-lives — anything older is <1% of its original weight, safe to ignore
// t3..t6 = steady-state XP at the old weekly targets (30/60/120/240 min/week)
// under XP_HALF_LIFE_DAYS decay: steady = (weeklyTarget/7) / (1 - 0.5^(1/14)).
export const XP_THRESHOLDS = { t3: 90, t4: 175, t5: 350, t6: 700 }

function daysAgoISO(n) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// rows: skill_logs rows for any skill, any window ≥ `weeks` — self-scopes to
// the trailing `weeks` so callers can pass a wider fetch (XP needs ~90d)
// without skewing this average.
export function languageBlend(rows, skill, weeks = 4) {
  const cutoff = daysAgoISO(weeks * 7)
  const l = (rows || []).filter(r => r.skill === skill && r.date >= cutoff)
  const cardsWeek = Math.round(l.filter(r => r.cards != null).reduce((s, r) => s + Number(r.cards || 0), 0) / weeks)
  const minutesWeek = Math.round(l.filter(r => r.cards == null).reduce((s, r) => s + Number(r.minutes || 0), 0) / weeks)
  if (!cardsWeek && !minutesWeek) return { effective: 0, cardsWeek: 0, minutesWeek: 0 }
  const parts = []
  if (cardsWeek > 0) parts.push(Math.min(1, cardsWeek / CARDS_TARGET_PER_WEEK))
  if (minutesWeek > 0) parts.push(Math.min(1, minutesWeek / MINUTES_TARGET_PER_WEEK))
  const blended = parts.reduce((a, b) => a + b, 0) / parts.length
  return { effective: Math.round(blended * MINUTES_TARGET_PER_WEEK), cardsWeek, minutesWeek }
}

// Honest display string — real numbers, not the blended tier-input.
export function languageLabel(b) {
  const parts = []
  if (b?.cardsWeek > 0) parts.push(`${b.cardsWeek} kort/v`)
  if (b?.minutesWeek > 0) parts.push(`${b.minutesWeek} min/v`)
  return parts.length ? parts.join(' · ') : '—'
}

// Decaying point total. Self-scopes to XP_LOOKBACK_DAYS regardless of how
// wide a window `rows` was fetched with.
export function languageXP(rows, skill, halfLifeDays = XP_HALF_LIFE_DAYS) {
  const cutoff = daysAgoISO(XP_LOOKBACK_DAYS)
  const l = (rows || []).filter(r => r.skill === skill && r.date >= cutoff)
  if (!l.length) return 0
  const cardXpRate = MINUTES_TARGET_PER_WEEK / CARDS_TARGET_PER_WEEK // 1 card ≈ this many XP, same ratio as the weekly targets
  const byDay = {}
  for (const r of l) {
    const earned = r.cards != null ? Number(r.cards || 0) * cardXpRate : Number(r.minutes || 0)
    if (earned > 0) byDay[r.date] = (byDay[r.date] || 0) + earned
  }
  const dates = Object.keys(byDay).sort()
  if (!dates.length) return 0
  const decay = Math.pow(0.5, 1 / halfLifeDays)
  let xp = 0
  const cursor = new Date(dates[0] + 'T00:00:00Z')
  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10)
    xp = xp * decay + (byDay[key] || 0)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return Math.round(xp)
}

export function xpTier(xp) {
  if (!xp) return { tier: 0, label: 'Inaktiv', color: '#374151' }
  if (xp >= XP_THRESHOLDS.t6) return { tier: 6, label: 'Mästare', color: '#f59e0b' }
  if (xp >= XP_THRESHOLDS.t5) return { tier: 5, label: 'Seriös', color: '#ec4899' }
  if (xp >= XP_THRESHOLDS.t4) return { tier: 4, label: 'Dedikerad', color: '#06b6d4' }
  if (xp >= XP_THRESHOLDS.t3) return { tier: 3, label: 'Regelbunden', color: '#10b981' }
  return { tier: 2, label: 'Nybörjare', color: '#3b82f6' }
}

// XP needed to reach `tier` (for progress bars / "N XP kvar till nästa tier").
export function xpForTier(tier) {
  if (tier >= 6) return XP_THRESHOLDS.t6
  if (tier === 5) return XP_THRESHOLDS.t5
  if (tier === 4) return XP_THRESHOLDS.t4
  return XP_THRESHOLDS.t3
}
