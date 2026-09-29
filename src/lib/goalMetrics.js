import { supabase } from './supabase'
import { fribeloppAmount } from './csn'

// ============================================================================
// Goal metrics — maps a goal's `metric` key to its live current value.
// ----------------------------------------------------------------------------
// A goal with `metric` set gets its progress from real data (latest weight, a
// strength PR, this month's net, …). A goal with no metric uses the manually
// entered `current_value`. Every resolver is defensive: returns null on any
// error or missing data, never throws.
// ============================================================================

const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
const monthStartISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const round1 = (x) => Math.round(x * 10) / 10

async function latestHealth(db, userId, field) {
  const { data } = await db.from('health_logs').select(`date,${field}`).eq('user_id', userId)
    .gt(field, 0).order('date', { ascending: false }).limit(1)
  const row = data?.[0]
  return row ? { value: Number(row[field]), asOf: row.date } : null
}

async function avgHealth(db, userId, field, days) {
  const { data } = await db.from('health_logs').select(field).eq('user_id', userId)
    .gte('date', daysAgoISO(days)).gt(field, 0)
  const vals = (data || []).map((r) => Number(r[field])).filter(Number.isFinite)
  if (!vals.length) return null
  return { value: round1(vals.reduce((a, b) => a + b, 0) / vals.length), asOf: `snitt ${days}d` }
}

// RECENT_STRENGTH_DAYS / RECENT_RUN_DAYS — goals are about what you can do NOW,
// so a strength/run "current value" comes from recent training, not a lifetime
// PR that might be years stale. If there's no recent data the metric is
// genuinely unknown → return null (the goal shows "—").
const RECENT_STRENGTH_DAYS = 120
const RECENT_RUN_DAYS = 180

async function strengthPR(db, userId, matchers) {
  const since = daysAgoISO(RECENT_STRENGTH_DAYS)
  const { data: sessions } = await db.from('training_sessions')
    .select('id,date').eq('user_id', userId).gte('date', since)
  if (!sessions?.length) return null
  const dateById = Object.fromEntries(sessions.map((s) => [s.id, s.date]))
  const { data: ex } = await db.from('training_exercises')
    .select('exercise_name,weight_kg,session_id').eq('user_id', userId).gt('weight_kg', 0)
    .in('session_id', sessions.map((s) => s.id))
  const hits = (ex || []).filter((r) => {
    const n = String(r.exercise_name || '').toLowerCase()
    return matchers.some((m) => n.includes(m))
  })
  if (!hits.length) return null
  const best = hits.reduce((a, b) => (Number(b.weight_kg) > Number(a.weight_kg) ? b : a))
  return { value: Number(best.weight_kg), asOf: dateById[best.session_id] || `senaste ${RECENT_STRENGTH_DAYS}d` }
}

async function runPR(db, userId, distanceKey) {
  const since = daysAgoISO(RECENT_RUN_DAYS)
  const { data } = await db.from('run_personal_records').select('time_seconds,date')
    .eq('user_id', userId).eq('distance_key', distanceKey).not('time_seconds', 'is', null)
    .gte('date', since)
    .order('time_seconds', { ascending: true }).limit(1)
  const row = data?.[0]
  return row ? { value: Number(row.time_seconds), asOf: row.date } : null
}

async function sessionCount(db, userId, days) {
  const { data } = await db.from('training_sessions').select('date').eq('user_id', userId).gte('date', daysAgoISO(days))
  return { value: (data || []).length, asOf: `senaste ${days}d` }
}

async function studyHours(db, userId, days) {
  const { data } = await db.from('study_sessions').select('hours').eq('user_id', userId).gte('date', daysAgoISO(days))
  return { value: round1((data || []).reduce((s, r) => s + Number(r.hours || 0), 0)), asOf: `senaste ${days}d` }
}

