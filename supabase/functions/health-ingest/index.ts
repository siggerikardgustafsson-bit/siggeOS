// supabase/functions/health-ingest/index.ts
// ============================================================================
// F3 — Apple Health via iOS Shortcuts.
// ----------------------------------------------------------------------------
// A Shortcut POSTs a tiny JSON of the day's metrics here instead of the app
// importing a multi-hundred-MB export.xml (audit P1-7). Auth is an opaque
// per-user token (user_settings.health_ingest_token) — the Shortcut can't do
// Supabase Auth. Deploy WITHOUT JWT verification:
//
//   supabase functions deploy health-ingest --no-verify-jwt
//
// Request:
//   POST  Authorization: Bearer <health_ingest_token>
//   { "date": "2026-09-09",            // optional, defaults to today (UTC)
//     "weight_kg": 71.6, "body_fat_pct": 14.2, "steps": 8432,
//     "sleep_hours": 7.3, "resting_hr": 52, "caffeine_mg": 160 }
//
// Response: { ok, date, updated: "created"|"merged", fields: [...], rejected: [...] }
//
// Only the fields present in the body are written; existing values for other
// columns on that day are preserved (PostgREST upsert = INSERT … ON CONFLICT
// DO UPDATE SET <provided columns>).
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, jsonResponse, serviceClient } from '../_shared/auth.ts'

// [min, max] sanity bounds — a Shortcut occasionally sends 0 or a wild value.
const FIELD_BOUNDS: Record<string, [number, number]> = {
  weight_kg:    [20, 400],
  body_fat_pct: [2, 70],
  steps:        [0, 100000],
  sleep_hours:  [0, 24],
  resting_hr:   [25, 150],
  caffeine_mg:  [0, 2000],
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, req)

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!UUID_RE.test(token)) return jsonResponse({ error: 'missing or malformed ingest token' }, 401, req)

  // Payload is tiny by design — refuse anything that isn't.
  const len = Number(req.headers.get('content-length') || '0')
  if (len > 4096) return jsonResponse({ error: 'payload too large' }, 413, req)

  let body: any
  try { body = await req.json() } catch { return jsonResponse({ error: 'invalid JSON' }, 400, req) }
  if (!body || typeof body !== 'object') return jsonResponse({ error: 'body must be a JSON object' }, 400, req)

  const svc = serviceClient()

  const { data: settings, error: lookupErr } = await svc
    .from('user_settings').select('user_id,last_ingest_at').eq('health_ingest_token', token).maybeSingle()
  if (lookupErr) return jsonResponse({ ok: false, error: 'lookup failed' }, 500, req)
  if (!settings?.user_id) return jsonResponse({ error: 'unknown ingest token' }, 401, req)
  const userId = settings.user_id as string

  // Per-token rate limit: reject if this token's last SUCCESSFUL write was
  // under 30s ago. last_ingest_at is only stamped on a successful upsert
  // (below), so rejected requests never move the window.
  if (settings.last_ingest_at) {
    const sinceMs = Date.now() - new Date(settings.last_ingest_at).getTime()
    if (sinceMs >= 0 && sinceMs < 30_000) {
      return jsonResponse({ ok: false, error: 'rate limited', retry_after_s: Math.ceil((30_000 - sinceMs) / 1000) }, 429, req)
    }
  }

  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10)

  const accepted: string[] = []
  const rejected: string[] = []
  const row: Record<string, unknown> = { user_id: userId, date }
  for (const [field, [lo, hi]] of Object.entries(FIELD_BOUNDS)) {
    if (body[field] == null || body[field] === '') continue
    const n = Number(body[field])
    if (!Number.isFinite(n) || n < lo || n > hi) { rejected.push(field); continue }
    row[field] = field === 'steps' || field === 'caffeine_mg' || field === 'resting_hr'
      ? Math.round(n)
      : Math.round(n * 100) / 100
    accepted.push(field)
  }
  if (!accepted.length) return jsonResponse({ ok: false, error: 'no valid fields', rejected }, 400, req)

  const { data: existing } = await svc
    .from('health_logs').select('id,source').eq('user_id', userId).eq('date', date).maybeSingle()
  // Only claim `source` when we're creating the row — don't relabel a day the
  // user logged by hand in the app.
  if (!existing) row.source = 'apple_health_shortcut'

  const { error } = await svc.from('health_logs').upsert(row, { onConflict: 'user_id,date' })
  if (error) return jsonResponse({ ok: false, error: error.message }, 500, req)

  // Stamp the rate-limit window only now that the write actually landed.
  await svc.from('user_settings').update({ last_ingest_at: new Date().toISOString() }).eq('health_ingest_token', token)

  return jsonResponse({ ok: true, date, updated: existing ? 'merged' : 'created', fields: accepted, rejected }, 200, req)
})
