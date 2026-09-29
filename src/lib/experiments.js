// ============================================================================
// Experiments — personal n-of-1 tests (post_deploy_24).
// ----------------------------------------------------------------------------
// Correlations (correlate.js) say what tends to go together; an experiment
// says what happens when YOU change one thing. The user picks a lever
// ("sov ≥ 7 h", "ingen alkohol") and an outcome ("energi"); the outcome during
// the experiment is compared with the same-length window right before it.
//
// Honest by construction: every verdict carries n per window, data coverage,
// adherence to the lever and a permutation-test p-value; with too little data
// it says so instead of guessing. No AI. Pure — takes rows, returns results;
// fetchExperimentDays() takes the supabase client as a parameter (runs in the
// browser and in the server bundle alike).
// ============================================================================

// zeroFill: a day with nothing logged counts as 0 (activity metrics — no
// study logged = 0 h studied). Otherwise only logged days count (state
// metrics — no sleep logged ≠ 0 h sleep).
export const EXPERIMENT_METRICS = {
  sleep:   { label: 'Sömn',          unit: 'h',        dec: 1, zeroFill: false },
  energy:  { label: 'Energi',        unit: '/10',      dec: 1, zeroFill: false },
  mood:    { label: 'Humör',         unit: '/10',      dec: 1, zeroFill: false },
  steps:   { label: 'Steg',          unit: 'steg',     dec: 0, zeroFill: false },
  weight:  { label: 'Vikt',          unit: 'kg',       dec: 1, zeroFill: false },
  alcohol: { label: 'Alkohol',       unit: 'enheter',  dec: 1, zeroFill: false },
  study:   { label: 'Pluggtimmar',   unit: 'h/dag',    dec: 1, zeroFill: true },
  train:   { label: 'Träningspass',  unit: 'pass/dag', dec: 2, zeroFill: true },
  skill:   { label: 'Färdighetstid', unit: 'min/dag',  dec: 0, zeroFill: true },
  paHours: { label: 'PA-timmar',     unit: 'h/dag',    dec: 1, zeroFill: true },
}

// One-click starting points. Levers are things you control; outcomes are
// things you want to move.
export const EXPERIMENT_TEMPLATES = [
  { title: 'Sov minst 7 timmar', hypothesis: 'Mer sömn ger mer energi dagen efter.', outcome_metric: 'energy', direction: 'up', lever_metric: 'sleep', lever_op: '>=', lever_target: 7 },
  { title: 'Ingen alkohol', hypothesis: 'Utan alkohol sover jag längre.', outcome_metric: 'sleep', direction: 'up', lever_metric: 'alcohol', lever_op: '<=', lever_target: 0 },
  { title: '8 000 steg om dagen', hypothesis: 'Mer rörelse ger bättre humör.', outcome_metric: 'mood', direction: 'up', lever_metric: 'steps', lever_op: '>=', lever_target: 8000 },
  { title: 'Plugga varje dag', hypothesis: 'Daglig plugg (≥ 1 h) höjer totalen utan att sömnen blir sämre.', outcome_metric: 'study', direction: 'up', lever_metric: 'study', lever_op: '>=', lever_target: 1 },
  { title: 'Sömn före träning', hypothesis: '7 h+ sömn gör att jag faktiskt tränar oftare.', outcome_metric: 'train', direction: 'up', lever_metric: 'sleep', lever_op: '>=', lever_target: 7 },
]

// ── dates (ISO yyyy-mm-dd, calendar arithmetic at UTC noon — TZ-safe) ────────
export const addDaysISO = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)
const round = (x, dec = 1) => (x == null ? null : Math.round(x * 10 ** dec) / 10 ** dec)

