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

type SupabaseClient = ReturnType<typeof createClient>

type RunPr = {
  distanceKey: '1k' | '5k' | '10k' | 'half_marathon'
  label: string
  km: number
  time: number
  pace: number
  date: string
  stravaActivityId: string
  effortName: string
}

const TARGETS = [
  { distanceKey: '1k',            label: '1 km PR',       km: 1.0,    meters: 1000,  names: ['1k', '1 km', '1 kilometer'] },
  { distanceKey: '5k',            label: '5 km PR',       km: 5.0,    meters: 5000,  names: ['5k', '5 km', '5 kilometer'] },
  { distanceKey: '10k',           label: '10 km PR',      km: 10.0,   meters: 10000, names: ['10k', '10 km', '10 kilometer'] },
  { distanceKey: 'half_marathon', label: 'Halvmara PR',   km: 21.097, meters: 21097, names: ['1/2 marathon', 'half marathon', 'half-marathon', 'halvmarathon'] },
] as const

function normalizeName(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function matchBestEffort(effort: any) {
  const name = normalizeName(effort?.name)
  const meters = Number(effort?.distance || 0)

  for (const target of TARGETS) {
    if (target.names.some(n => name === n)) return target
    if (meters && Math.abs(meters - target.meters) <= Math.max(25, target.meters * 0.01)) return target
  }

  return null
}

async function getAccessToken(supabase: SupabaseClient, userId: string) {
  const { data: tokenRow } = await supabase.from('strava_tokens').select('*').eq('user_id', userId).single()
  if (!tokenRow) throw new Error('Not connected')

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
    if (!res.ok) throw new Error(refreshed?.message || 'Could not refresh Strava token')

    accessToken = refreshed.access_token
    await supabase.from('strava_tokens').update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    }).eq('user_id', userId)
  }

  return accessToken
}

async function extractRunPrsForActivity(accessToken: string, activityId: string, fallbackDate: string): Promise<RunPr[]> {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  const detail = await res.json()
  if (!res.ok || !Array.isArray(detail.best_efforts)) return []

  const bestByDistance: Record<string, RunPr> = {}

  for (const effort of detail.best_efforts) {
    const target = matchBestEffort(effort)
    const elapsed = Number(effort?.elapsed_time || 0)
    if (!target || !elapsed) continue

    const candidate: RunPr = {
      distanceKey: target.distanceKey,
      label: target.label,
      km: target.km,
      time: elapsed,
      pace: Math.round(elapsed / target.km),
      date: effort.start_date_local?.slice(0, 10) || detail.start_date_local?.slice(0, 10) || fallbackDate,
      stravaActivityId: String(activityId),
      effortName: String(effort.name || target.label),
    }

    const existing = bestByDistance[target.distanceKey]
    if (!existing || candidate.time < existing.time) bestByDistance[target.distanceKey] = candidate
  }

  return Object.values(bestByDistance)
}

async function upsertBestRunPrs(supabase: SupabaseClient, userId: string, candidates: RunPr[]) {
  let prsUpdated = 0

  for (const pr of candidates) {
    const { data: existing } = await supabase
      .from('run_personal_records')
      .select('time_seconds')
      .eq('user_id', userId)
      .eq('distance_key', pr.distanceKey)
      .maybeSingle()

    const existingTime = Number(existing?.time_seconds || 0)
    if (existingTime && existingTime <= pr.time) continue

    const { error } = await supabase.from('run_personal_records').upsert({
      user_id: userId,
      distance_key: pr.distanceKey,
      label: pr.label,
      distance_km: pr.km,
      time_seconds: pr.time,
      pace_per_km: pr.pace,
      date: pr.date,
      strava_activity_id: pr.stravaActivityId,
      strava_effort_name: pr.effortName,
      source: 'strava',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,distance_key' })

    if (!error) prsUpdated++
    else console.warn('run_personal_records upsert failed:', error)
  }

  return prsUpdated
}

function isRunType(type: string) {
  return type === 'Run' || type === 'TrailRun' || type === 'VirtualRun'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

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
    try {
      const accessToken = await getAccessToken(supabase, user.id)

      const { data: sessions } = await supabase
        .from('training_sessions')
        .select('strava_id, date')
        .eq('user_id', user.id)
        .eq('source', 'strava')
        .eq('session_type', 'run')
        .not('strava_id', 'is', null)

      if (!sessions || sessions.length === 0) {
        return new Response(JSON.stringify({ ok: true, prsUpdated: 0, processed: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const globalBest: Record<string, RunPr> = {}

      for (const session of sessions) {
        const prs = await extractRunPrsForActivity(accessToken, String(session.strava_id), session.date)
        for (const pr of prs) {
          const existing = globalBest[pr.distanceKey]
          if (!existing || pr.time < existing.time) globalBest[pr.distanceKey] = pr
        }
        await new Promise(r => setTimeout(r, 100))
      }

      const prsUpdated = await upsertBestRunPrs(supabase, user.id, Object.values(globalBest))

      return new Response(JSON.stringify({ ok: true, prsUpdated, processed: sessions.length, found: Object.keys(globalBest).length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  // ===== SYNC ACTIVITIES =====
  if (action === 'sync') {
    try {
      const accessToken = await getAccessToken(supabase, user.id)

      let allActivities: any[] = []
      for (let page = 1; page <= 2; page++) {
        const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        const acts = await res.json()
        if (!Array.isArray(acts) || acts.length === 0) break
        allActivities = [...allActivities, ...acts]
      }

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

        const { data: existing } = await supabase
          .from('training_sessions')
          .select('id')
          .eq('user_id', user.id)
          .eq('strava_id', String(act.id))
          .maybeSingle()

        if (existing) { skipped++; continue }

        const distanceKm = act.distance ? Math.round(act.distance / 10) / 100 : null
        const durationMin = act.moving_time ? Math.round(act.moving_time / 60) : null
        const pacePerKm = distanceKm && act.moving_time ? Math.round(act.moving_time / distanceKm) : null
        const elevationM = act.total_elevation_gain || null
        const avgHr = act.average_heartrate || null

        await supabase.from('training_sessions').insert({
          user_id: user.id,
          date,
          session_type: sessionType,
          duration_minutes: durationMin,
          distance_km: distanceKm,
          time_seconds: act.moving_time || null,
          pace_per_km: pacePerKm,
          notes: `${act.name}${elevationM ? ` · ${Math.round(elevationM)}m↑` : ''}${avgHr ? ` · ❤️ ${Math.round(avgHr)}bpm` : ''}`,
          source: 'strava',
          strava_id: String(act.id),
          feeling: null,
        })
        synced++

        if (isRunType(act.type)) {
          const prs = await extractRunPrsForActivity(accessToken, String(act.id), date)
          prsUpdated += await upsertBestRunPrs(supabase, user.id, prs)
          await new Promise(r => setTimeout(r, 100))
        }
      }

      return new Response(JSON.stringify({ ok: true, synced, skipped, total: allActivities.length, prsUpdated }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  // ===== CHECK CONNECTION STATUS =====
  if (action === 'status') {
    const { data } = await supabase.from('strava_tokens').select('athlete_id, expires_at').eq('user_id', user.id).maybeSingle()
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
