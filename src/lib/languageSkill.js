// ============================================================================
// Language skill scoring — shared between Dashboard.jsx (Färdigheter tier)
// and Plugg's Språk tab (stats display), so both always agree.
//
// Blends two real, never-estimated signals into one "effective minutes/week"
// fed to the existing getSkillTier() ladder (tierUtils.js): Anki cards
// reviewed (skill_logs.cards, written by the skill-ingest auto-sync) and
// logged non-Anki minutes (CI or "Allmänt"). A row contributes to ONE bucket
// only — cards if set, else minutes — so nothing is double-counted. When only
// one bucket has data the blend reduces to exactly that bucket (no behaviour
// change for a minutes-only history). User call 2026-09-11: combine cards +
// CI into "the whole picture", don't replace minutes with cards.
// ============================================================================
export const CARDS_TARGET_PER_WEEK = 700   // ≈100 cards/day — a starting guess, tune once real data exists
export const MINUTES_TARGET_PER_WEEK = 240 // matches getSkillTier's own T6 ("Mästare") threshold
export const LANGUAGE_SKILLS = ['spanish', 'serbian', 'german']
export const LANGUAGE_LABELS = { spanish: 'Spanska', serbian: 'Serbiska', german: 'Tyska' }

// rows: skill_logs rows for any skill, over some window. `weeks` converts
// that window into a weekly average — Dashboard fetches 30d (~4 weeks).
export function languageBlend(rows, skill, weeks = 4) {
  const l = (rows || []).filter(r => r.skill === skill)
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
