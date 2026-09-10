import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, unauthorized, getAuthedUser, serviceClient } from '../_shared/auth.ts'

const STRAVA_CLIENT_ID     = Deno.env.get('STRAVA_CLIENT_ID') ?? ''
const STRAVA_CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET') ?? ''

// Strava's edge/WAF is happier with an explicit UA than Deno's default.
const STRAVA_UA = 'MaxxIt/1.0 (+https://maxxit.app)'

// A Strava error body can be 200-with-object or non-2xx. Detect the ones that
// mean "the token/grant is dead" so we can tell the user to reconnect instead
// of showing a generic 502.
function isStravaAuthError(status: number, body: any): boolean {
  if (status === 401) return true
  const errs = body && typeof body === 'object' ? body.errors : null
  if (Array.isArray(errs)) {
    return errs.some((e: any) =>
      /token|auth/i.test(String(e?.field || '')) ||
      /token|auth/i.test(String(e?.resource || '')) ||
      ['invalid', 'missing'].includes(String(e?.code || '')))
  }
  return /authorization error/i.test(String(body?.message || ''))
}

// Strava returns 403 {"errors":[{"resource":"Application","code":"Inactive"}]}
// when the API *application* (client_id) is deactivated on Strava's side —
// nothing the user or a token refresh can fix. The app owner must re-activate
// it / accept the API terms at strava.com/settings/api.
function isStravaAppInactive(body: any): boolean {
  const errs = body && typeof body === 'object' ? body.errors : null
  return Array.isArray(errs) && errs.some((e: any) =>
    String(e?.resource || '') === 'Application' && String(e?.code || '') === 'Inactive')
}

