// ============================================================================
// Signals — deterministic "risker och signaler" (Insights page subtitle).
// ----------------------------------------------------------------------------
// Things worth acting on THIS week, computed from the user's own recent data.
// No AI. Each signal has a severity, a concrete detail, and one action.
// Positive signals count too — the point is to steer, not just to nag.
//
// Pure: takes the data, returns the signals. Insights and the Jarvis context
// both feed it what they already have.
// ============================================================================

const DAY = 86400000
// Local calendar date of a Date — NOT toISOString(), which is UTC and flips a
// day late in the evening for anyone east of UTC.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)
const r1 = (x) => Math.round(x * 10) / 10

// Whole days from date-string `aStr` to Date `b`, both taken at local midnight.
function daysBetween(aStr, b) {
  return Math.round((b - new Date(aStr + 'T00:00:00')) / DAY)
}

export function detectSignals({
  health = [],
  training = [],
  exams = [],
  courses = [],
  studySessions = [],
  goals = {},
  today = new Date(),
} = {}) {
  const out = []
  const t0 = new Date(iso(today) + 'T00:00:00')
  const within = (dateStr, days) => {
    const n = daysBetween(dateStr, t0)
    return n >= 0 && n < days
  }

  // ── SLEEP ─────────────────────────────────────────────────────────────────
  const sleep7 = health.filter((h) => h.sleep_hours > 0 && within(h.date, 7)).map((h) => h.sleep_hours)
  if (sleep7.length >= 4) {
    const avg = mean(sleep7)
    if (avg < 6.5) {
      out.push({
        id: 'sleep-deficit', severity: 'warn', domain: 'somn',
        headline: 'Sömnunderskott den här veckan',
        detail: `Snittsömn ${r1(avg)}h senaste ${sleep7.length} nätterna. Under 6.5h drar ner energi, träning och humör.`,
        action: 'Sikta 7h denna vecka – lägg dig 30 min tidigare de närmaste kvällarna.',
      })
    } else if (avg >= 7.3 && sleep7.length >= 5) {
      out.push({
        id: 'sleep-strong', severity: 'good', domain: 'somn',
        headline: 'Sömnen ligger bra',
        detail: `Snittsömn ${r1(avg)}h senaste ${sleep7.length} nätterna.`,
        action: 'Håll rytmen – det här är grunden för allt annat.',
      })
    }
  }

  // ── TRAINING GAP / CONSISTENCY ────────────────────────────────────────────
  const trainDates = [...new Set(training.map((s) => s.date))].sort()
  if (trainDates.length >= 3) {
    const last = trainDates[trainDates.length - 1]
    const sinceLast = daysBetween(last, t0)
    // median gap over the last ~10 sessions
    const recent = trainDates.slice(-11)
    const gaps = []
    for (let i = 1; i < recent.length; i++) gaps.push(daysBetween(recent[i - 1], new Date(recent[i] + 'T00:00:00')))
    gaps.sort((a, b) => a - b)
    const medGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 3
    const last7 = trainDates.filter((d) => within(d, 7)).length
    if (sinceLast >= Math.max(7, medGap * 2 + 1)) {
      out.push({
        id: 'training-gap', severity: 'warn', domain: 'traning',
        headline: 'Träningsuppehåll',
        detail: `${sinceLast} dagar sedan senaste passet. Din vanliga takt är ~${medGap === 0 ? 1 : Math.round(7 / medGap)} pass/vecka.`,
        action: 'Boka in ett kort pass idag eller imorgon – tröskeln sänks när du bara kommer igång.',
      })
    } else if (last7 >= 3) {
      out.push({
        id: 'training-consistent', severity: 'good', domain: 'traning',
        headline: 'Bra träningsvecka',
        detail: `${last7} pass senaste 7 dagarna.`,
        action: 'Se till att sömnen och kalorierna hänger med volymen.',
      })
    }
  }

  // ── EXAM READINESS ────────────────────────────────────────────────────────
  const courseName = Object.fromEntries((courses || []).map((c) => [c.id, c.name]))
  const studyByCourse14 = {}
  for (const s of studySessions || []) {
    if (!within(s.date, 14)) continue
    studyByCourse14[s.course_id] = (studyByCourse14[s.course_id] || 0) + (s.hours || 0)
  }
  for (const e of exams || []) {
    if (!e.exam_date) continue
    const d = daysBetween(e.exam_date, t0) * -1 // days until (positive = future)
    if (d < 0 || d > 21) continue
    const h = studyByCourse14[e.course_id] || 0
    if (h < 3) {
      out.push({
        id: `exam-${e.course_id || e.name}`, severity: d <= 10 ? 'warn' : 'info', domain: 'plugg',
        headline: `Tenta om ${d}d: ${courseName[e.course_id] || e.name}`,
        detail: `${h === 0 ? 'Inga' : r1(h) + 'h'} loggade pluggtimmar på kursen senaste 14 dagarna.`,
        action: d <= 10 ? 'Blocka djupplugg i kalendern nu – börja med det svåraste området.' : 'Lägg in första pluggpasset denna vecka så du inte hamnar efter.',
      })
    }
  }

  // ── LOGGING GAP (data quality) ────────────────────────────────────────────
  const lastHealth = health.map((h) => h.date).sort().pop()
  if (lastHealth) {
    const gap = daysBetween(lastHealth, t0)
    if (gap >= 3) {
      out.push({
        id: 'logging-gap', severity: 'info', domain: 'halsa',
        headline: 'Hälsologgen har en lucka',
        detail: `${gap} dagar sedan senaste hälsologgen. Insikterna blir bara så bra som datan.`,
        action: 'Logga vikt/sömn för de senaste dagarna, eller sätt upp Apple Health-synken.',
      })
    }
  }

  // ── NICOTINE SLIP ─────────────────────────────────────────────────────────
  const nic7 = health.filter((h) => within(h.date, 7) && h.nicotine === true).length
  const nicPrev7 = health.filter((h) => {
    const n = daysBetween(h.date, t0)
    return n >= 7 && n < 14 && h.nicotine === true
  }).length
  if (nic7 >= 3 && nic7 >= nicPrev7 + 2) {
    out.push({
      id: 'nicotine-slip', severity: 'warn', domain: 'halsa',
      headline: 'Nikotinet är på uppgång',
      detail: `Nikotin ${nic7} av senaste 7 dagarna (${nicPrev7} veckan innan).`,
      action: 'Sätt ett konkret tak för veckan och logga varje dag – synligheten hjälper.',
    })
  }

  // ── WEIGHT vs GOAL ────────────────────────────────────────────────────────
  const goalW = parseFloat(goals?.body_weight_goal ?? goals?.target_weight ?? goals?.body_weight ?? '')
  const wRows = health.filter((h) => h.weight_kg > 0).sort((a, b) => a.date.localeCompare(b.date))
  if (Number.isFinite(goalW) && wRows.length >= 4) {
    const latest = wRows[wRows.length - 1].weight_kg
    const monthAgo = wRows.filter((h) => daysBetween(h.date, t0) >= 21)
    const past = monthAgo.length ? monthAgo[monthAgo.length - 1].weight_kg : wRows[0].weight_kg
    const slope = latest - past
    const wantDown = goalW < latest - 0.3
    const dl = goals?.body_weight_deadline
    const dlPast = dl && new Date(dl) < t0
    if (wantDown && slope >= -0.2) {
      out.push({
        id: 'weight-stall', severity: 'info', domain: 'halsa',
        headline: dlPast ? 'Viktmålet: deadline passerad, vikten står still' : 'Vikten rör sig inte mot målet',
        detail: `Nu ${r1(latest)} kg, mål ${goalW} kg${dl ? ` (deadline ${dl})` : ''}. Senaste 3 veckorna: ${slope >= 0 ? '+' : ''}${r1(slope)} kg.`,
        action: 'Antingen skärp underskottet lite, eller flytta målet – ett mål utan rörelse tär mest på motivationen.',
      })
    }
  }

  // severity order: warn first, then info, then good
  const rank = { warn: 0, info: 1, good: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity])
}

// Compact text for the Jarvis context.
export function signalsToPrompt(signals) {
  if (!signals.length) return ''
  return 'SIGNALER (uträknade, denna vecka):\n' +
    signals.map((s) => `- [${s.severity}] ${s.headline}. ${s.detail} → ${s.action}`).join('\n')
}
