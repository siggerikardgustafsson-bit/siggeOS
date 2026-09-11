// supabase/functions/skill-ingest/index.ts
// ============================================================================
// Anki auto-sync — a scheduled script on the user's own Mac (Anki Desktop +
// AnkiConnect) POSTs per-deck card counts here, the same pattern as
// health-ingest (F3) for Apple Health. Reuses the SAME opaque per-user token
// (user_settings.health_ingest_token) — one token, both endpoints.
//
// Deploy WITHOUT JWT verification:
//   supabase functions deploy skill-ingest --no-verify-jwt
//
// Request — single day:
//   POST  Authorization: Bearer <health_ingest_token>
//   { "date": "2026-09-11",   // optional, defaults to today (UTC)
//     "skills": [{ "skill": "spanish", "cards": 220 }, ...] }
//
// Request — backfill (multiple days in one call, so a gap self-heals without
// hammering the 30s rate limit):
//   { "days": [
//       { "date": "2026-09-10", "skills": [{ "skill": "spanish", "cards": 80 }] },
//       { "date": "2026-09-11", "skills": [{ "skill": "spanish", "cards": 220 }] },
//   ] }
//
// Response: { ok, days, rows, rejected: [...] }
//
// Every named skill/day row is replaced (delete-then-insert, scoped to
// source='anki_sync' so a hand-logged Journal row for the same skill/day is
// never touched) — re-running the sync, including overlapping backfill
// windows, is always safe.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, jsonResponse, serviceClient } from '../_shared/auth.ts'

const KNOWN_SKILLS = new Set(['guitar', 'spanish', 'serbian', 'german', 'reading', 'piano', 'other'])
const CARDS_BOUNDS: [number, number] = [0, 5000] // a run occasionally reports 0 or a wild value
const MAX_DAYS = 60
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, req)

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!UUID_RE.test(token)) return jsonResponse({ error: 'missing or malformed ingest token' }, 401, req)

  const len = Number(req.headers.get('content-length') || '0')
  if (len > 32_768) return jsonResponse({ error: 'payload too large' }, 413, req) // backfill batches are bigger than health-ingest's single-day 4KB

  let body: any
  try { body = await req.json() } catch { return jsonResponse({ error: 'invalid JSON' }, 400, req) }
  if (!body || typeof body !== 'object') return jsonResponse({ error: 'invalid body' }, 400, req)

  // Normalise to a list of { date, skills } — a bare { skills } (no `days`)
  // is treated as one day, defaulting to today.
  const rawDays: any[] = Array.isArray(body.days) ? body.days
    : Array.isArray(body.skills) ? [{ date: body.date, skills: body.skills }]
    : []
  if (!rawDays.length) return jsonResponse({ error: 'body must be { skills: [...] } or { days: [...] }' }, 400, req)
  if (rawDays.length > MAX_DAYS) return jsonResponse({ error: `too many days (max ${MAX_DAYS})` }, 400, req)

  const svc = serviceClient()

  const { data: settings, error: lookupErr } = await svc
    .from('user_settings').select('user_id,last_ingest_at').eq('health_ingest_token', token).maybeSingle()
  if (lookupErr) return jsonResponse({ ok: false, error: 'lookup failed' }, 500, req)
  if (!settings?.user_id) return jsonResponse({ error: 'unknown ingest token' }, 401, req)
  const userId = settings.user_id as string

  // Same 30s cooldown health-ingest uses, shared across both endpoints for
  // this token — one request covers a whole backfill batch, so this is only
  // ever hit by back-to-back runs, not by the size of one sync.
  if (settings.last_ingest_at) {
    const sinceMs = Date.now() - new Date(settings.last_ingest_at).getTime()
    if (sinceMs >= 0 && sinceMs < 30_000) {
      return jsonResponse({ ok: false, error: 'rate limited', retry_after_s: Math.ceil((30_000 - sinceMs) / 1000) }, 429, req)
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const rows: Record<string, unknown>[] = []
  const dates = new Set<string>()
  const skillsSeen = new Set<string>()
  const rejected: string[] = []
  let dayCount = 0

  for (const day of rawDays) {
    const date = typeof day?.date === 'string' && DATE_RE.test(day.date) ? day.date : today
    if (!Array.isArray(day?.skills)) continue
    let any = false
    for (const row of day.skills) {
      const skill = row?.skill
      if (typeof skill !== 'string' || !KNOWN_SKILLS.has(skill)) { rejected.push(`${date}/${String(skill)}`); continue }
      const cards = Number(row?.cards)
      if (!Number.isFinite(cards) || cards < CARDS_BOUNDS[0] || cards > CARDS_BOUNDS[1]) { rejected.push(`${date}/${skill}`); continue }
      // minutes has a NOT NULL constraint predating the cards column — 0 is
      // accurate here (this row logs cards, not minutes) and every reader
      // (languageSkill.js) buckets by `cards != null`, not by this value.
      rows.push({ user_id: userId, date, skill, cards: Math.round(cards), minutes: 0, activity_type: 'anki', source: 'anki_sync' })
      dates.add(date)
      skillsSeen.add(skill)
      any = true
    }
    if (any) dayCount++
  }

  if (!rows.length) return jsonResponse({ ok: false, error: 'no valid skills', rejected }, 400, req)

  // Replace only what THIS endpoint previously wrote for these date/skill
  // combinations in one shot — a hand-logged Journal row (source is null
  // there) for the same skill/day is never touched.
  await svc.from('skill_logs').delete()
    .eq('user_id', userId).eq('source', 'anki_sync')
    .in('date', [...dates]).in('skill', [...skillsSeen])

  const { error } = await svc.from('skill_logs').insert(rows)
  if (error) return jsonResponse({ ok: false, error: error.message }, 500, req)

  await svc.from('user_settings').update({ last_ingest_at: new Date().toISOString() }).eq('health_ingest_token', token)

  return jsonResponse({ ok: true, days: dayCount, rows: rows.length, rejected }, 200, req)
})
