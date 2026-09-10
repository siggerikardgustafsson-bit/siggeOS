import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, unauthorized, getAuthedUser, serviceClient } from '../_shared/auth.ts'

const STRAVA_CLIENT_ID     = Deno.env.get('STRAVA_CLIENT_ID') ?? ''
const STRAVA_CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET') ?? ''

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
  if (new Date(tokenRow.expires_at) >= new Date()) {
    return { accessToken: tokenRow.access_token }
  }
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const refreshed = await res.json().catch(() => null)
  if (!res.ok || !refreshed?.access_token) {
    console.warn('Strava token refresh failed:', res.status)
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
  const detailRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}?include_all_efforts=true`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (detailRes.status === 429) throw new Error('rate_limited')
  const detail = await detailRes.json().catch(() => null)
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
      const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (res.status === 429) { rateLimited = true; break }
      if (res.status === 401) {
        return new Response(JSON.stringify({ error: 'reauthorize', detail: 'Strava-anslutningen behöver kopplas om.' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
      const acts = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(acts)) {
        // Nothing fetched at all → surface it; partial pages → keep what we have.
        if (page === 1) return new Response(JSON.stringify({ error: 'Strava svarade oväntat vid hämtning av aktiviteter.' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } })
        break
      }
      if (acts.length === 0) break
      allActivities = [...allActivities, ...acts]
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

  // ===== DISCONNECT =====
  if (action === 'disconnect') {
    await supabase.from('strava_tokens').delete().eq('user_id', user.id)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: cors })
})
