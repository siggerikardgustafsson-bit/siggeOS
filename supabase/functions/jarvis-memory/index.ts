// ============================================================================
// jarvis-memory — keeps Jarvis's long-term memory (jarvis_insights) current
// (post_deploy_31).
// ----------------------------------------------------------------------------
// Nightly (pg_cron 01:30 UTC): for each user who chatted or journaled in the
// last ~day, one Claude call reads the ACTIVE memory + that day's chat and
// journal and returns add / update / archive operations. Memory no longer
// depends on Jarvis remembering to call save_insight mid-conversation (it
// had saved 4 insights in 3.5 months).
//
// ?mode=curate — one-off: condenses every active insight into a short curated
// list, archives the old rows (never deletes) and inserts the new ones.
// ?dry=1 — returns what would change, writes nothing.
//
// Auth: x-cron-secret == Vault 'nightly_cron_secret'. Deployed --no-verify-jwt.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { corsHeaders, unauthorized, serviceClient } from '../_shared/auth.ts'
import { newUsage, addUsage, logUsage } from '../_shared/aiUsage.ts'

const MODEL = 'claude-sonnet-5-5'
const CATEGORIES = ['hälsa', 'sömn', 'träning', 'kost', 'plugg', 'jobb', 'ekonomi', 'socialt', 'personlighet', 'mål', 'mönster', 'preferens', 'kontext']
const MAX_ACTIVE = 120

const WHAT_TO_KEEP = `Ett minne är en VARAKTIG sanning om användaren som gör en coach bättre: livssituation och planer, preferenser (hur hen vill bli coachad/tilltalad), återkommande mönster med belägg (t.ex. "sover sämre efter nattpass"), hälsotillstånd/mediciner, relationer, värderingar och drivkrafter, vad som fungerat eller inte fungerat tidigare.
Inget minne: enskilda dagshändelser, siffror som ändå finns i appens data (vikt idag, veckans steg), allmänna råd, sådant Jarvis själv föreslog men användaren inte bekräftat, och sådant som redan står i PROFIL.
Varje minne: en mening på svenska, max ~160 tecken, konkret och självbärande (begriplig utan sammanhang), skriv "hen"/"användaren" eller utan subjekt – aldrig namn som gissas fram. confidence 50–100 efter hur väl belagt det är.`

const OPS_TOOL = {
  name: 'memory_ops',
  description: 'Ändringar i det aktiva minnet efter dagens samtal och journal. Tomma listor om inget varaktigt framkom.',
  input_schema: {
    type: 'object',
    properties: {
      add: { type: 'array', items: { type: 'object', properties: { category: { type: 'string', enum: CATEGORIES }, insight: { type: 'string' }, confidence: { type: 'integer' } }, required: ['category', 'insight', 'confidence'], additionalProperties: false } },
      update: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, insight: { type: 'string' }, confidence: { type: 'integer' } }, required: ['id', 'insight', 'confidence'], additionalProperties: false } },
      archive: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'], additionalProperties: false } },
    },
    required: ['add', 'update', 'archive'],
    additionalProperties: false,
  },
}

const CURATE_TOOL = {
  name: 'curated_memory',
  description: 'Den nya, kuraterade minneslistan som ersätter alla gamla minnen.',
  input_schema: {
    type: 'object',
    properties: {
      insights: { type: 'array', items: { type: 'object', properties: { category: { type: 'string', enum: CATEGORIES }, insight: { type: 'string' }, confidence: { type: 'integer' } }, required: ['category', 'insight', 'confidence'], additionalProperties: false } },
      dropped_summary: { type: 'string', description: 'En mening om vad som togs bort och varför.' },
    },
    required: ['insights', 'dropped_summary'],
    additionalProperties: false,
  },
}

const STOCKHOLM_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })

// Structured outputs (output_config.format): Sonnet 5.5 rejects forced
// tool_choice, and a JSON schema guarantees a parseable answer.
async function callTool(client: Anthropic, supabase: any, userId: string, feature: string, system: string, user: string, tool: any, maxTokens: number) {
  const msg = await (client.beta.messages as any).stream({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: tool.input_schema } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: user }],
  }).finalMessage()
  const usage = newUsage()
  addUsage(usage, msg.usage)
  await logUsage(supabase, userId, feature, msg.model || MODEL, usage)
  if (msg.stop_reason === 'refusal') throw new Error('refusal')
  if (msg.stop_reason === 'max_tokens') throw new Error('max_tokens')
  const text = (msg.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  try { return JSON.parse(text) } catch { throw new Error(`unparseable ${tool.name} (${msg.stop_reason})`) }
}

