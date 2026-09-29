// ============================================================================
// push-notify — web push reminders (post_deploy_27).
// ----------------------------------------------------------------------------
// Hourly (pg_cron). Decides in Europe/Stockholm time what is due per user and
// only sends when something is actually missing / relevant:
//   09 · notif_journal  · no sleep logged for last night   → "Hur sov du?"
//   21 · notif_journal  · no journal entry today            → kvällslogg
//   18 · notif_training · an exam tomorrow                  → tenta imorgon
//   12 · notif_training · experiment at half-time / last day
//   20 · notif_training · Sunday, weekly report written     → rapporten är klar
// notif_training is labelled "Jarvis-påminnelser" in Settings.
// notification_log (user, kind, day) makes every reminder once-per-day.
//
// Auth: x-cron-secret (scheduled) — or a user JWT with {"test": true}, which
// sends a test notification to that user's own devices (Settings button).
// Deployed with --no-verify-jwt.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import webpush from 'npm:web-push@3.6.7'
import { corsHeaders, unauthorized, serviceClient, getAuthedUser } from '../_shared/auth.ts'
// @ts-ignore — generated plain-JS bundle
import { evaluateExperiment, fetchExperimentDays, experimentsFetchStart } from '../_shared/serverLib.bundle.js'

const TZ = 'Europe/Stockholm'
const dateFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const hourFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' })
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' })

type Note = { kind: string; title: string; body: string; url: string }

function vapid() {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) throw new Error('VAPID keys not configured')
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'https://github.com', pub, priv)
}

// Send to every device of a user; prune subscriptions the push service says are gone.
async function sendToUser(svc: any, userId: string, note: Note): Promise<number> {
  const { data: subs } = await svc.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', userId)
  let ok = 0
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: note.title, body: note.body, url: note.url, tag: note.kind }), { TTL: 4 * 3600 })
      ok++
      await svc.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('id', s.id)
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await svc.from('push_subscriptions').delete().eq('id', s.id)
      else console.warn('push failed:', e?.statusCode, e?.body || e?.message)
    }
  }
  return ok
}

async function dueNotes(svc: any, userId: string, prefs: any, now: Date): Promise<Note[]> {
  const today = dateFmt.format(now)
  const tomorrow = dateFmt.format(new Date(now.getTime() + 86400000))
  const hour = Number(hourFmt.format(now))
  const sunday = dayFmt.format(now) === 'Sun'
  const out: Note[] = []

  if (prefs.notif_journal && hour === 9) {
    const [h, j] = await Promise.all([
      svc.from('health_logs').select('id').eq('user_id', userId).eq('date', today).gt('sleep_hours', 0).limit(1),
      svc.from('journal_entries').select('id').eq('user_id', userId).eq('date', today).gt('sleep_hours', 0).limit(1),
    ])
    if (!h.data?.length && !j.data?.length) out.push({ kind: 'sleep_morning', title: 'Hur sov du?', body: 'Logga natten – tio sekunder, och sömnsnittet blir att lita på.', url: '/halsa' })
  }
  if (prefs.notif_journal && hour === 21) {
    const { data } = await svc.from('journal_entries').select('id').eq('user_id', userId).eq('date', today).limit(1)
    if (!data?.length) out.push({ kind: 'evening_log', title: 'Kvällslogg', body: 'Humör, energi och en rad om dagen – 20 sekunder.', url: '/journal' })
  }
  if (prefs.notif_training && hour === 18) {
    const { data } = await svc.from('course_exams').select('name').eq('user_id', userId).eq('exam_date', tomorrow).limit(3)
    if (data?.length) out.push({ kind: 'exam_eve', title: `Tenta imorgon: ${data.map((e: any) => e.name).join(', ')}`, body: 'Sista repetitionen nu – och sov ordentligt i natt.', url: '/plugg' })
  }
  if (prefs.notif_training && hour === 12) {
    const { data: exps } = await svc.from('experiments').select('*').eq('user_id', userId).eq('status', 'active')
    const from = experimentsFetchStart(exps || [])
    if (from) {
      const days = await fetchExperimentDays(svc, userId, from, today)
      for (const e of exps || []) {
        const r = evaluateExperiment(e, days, now)
        const half = Math.ceil(r.duration / 2)
        const adh = r.adherence?.rate != null ? ` Följsamhet ${Math.round(r.adherence.rate * 100)}%.` : ''
        if (r.phase === 'running' && r.dayIndex === half) out.push({ kind: `exp_mid:${e.id}`, title: `Halvvägs: ${e.title}`, body: `Dag ${r.dayIndex} av ${r.duration}.${adh} ${r.verdictLabel}.`, url: '/insights' })
        if (r.dayIndex === r.duration && r.phase !== 'upcoming') out.push({ kind: `exp_end:${e.id}`, title: `Sista dagen: ${e.title}`, body: `Resultatet är klart imorgon.${adh}`, url: '/insights' })
      }
    }
  }
  if (prefs.notif_training && sunday && hour === 20) {
    const { data } = await svc.from('jarvis_reports').select('focus').eq('user_id', userId).eq('kind', 'weekly').eq('period_end', today).limit(1)
    if (data?.length) out.push({ kind: 'weekly_report', title: 'Veckorapporten är klar', body: data[0].focus ? `Nästa veckas fokus: ${data[0].focus}` : 'Jarvis har gått igenom veckan.', url: '/jarvis' })
  }
  return out
}

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  const svc = serviceClient()
  try { vapid() } catch (e) { return json({ error: String(e) }, 500) }

  // Test from Settings: user-authenticated, own devices only.
  const provided = req.headers.get('x-cron-secret') || ''
  if (!provided) {
    const body = await req.json().catch(() => ({}))
    if (!body?.test) return unauthorized(req)
    const { user } = await getAuthedUser(req)
    if (!user) return unauthorized(req)
    const sent = await sendToUser(svc, user.id, { kind: 'test', title: 'MaxxIt', body: 'Notiser fungerar på den här enheten. 👍', url: '/installningar' })
    return json({ ok: true, sent })
  }

  const { data: expected } = await svc.rpc('get_nightly_cron_secret')
  if (!expected || provided !== expected) return unauthorized(req)

  const now = new Date()
  const today = dateFmt.format(now)
  const { data: subs } = await svc.from('push_subscriptions').select('user_id')
  const userIds = [...new Set((subs || []).map((s: any) => s.user_id))]
  const results: Record<string, unknown>[] = []
  for (const userId of userIds) {
    const { data: prefs } = await svc.from('user_settings').select('notif_journal,notif_training').eq('user_id', userId).maybeSingle()
    if (!prefs?.notif_journal && !prefs?.notif_training) continue
    for (const note of await dueNotes(svc, userId, prefs, now)) {
      // Claim the (user, kind, day) slot first — a unique violation means it
      // was already sent (or another run is sending it).
      const { error: claimErr } = await svc.from('notification_log').insert({ user_id: userId, kind: note.kind, day: today, title: note.title })
      if (claimErr) continue
      results.push({ userId, kind: note.kind, sent: await sendToUser(svc, userId, note) })
    }
  }
  console.log('push-notify:', JSON.stringify(results))
  return json({ ok: true, hour: Number(hourFmt.format(now)), results })
})