// ── daily series ──────────────────────────────────────────────────────────────
// Merge the raw logs into { [date]: { sleep, energy, mood, steps, weight,
// alcohol, study, train, skill, paHours } }. Journal wins for sleep/energy/
// mood (same precedence as the Jarvis context), health_logs fills the gaps.
export function buildDailySeries({ health = [], journal = [], study = [], training = [], skills = [], pa = [] } = {}) {
  const days = {}
  const touch = (d) => (days[d] || (days[d] = {}))
  for (const e of journal) {
    const r = touch(e.date)
    if (e.sleep_hours > 0) r.sleep = Number(e.sleep_hours)
    if (e.energy > 0) r.energy = Number(e.energy)
    if (e.mood > 0) r.mood = Number(e.mood)
  }
  for (const l of health) {
    const r = touch(l.date)
    const en = l.energy_level ?? l.energy
    if (l.sleep_hours > 0 && r.sleep == null) r.sleep = Number(l.sleep_hours)
    if (en > 0 && r.energy == null) r.energy = Number(en)
    if (l.mood > 0 && r.mood == null) r.mood = Number(l.mood)
    if (l.steps > 0) r.steps = Number(l.steps)
    if (l.weight_kg > 0) r.weight = Number(l.weight_kg)
    if (l.alcohol_units != null) r.alcohol = Number(l.alcohol_units)
  }
  for (const s of study) { const r = touch(s.date); r.study = (r.study || 0) + (Number(s.hours) || 0) }
  for (const t of training) { const r = touch(t.date); r.train = (r.train || 0) + 1 }
  for (const s of skills) { const r = touch(s.date); r.skill = (r.skill || 0) + (Number(s.minutes) || 0) }
  for (const p of pa) { const r = touch(p.date); r.paHours = (r.paHours || 0) + (Number(p.hours_worked) || 0) }
  return days
}

export async function fetchExperimentDays(supabase, userId, fromISO, toISO) {
  const q = (table, cols) => supabase.from(table).select(cols).eq('user_id', userId).gte('date', fromISO).lte('date', toISO)
  const [h, j, st, tr, sk, pa] = await Promise.all([
    q('health_logs', 'date,sleep_hours,energy,energy_level,mood,steps,weight_kg,alcohol_units'),
    q('journal_entries', 'date,sleep_hours,energy,mood'),
    q('study_sessions', 'date,hours'),
    q('training_sessions', 'date'),
    q('skill_logs', 'date,minutes'),
    q('pa_shifts', 'date,hours_worked'),
  ])
  return buildDailySeries({ health: h.data || [], journal: j.data || [], study: st.data || [], training: tr.data || [], skills: sk.data || [], pa: pa.data || [] })
}

// Earliest date any of these experiments needs (for one combined fetch).
export function experimentsFetchStart(experiments) {
  const starts = (experiments || []).map((e) => addDaysISO(e.start_date, -(e.baseline_days || 14)))
  return starts.length ? starts.sort()[0] : null
}

// ── statistics ────────────────────────────────────────────────────────────────
// Two-sided permutation test on the difference of means. Deterministic RNG so
// the same data always gives the same verdict (no flicker between reloads).
function permutationP(a, b, iterations = 2000) {
  const observed = Math.abs(mean(b) - mean(a))
  const pool = [...a, ...b]
  let seed = 1234567
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  let extreme = 0
  for (let i = 0; i < iterations; i++) {
    for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]] }
    const d = Math.abs(mean(pool.slice(a.length)) - mean(pool.slice(0, a.length)))
    if (d >= observed - 1e-12) extreme++
  }
  return (extreme + 1) / (iterations + 1)
}

function windowValues(days, metric, from, to) {
  const def = EXPERIMENT_METRICS[metric]
  const out = []
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const v = days[d]?.[metric]
    if (v != null) out.push(v)
    else if (def?.zeroFill) out.push(0)
  }
  return out
}

const MIN_N = 5

/**
 * Evaluate one experiment against a daily series.
 * @returns {
 *   phase: 'upcoming'|'running'|'done', dayIndex, windows,
 *   baseline:{mean,n,coverage}, during:{mean,n,coverage},
 *   delta, pct, p, adherence:{rate,n}|null,
 *   verdict: 'insufficient'|'improved'|'worsened'|'no_effect'|'interim',
 *   verdictLabel, summary
 * }
 */
