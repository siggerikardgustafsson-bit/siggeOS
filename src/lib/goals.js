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

const SELECT = 'id,title,category,description,metric,unit,target_value,current_value,direction,deadline,status,pinned,linked_trip_id,sort_order,created_at,updated_at,completed_at'
// Columns that exist on the table before post-deploy 05 adds the rest.
const SELECT_LEGACY = 'id,title,category,description,unit,target_value,current_value,deadline,status,created_at,updated_at'

// Remembered for the session once we learn the table is pre-migration, so we
// don't fire a doomed full-column query on every page load.
let legacySchema = false

export async function listGoals(userId, { status = 'active' } = {}) {
  const run = (cols, ordered) => {
    let q = supabase.from('goals').select(cols).eq('user_id', userId)
    if (status && status !== 'all') q = q.eq('status', status)
    q = q.order('created_at', { ascending: true })
    if (ordered) q = q.order('pinned', { ascending: false }).order('sort_order', { ascending: true })
    return q
  }
  if (legacySchema) {
    const { data, error } = await run(SELECT_LEGACY, false)
    if (error) throw error
    return data || []
  }
  let { data, error } = await run(SELECT, true)
  if (isMissingColumnError(error)) {
    legacySchema = true
    ;({ data, error } = await run(SELECT_LEGACY, false))
  }
  if (error) throw error
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
    direction: fields.direction === 'down' ? 'down' : 'up',
    deadline: fields.deadline || fields.target_date || null,
    status: fields.status || 'active',
    pinned: !!fields.pinned,
    linked_trip_id: fields.linked_trip_id || null,
    sort_order: Number.isFinite(fields.sort_order) ? fields.sort_order : 0,
  }
  return writeWithFallback((cols) => supabase.from('goals').insert(stripForCols(row, cols)).select(cols).single())
}

export async function updateGoal(id, patch) {
  const clean = { ...patch }
  if ('domain' in clean) { clean.category = clean.domain; delete clean.domain }
  if ('detail' in clean) { clean.description = clean.detail; delete clean.detail }
  if ('target_date' in clean) { clean.deadline = clean.target_date; delete clean.target_date }
  if ('target_value' in clean) clean.target_value = numOrNull(clean.target_value)
  if ('current_value' in clean) clean.current_value = numOrNull(clean.current_value)
  // Stamp / clear completed_at as status flips to and from 'done'.
  if (clean.status === 'done' && !('completed_at' in clean)) clean.completed_at = new Date().toISOString()
  if (clean.status && clean.status !== 'done') clean.completed_at = null
  return writeWithFallback((cols) => supabase.from('goals').update(stripForCols(clean, cols)).eq('id', id).select(cols).single())
}

// Pre-migration the new columns don't exist — retry the write with only the
// legacy set on a "column ... does not exist" error.
const LEGACY_COLS = new Set(SELECT_LEGACY.split(','))
function stripForCols(obj, cols) {
  if (cols === SELECT) return obj
  return Object.fromEntries(Object.entries(obj).filter(([k]) => LEGACY_COLS.has(k) || k === 'user_id'))
}
async function writeWithFallback(run) {
  if (legacySchema) {
    const { data, error } = await run(SELECT_LEGACY)
    if (error) throw error
    return data
  }
  let { data, error } = await run(SELECT)
  if (isMissingColumnError(error)) {
    legacySchema = true
    ;({ data, error } = await run(SELECT_LEGACY))
  }
  if (error) throw error
  return data
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

// 0..1 progress toward target. Handles both directions.
export function goalProgress(goal) {
  if (goal == null || goal.target_value == null || goal.current_value == null) return null
  const t = Number(goal.target_value)
  const c = Number(goal.current_value)
  if (!Number.isFinite(t) || !Number.isFinite(c)) return null
  if (goal.direction === 'down') {
    if (c <= t) return 1
    return Math.max(0, Math.min(1, t / c)) // crude but bounded: →1 as c approaches t
  }
  if (t === 0) return c >= 0 ? 1 : 0
  return Math.max(0, Math.min(1, c / t))
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
