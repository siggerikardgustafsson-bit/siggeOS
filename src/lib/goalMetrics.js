import { supabase } from './supabase'

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

async function latestHealth(userId, field) {
  const { data } = await supabase.from('health_logs').select(`date,${field}`).eq('user_id', userId)
    .gt(field, 0).order('date', { ascending: false }).limit(1)
  const row = data?.[0]
  return row ? { value: Number(row[field]), asOf: row.date } : null
}

async function avgHealth(userId, field, days) {
  const { data } = await supabase.from('health_logs').select(field).eq('user_id', userId)
    .gte('date', daysAgoISO(days)).gt(field, 0)
  const vals = (data || []).map((r) => Number(r[field])).filter(Number.isFinite)
  if (!vals.length) return null
  return { value: round1(vals.reduce((a, b) => a + b, 0) / vals.length), asOf: `snitt ${days}d` }
}

async function strengthPR(userId, matchers) {
  const { data } = await supabase.from('personal_records').select('exercise_name,weight_kg,date')
    .eq('user_id', userId).gt('weight_kg', 0)
  const hits = (data || []).filter((r) => {
    const n = String(r.exercise_name || '').toLowerCase()
    return matchers.some((m) => n.includes(m))
  })
  if (!hits.length) return null
  const best = hits.reduce((a, b) => (Number(b.weight_kg) > Number(a.weight_kg) ? b : a))
  return { value: Number(best.weight_kg), asOf: best.date }
}

async function runPR(userId, distanceKey) {
  const { data } = await supabase.from('run_personal_records').select('time_seconds,date')
    .eq('user_id', userId).eq('distance_key', distanceKey).not('time_seconds', 'is', null)
    .order('time_seconds', { ascending: true }).limit(1)
  const row = data?.[0]
  return row ? { value: Number(row.time_seconds), asOf: row.date } : null
}

async function sessionCount(userId, days) {
  const { data } = await supabase.from('training_sessions').select('date').eq('user_id', userId).gte('date', daysAgoISO(days))
  return { value: (data || []).length, asOf: `senaste ${days}d` }
}

async function studyHours(userId, days) {
  const { data } = await supabase.from('study_sessions').select('hours').eq('user_id', userId).gte('date', daysAgoISO(days))
  return { value: round1((data || []).reduce((s, r) => s + Number(r.hours || 0), 0)), asOf: `senaste ${days}d` }
}

async function netWorth(userId) {
  const { data } = await supabase.from('net_worth_history').select('total_sek,date').eq('user_id', userId)
    .order('date', { ascending: false }).limit(1)
  if (data?.[0]?.total_sek != null) return { value: Number(data[0].total_sek), asOf: data[0].date }
  const { data: a } = await supabase.from('assets').select('quantity,manual_price_sek').eq('user_id', userId)
  const sum = (a || []).reduce((s, r) => s + Number(r.quantity || 1) * Number(r.manual_price_sek || 0), 0)
  return sum > 0 ? { value: Math.round(sum), asOf: 'tillgångar' } : null
}

async function monthAggregate(userId, kind) {
  const start = monthStartISO()
  const [inc, exp, fix] = await Promise.all([
    supabase.from('income_logs').select('amount').eq('user_id', userId).gte('date', start),
    kind === 'net' ? supabase.from('expense_logs').select('amount').eq('user_id', userId).gte('date', start) : Promise.resolve({ data: [] }),
    kind === 'net' ? supabase.from('fixed_costs').select('amount').eq('user_id', userId).eq('active', true) : Promise.resolve({ data: [] }),
  ])
  const s = (r) => (r.data || []).reduce((a, x) => a + Number(x.amount || 0), 0)
  const value = kind === 'net' ? Math.round(s(inc) - s(exp) - s(fix)) : Math.round(s(inc))
  return { value, asOf: 'denna månad' }
}