async function netWorth(db, userId) {
  const { data } = await db.from('net_worth_history').select('total_sek,date').eq('user_id', userId)
    .order('date', { ascending: false }).limit(1)
  if (data?.[0]?.total_sek != null) return { value: Number(data[0].total_sek), asOf: data[0].date }
  const { data: a } = await db.from('assets').select('quantity,manual_price_sek').eq('user_id', userId)
  const sum = (a || []).reduce((s, r) => s + Number(r.quantity || 1) * Number(r.manual_price_sek || 0), 0)
  return sum > 0 ? { value: Math.round(sum), asOf: 'tillgångar' } : null
}

async function monthAggregate(db, userId, kind) {
  const start = monthStartISO()
  const [inc, exp, fix] = await Promise.all([
    db.from('income_logs').select('amount').eq('user_id', userId).gte('date', start),
    kind !== 'income' ? db.from('expense_logs').select('amount').eq('user_id', userId).gte('date', start) : Promise.resolve({ data: [] }),
    kind !== 'income' ? db.from('fixed_costs').select('amount').eq('user_id', userId).eq('active', true) : Promise.resolve({ data: [] }),
  ])
  const s = (r) => (r.data || []).reduce((a, x) => a + Number(x.amount || 0), 0)
  const income = s(inc)
  if (kind === 'income') return { value: Math.round(income), asOf: 'denna månad' }
  const net = income - s(exp) - s(fix)
  if (kind === 'net') return { value: Math.round(net), asOf: 'denna månad' }
  // savings rate: net / income, as a percentage
  if (income <= 0) return null
  return { value: round1((net / income) * 100), asOf: 'denna månad' }
}

// kr counted toward the CSN fribelopp so far this half-year (Jan–Jun / Jul–Dec).
async function csnHalfYearUsed(db, userId) {
  const now = new Date()
  const halfStart = now.getMonth() < 6 ? `${now.getFullYear()}-01-01` : `${now.getFullYear()}-07-01`
  const { data } = await db.from('income_logs').select('amount,source,counts_toward_csn')
    .eq('user_id', userId).eq('counts_toward_csn', true).gte('date', halfStart)
  if (!data) return null
  const used = data.reduce((a, r) => a + fribeloppAmount(r), 0) // net 'Lön' grossed up
  return { value: Math.round(used), asOf: now.getMonth() < 6 ? 'vårterminen' : 'höstterminen' }
}

