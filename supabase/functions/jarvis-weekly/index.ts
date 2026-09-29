// ============================================================================
// jarvis-weekly — proactive weekly report (post_deploy_23).
// ----------------------------------------------------------------------------
// Every Sunday (pg_cron, 18:00 UTC) for each user with recent data:
//   1. deterministic week numbers + logging gaps (this week vs last week),
//   2. the same Jarvis NU context the chat gets (serverLib.bundle.js),
//   3. last week's FOKUS, so Jarvis checks its own recommendation against
//      what actually happened (the accountability loop),
// → one Claude call writes the report; it is stored in jarvis_reports and
// posted into jarvis_conversations so it shows up in the Jarvis chat.
//
// Auth: x-cron-secret == Vault 'nightly_cron_secret' (service-role RPC).
// Deployed with --no-verify-jwt. `?dry=1` generates but saves nothing.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { corsHeaders, unauthorized, serviceClient } from '../_shared/auth.ts'
import { newUsage, addUsage, logUsage } from '../_shared/aiUsage.ts'
// @ts-ignore — generated plain-JS bundle
import { buildJarvisNowContext } from '../_shared/serverLib.bundle.js'

// Sonnet 5.5 at medium effort (2026-09-29 cost pass, was Opus 5.5): a weekly
// synthesis over pre-computed numbers — half the per-token price.
const MODEL = 'claude-sonnet-5-5'
const STOCKHOLM_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
const isoDaysAgo = (n: number) => STOCKHOLM_DATE.format(new Date(Date.now() - n * 86400000))
const r1 = (x: number) => Math.round(x * 10) / 10
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)

const SYSTEM = `Du är Jarvis, en datadriven personlig coach. Du skriver användarens VECKORAPPORT – den kommer oombedd på söndagskvällen, så den ska vara värd att läsa.

Skriv på svenska, max ~250 ord, markdown med exakt dessa rubriker:
**Veckan i siffror** – 3–5 punkter, bara det som faktiskt rörde sig (jämför med förra veckan).
**Förra veckans fokus** – bara om FÖRRA FOKUS finns: hände det? Svara ja/delvis/nej och belägg med siffror ur datan. Var ärlig, inte snäll.
**Mönster** – EN koppling mellan domäner (sömn, träning, plugg, jobb, humör, ekonomi) ur datan eller MÖNSTER-blocket. Märk den [fakta] eller [hypotes].
**Luckor i loggningen** – vad som saknas och varför det spelar roll (t.ex. sömn loggad 3/7 nätter → sömnsnittet och Hälsa-tiern är osäkra). Hoppa över om loggningen var komplett.
**Fokus nästa vecka** – EN konkret, mätbar sak som går att kontrollera i datan nästa söndag.

Sista raden ska vara exakt: FOKUS: <samma fokus, en mening, mätbart>

Regler: utgå bara från siffrorna nedan, hitta inte på. Inga hälsningsfraser. Lyft det som gick bra också. Om en tenta, deadline eller ett mål är nära – prioritera det i fokus.`

