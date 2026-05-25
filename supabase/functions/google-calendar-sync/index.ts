// supabase/functions/google-calendar-sync/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await resp.json()
  return data.access_token || null
}

async function fetchCalendarEvents(accessToken: string, monthsBack = 2): Promise<any[]> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1).toISOString()
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString()

  // First get all calendars
  const calListResp = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const calList = await calListResp.json()
  const calendars = calList.items || []
  console.log('Calendars found:', calendars.map((c: any) => c.summary).join(', '))

  // Fetch events from all calendars
  const allEvents: any[] = []
  for (const cal of calendars) {
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime&maxResults=500`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await resp.json()
    if (data.items) allEvents.push(...data.items)
  }

  return allEvents
}

function isPaShift(event: any): boolean {
  const title = (event.summary || '').toLowerCase()
  return title.includes('assistanstid') || title.includes('hos hw')
}

function parseShiftHours(event: any): { start: string; end: string; hours: number; isNight: boolean } | null {
  const startStr = event.start?.dateTime
  const endStr = event.end?.dateTime
  if (!startStr || !endStr) return null

  const start = new Date(startStr)
  const end = new Date(endStr)
  const hours = (end.getTime() - start.getTime()) / 3600000
  const hour = start.getHours()
  const isNight = hour >= 20 || hour <= 6

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    hours: Math.round(hours * 100) / 100,
    isNight,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No auth header')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? '',
    )

    // Get user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) throw new Error('Unauthorized')

    const { action, code, redirect_uri } = await req.json().catch(() => ({}))

    // ===== EXCHANGE CODE FOR TOKENS =====
    if (action === 'exchange_code') {
      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri,
          grant_type: 'authorization_code',
        }),
      })
      const tokens = await resp.json()
      if (tokens.error) throw new Error(tokens.error_description || tokens.error)

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

      await supabase.from('google_tokens').upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ===== SYNC CALENDAR =====
    if (action === 'sync') {
      const { data: tokenRow } = await supabase
        .from('google_tokens')
        .select('*')
        .eq('user_id', user.id)
        .single()

      console.log('Token row found:', !!tokenRow)
      console.log('Has refresh_token:', !!tokenRow?.refresh_token)
      console.log('Expires at:', tokenRow?.expires_at)
      console.log('Is expired:', tokenRow?.expires_at ? new Date(tokenRow.expires_at) < new Date() : 'unknown')

      if (!tokenRow?.refresh_token) {
        return new Response(JSON.stringify({ error: 'not_connected', message: 'Google Calendar inte kopplat' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      let accessToken = tokenRow.access_token
      if (!accessToken || new Date(tokenRow.expires_at) < new Date()) {
        console.log('Refreshing access token...')
        accessToken = await refreshAccessToken(tokenRow.refresh_token)
        console.log('New access token received:', !!accessToken)
        if (!accessToken) throw new Error('Could not refresh token')

        await supabase.from('google_tokens').update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id)
      }

      const events = await fetchCalendarEvents(accessToken)
      console.log('Total events fetched:', events.length)
      const paEvents = events.filter(isPaShift)
      console.log('PA events found:', paEvents.length)
      if (paEvents.length > 0) {
        console.log('PA event titles:', paEvents.map((e: any) => e.summary).join(', '))
      }

      // Upsert PA shifts
      let synced = 0
      for (const event of paEvents) {
        const parsed = parseShiftHours(event)
        if (!parsed) continue

        const date = event.start.dateTime
          ? new Date(event.start.dateTime).toISOString().slice(0, 10)
          : event.start.date

        await supabase.from('pa_shifts').upsert({
          user_id: user.id,
          date,
          start_time: parsed.start,
          end_time: parsed.end,
          hours_worked: parsed.hours,
          is_night_shift: parsed.isNight,
          client_name: event.summary,
          notes: event.description || null,
          google_event_id: event.id,
          synced_from_google: true,
        }, { onConflict: 'google_event_id' })
        synced++
      }

      return new Response(JSON.stringify({
        success: true,
        total_events: events.length,
        pa_events: paEvents.length,
        synced,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ===== CHECK CONNECTION =====
    if (action === 'check') {
      const { data } = await supabase.from('google_tokens')
        .select('updated_at').eq('user_id', user.id).single()
      return new Response(JSON.stringify({ connected: !!data, last_sync: data?.updated_at }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ===== SYNC MANDATORY SESSIONS =====
    if (action === 'mandatory') {
      const { data: tokenRow } = await supabase.from('google_tokens').select('*').eq('user_id', user.id).single()
      if (!tokenRow?.refresh_token) {
        return new Response(JSON.stringify({ error: 'not_connected' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      let accessToken = tokenRow.access_token
      if (!accessToken || new Date(tokenRow.expires_at) < new Date()) {
        accessToken = await refreshAccessToken(tokenRow.refresh_token)
        if (!accessToken) throw new Error('Could not refresh token')
        await supabase.from('google_tokens').update({ access_token: accessToken, expires_at: new Date(Date.now() + 3600000).toISOString() }).eq('user_id', user.id)
      }

      // Fetch all events from all calendars (12 months back, 6 forward)
      const events = await fetchCalendarEvents(accessToken, 12)

      // Filter events containing "obligatorisk" anywhere in title or description
      const mandatoryEvents = events.filter((e: any) => {
        const title = (e.summary || '').toLowerCase()
        const desc = (e.description || '').toLowerCase()
        return title.includes('obligatorisk') || desc.includes('obligatorisk')
      })

      // Fetch user's active courses for matching
      const { data: courses } = await supabase
        .from('courses')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('active', true)

      // Try to match event to a course by looking for course name/code in title
      function matchCourse(eventTitle: string, eventDesc: string) {
        if (!courses?.length) return null
        const text = (eventTitle + ' ' + eventDesc).toLowerCase()
        for (const course of courses) {
          const courseName = course.name.toLowerCase()
          // Match on course name or course code (e.g. "2LAO04")
          const words = courseName.split(/[\s,]+/).filter((w: string) => w.length > 3)
          if (words.some((w: string) => text.includes(w))) return course.id
          // Also try matching course code pattern like "2LA004"
          const codeMatch = courseName.match(/\d[a-z]{2,4}\d{2,4}/i)
          if (codeMatch && text.includes(codeMatch[0].toLowerCase())) return course.id
        }
        return null
      }

      let synced = 0
      for (const event of mandatoryEvents) {
        const startStr = event.start?.dateTime || event.start?.date
        const endStr = event.end?.dateTime || event.end?.date
        if (!startStr) continue

        const date = startStr.slice(0, 10)
        const courseId = matchCourse(event.summary || '', event.description || '')

        await supabase.from('mandatory_sessions').upsert({
          user_id: user.id,
          google_event_id: event.id,
          title: event.summary,
          date,
          start_time: event.start?.dateTime || null,
          end_time: event.end?.dateTime || null,
          course_id: courseId,
          course_hint: event.description || null,
        }, { onConflict: 'google_event_id' })
        synced++
      }

      return new Response(JSON.stringify({ success: true, synced, total: mandatoryEvents.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    throw new Error('Unknown action')

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
