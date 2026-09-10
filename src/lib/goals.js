import { supabase } from './supabase'

// ============================================================================
// Structured goals — the `goals` table (extended in post-deploy 05).
// ----------------------------------------------------------------------------
// Concrete, trackable objectives across every domain. Separate from the
// free-text life goals in user_settings.goals (one_year / three_year / …),
// which stay where they are and are read via patchGoals / the Jarvis prompt.
//
// Column mapping (the table predates the migrations): `category` holds the
// domain, `deadline` holds the target date, `description` holds the detail.
// ============================================================================

export const GOAL_DOMAINS = ['traning', 'halsa', 'ekonomi', 'plugg', 'resor', 'jobb', 'livet']

export const GOAL_DOMAIN_LABEL = {
  traning: 'Träning', halsa: 'Hälsa', ekonomi: 'Ekonomi', plugg: 'Studier',
  resor: 'Resor', jobb: 'Jobb', livet: 'Livet',
}

// Three column tiers, newest first — the table has been extended twice by
// migration and a given deploy may sit at any tier:
//   FULL  — post-deploy 08 (adds start_value / baseline_date)
//   V5    — post-deploy 05 (metric / direction / pinned / …)
//   LEGACY— the original table
const SELECT_FULL = 'id,title,category,description,metric,unit,target_value,current_value,start_value,baseline_date,direction,deadline,status,pinned,linked_trip_id,sort_order,created_at,updated_at,completed_at'
const SELECT_V5 = 'id,title,category,description,metric,unit,target_value,current_value,direction,deadline,status,pinned,linked_trip_id,sort_order,created_at,updated_at,completed_at'
const SELECT_LEGACY = 'id,title,category,description,unit,target_value,current_value,deadline,status,created_at,updated_at'
const TIERS = [SELECT_FULL, SELECT_V5, SELECT_LEGACY]

// Which tier this deploy's `goals` table is at. Probed ONCE per session via a
// shared in-flight promise so concurrent callers never race the counter (that
// raced some page loads onto the legacy shape and dropped metric/pin). 0 = FULL.
let schemaTier = 0
const cols = () => TIERS[schemaTier]
let tierProbe = null
function ensureTier() {
  if (!tierProbe) {
    tierProbe = (async () => {
      for (; schemaTier < TIERS.length - 1; schemaTier++) {
        const { error } = await supabase.from('goals').select(cols()).limit(1)
        if (!isMissingColumnError(error)) break
      }
    })().catch(() => { /* leave schemaTier where it got to */ })
  }
  return tierProbe
}

async function runTiered(attempt) {
  await ensureTier()
  let { data, error } = await attempt(cols())
  // Very rare: schema changed under us (08 deployed mid-session). Walk down once.
  while (isMissingColumnError(error) && schemaTier < TIERS.length - 1) {
    schemaTier++
    ;({ data, error } = await attempt(cols()))
  }
  if (error) throw error
  return data
}

export async function listGoals(userId, { status = 'active' } = {}) {
  const data = await runTiered((c) => {
    let q = supabase.from('goals').select(c).eq('user_id', userId)
    if (status && status !== 'all') q = q.eq('status', status)
    q = q.order('created_at', { ascending: true })
    if (c !== SELECT_LEGACY) q = q.order('pinned', { ascending: false }).order('sort_order', { ascending: true })
    return q
  })
  return data || []
}

export async function createGoal(userId, fields) {
  const row = {
    user_id: userId,
    title: (fields.title || '').trim(),
    category: fields.category || fields.domain || null,
    description: fields.description || fields.detail || null,
    metric: fields.metric || null,
    unit: fields.unit || null,
    target_value: numOrNull(fields.target_value),
    current_value: numOrNull(fields.current_value),
    // Baseline: progress is measured from here, not from zero. Callers pass the
    // resolved metric value (or the entered current) captured at creation.
    start_value: numOrNull(fields.start_value),
    baseline_date: fields.baseline_date || (numOrNull(fields.start_value) != null ? new Date().toISOString().slice(0, 10) : null),
    direction: fields.direction === 'down' ? 'down' : 'up',
    deadline: fields.deadline || fields.target_date || null,
    status: fields.status || 'active',
    pinned: !!fields.pinned,
    linked_trip_id: fields.linked_trip_id || null,
    sort_order: Number.isFinite(fields.sort_order) ? fields.sort_order : 0,
  }
  return writeWithFallback((c) => supabase.from('goals').insert(stripForCols(row, c)).select(c).single())
}

