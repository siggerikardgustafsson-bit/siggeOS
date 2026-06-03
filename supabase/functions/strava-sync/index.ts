import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRAVA_CLIENT_ID     = Deno.env.get('STRAVA_CLIENT_ID') ?? ''
const STRAVA_CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET') ?? ''
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? ''

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
  const detail = await detailRes.json()
  if (!detailRes.ok) {
    console.warn(`Strava activity detail failed for ${activityId}:`, detail)
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // Auth header → get user
  const authHeader = req.headers.get('Authorization') || ''
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

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
    if (!res.ok) return new Response(JSON.stringify({ error: data.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    await supabase.from('strava_tokens').upsert({
      user_id: user.id,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(data.expires_at * 1000).toISOString(),
      athlete_id: data.athlete?.id,
    }, { onConflict: 'user_id' })

    return new Response(JSON.stringify({ ok: true, athlete: data.athlete }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ===== FETCH PRs FOR EXISTING STRAVA RUNS =====
  if (action === 'fetch_prs') {
    const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single()
    if (!tokenRow) return new Response(JSON.stringify({ error: 'Not connected' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    let accessToken = tokenRow.access_token
    if (new Date(tokenRow.expires_at) < new Date()) {
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
      const refreshed = await res.json()
      accessToken = refreshed.access_token
      await supabase.from('strava_tokens').update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
      }).eq('user_id', user.id)
    }

    const { data: sessions } = await supabase
      .from('training_sessions')
      .select('strava_id, date')
      .eq('user_id', user.id)
      .eq('source', 'strava')
      .eq('session_type', 'run')
      .not('strava_id', 'is', null)
      .order('date', { ascending: false })

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ ok: true, prsUpdated: 0, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let prsUpdated = 0
    let processed = 0
    let failed = 0

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
        failed++
        console.warn(`Best-efforts fetch failed for ${session.strava_id}:`, e)
      }
    }

    return new Response(JSON.stringify({ ok: true, prsUpdated, processed, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ===== SYNC ACTIVITIES =====
  if (action === 'sync') {
    // Get token
    const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single()
    if (!tokenRow) return new Response(JSON.stringify({ error: 'Not connected' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Refresh token if expired
    let accessToken = tokenRow.access_token
    if (new Date(tokenRow.expires_at) < new Date()) {
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
      const refreshed = await res.json()
      accessToken = refreshed.access_token
      await supabase.from('strava_tokens').update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
      }).eq('user_id', user.id)
    }

    // Fetch activities — up to 200 per page, max 2 pages
    let allActivities: any[] = []
    for (let page = 1; page <= 2; page++) {
      const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      const acts = await res.json()
      if (!Array.isArray(acts) || acts.length === 0) break
      allActivities = [...allActivities, ...acts]
    }

    // Map Strava activity types to our session types
    const typeMap: Record<string, string> = {
      Run: 'run', TrailRun: 'run', VirtualRun: 'run',
      Ride: 'other', VirtualRide: 'other', EBikeRide: 'other',
      Swim: 'other', Walk: 'walk', Hike: 'walk',
      WeightTraining: 'gym', Workout: 'gym', CrossFit: 'gym',
    }


    let synced = 0
    let skipped = 0
    let prsUpdated = 0

    for (const act of allActivities) {
      const sessionType = typeMap[act.type] || 'other'
      const date = act.start_date_local?.slice(0, 10)
      if (!date) continue

      // Check if already synced
      const { data: existing } = await supabase
        .from('training_sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('strava_id', String(act.id))
        .single()

      if (existing) { skipped++; continue }

      const distanceKm = act.distance ? Math.round(act.distance / 10) / 100 : null
      const durationMin = act.moving_time ? Math.round(act.moving_time / 60) : null
      const pacePerKm = distanceKm && act.moving_time ? Math.round(act.moving_time / distanceKm) : null
      const elevationM = act.total_elevation_gain || null
      const avgHr = act.average_heartrate || null
      const maxHr = act.max_heartrate || null

      await supabase.from('training_sessions').insert({
        user_id: user.id,
        date,
        session_type: sessionType,
        duration_minutes: durationMin,
        distance_km: distanceKm,
        pace_per_km: pacePerKm,
        notes: `${act.name}${elevationM ? ` · ${Math.round(elevationM)}m↑` : ''}${avgHr ? ` · ❤️ ${Math.round(avgHr)}bpm` : ''}`,
        source: 'strava',
        strava_id: String(act.id),
        feeling: null,
      })
      synced++

      // For run activities, fetch detailed activity to get Strava's actual best_efforts.
      // Do not estimate 1 km / 5 km / 10 km from whole-run average pace.
      if (act.type === 'Run' || act.type === 'TrailRun' || act.type === 'VirtualRun') {
        try {
          prsUpdated += await upsertRunBestEffortsForActivity(
            supabase,
            user.id,
            accessToken,
            act.id,
            date,
          )
          await new Promise(r => setTimeout(r, 120))
        } catch (e) {
          console.warn(`best_efforts fetch failed for activity ${act.id}:`, e)
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, synced, skipped, total: allActivities.length, prsUpdated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ===== CHECK CONNECTION STATUS =====
  if (action === 'status') {
    const { data } = await supabase.from('strava_tokens').select('athlete_id, expires_at').eq('user_id', user.id).single()
    return new Response(JSON.stringify({ connected: !!data, athlete_id: data?.athlete_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ===== DISCONNECT =====
  if (action === 'disconnect') {
    await supabase.from('strava_tokens').delete().eq('user_id', user.id)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders })
})
