// Daily score side effect of a journal entry — shared by Journal.jsx and
// QuickLog so an entry counts the same wherever it is written (QuickLog used
// to skip it, so evening logs from the + button never reached the score).
// Same formula as jarvis-chat's log_journal.
export async function updateJournalScore(supabase, userId, dateStr, { content = '', energy = null } = {}) {
  const journalScore = Math.min(75 + Math.min(String(content || '').length / 5, 25), 100)
  const energyScore = energy != null && energy !== '' ? (Number(energy) / 10) * 100 : null
  const { data: existing } = await supabase.from('daily_scores').select('id,score_health').eq('user_id', userId).eq('date', dateStr).maybeSingle()
  if (existing) {
    const patch = { score_journal: journalScore }
    if (energyScore != null) patch.score_health = Math.max(existing.score_health || 0, energyScore)
    await supabase.from('daily_scores').update(patch).eq('id', existing.id).eq('user_id', userId)
  } else {
    await supabase.from('daily_scores').insert({ user_id: userId, date: dateStr, score_journal: journalScore, ...(energyScore != null && { score_health: energyScore }) })
  }
}
