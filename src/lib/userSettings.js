import { supabase } from './supabase'

// user_settings.goals is a single shared JSONB blob written from several
// screens (Settings, Hälsa, Träning, Onboarding). Each screen only owns a few
// keys, so a blind write of a stale copy silently wipes another screen's keys
// (AUDIT.md P0-5). Always merge onto a fresh read.
//
// `patch` holds only the keys the caller owns; they win over the stored blob.
// Returns the merged goals object (or throws on write error).
export async function patchGoals(userId, patch) {
  const { data } = await supabase
    .from('user_settings')
    .select('goals')
    .eq('user_id', userId)
    .maybeSingle()

  const goals = { ...(data?.goals || {}), ...patch }

  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, goals, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error

  return goals
}
