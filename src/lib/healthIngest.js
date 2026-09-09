import { supabase } from './supabase'

// ============================================================================
// F3 — Apple Health ingest token (for the iOS Shortcut push endpoint).
// ----------------------------------------------------------------------------
// The token lives on user_settings.health_ingest_token and is generated lazily
// the first time the user opens the setup screen. The `health-ingest` edge
// function looks a user up by this token. Rotating it revokes the old one.
// UI for all this is still a product decision — see IDEAS.md.
// ============================================================================

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/health-ingest`

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export async function getIngestToken(userId) {
  const { data } = await supabase.from('user_settings')
    .select('health_ingest_token').eq('user_id', userId).maybeSingle()
  return data?.health_ingest_token || null
}

// Returns the existing token, or generates and stores a new one.
export async function getOrCreateIngestToken(userId) {
  const existing = await getIngestToken(userId)
  if (existing) return existing
  const token = uuid()
  const { error } = await supabase.from('user_settings')
    .upsert({ user_id: userId, health_ingest_token: token, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
  return token
}

// Rotate — invalidates the old token immediately.
export async function rotateIngestToken(userId) {
  const token = uuid()
  const { error } = await supabase.from('user_settings')
    .update({ health_ingest_token: token, updated_at: new Date().toISOString() }).eq('user_id', userId)
  if (error) throw error
  return token
}

export async function disableIngest(userId) {
  const { error } = await supabase.from('user_settings')
    .update({ health_ingest_token: null, updated_at: new Date().toISOString() }).eq('user_id', userId)
  if (error) throw error
}

// Everything the setup screen needs to show the user how to wire the Shortcut.
export function ingestSetup(token) {
  return {
    endpoint: FN_URL,
    token,
    // What the Shortcut's "Get Contents of URL" action should send.
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    exampleBody: {
      date: '2026-09-09',
      weight_kg: 71.6,
      body_fat_pct: 14.2,
      steps: 8432,
      sleep_hours: 7.3,
      resting_hr: 52,
    },
    acceptedFields: ['weight_kg', 'body_fat_pct', 'steps', 'sleep_hours', 'resting_hr', 'caffeine_mg'],
    note: 'Kör Shortcut:en varje morgon (t.ex. via en Automation). Bara fälten du skickar skrivs — resten av dagens rad rörs inte.',
  }
}