export async function updateGoal(id, patch) {
  const clean = { ...patch }
  if ('domain' in clean) { clean.category = clean.domain; delete clean.domain }
  if ('detail' in clean) { clean.description = clean.detail; delete clean.detail }
  if ('target_date' in clean) { clean.deadline = clean.target_date; delete clean.target_date }
  if ('target_value' in clean) clean.target_value = numOrNull(clean.target_value)
  if ('current_value' in clean) clean.current_value = numOrNull(clean.current_value)
  if ('start_value' in clean) clean.start_value = numOrNull(clean.start_value)
  // Stamp / clear completed_at as status flips to and from 'done'.
  if (clean.status === 'done' && !('completed_at' in clean)) clean.completed_at = new Date().toISOString()
  if (clean.status && clean.status !== 'done') clean.completed_at = null
  return writeWithFallback((c) => supabase.from('goals').update(stripForCols(clean, c)).eq('id', id).select(c).single())
}

// Keep a write's fields to the columns the given tier actually has.
function stripForCols(obj, c) {
  if (c === SELECT_FULL) return obj
  const allowed = new Set(c.split(','))
  allowed.add('user_id')
  return Object.fromEntries(Object.entries(obj).filter(([k]) => allowed.has(k)))
}
function writeWithFallback(run) {
  return runTiered(run)
}

// PostgREST reports an unknown column differently on read vs write:
//   read:  { code: '42703', message: 'column goals.metric does not exist' }
//   write: { code: 'PGRST204', message: "Could not find the 'direction' column ..." }
function isMissingColumnError(error) {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return /column .*goals\.|find the '.*' column of 'goals'/i.test(error.message || '')
}

export async function deleteGoal(id) {
  const { error } = await supabase.from('goals').delete().eq('id', id)
  if (error) throw error
}

const clamp01 = (x) => Math.max(0, Math.min(1, x))

// 0..1 progress toward target, measured from the goal's baseline (start_value)
// rather than from zero: at bench 80kg with a 100kg goal set when you could do
// 75, you're (80-75)/(100-75) = 20% there, not 80%.
// Falls back to the old zero-based ratio when no baseline is recorded yet.
export function goalProgress(goal) {
  if (goal == null || goal.target_value == null || goal.current_value == null) return null
  const t = Number(goal.target_value)
  const c = Number(goal.current_value)
  if (!Number.isFinite(t) || !Number.isFinite(c)) return null
  const down = goal.direction === 'down'
  const s = goal.start_value == null ? null : Number(goal.start_value)
  const hasBaseline = s != null && Number.isFinite(s)

  if (down) {
    if (c <= t) return 1
    if (!hasBaseline) return clamp01(t / c) // legacy: bounded, →1 as c approaches t
    const span = s - t
    if (span <= 0) return c <= t ? 1 : 0 // baseline already at/under target
    return clamp01((s - c) / span)
  }
  if (c >= t) return 1
  if (!hasBaseline) return t === 0 ? (c >= 0 ? 1 : 0) : clamp01(c / t)
  const span = t - s
  if (span <= 0) return c >= t ? 1 : 0
  return clamp01((c - s) / span)
}

// A metric-linked (or manual-with-current) goal that predates the baseline
// column — the UI backfills start_value once so progress reads sensibly.
export function goalNeedsBaseline(goal) {
  return goal != null
    && goal.status === 'active'
    && goal.target_value != null
    && goal.start_value == null
    && 'start_value' in goal // schema tier actually has the column
}

// Days until the deadline (negative = overdue), or null.
export function goalDaysLeft(goal) {
  if (!goal?.deadline) return null
  const d = new Date(goal.deadline + 'T00:00:00')
  return Math.ceil((d - new Date()) / 86400000)
}

// Compact one-liner per goal for the Jarvis context / tools.
export function goalLine(g) {
  const bits = [g.title]
  const dom = g.category || g.domain
  if (dom) bits.push(GOAL_DOMAIN_LABEL[dom] || dom)
  if (g.target_value != null) {
    const cur = g.current_value != null ? `${g.current_value}` : '?'
    bits.push(`${cur}/${g.target_value}${g.unit ? ' ' + g.unit : ''}`)
    const p = goalProgress(g)
    if (p != null) bits.push(`${Math.round(p * 100)}%`)
  }
  const dl = goalDaysLeft(g)
  if (dl != null) bits.push(dl < 0 ? `försenat ${-dl}d` : `${dl}d kvar`)
  if (g.status && g.status !== 'active') bits.push(g.status)
  return bits.join(' · ')
}

function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