const clean = (s: unknown) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 300)
const clampConf = (c: unknown) => Math.max(50, Math.min(100, Math.round(Number(c) || 80)))

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const supabase = serviceClient()
  const provided = req.headers.get('x-cron-secret') || ''
  const { data: expected, error: secretErr } = await supabase.rpc('get_nightly_cron_secret')
  if (secretErr || !expected || provided !== expected) return unauthorized(req)
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

  const params = new URL(req.url).searchParams
  const dry = params.get('dry') === '1'
  const mode = params.get('mode') || 'nightly'
  const onlyUser = params.get('user') || null
  const client = new Anthropic()
  const results: Record<string, unknown>[] = []

  const { data: users } = await supabase.from('profiles').select('id')
  for (const { id: userId } of (users || []).filter((u: any) => !onlyUser || u.id === onlyUser)) {
    try {
      // PostgREST caps a response at 1000 rows — page through.
      const active: any[] = []
      for (let from = 0; ; from += 1000) {
        const { data: page, error } = await supabase.from('jarvis_insights').select('id,category,insight,confidence,updated_at')
          .eq('user_id', userId).is('archived_at', null).order('updated_at', { ascending: false }).order('id').range(from, from + 999)
        if (error) throw error
        active.push(...(page || []))
        if (!page || page.length < 1000) break
      }
      const { data: settings } = await supabase.from('user_settings').select('about_me_summary').eq('user_id', userId).maybeSingle()
      const todayStr = STOCKHOLM_DATE.format(new Date())
      const profile = (settings?.about_me_summary || '').slice(0, 9000)

      if (mode === 'curate') {
        if (!active?.length) { results.push({ userId, skipped: 'no_insights' }); continue }
        const list = active.map((i: any) => `[${i.category}|${i.confidence}] ${clean(i.insight)}`).join('\n')
        const system = `Du kuraterar långtidsminnet för Jarvis, en personlig AI-coach. Minnet har vuxit okontrollerat (massgenererat, dubbletter, motsägelser, inaktuellt). Ersätt det med en kort, skarp lista på högst 80 minnen som gör Jarvis märkbart smartare om just den här personen.
${WHAT_TO_KEEP}
Slå ihop dubbletter och närliggande påståenden till ett starkare. Vid motsägelse: behåll det senare/bäst belagda (listan är sorterad nyast först). Släpp det som är inaktuellt (gamla planer, avklarade saker) eller redan står i PROFIL. Hitta inte på något som inte stöds av listan. Använd minst hälften av utrymmet på mönster, preferenser och personlighet – det är där en coach gör skillnad.
IDAG är ${todayStr}. Planer och perioder som redan passerat (resor, kurser, "i sommar") skrivs i dåtid om de säger något bestående om personen, annars släpps de. Datumsätt tidsbundna fakta ("sedan juni 2026").`
        const input = await callTool(client, supabase, userId, dry ? 'memory_curate:dry' : 'memory_curate', system,
          `PROFIL (finns redan i Jarvis prompt – duplicera inte):\n${profile || '–'}\n\nNUVARANDE MINNEN (${active.length}, nyast först):\n${list}`, CURATE_TOOL, 16000)
        const curated = (input.insights || []).filter((i: any) => clean(i.insight) && CATEGORIES.includes(i.category)).slice(0, 80)
        if (curated.length < 10) throw new Error(`curated list too short (${curated.length}) — refusing to archive`)
        if (!dry) {
          const now = new Date().toISOString()
          const { error: insErr } = await supabase.from('jarvis_insights').insert(curated.map((i: any) => ({
            user_id: userId, category: i.category, insight: clean(i.insight), confidence: clampConf(i.confidence), source: 'curated',
          })))
          if (insErr) throw insErr
          const ids = active.map((i: any) => i.id)
          for (let k = 0; k < ids.length; k += 500) {
            const { error } = await supabase.from('jarvis_insights').update({ archived_at: now }).in('id', ids.slice(k, k + 500)).eq('user_id', userId)
            if (error) throw error
          }
        }
        results.push({ userId, before: active.length, after: curated.length, dropped: input.dropped_summary, ...(dry && { curated }) })
        continue
      }

      // ── nightly ──
      const since = new Date(Date.now() - 26 * 3600000).toISOString()
      const yesterday = STOCKHOLM_DATE.format(new Date(Date.now() - 86400000)), today = STOCKHOLM_DATE.format(new Date())
      const [{ data: chat }, { data: journal }] = await Promise.all([
        supabase.from('jarvis_conversations').select('role,content,created_at').eq('user_id', userId).gte('created_at', since).order('created_at').limit(80),
        supabase.from('journal_entries').select('date,content').eq('user_id', userId).in('date', [yesterday, today]),
      ])
      const userTurns = (chat || []).filter((m: any) => m.role === 'user')
      const journalText = (journal || []).filter((j: any) => (j.content || '').trim().length > 20)
      if (!userTurns.length && !journalText.length) { results.push({ userId, skipped: 'nothing_new' }); continue }

      const memory = (active || []).slice(0, MAX_ACTIVE).map((i: any) => `${i.id} | ${i.category} | ${clean(i.insight)}`).join('\n')
      const convo = (chat || []).map((m: any) => `${m.role === 'user' ? 'ANVÄNDARE' : 'JARVIS'}: ${String(m.content || '').slice(0, m.role === 'user' ? 2000 : 800)}`).join('\n')
      const system = `Du underhåller långtidsminnet för Jarvis, en personlig AI-coach. Varje natt läser du dagens samtal och journal och uppdaterar minnet. IDAG är ${todayStr}; datumsätt tidsbundna fakta.
${WHAT_TO_KEEP}
Regler: Föredra update framför add när ett befintligt minne kan skärpas eller rättas. Arkivera minnen som dagens material visar är fel eller inaktuella (ange skäl). Lägg bara till sådant användaren själv sagt eller tydligt visat – inte Jarvis egna förslag. Högst 6 ändringar totalt; oftast är 0–2 rätt. Påståenden som bara finns i JARVIS-repliker räknas inte som belägg.`
      const input = await callTool(client, supabase, userId, dry ? 'memory_nightly:dry' : 'memory_nightly', system,
        `PROFIL:\n${profile || '–'}\n\nAKTIVT MINNE (id | kategori | minne):\n${memory || '–'}\n\nDAGENS SAMTAL:\n${convo || '–'}\n\nDAGENS JOURNAL:\n${journalText.map((j: any) => `${j.date}: ${String(j.content).slice(0, 3000)}`).join('\n\n') || '–'}`, OPS_TOOL, 4000)

      const activeIds = new Set((active || []).map((i: any) => i.id))
      const add = (input.add || []).filter((a: any) => clean(a.insight) && CATEGORIES.includes(a.category)).slice(0, 6)
      const update = (input.update || []).filter((u: any) => activeIds.has(u.id) && clean(u.insight)).slice(0, 6)
      const archive = (input.archive || []).filter((a: any) => activeIds.has(a.id)).slice(0, 6)
      if (!dry) {
        const now = new Date().toISOString()
        if (add.length) await supabase.from('jarvis_insights').insert(add.map((a: any) => ({ user_id: userId, category: a.category, insight: clean(a.insight), confidence: clampConf(a.confidence), source: 'nightly' })))
        for (const u of update) await supabase.from('jarvis_insights').update({ insight: clean(u.insight), ...(u.confidence != null && { confidence: clampConf(u.confidence) }), updated_at: now }).eq('id', u.id).eq('user_id', userId)
        if (archive.length) await supabase.from('jarvis_insights').update({ archived_at: now }).in('id', archive.map((a: any) => a.id)).eq('user_id', userId)
      }
      results.push({ userId, added: add.length, updated: update.length, archived: archive.length, ...(dry && { add, update, archive }) })
    } catch (e) {
      results.push({ userId, error: e instanceof Error ? e.message : String(e) })
    }
  }
  console.log('jarvis-memory:', mode, JSON.stringify(results.map((r: any) => ({ added: r.added, updated: r.updated, archived: r.archived, after: r.after, error: r.error, skipped: r.skipped }))))
  return json({ ok: true, mode, dry, results })
})