// key → { label, unit, direction, domains[], resolve(userId) }
export const GOAL_METRICS = {
  body_weight:    { label: 'Vikt (senaste)',      unit: 'kg',   direction: 'down', domains: ['halsa', 'traning', 'livet'], resolve: (u) => latestHealth(u, 'weight_kg') },
  body_fat:       { label: 'Fettprocent',          unit: '%',    direction: 'down', domains: ['halsa', 'traning', 'livet'], resolve: (u) => latestHealth(u, 'body_fat_pct') },
  sleep_avg_7d:   { label: 'Snittsömn (7d)',        unit: 'h',    direction: 'up',   domains: ['halsa', 'livet'],            resolve: (u) => avgHealth(u, 'sleep_hours', 7) },
  steps_avg_7d:   { label: 'Snittsteg (7d)',        unit: 'steg', direction: 'up',   domains: ['halsa', 'livet'],            resolve: (u) => avgHealth(u, 'steps', 7) },
  bench_pr:       { label: 'Bänkpress PR',          unit: 'kg',   direction: 'up',   domains: ['traning'],                   resolve: (u) => strengthPR(u, ['bänk', 'bench']) },
  squat_pr:       { label: 'Knäböj PR',             unit: 'kg',   direction: 'up',   domains: ['traning'],                   resolve: (u) => strengthPR(u, ['knäböj', 'knaböj', 'squat']) },
  deadlift_pr:    { label: 'Marklyft PR',           unit: 'kg',   direction: 'up',   domains: ['traning'],                   resolve: (u) => strengthPR(u, ['marklyft', 'deadlift']) },
  run_5k:         { label: '5 km-tid',              unit: 's',    direction: 'down', domains: ['traning'],                   resolve: (u) => runPR(u, '5k') },
  run_10k:        { label: '10 km-tid',             unit: 's',    direction: 'down', domains: ['traning'],                   resolve: (u) => runPR(u, '10k') },
  sessions_7d:    { label: 'Pass senaste 7d',       unit: 'pass', direction: 'up',   domains: ['traning'],                   resolve: (u) => sessionCount(u, 7) },
  sessions_28d:   { label: 'Pass senaste 28d',      unit: 'pass', direction: 'up',   domains: ['traning'],                   resolve: (u) => sessionCount(u, 28) },
  study_hours_7d: { label: 'Studietimmar (7d)',     unit: 'h',    direction: 'up',   domains: ['plugg'],                     resolve: (u) => studyHours(u, 7) },
  net_worth:      { label: 'Nettoförmögenhet',      unit: 'kr',   direction: 'up',   domains: ['ekonomi', 'livet'],          resolve: (u) => netWorth(u) },
  month_net:      { label: 'Netto denna månad',     unit: 'kr',   direction: 'up',   domains: ['ekonomi'],                   resolve: (u) => monthAggregate(u, 'net') },
  month_income:   { label: 'Inkomst denna månad',   unit: 'kr',   direction: 'up',   domains: ['ekonomi'],                   resolve: (u) => monthAggregate(u, 'income') },
}

export function metricsForDomain(domain) {
  return Object.entries(GOAL_METRICS)
    .filter(([, m]) => !domain || m.domains.includes(domain))
    .map(([key, m]) => ({ key, ...m }))
}

export async function resolveGoalCurrent(userId, metricKey) {
  const m = GOAL_METRICS[metricKey]
  if (!m || !userId) return null
  try { return await m.resolve(userId) } catch { return null }
}

// Resolve the live current value for every metric-linked goal in one pass.
// Returns { [goalId]: { value, asOf } }.
export async function resolveGoalsProgress(userId, goals) {
  const linked = (goals || []).filter((g) => g.metric && GOAL_METRICS[g.metric])
  const entries = await Promise.all(linked.map(async (g) => {
    const r = await resolveGoalCurrent(userId, g.metric)
    return [g.id, r]
  }))
  return Object.fromEntries(entries.filter(([, r]) => r != null))
}

// Human-readable value for a metric/unit.
export function formatMetricValue(value, unit) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const n = Number(value)
  if (unit === 's') {
    const m = Math.floor(n / 60)
    const s = Math.round(n % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (unit === 'kr' || unit === 'steg') return n.toLocaleString('sv-SE') + (unit === 'kr' ? ' kr' : '')
  return `${round1(n)}${unit ? ' ' + unit : ''}`
}