// key → { label, unit, direction, domains[], resolve(userId) }
export const GOAL_METRICS = {
  body_weight:    { label: 'Vikt (senaste)',      unit: 'kg',   direction: 'down', domains: ['halsa', 'traning', 'livet'], resolve: (u, db) => latestHealth(db, u, 'weight_kg') },
  body_fat:       { label: 'Fettprocent',          unit: '%',    direction: 'down', domains: ['halsa', 'traning', 'livet'], resolve: (u, db) => latestHealth(db, u, 'body_fat_pct') },
  sleep_avg_7d:   { label: 'Snittsömn (7d)',        unit: 'h',    direction: 'up',   domains: ['halsa', 'livet'],            resolve: (u, db) => avgHealth(db, u, 'sleep_hours', 7) },
  steps_avg_7d:   { label: 'Snittsteg (7d)',        unit: 'steg', direction: 'up',   domains: ['halsa', 'livet'],            resolve: (u, db) => avgHealth(db, u, 'steps', 7) },
  bench_pr:       { label: 'Bänkpress PR',          unit: 'kg',   direction: 'up',   domains: ['traning'],                   resolve: (u, db) => strengthPR(db, u, ['bänk', 'bench']) },
  squat_pr:       { label: 'Knäböj PR',             unit: 'kg',   direction: 'up',   domains: ['traning'],                   resolve: (u, db) => strengthPR(db, u, ['knäböj', 'knaböj', 'squat']) },
  deadlift_pr:    { label: 'Marklyft PR',           unit: 'kg',   direction: 'up',   domains: ['traning'],                   resolve: (u, db) => strengthPR(db, u, ['marklyft', 'deadlift']) },
  run_1k:         { label: '1 km-tid',              unit: 's',    direction: 'down', domains: ['traning'],                   resolve: (u, db) => runPR(db, u, '1k') },
  run_5k:         { label: '5 km-tid',              unit: 's',    direction: 'down', domains: ['traning'],                   resolve: (u, db) => runPR(db, u, '5k') },
  run_10k:        { label: '10 km-tid',             unit: 's',    direction: 'down', domains: ['traning'],                   resolve: (u, db) => runPR(db, u, '10k') },
  run_half:       { label: 'Halvmaraton-tid',       unit: 's',    direction: 'down', domains: ['traning'],                   resolve: (u, db) => runPR(db, u, 'half_marathon') },
  sessions_7d:    { label: 'Pass senaste 7d',       unit: 'pass', direction: 'up',   domains: ['traning'],                   resolve: (u, db) => sessionCount(db, u, 7) },
  sessions_28d:   { label: 'Pass senaste 28d',      unit: 'pass', direction: 'up',   domains: ['traning'],                   resolve: (u, db) => sessionCount(db, u, 28) },
  study_hours_7d: { label: 'Studietimmar (7d)',     unit: 'h',    direction: 'up',   domains: ['plugg'],                     resolve: (u, db) => studyHours(db, u, 7) },
  study_hours_28d:{ label: 'Studietimmar (28d)',    unit: 'h',    direction: 'up',   domains: ['plugg'],                     resolve: (u, db) => studyHours(db, u, 28) },
  net_worth:      { label: 'Nettoförmögenhet',      unit: 'kr',   direction: 'up',   domains: ['ekonomi', 'livet'],          resolve: (u, db) => netWorth(db, u) },
  month_net:      { label: 'Netto denna månad',     unit: 'kr',   direction: 'up',   domains: ['ekonomi'],                   resolve: (u, db) => monthAggregate(db, u, 'net') },
  month_income:   { label: 'Inkomst denna månad',   unit: 'kr',   direction: 'up',   domains: ['ekonomi'],                   resolve: (u, db) => monthAggregate(db, u, 'income') },
  savings_rate:   { label: 'Sparkvot denna månad',  unit: '%',    direction: 'up',   domains: ['ekonomi'],                   resolve: (u, db) => monthAggregate(db, u, 'rate') },
  csn_fribelopp:  { label: 'CSN-fribelopp använt (termin)', unit: 'kr', direction: 'down', domains: ['ekonomi', 'plugg'],   resolve: (u, db) => csnHalfYearUsed(db, u) },
}

export function metricsForDomain(domain) {
  return Object.entries(GOAL_METRICS)
    .filter(([, m]) => !domain || m.domains.includes(domain))
    .map(([key, m]) => ({ key, ...m }))
}

// `db` defaults to the browser client; the server (Jarvis NU context, via the
// serverLib bundle) passes its own.
export async function resolveGoalCurrent(userId, metricKey, db = supabase) {
  const m = GOAL_METRICS[metricKey]
  if (!m || !userId || !db) return null
  try { return await m.resolve(userId, db) } catch { return null }
}

// Resolve the live current value for every metric-linked goal in one pass.
// Returns { [goalId]: { value, asOf } }.
export async function resolveGoalsProgress(userId, goals, db = supabase) {
  const linked = (goals || []).filter((g) => g.metric && GOAL_METRICS[g.metric])
  const entries = await Promise.all(linked.map(async (g) => {
    const r = await resolveGoalCurrent(userId, g.metric, db)
    return [g.id, r]
  }))
  return Object.fromEntries(entries.filter(([, r]) => r != null))
}

// Human-readable value for a metric/unit.
export function formatMetricValue(value, unit) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const n = Number(value)
  if (unit === 's') {
    const total = Math.round(n)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (unit === 'kr' || unit === 'steg') return n.toLocaleString('sv-SE') + (unit === 'kr' ? ' kr' : '')
  return `${round1(n)}${unit ? ' ' + unit : ''}`
}