export function evaluateExperiment(exp, days, today = new Date()) {
  const def = EXPERIMENT_METRICS[exp.outcome_metric]
  const todayISO = localISO(today)
  const duration = exp.duration_days || 14
  const baselineDays = exp.baseline_days || 14
  const start = exp.start_date
  const end = addDaysISO(start, duration - 1)
  const baseFrom = addDaysISO(start, -baselineDays), baseTo = addDaysISO(start, -1)
  const lastDay = exp.status === 'active' ? (todayISO < end ? todayISO : end) : (exp.ended_at ? [end, localISO(new Date(exp.ended_at))].sort()[0] : end)
  const phase = todayISO < start ? 'upcoming' : (exp.status === 'active' && todayISO < end ? 'running' : 'done')
  const dayIndex = phase === 'upcoming' ? 0 : Math.min(duration, Math.round((new Date(lastDay + 'T12:00:00Z') - new Date(start + 'T12:00:00Z')) / 86400000) + 1)

  const a = windowValues(days, exp.outcome_metric, baseFrom, baseTo)
  const b = phase === 'upcoming' ? [] : windowValues(days, exp.outcome_metric, start, lastDay)
  const mA = mean(a), mB = mean(b)
  const delta = mA != null && mB != null ? mB - mA : null
  const pct = delta != null && mA ? (delta / Math.abs(mA)) * 100 : null
  const enough = a.length >= MIN_N && b.length >= MIN_N
  const p = enough && delta !== 0 ? permutationP(a, b) : (enough ? 1 : null)

  let adherence = null
  if (exp.lever_metric && exp.lever_op && exp.lever_target != null && phase !== 'upcoming') {
    const lv = windowValues(days, exp.lever_metric, start, lastDay)
    const ok = lv.filter((v) => (exp.lever_op === '>=' ? v >= Number(exp.lever_target) : v <= Number(exp.lever_target))).length
    adherence = { rate: lv.length ? ok / lv.length : null, n: lv.length, days: dayIndex }
  }

  const wanted = exp.direction === 'down' ? -1 : 1
  let verdict
  if (phase === 'upcoming') verdict = 'upcoming'
  else if (!enough) verdict = phase === 'running' ? 'interim' : 'insufficient'
  else if (phase === 'running') verdict = 'interim'
  else if (p < 0.1 && Math.sign(delta) === wanted) verdict = 'improved'
  else if (p < 0.1 && Math.sign(delta) === -wanted) verdict = 'worsened'
  else verdict = 'no_effect'

  const unit = def?.unit || ''
  const fmt = (v) => (v == null ? '—' : `${round(v, def?.dec ?? 1).toLocaleString('sv-SE')}${unit.startsWith('/') ? '' : ' '}${unit}`.trim())
  const sign = delta == null ? '' : delta > 0 ? '+' : ''
  const LABELS = {
    upcoming: 'Startar snart',
    interim: enough ? 'Pågår – preliminärt' : 'Pågår – samlar data',
    insufficient: 'För lite data',
    improved: 'Tydlig förbättring',
    worsened: 'Tydlig försämring',
    no_effect: 'Ingen säker effekt',
  }
  const lowAdherence = adherence?.rate != null && adherence.rate < 0.6
  const parts = [`${def?.label || exp.outcome_metric}: ${fmt(mA)} före → ${fmt(mB)} under (${sign}${fmt(delta)}${pct != null ? `, ${sign}${Math.round(pct).toLocaleString('sv-SE')}%` : ''})`,
    `n=${a.length}+${b.length}`]
  if (p != null && enough) parts.push(`p≈${p < 0.01 ? '<0.01' : round(p, 2)}`)
  if (adherence?.rate != null) parts.push(`följsamhet ${Math.round(adherence.rate * 100)}% (${adherence.n} dagar med data)`)
  if (lowAdherence) parts.push('låg följsamhet – säger lite om hypotesen')
  if (!enough && phase !== 'upcoming') parts.push(`behöver ≥${MIN_N} loggade dagar i båda perioderna`)

  return {
    phase, dayIndex, duration,
    windows: { baseline: [baseFrom, baseTo], during: [start, end] },
    baseline: { mean: mA, n: a.length, coverage: a.length / baselineDays },
    during: { mean: mB, n: b.length, coverage: dayIndex ? b.length / dayIndex : 0 },
    delta, pct, p, adherence, lowAdherence,
    verdict, verdictLabel: LABELS[verdict], summary: parts.join(' · '),
    fmt,
  }
}

// Compact lines for the Jarvis NU context.
export function experimentsToPrompt(experiments, days, today = new Date()) {
  const rows = (experiments || []).filter((e) => e.status === 'active' || (e.ended_at && (today - new Date(e.ended_at)) < 14 * 86400000))
  if (!rows.length) return ''
  return 'EXPERIMENT (användarens egna n-of-1-tester – följ upp, uppmuntra följsamhet, tolka ärligt):\n' + rows.map((e) => {
    const r = evaluateExperiment(e, days, today)
    const lever = e.lever_metric ? ` [hävstång: ${EXPERIMENT_METRICS[e.lever_metric]?.label || e.lever_metric} ${e.lever_op} ${e.lever_target}]` : ''
    return `- "${e.title}"${lever} dag ${r.dayIndex}/${r.duration} · ${r.verdictLabel} · ${r.summary}`
  }).join('\n')
}
