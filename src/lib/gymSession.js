// Saving a gym session: session row, exercise rows, PR check, daily score.
// One implementation for the live workout (ActiveWorkout) — the same steps as
// Träning's own gym form, built on the shared library/PR helpers.
import { findExerciseMatch, updatePersonalRecord, isBodyweightName } from './exercises'

export async function updateTrainingScore(supabase, userId, dateStr, feeling) {
  const score = Math.min(50 + (Number(feeling) / 10) * 50, 100)
  const { data: existing } = await supabase.from('daily_scores').select('id').eq('user_id', userId).eq('date', dateStr).maybeSingle()
  if (existing) await supabase.from('daily_scores').update({ score_training: score }).eq('id', existing.id).eq('user_id', userId)
  else await supabase.from('daily_scores').insert({ user_id: userId, date: dateStr, score_training: score })
}

// exercises: [{ name, sets: [{ reps, weight, is_dropset? }] }] — only sets that
// should be stored. Returns { session, prs: [exercise names with a new PR] }.
export async function saveGymWorkout({ supabase, userId, date, durationMinutes, feeling, notes, exercises, catalogue, aliasMap }) {
  const lib = (name) => findExerciseMatch(name, catalogue, aliasMap)
  const list = (exercises || []).filter(ex => ex.name?.trim() && ex.sets?.length)
  const unresolved = [...new Set(list.filter(ex => !lib(ex.name)).map(ex => ex.name.trim()))]
  if (unresolved.length) throw new Error(`Lägg till i biblioteket först: ${unresolved.join(', ')}`)
  if (!list.length) throw new Error('Inga set att spara.')

  const { data: session, error } = await supabase.from('training_sessions').insert({
    user_id: userId, date, session_type: 'gym',
    duration_minutes: durationMinutes ? Math.round(durationMinutes) : null,
    feeling, notes: notes || null, source: 'manual',
  }).select().single()
  if (error) throw error

  const rows = list.flatMap(ex => ex.sets.map((s, i) => ({
    user_id: userId, session_id: session.id,
    exercise_id: lib(ex.name)?.id || null, exercise_name: ex.name.trim(),
    set_number: i + 1,
    reps: s.reps !== '' && s.reps != null ? parseInt(s.reps) : null,
    weight_kg: s.weight !== '' && s.weight != null ? parseFloat(String(s.weight).replace(',', '.')) : null,
    is_dropset: !!s.is_dropset,
  })))
  const { error: exErr } = await supabase.from('training_exercises').insert(rows)
  if (exErr) {
    // Never leave an empty session behind.
    await supabase.from('training_sessions').delete().eq('id', session.id).eq('user_id', userId)
    throw exErr
  }

  const prs = []
  for (const ex of list) {
    const l = lib(ex.name)
    const bodyweight = l && typeof l.is_bodyweight === 'boolean' ? l.is_bodyweight : isBodyweightName(ex.name)
    const { isPR } = await updatePersonalRecord({
      supabase, userId, exerciseName: ex.name.trim(), exerciseId: l?.id || null,
      sets: ex.sets.map(s => ({ ...s, weight: String(s.weight ?? '').replace(',', '.') })), date, bodyweight,
    })
    if (isPR) prs.push(ex.name.trim())
  }
  await updateTrainingScore(supabase, userId, date, feeling)
  return { session, prs }
}

// Latest logged sets per exercise ("förra gången"), keyed by exercise_id and
// by lowercased name. One query over recent rows; the newest session wins.
export async function fetchLastPerformance(supabase, userId) {
  const { data } = await supabase.from('training_exercises')
    .select('exercise_id,exercise_name,set_number,reps,weight_kg,session_id,training_sessions!inner(date)')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1500)
  const out = {}
  const keyOf = (r) => [r.exercise_id, String(r.exercise_name || '').toLowerCase().trim()].filter(Boolean)
  const chosen = {} // key → session_id of the most recent session containing it
  for (const r of data || []) {
    for (const k of keyOf(r)) {
      const date = r.training_sessions?.date || ''
      if (!chosen[k] || date > chosen[k].date) chosen[k] = { session: r.session_id, date }
    }
  }
  for (const r of data || []) {
    for (const k of keyOf(r)) {
      if (chosen[k].session !== r.session_id) continue
      ;(out[k] ||= { date: chosen[k].date, sets: [] }).sets.push({ n: r.set_number, reps: r.reps, weight: r.weight_kg })
    }
  }
  for (const k of Object.keys(out)) out[k].sets.sort((a, b) => a.n - b.n)
  return out
}
