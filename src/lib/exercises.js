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
