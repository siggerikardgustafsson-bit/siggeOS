// supabase/functions/skill-ingest/index.ts
// ============================================================================
// Anki auto-sync — a scheduled script/Shortcut on the user's own Mac (Anki
// Desktop + AnkiConnect) POSTs today's per-deck card counts here, the same
// pattern as health-ingest (F3) for Apple Health. Reuses the SAME opaque
// per-user token (user_settings.health_ingest_token) — one token, both
// endpoints, nothing new to generate or manage.
//
// Deploy WITHOUT JWT verification:
//   supabase functions deploy skill-ingest --no-verify-jwt
//
// Request:
//   POST  Authorization: Bearer <health_ingest_token>
//   { "date": "2026-09-11",                 // optional, defaults to today (UTC)
//     "skills": [
//       { "skill": "spanish", "cards": 220 },
//       { "skill": "serbian", "cards": 80 },
//       { "skill": "german",  "cards": 150 }
//     ] }
//
// Response: { ok, date, updated: [...skill ids], rejected: [...skill ids] }
//
// Each named skill's row for that day is replaced (delete-then-insert, scoped
// to source='anki_sync' so a manually-logged Journal row for the same
// skill/day is never touched) — re-running the sync for a day is safe.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, jsonResponse, serviceClient } from '../_shared/auth.ts'

const KNOWN_SKILLS = new Set(['guitar', 'spanish', 'serbian', 'german', 'reading', 'piano', 'other'])
const CARDS_BOUNDS: [number, number] = [0, 5000] // a Shortcut occasionally sends 0 or a wild value

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, req)

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!UUID_RE.test(token)) return jsonResponse({ error: 'missing or malformed ingest token' }, 401, req)

  const len = Number(req.headers.get('content-length') || '0')
  if (len > 4096) return jsonResponse({ error: 'payload too large' }, 413, req)

  let body: any
  try { body = await req.json() } catch { return jsonResponse({ error: 'invalid JSON' }, 400, req) }
  if (!body || typeof body !== 'object' || !Array.isArray(body.skills)) {
    return jsonResponse({ error: 'body must be { skills: [...] }' }, 400, req)
  }

  const svc = serviceClient()

  const { data: settings, error: lookupErr } = await svc
    .from('user_settings').select('user_id,last_ingest_at').eq('health_ingest_token', token).maybeSingle()
  if (lookupErr) return jsonResponse({ ok: false, error: 'lookup failed' }, 500, req)
  if (!settings?.user_id) return jsonResponse({ error: 'unknown ingest token' }, 401, req)
  const userId = settings.user_id as string

  // Same 30s cooldown window health-ingest uses — shared across both
  // endpoints for this token, which is fine: nothing pushes to both within
  // 30s under normal automation schedules.
  if (settings.last_ingest_at) {
    const sinceMs = Date.now() - new Date(settings.last_ingest_at).getTime()
    if (sinceMs >= 0 && sinceMs < 30_000) {
      return jsonResponse({ ok: false, error: 'rate limited', retry_after_s: Math.ceil((30_000 - sinceMs) / 1000) }, 429, req)
    }
  }

  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10)

  const updated: string[] = []
  const rejected: string[] = []

  for (const row of body.skills) {
    const skill = row?.skill
    if (typeof skill !== 'string' || !KNOWN_SKILLS.has(skill)) { rejected.push(String(skill)); continue }
    const cards = Number(row?.cards)
    if (!Number.isFinite(cards) || cards < CARDS_BOUNDS[0] || cards > CARDS_BOUNDS[1]) { rejected.push(skill); continue }

    // Replace only what THIS endpoint previously wrote for skill/date — a
    // hand-logged Journal row for the same skill/day (source is null there)
    // is never touched.
    await svc.from('skill_logs').delete()
      .eq('user_id', userId).eq('date', date).eq('skill', skill).eq('source', 'anki_sync')

    const { error } = await svc.from('skill_logs').insert({
      user_id: userId, date, skill, cards: Math.round(cards),
      activity_type: 'anki', source: 'anki_sync',
    })
    if (error) { console.warn(`skill_logs insert failed for ${skill}:`, error.message); rejected.push(skill); continue }
    updated.push(skill)
  }

  if (!updated.length) return jsonResponse({ ok: false, error: 'no valid skills', rejected }, 400, req)

  await svc.from('user_settings').update({ last_ingest_at: new Date().toISOString() }).eq('health_ingest_token', token)

  return jsonResponse({ ok: true, date, updated, rejected }, 200, req)
})