// GET a Strava endpoint with one retry on 5xx / network blip. Returns the parsed
// body plus the raw status + a text snippet so callers can surface what actually
// went wrong (the old code swallowed all of this into a flat 502).
async function stravaGet(pathAndQuery: string, accessToken: string): Promise<{
  ok: boolean; status: number; body: any; snippet: string
}> {
  let lastStatus = 0
  let lastSnippet = ''
  let lastBody: any = null
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1200))
    let res: Response
    try {
      res = await fetch(`https://www.strava.com/api/v3${pathAndQuery}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': STRAVA_UA, Accept: 'application/json' },
      })
    } catch (e) {
      lastStatus = 0
      lastSnippet = `fetch threw: ${e instanceof Error ? e.message : String(e)}`
      continue
    }
    const text = await res.text()
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch { /* HTML / empty */ }
    lastStatus = res.status
    lastSnippet = text.slice(0, 300)
    lastBody = body
    if (res.ok || res.status === 401 || res.status === 429) {
      return { ok: res.ok, status: res.status, body, snippet: lastSnippet }
    }
    // 4xx (non-auth, non-rate) won't get better on retry.
    if (res.status >= 400 && res.status < 500) break
  }
  return { ok: false, status: lastStatus, body: lastBody, snippet: lastSnippet }
}

type RunBestEffortTarget = {
  distanceKey: '1k' | '5k' | '10k' | 'half_marathon'
  label: string
  km: number
}

const RUN_BEST_EFFORT_MAP: Record<string, RunBestEffortTarget> = {
  '1k': { distanceKey: '1k', label: '1 km PR', km: 1 },
  '1 km': { distanceKey: '1k', label: '1 km PR', km: 1 },
  '5k': { distanceKey: '5k', label: '5 km PR', km: 5 },
  '5 km': { distanceKey: '5k', label: '5 km PR', km: 5 },
  '10k': { distanceKey: '10k', label: '10 km PR', km: 10 },
  '10 km': { distanceKey: '10k', label: '10 km PR', km: 10 },
  '1/2 marathon': { distanceKey: 'half_marathon', label: 'Halvmara PR', km: 21.097 },
  'half marathon': { distanceKey: 'half_marathon', label: 'Halvmara PR', km: 21.097 },
  'half-marathon': { distanceKey: 'half_marathon', label: 'Halvmara PR', km: 21.097 },
  'half_marathon': { distanceKey: 'half_marathon', label: 'Halvmara PR', km: 21.097 },
}

function mapRunBestEffortName(name: unknown): RunBestEffortTarget | null {
  if (!name || typeof name !== 'string') return null
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return RUN_BEST_EFFORT_MAP[normalized] ?? null
}

// Returns a valid access token, refreshing if expired. On a failed refresh it
// returns an errorResponse instead of writing a corrupt token row (the old
// code set access_token=undefined and expires_at='Invalid Date', which made
// every later call 401 silently). See AUDIT.md P1-8.
async function getValidStravaToken(
  supabase: any,
  tokenRow: any,
  userId: string,
  cors: Record<string, string>,
): Promise<{ accessToken?: string; errorResponse?: Response }> {
  // Refresh a bit early — a long sync can outlive a token that's seconds from
  // expiring, and an Invalid/absent expires_at parses to NaN (→ refresh).
  const expMs = new Date(tokenRow.expires_at).getTime()
  if (Number.isFinite(expMs) && expMs - Date.now() > 120_000) {
    return { accessToken: tokenRow.access_token }
  }
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    console.error('Strava refresh: STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET not set on the function')
    return {
      errorResponse: new Response(
        JSON.stringify({ error: 'config', detail: 'Strava-integrationen är felkonfigurerad på servern (saknar nycklar).' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
      ),
    }
  }
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': STRAVA_UA },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const refreshed = await res.json().catch(() => null)
  if (!res.ok || !refreshed?.access_token) {
    console.error('Strava token refresh failed:', res.status, JSON.stringify(refreshed)?.slice(0, 200))
    return {
      errorResponse: new Response(
        JSON.stringify({ error: 'reauthorize', detail: 'Strava-anslutningen behöver kopplas om.' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } },
      ),
    }
  }
  const expiresAt = refreshed.expires_at
    ? new Date(refreshed.expires_at * 1000).toISOString()
    : new Date(Date.now() + (Number(refreshed.expires_in) || 21600) * 1000).toISOString()
  await supabase.from('strava_tokens').update({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? tokenRow.refresh_token,
    expires_at: expiresAt,
  }).eq('user_id', userId)
  return { accessToken: refreshed.access_token }
}

async function upsertRunBestEffortsForActivity(
  supabase: any,
  userId: string,
  accessToken: string,
  activityId: string | number,
  fallbackDate: string | null,
) {
  const detailRes = await stravaGet(`/activities/${activityId}?include_all_efforts=true`, accessToken)
  if (detailRes.status === 429) throw new Error('rate_limited')
  const detail = detailRes.body
  if (!detailRes.ok || !detail) {
    console.warn(`Strava activity detail failed for ${activityId}:`, detailRes.status)
    return 0
  }
  if (!Array.isArray(detail.best_efforts)) return 0

  let saved = 0
  const seenDistanceKeys = new Set<string>()

  for (const effort of detail.best_efforts) {
    const mapping = mapRunBestEffortName(effort?.name)
    if (!mapping || !effort?.elapsed_time) continue

    // One saved best effort per target distance per activity.
    // Never estimate from whole-activity average pace.
    if (seenDistanceKeys.has(mapping.distanceKey)) continue
    seenDistanceKeys.add(mapping.distanceKey)

    const timeSeconds = Number(effort.elapsed_time)
    if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) continue

    const effortDistanceKm = effort.distance
      ? Math.round((Number(effort.distance) / 1000) * 1000) / 1000
      : mapping.km

    const effortDate =
      effort.start_date_local?.slice(0, 10) ||
      detail.start_date_local?.slice(0, 10) ||
      fallbackDate

    const { error } = await supabase.from('run_personal_records').upsert({
      user_id: userId,
      distance_key: mapping.distanceKey,
      label: mapping.label,
      distance_km: effortDistanceKm || mapping.km,
      time_seconds: timeSeconds,
      pace_per_km: Math.round(timeSeconds / mapping.km),
      date: effortDate,
      strava_activity_id: String(activityId),
      strava_effort_name: effort.name,
      source: 'strava',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,distance_key,strava_activity_id' })

    if (error) {
      console.warn(`run_personal_records upsert failed for ${activityId}/${mapping.distanceKey}:`, error)
      continue
    }
    saved++
  }

  return saved
}

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // Resolve the authenticated user (rejects anon-key-only / anonymous calls).
  // Service-role client is required below to read/write the locked-down
  // strava_tokens table (no client RLS policy) — always scoped by user.id.
  const { user } = await getAuthedUser(req)
  if (!user) return unauthorized(req)
  const supabase = serviceClient()

  // ===== EXCHANGE CODE FOR TOKEN =====
  if (action === 'exchange') {
    const { code } = await req.json()
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })
    const data = await res.json()
    if (!res.ok) return new Response(JSON.stringify({ error: data.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

    await supabase.from('strava_tokens').upsert({
      user_id: user.id,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(data.expires_at * 1000).toISOString(),
      athlete_id: data.athlete?.id,
    }, { onConflict: 'user_id' })

    return new Response(JSON.stringify({ ok: true, athlete: data.athlete }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // ===== FETCH PRs FOR EXISTING STRAVA RUNS =====
  if (action === 'fetch_prs') {
    const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).maybeSingle()
    if (!tokenRow) return new Response(JSON.stringify({ error: 'reauthorize', detail: 'Strava är inte kopplat.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

    const tok = await getValidStravaToken(supabase, tokenRow, user.id, cors)
    if (tok.errorResponse) return tok.errorResponse
    const accessToken = tok.accessToken!

    // Bounded per call — Strava allows 100 req / 15 min and this makes one
    // detail call per run. Most-recent-first so new PRs surface fastest; older
    // runs get processed on later calls (AUDIT.md P1-1).
    const { data: sessions } = await supabase
      .from('training_sessions')
      .select('strava_id, date')
      .eq('user_id', user.id)
      .eq('source', 'strava')
      .eq('session_type', 'run')
      .not('strava_id', 'is', null)
      .order('date', { ascending: false })
      .limit(40)

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ ok: true, prsUpdated: 0, processed: 0 }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    let prsUpdated = 0
    let processed = 0
    let failed = 0
    let rateLimited = false

    for (const session of sessions) {
      if (!session.strava_id) continue
      processed++
      try {
        prsUpdated += await upsertRunBestEffortsForActivity(
          supabase,
          user.id,
          accessToken,
          session.strava_id,
          session.date,
        )
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 120))
      } catch (e) {
        if (e instanceof Error && e.message === 'rate_limited') { rateLimited = true; break }
        failed++
        console.warn(`Best-efforts fetch failed for ${session.strava_id}:`, e)
      }
    }

    return new Response(JSON.stringify({ ok: true, prsUpdated, processed, failed, rateLimited }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  // ===== SYNC ACTIVITIES =====
  if (action === 'sync') {
    // Get token
    const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).maybeSingle()
    if (!tokenRow) return new Response(JSON.stringify({ error: 'reauthorize', detail: 'Strava är inte kopplat.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

    // Refresh token if expired
    const tok = await getValidStravaToken(supabase, tokenRow, user.id, cors)
    if (tok.errorResponse) return tok.errorResponse
    const accessToken = tok.accessToken!

    // Fetch activities — 100 per page, up to 4 pages (400 most recent).
    let allActivities: any[] = []
    let rateLimited = false
    for (let page = 1; page <= 4; page++) {
      const r = await stravaGet(`/athlete/activities?per_page=100&page=${page}`, accessToken)
      if (r.status === 429) { rateLimited = true; break }
      if (isStravaAppInactive(r.body)) {
        return new Response(JSON.stringify({
          error: 'app_inactive',
          detail: 'Strava-API-appen är inaktiverad hos Strava. Appägaren måste återaktivera den och godkänna API-villkoren på strava.com/settings/api.',
        }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
      if (isStravaAuthError(r.status, r.body)) {
        return new Response(JSON.stringify({ error: 'reauthorize', detail: 'Strava-anslutningen behöver kopplas om.' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
      if (!r.ok || !Array.isArray(r.body)) {
        // Nothing fetched at all → surface the real reason; partial pages → keep what we have.
        if (page === 1) {
          console.error('Strava activities fetch failed', { status: r.status, snippet: r.snippet })
          return new Response(JSON.stringify({
            error: `Strava svarade med HTTP ${r.status || 'okänt'} vid hämtning av aktiviteter.`,
            stravaStatus: r.status,
            stravaBody: r.snippet || null,
          }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } })
        }
        break
      }
      if (r.body.length === 0) break
      allActivities = [...allActivities, ...r.body]
    }

    // Map Strava activity types to our session types
    const typeMap: Record<string, string> = {
      Run: 'run', TrailRun: 'run', VirtualRun: 'run',
      Ride: 'other', VirtualRide: 'other', EBikeRide: 'other',
      Swim: 'other', Walk: 'walk', Hike: 'walk',
      WeightTraining: 'gym', Workout: 'gym', CrossFit: 'gym',
    }


    // One query for every strava_id we already have — instead of a SELECT per
    // activity (AUDIT.md P1-1).
    const { data: existingRows } = await supabase
      .from('training_sessions')
      .select('strava_id')
      .eq('user_id', user.id)
      .eq('source', 'strava')
      .not('strava_id', 'is', null)
    const existingIds = new Set((existingRows || []).map((r: any) => String(r.strava_id)))

    const isRunType = (t: string) => t === 'Run' || t === 'TrailRun' || t === 'VirtualRun'

    const newRows: any[] = []
    const newRunActs: { id: any; date: string }[] = []
    let skipped = 0

    for (const act of allActivities) {
      const date = act.start_date_local?.slice(0, 10)
      if (!date) continue
      if (existingIds.has(String(act.id))) { skipped++; continue }

      const distanceKm = act.distance ? Math.round(act.distance / 10) / 100 : null
      const durationMin = act.moving_time ? Math.round(act.moving_time / 60) : null
      const pacePerKm = distanceKm && act.moving_time ? Math.round(act.moving_time / distanceKm) : null
      const elevationM = act.total_elevation_gain || null
      const avgHr = act.average_heartrate || null

      newRows.push({
        user_id: user.id,
        date,
        session_type: typeMap[act.type] || 'other',
        duration_minutes: durationMin,
        distance_km: distanceKm,
        pace_per_km: pacePerKm,
        notes: `${act.name}${elevationM ? ` · ${Math.round(elevationM)}m↑` : ''}${avgHr ? ` · ❤️ ${Math.round(avgHr)}bpm` : ''}`,
        source: 'strava',
        strava_id: String(act.id),
        feeling: null,
      })
      if (isRunType(act.type)) newRunActs.push({ id: act.id, date })
    }

    // Batch insert (chunked) instead of one round-trip per activity.
    let synced = 0
    for (let i = 0; i < newRows.length; i += 500) {
      const chunk = newRows.slice(i, i + 500)
      const { error } = await supabase.from('training_sessions').insert(chunk)
      if (error) { console.warn('batch insert failed:', error.message); continue }
      synced += chunk.length
    }

    // Best-efforts detail calls are rate-limited (100 req / 15 min). Bound them
    // per invocation; the rest get picked up by fetch_prs over subsequent runs.
    const DETAIL_BUDGET = 40
    let prsUpdated = 0
    let detailCalls = 0
    let detailDeferred = 0
    for (const run of newRunActs) {
      if (detailCalls >= DETAIL_BUDGET) { detailDeferred++; continue }
      detailCalls++
      try {
        prsUpdated += await upsertRunBestEffortsForActivity(supabase, user.id, accessToken, run.id, run.date)
        await new Promise(r => setTimeout(r, 150))
      } catch (e) {
        if (e instanceof Error && e.message === 'rate_limited') { rateLimited = true; detailDeferred += (newRunActs.length - detailCalls); break }
        console.warn(`best_efforts fetch failed for activity ${run.id}:`, e)
      }
    }

    return new Response(JSON.stringify({ ok: true, synced, skipped, total: allActivities.length, prsUpdated, detailDeferred, rateLimited }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  // ===== CHECK CONNECTION STATUS =====
  if (action === 'status') {
    const { data } = await supabase.from('strava_tokens').select('athlete_id, expires_at').eq('user_id', user.id).maybeSingle()
    return new Response(JSON.stringify({ connected: !!data, athlete_id: data?.athlete_id }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  // ===== DEBUG — no secrets, shows exactly why a sync fails =====
  if (action === 'debug') {
    const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).maybeSingle()
    const out: Record<string, unknown> = {
      hasTokenRow: !!tokenRow,
      athlete_id: tokenRow?.athlete_id ?? null,
      expires_at: tokenRow?.expires_at ?? null,
      expired: tokenRow ? !(new Date(tokenRow.expires_at).getTime() - Date.now() > 120_000) : null,
      hasRefreshToken: !!tokenRow?.refresh_token,
      clientKeysSet: !!STRAVA_CLIENT_ID && !!STRAVA_CLIENT_SECRET,
    }
    if (tokenRow) {
      const tok = await getValidStravaToken(supabase, tokenRow, user.id, cors)
      out.tokenRefresh = tok.errorResponse ? 'failed' : 'ok'
      if (!tok.errorResponse) {
        const probe = await stravaGet('/athlete/activities?per_page=1&page=1', tok.accessToken!)
        out.activitiesProbe = {
          status: probe.status,
          ok: probe.ok,
          isArray: Array.isArray(probe.body),
          count: Array.isArray(probe.body) ? probe.body.length : null,
          bodySnippet: probe.ok ? null : probe.snippet,
        }
      }
    }
    return new Response(JSON.stringify(out, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // ===== DISCONNECT =====
  if (action === 'disconnect') {
    await supabase.from('strava_tokens').delete().eq('user_id', user.id)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: cors })
})
