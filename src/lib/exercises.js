// Shared exercise catalogue + personal-record logic.
//
// Previously QuickLog carried a hardcoded copy of the library and its OWN,
// incompatible PR update (weight-only, ignored reps and bodyweight), so a
// pull-up set logged via QuickLog wrote a corrupt PR that then broke Träning's
// bodyweight comparison. See AUDIT.md P2-2 / P2-3.

export const BASE_EXERCISE_LIBRARY = {
  'Bröst': ['Bänkpress', 'Lutande bänkpress', 'Cables korsning', 'Dips', 'Armhävningar'],
  'Rygg': ['Marklyft', 'Latsdrag', 'Rodd', 'Pull-ups', 'Weighted pull-up', 'Hyperextensions'],
  'Ben': ['Knäböj', 'Benpress', 'Utfall', 'Leg curl', 'Leg extension', 'Kalvhävningar'],
  'Axlar': ['Militärpress', 'Sidolyft', 'Framåtlyft', 'Face pulls', 'Shrugs'],
  'Armar': ['Bicepscurl', 'Hammercurl', 'Tryckkpress', 'Skullcrusher', 'Kabeldrag'],
  'Core': ['Plankan', 'Situps', 'Crunches', 'Russian twist', 'Bäckenlyft'],
  'Egna': [],
}

// Exercises where weight_kg means "added weight above bodyweight" (0 = BW only).
// Fallback only — the DB flag exercise_library.is_bodyweight is authoritative
// where a library row exists (see Träning's isBodyweight()).
export const BW_EXERCISES = new Set([
  'pull-ups', 'pullups', 'pull up', 'pull-up', 'weighted pull-up',
  'dips', 'dip',
  'armhävningar', 'pushups', 'push-ups', 'push ups',
  'chin-ups', 'chinups', 'chins',
  'muscle up', 'muscle-up',
  'ring dips', 'plankan',
  'situps', 'sit-ups', 'crunches', 'bäckenlyft', 'hyperextensions',
])

export function isBodyweightName(name) {
  return BW_EXERCISES.has(String(name || '').toLowerCase().trim())
}

// ============================================================================
// The REAL exercise library (exercise_library table + exercise_aliases) —
// user call 2026-09-12: logged exercises weren't reliably landing in the
// library ("kan inte hitta 'lutande hantelbänk'"). Root cause: every logging
// path (Träning's gym form, its session editor, AND QuickLog) let you type a
// free-text exercise_name that got saved with exercise_id: null whenever it
// didn't happen to slug-match an existing row — QuickLog didn't even try.
// These are the ONE shared implementation for "does this name exist in the
// library" / "add it if not" so no logging path can drift onto its own
// (wrong) notion of the library again — same precedent as updatePersonalRecord
// above (AUDIT.md P2-2/P2-3).
// ============================================================================
export function normalizeExerciseSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// One row per slug, preferring the user's own override of a global exercise.
function uniqueExercisesBySlug(rows) {
  const sorted = [...(rows || [])].sort((a, b) => {
    if (a.user_id && !b.user_id) return -1
    if (!a.user_id && b.user_id) return 1
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
  const seen = new Set()
  return sorted.filter(row => {
    const key = row.slug || normalizeExerciseSlug(row.name)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Fetch the real library + its alias map. Every logging surface calls this — none keep a local copy. */
export async function fetchExerciseCatalogue(supabase) {
  const [exerciseRes, aliasRes] = await Promise.all([
    supabase.from('exercise_library_with_muscles').select('*').order('category').order('name'),
    supabase.from('exercise_aliases').select('id, exercise_id, alias, slug'),
  ])
  const exercises = uniqueExercisesBySlug(exerciseRes.data || [])
  const aliasMap = {}
  for (const a of aliasRes.data || []) {
    if (!aliasMap[a.exercise_id]) aliasMap[a.exercise_id] = []
    aliasMap[a.exercise_id].push(a)
  }
  return { exercises, aliasMap }
}

/** Match a typed name against the real library — by slug, or by a known alias. */
export function findExerciseMatch(name, exercises, aliasMap = {}) {
  const normalized = normalizeExerciseSlug(name)
  if (!normalized) return null
  const direct = (exercises || []).find(e => e.slug === normalized || normalizeExerciseSlug(e.name) === normalized)
  if (direct) return direct
  for (const ex of exercises || []) {
    const aliases = aliasMap[ex.id] || []
    if (aliases.some(a => a.slug === normalized || normalizeExerciseSlug(a.alias) === normalized)) return ex
  }
  return null
}

/**
 * Add a name straight to the library with minimal metadata (category/muscle
 * groups can be filled in later from the full library editor) — the
 * "not found → add it" affordance every logging path offers INSTEAD OF
 * allowing a free-text, unlinked exercise_name.
 */
export async function quickAddExercise({ supabase, userId, name }) {
  const trimmed = String(name || '').trim()
  if (!trimmed) return null
  const slug = normalizeExerciseSlug(trimmed)
  const { data, error } = await supabase
    .from('exercise_library')
    .upsert(
      { user_id: userId, name: trimmed, slug, measurement_type: 'weight_reps', is_bodyweight: isBodyweightName(trimmed), is_active: true },
      { onConflict: 'user_id,slug' }
    )
    .select()
    .single()
  if (error) { console.error('quickAddExercise failed:', error); return null }
  return data
}

// Pick the strongest set. Bodyweight sets rank by reps×(1+addedWeight/30);
// weighted sets rank by an Epley-style 1RM estimate.
function bestSet(sets, bodyweight) {
  let best = null
  for (const s of sets || []) {
    const w = parseFloat(s.weight) || 0
    const r = parseInt(s.reps) || 0
    if (bodyweight ? r <= 0 : w <= 0) continue
    const val = bodyweight ? r * (1 + w / 30) : w * (1 + (r || 1) / 30)
    if (!best || val > best.val) best = { w, r: r || 1, val }
  }
  return best
}

/**
 * Check the sets of one exercise against the stored PR and update it if beaten.
 * One implementation for every logging path (Träning gym form, QuickLog).
 *
 * @returns {Promise<{ isPR: boolean }>}
 */
export async function updatePersonalRecord({ supabase, userId, exerciseName, exerciseId = null, sets, date, bodyweight }) {
  const name = exerciseName?.trim()
  if (!name || !sets?.length) return { isPR: false }

  const best = bestSet(sets, bodyweight)
  if (!best) return { isPR: false }

  const { data: rows } = await supabase
    .from('personal_records')
    .select('*')
    .eq('user_id', userId)
    .eq('exercise_name', name)
    .limit(1)
  const existing = rows?.[0] || null

  const existingScore = existing
    ? (bodyweight
        ? (existing.reps || 0) * (1 + (existing.weight_kg || 0) / 30)
        : (existing.weight_kg || 0))
    : -1
  const newScore = bodyweight ? best.val : best.w
  if (existing && newScore <= existingScore) return { isPR: false }

  const payload = { user_id: userId, exercise_id: exerciseId, exercise_name: name, weight_kg: best.w, reps: best.r, date }
  const { error } = existing
    ? await supabase.from('personal_records').update(payload).eq('user_id', userId).eq('exercise_name', name)
    : await supabase.from('personal_records').insert(payload)
  if (error) { console.error('PR save error:', name, error); return { isPR: false } }
  return { isPR: true }
}