async function weekStats(supabase: any, userId: string, from: string, to: string) {
  const range = (q: any, col = 'date') => q.eq('user_id', userId).gte(col, from).lte(col, to)
  const [h, j, t, st, pa, ex, sk] = await Promise.all([
    range(supabase.from('health_logs').select('date,sleep_hours,steps,weight_kg,energy,energy_level,mood,alcohol_units')),
    range(supabase.from('journal_entries').select('date,mood,energy,sleep_hours')),
    range(supabase.from('training_sessions').select('date,session_type,duration_minutes,distance_km')),
    range(supabase.from('study_sessions').select('date,hours')),
    range(supabase.from('pa_shifts').select('date,hours_worked,is_night_shift')),
    range(supabase.from('expense_logs').select('date,amount,category')),
    range(supabase.from('skill_logs').select('date,skill,minutes')),
  ])
  const health = h.data || [], journal = j.data || []
  const sleepByDate: Record<string, number> = {}
  for (const r of journal) if (r.sleep_hours > 0) sleepByDate[r.date] = r.sleep_hours
  for (const r of health) if (r.sleep_hours > 0 && sleepByDate[r.date] == null) sleepByDate[r.date] = r.sleep_hours
  const sleeps = Object.values(sleepByDate)
  const moods = [...journal.map((r: any) => r.mood), ...health.map((r: any) => r.mood)].filter((v: any) => v > 0)
  const energies = [...journal.map((r: any) => r.energy), ...health.map((r: any) => r.energy_level ?? r.energy)].filter((v: any) => v > 0)
  const steps = health.map((r: any) => r.steps).filter((v: any) => v > 0)
  const weights = health.filter((r: any) => r.weight_kg > 0).sort((a: any, b: any) => a.date.localeCompare(b.date))
  const trainings = t.data || []
  const byType: Record<string, number> = {}
  for (const s of trainings) byType[s.session_type || 'other'] = (byType[s.session_type || 'other'] || 0) + 1
  const skills: Record<string, number> = {}
  for (const s of sk.data || []) skills[s.skill] = (skills[s.skill] || 0) + (s.minutes || 0)
  const expenses = (ex.data || []).filter((e: any) => e.category !== 'hyra')
  return {
    sleepNightsLogged: sleeps.length,
    sleepAvgH: sleeps.length ? r1(mean(sleeps)!) : null,
    stepsAvg: steps.length ? Math.round(mean(steps)!) : null,
    weighIns: weights.length,
    weightStartEnd: weights.length ? [weights[0].weight_kg, weights[weights.length - 1].weight_kg] : null,
    moodAvg: moods.length ? r1(mean(moods)!) : null,
    energyAvg: energies.length ? r1(mean(energies)!) : null,
    journalEntries: journal.length,
    trainings: trainings.length,
    trainingsByType: byType,
    runKm: r1(trainings.reduce((s: number, x: any) => s + (x.session_type === 'run' ? Number(x.distance_km) || 0 : 0), 0)),
    studyHours: r1((st.data || []).reduce((s: number, x: any) => s + (Number(x.hours) || 0), 0)),
    paHours: r1((pa.data || []).reduce((s: number, x: any) => s + (Number(x.hours_worked) || 0), 0)),
    paNightShifts: (pa.data || []).filter((x: any) => x.is_night_shift).length,
    alcoholUnits: r1(health.reduce((s: number, x: any) => s + (Number(x.alcohol_units) || 0), 0)),
    expensesExRentKr: Math.round(expenses.reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0)),
    skillMinutes: skills,
  }
}

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const supabase = serviceClient()
  const provided = req.headers.get('x-cron-secret') || ''
  const { data: expected, error: secretErr } = await supabase.rpc('get_nightly_cron_secret')
  if (secretErr || !expected || provided !== expected) return unauthorized(req)
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

  const dry = new URL(req.url).searchParams.get('dry') === '1'
  const end = isoDaysAgo(0), start = isoDaysAgo(6)
  const prevEnd = isoDaysAgo(7), prevStart = isoDaysAgo(13)
  const client = new Anthropic()

  const { data: users } = await supabase.from('profiles').select('id')
  const results: Record<string, unknown>[] = []
  for (const { id: userId } of users || []) {
    try {
      const [thisWeek, lastWeek] = await Promise.all([
        weekStats(supabase, userId, start, end),
        weekStats(supabase, userId, prevStart, prevEnd),
      ])
      // Nothing logged in two weeks (e.g. an unused account) → no report.
      const any = (w: any) => w.sleepNightsLogged || w.trainings || w.journalEntries || w.studyHours || w.stepsAvg
      if (!any(thisWeek) && !any(lastWeek)) { results.push({ userId, skipped: 'no_data' }); continue }

      const [nowCtx, { data: prev }] = await Promise.all([
        buildJarvisNowContext(supabase, userId, new Date()),
        supabase.from('jarvis_reports').select('period_start,focus').eq('user_id', userId).eq('kind', 'weekly')
          .lt('period_start', start).order('period_start', { ascending: false }).limit(1).maybeSingle(),
      ])
      const gaps = [
        `sömn loggad ${thisWeek.sleepNightsLogged}/7 nätter`,
        `journal ${thisWeek.journalEntries}/7 dagar`,
        thisWeek.stepsAvg == null ? 'inga steg loggade' : null,
        thisWeek.weighIns ? null : 'ingen vägning denna vecka',
      ].filter(Boolean).join(', ')

      const userMsg = [
        `VECKA ${start} – ${end}:\n${JSON.stringify(thisWeek)}`,
        `FÖRRA VECKAN ${prevStart} – ${prevEnd}:\n${JSON.stringify(lastWeek)}`,
        `LOGGNING DENNA VECKA: ${gaps}`,
        prev?.focus ? `FÖRRA FOKUS (satt ${prev.period_start}): ${prev.focus}` : 'FÖRRA FOKUS: – (första rapporten)',
        `NU-KONTEXT (mål, tentor, tiers, mönster, signaler):\n${nowCtx}`,
      ].join('\n\n')

      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      } as any)
      const usage = newUsage()
      addUsage(usage, response.usage)
      await logUsage(supabase, userId, dry ? 'weekly:dry' : 'weekly', response.model || MODEL, usage)
      if (response.stop_reason === 'refusal') { results.push({ userId, error: 'refusal', details: (response as any).stop_details }); continue }
      const content = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim()
      if (!content) { results.push({ userId, error: `empty response (${response.stop_reason})` }); continue }
      const focus = /^FOKUS:\s*(.+)$/m.exec(content)?.[1]?.trim() || null

      if (!dry) {
        const { error: repErr } = await supabase.from('jarvis_reports').upsert({
          user_id: userId, kind: 'weekly', period_start: start, period_end: end, content, focus,
        }, { onConflict: 'user_id,kind,period_start' })
        if (repErr) { results.push({ userId, error: repErr.message }); continue }
        const { error: convErr } = await supabase.from('jarvis_conversations').insert({
          user_id: userId, role: 'assistant', content: `📊 **Veckorapport ${start} – ${end}**\n\n${content}`,
        })
        if (convErr) console.warn('jarvis_conversations insert failed:', convErr.message)
      }
      results.push(dry ? { userId, focus, content, model: response.model, usage: response.usage } : { userId, ok: true, focus })
    } catch (e) {
      results.push({ userId, error: e instanceof Error ? e.message : String(e) })
    }
  }
  console.log('jarvis-weekly:', JSON.stringify(results.map((r: any) => ({ userId: r.userId, ok: r.ok, error: r.error, skipped: r.skipped }))))
  return json({ ok: true, period: [start, end], dry, results })
})
