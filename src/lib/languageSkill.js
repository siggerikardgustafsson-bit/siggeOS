// ============================================================================
// Language skill scoring — shared between Dashboard.jsx (Färdigheter tier)
// and Plugg's Språk tab (stats display), so both always agree.
//
// Two real, never-estimated signals feed everything here: Anki cards reviewed
// (skill_logs.cards, written by the skill-ingest auto-sync) and logged CI
// minutes (comprehensible input — activity_type 'ci', or legacy unlabeled
// rows; explicitly NOT 'anki' rows that happen to have no card count). A row
// contributes to ONE bucket only — cards if set, else CI minutes — so nothing
// is double-counted.
//
// v2 (user call 2026-09-11) — replaces the v1 decaying-XP tier ("counts
// everything, loses points if you stop") with a THREE-GATE model, because a
// single blended number let raw card volume paper over a total absence of
// listening/reading practice, and decay made no sense for "have I actually
// learned 8000 words" (spaced repetition already handles retention; forgetting
// isn't the same axis as "have I been exposed to this word before"). The tier
// is now the WEAKEST of three gates — cards, CI, and recent consistency each
// have to clear the bar independently:
//
//   1. Cumulative lifetime CARDS (never decreases) — a rough proxy for
//      vocabulary exposure. Anchored to vocabulary-size research correlating
//      word-family counts with CEFR levels (Nation et al.): ~1000 words is a
//      beginner floor, ~8000-9000 word families is the commonly-cited
//      threshold for understanding "almost everything" (C1/C2, i.e. fluent —
//      hence the top tier's label and the ~8000-card ceiling below). Anki
//      cards ≠ unique words 1:1 (a deck can drill one word from several
//      angles), so this is a proxy, not a word count — the ladder is deliber-
//      ately conservative about that gap rather than precise about it.
//   2. Cumulative lifetime CI hours — immersion/input-based acquisition
//      research (the "input hypothesis" tradition, and the ~1000-hour rule of
//      thumb common in immersion-learning communities) puts several hundred
//      to ~1000 hours of real comprehensible input around the point where
//      native content becomes genuinely followable. Vocabulary drilling alone
//      does not make someone fluent — this is why CI is its own gate, not
//      folded into the cards number.
//   3. RECENT consistency — active practice days (cards OR CI) in the
//      trailing 28 days. A large lifetime total with zero recent activity
//      caps you here, not at the cards/CI tier — "flytande" should mean
//      currently fluent, not "was fluent once."
//
// languageBlend() stays as the rolling-weekly DISPLAY breakdown ("X kort/v ·
// Y min/v") — informational only, doesn't drive the tier (same as before).
// ============================================================================
export const CARDS_TARGET_PER_WEEK = 700   // ≈100 cards/day — for the weekly display blend only
export const MINUTES_TARGET_PER_WEEK = 240 // matches the old T6 weekly-minutes threshold — display only
export const LANGUAGE_SKILLS = ['spanish', 'serbian', 'german']
export const LANGUAGE_LABELS = { spanish: 'Spanska', serbian: 'Serbiska', german: 'Tyska' }

// Tier 2..6 thresholds (index 0 → tier 2, … index 4 → tier 6). See header for
// the evidence basis. User-anchored: tier 2 = 1000 cards + 15h CI (their own
// example); tier 6 = ~8000 cards ("flytande").
export const CARDS_THRESHOLDS = [1000, 2500, 4500, 6500, 8000]     // cumulative lifetime cards
export const CI_HOURS_THRESHOLDS = [15, 50, 150, 400, 900]         // cumulative lifetime CI hours
export const CONSISTENCY_DAY_THRESHOLDS = [2, 6, 10, 16, 22]       // active days in trailing 28

const TIER_LABELS = ['Inaktiv', 'Har börjat', 'Nybörjare', 'Regelbunden', 'Dedikerad', 'Seriös', 'Flytande']
const TIER_COLORS = ['#374151', '#4b5563', '#3b82f6', '#10b981', '#06b6d4', '#ec4899', '#f59e0b']
const GATE_LABELS = { cards: 'kort', ci: 'CI', consistency: 'regelbundenhet' }

function daysAgoISO(n) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// rows: skill_logs rows for any skill, any window ≥ `weeks` — self-scopes to
// the trailing `weeks` so callers can pass a wider (even lifetime) fetch
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

// Cumulative lifetime cards — every row where an Anki sync/log set `cards`.
export function totalCards(rows, skill) {
  return (rows || []).filter(r => r.skill === skill && r.cards != null).reduce((s, r) => s + Number(r.cards || 0), 0)
}

// Cumulative lifetime CI minutes — rows with no card count, EXCLUDING legacy
// activity_type:'anki' minutes-only rows (that's Anki time, not input time).
export function totalCIMinutes(rows, skill) {
  return (rows || [])
    .filter(r => r.skill === skill && r.cards == null && r.activity_type !== 'anki')
    .reduce((s, r) => s + Number(r.minutes || 0), 0)
}

// Days with ANY logged activity (cards or CI) for this skill in the trailing
// `days` window — the "are you currently doing this" consistency signal.
export function activeDaysCount(rows, skill, days = 28) {
  const cutoff = daysAgoISO(days)
  const dates = new Set(
    (rows || [])
      .filter(r => r.skill === skill && r.date >= cutoff && (Number(r.cards) > 0 || Number(r.minutes) > 0))
      .map(r => r.date)
  )
  return dates.size
}

function ladderTier(value, thresholds) {
  let tier = 1
  for (let i = 0; i < thresholds.length; i++) if (value >= thresholds[i]) tier = i + 2
  return tier
}

// The tier source (v2, user call 2026-09-11) — weakest of 3 gates. `rows` can
// be any window; totals/consistency self-scope internally (lifetime for
// totals, trailing 28d for consistency) regardless of how wide the fetch was.
export function languageTier(rows, skill) {
  const cardsTotal = totalCards(rows, skill)
  const ciMinutesTotal = totalCIMinutes(rows, skill)
  const ciHoursTotal = Math.round((ciMinutesTotal / 60) * 10) / 10
  const activeDays = activeDaysCount(rows, skill, 28)

  if (!cardsTotal && !ciMinutesTotal) {
    return { tier: 0, label: TIER_LABELS[0], color: TIER_COLORS[0], cardsTotal: 0, ciHoursTotal: 0, activeDays: 0,
      cardsTier: 0, ciTier: 0, consistencyTier: 0, bottleneck: null }
  }
  const cardsTier = ladderTier(cardsTotal, CARDS_THRESHOLDS)
  const ciTier = ladderTier(ciHoursTotal, CI_HOURS_THRESHOLDS)
  const consistencyTier = ladderTier(activeDays, CONSISTENCY_DAY_THRESHOLDS)
  const tier = Math.min(cardsTier, ciTier, consistencyTier)
  const gates = [['cards', cardsTier], ['ci', ciTier], ['consistency', consistencyTier]]
  const bottleneckKey = gates.find(([, t]) => t === tier)?.[0] || null
  return {
    tier, label: TIER_LABELS[tier], color: TIER_COLORS[tier],
    cardsTotal, ciHoursTotal, activeDays, cardsTier, ciTier, consistencyTier,
    bottleneck: bottleneckKey ? GATE_LABELS[bottleneckKey] : null,
  }
}
