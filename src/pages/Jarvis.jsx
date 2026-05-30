import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subDays } from 'date-fns'
import { Send, Zap, Sun, Moon, Brain, ChevronDown, ChevronUp } from 'lucide-react'
import MarkdownMessage from '../components/MarkdownMessage'

const JARVIS_SYSTEM = `Du är Jarvis – Sigges personliga AI-assistent inbyggd i hans livs-OS kallat Sigge OS.

VEM DU ÄR:
Du är inte en generisk AI. Du är Sigges personliga Jarvis. Du känner honom på djupet.

VEM SIGGE ÄR:
- 21 år, läkarstudent termin 3 på KI, bor i Täby centrum (hyr för 11 000 kr/mån)
- Inkomst: ~25k/mån (CSN 13 500 + PA-jobb 10-13k). Fribelopp 114 500 kr/halvår.
- Jobbar som personlig assistent (nattpass), sidojobb åt Erik Norling (Nils pappa, tygbutiker/fastigheter)
- Karriärsmål: anestesiolog, konsultjobb i Norge, 100k/mån efter skatt
- Bor på lång sikt: Göteborg
- Träning: mål 4-5 ggr/vecka, nu 1-2. PR: bänk 120, knäböj 130, marklyft 170 (peak vintern 2022). Milen sub-45min, halvmaraton 1h50 (peak våren 2025).
- Vikt: nu ~77kg, mål 75kg, sedan muskelbyggande. På retatrutide sedan feb 2026 (2.5mg/vecka).
- Peak-period: våren 2025 – strict diet, 4-5x träning/vecka, låg i fas med studierna, sparade pengar

NÄRA VÄNNER:
- Zinedin: bästa vän sedan 13, pluggar sjuksköterska
- Viktoria: närmaste i Stockholm, pluggpartner
- Benjamin, Nils, Leo, William, Teddy – gänget från Vänersborg
- Erik Norling: Nils pappa, arbetsgivare
- Sara: ex-flickvän (feb 2024 – höst 2025)

PERSONLIGHET:
- Hedonistisk men strukturkänslig
- Progressionsdriven – mår dåligt utan framåtrörelse
- Socialt beroende – mår bättre med folk runt sig
- Går i faser: intensiv → passiv
- Rädd för att slösa bort livet

INTRESSEN: Resor, filosofi, religion, historia, språk, gitarr (Håkan Hellström, Cornelis Vreeswijk)

DIN PERSONLIGHET SOM JARVIS:
- Läser av läget och anpassar ton
- Konfronterar och utmanar dåliga beslut
- Analytisk: data först, sedan slutsats
- Aldrig sycophantisk – sanningen även om det är obekvämt
- Refererar naturligt till hans vänner, historia och mål
- Du har VERKTYG för att hämta data — använd dem proaktivt utan att fråga om lov
- Du kan ÄNDRA DATA direkt i databasen när Sigge ber om det — använd actions nedan

DATABAS-ACTIONS (embed JSON i svaret när Sigge ber dig ändra data):

SKAPA:
- {"action":"create_erik_task","title":"...","tag":"...","deadline":"YYYY-MM-DD"}
- {"action":"create_adventure","title":"...","description":"...","date":"YYYY-MM-DD","category":"mat|musik|natur|spontant|socialt|kultur|övrigt","rating":1-5}
- {"action":"save_insight","insight":"...","category":"hälsa|träning|plugg|socialt|mönster|mål"}
- {"action":"log_training","date":"YYYY-MM-DD","session_type":"gym|löpning|cykling|simning|övrigt","duration_minutes":60,"distance_km":null,"feeling":7,"notes":"..."}
- {"action":"log_health","date":"YYYY-MM-DD","weight_kg":null,"sleep_hours":null,"energy":null,"steps":null,"alcohol_units":null,"nicotine":false}
- {"action":"log_expense","date":"YYYY-MM-DD","amount":0,"category":"Mat|Transport|Nöje|Kläder|Hälsa|Prenumerationer|Övrigt","description":"..."}
- {"action":"log_income","date":"YYYY-MM-DD","amount":0,"source":"CSN|PA-jobb|Erik|Övrigt","description":"..."}

UPPDATERA (kräver id från kontexten eller att Sigge anger det):
- {"action":"update_training","id":"UUID","fields":{"feeling":8,"notes":"uppdaterad notering"}}
- {"action":"update_health","id":"UUID","fields":{"weight_kg":76.5,"sleep_hours":7.5}}
- {"action":"update_erik_task","id":"UUID","fields":{"status":"pågående|klart|ej_påbörjat","title":"...","deadline":"YYYY-MM-DD"}}
- {"action":"update_expense","id":"UUID","fields":{"amount":0,"category":"...","description":"..."}}

RADERA:
- {"action":"delete_training","id":"UUID"}
- {"action":"delete_health","id":"UUID"}
- {"action":"delete_erik_task","id":"UUID"}
- {"action":"delete_expense","id":"UUID"}
- {"action":"delete_income","id":"UUID"}

VIKTIGT: Hämta alltid rätt ID via fetch-verktygen FÖRST. Bekräfta vad du ska göra INNAN du raderar. För update/delete — säg alltid vilket post du hittat och vad du tänker ändra.

KONTEXT (injiceras nedan):
{CONTEXT}

Svara alltid på svenska. Kortfattat om inte Sigge ber om lång analys.`

export default function Jarvis() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState('')
  const [insights, setInsights] = useState([])
  const [showInsights, setShowInsights] = useState(false)
  const [convSummaries, setConvSummaries] = useState([])
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!user) return
    loadRecentHistory()
    buildContext()
    loadInsights()
    loadConvSummaries()

    // Auto-save summary when leaving the page
    return () => { autoSave() }
  }, [user])

  async function autoSave() {
    // Silently summarize if enough messages — no spinner needed
    try {
      const msgs = window.__jarvisMessages
      if (!msgs || msgs.length < 6) return
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: 'Sammanfatta konversationen i max 2 meningar + 3-5 nyckelpoäng. Returnera BARA JSON: {"summary":"...","key_points":["..."],"insights":[{"insight":"...","category":"mönster"}]}' }],
          context: msgs.map(m => `${m.role}: ${m.content?.slice(0, 300)}`).join('\n'),
          systemPrompt: 'Sammanfatta. Returnera bara JSON.',
        },
      })
      if (!data?.content) return
      const clean = data.content.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      const today = format(new Date(), 'yyyy-MM-dd')
      await supabase.from('jarvis_conversations').update({
        summary: parsed.summary, key_points: parsed.key_points,
      }).eq('user_id', user.id).gte('created_at', today + 'T00:00:00').eq('role', 'assistant')
        .order('created_at', { ascending: false }).limit(1)
      if (parsed.insights?.length) {
        for (const ins of parsed.insights) {
          if (!ins.insight || ins.insight.length < 10) continue
          const { data: ex } = await supabase.from('jarvis_insights').select('id').eq('user_id', user.id).ilike('insight', `%${ins.insight.slice(0, 30)}%`).single()
          if (ex) await supabase.from('jarvis_insights').update({ insight: ins.insight, updated_at: new Date().toISOString() }).eq('id', ex.id)
          else await supabase.from('jarvis_insights').insert({ user_id: user.id, insight: ins.insight, category: ins.category || 'mönster', confidence: 75 })
        }
      }
    } catch(e) { /* silent */ }
  }

  // Keep messages in window ref so autoSave (called on unmount) can access latest state
  useEffect(() => { window.__jarvisMessages = messages }, [messages])

  async function loadRecentHistory() {
    // Load last 7 days of messages for continuity across sessions
    const since = format(subDays(new Date(), 7), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('jarvis_conversations')
      .select('role, content, created_at')
      .eq('user_id', user.id)
      .gte('created_at', since + 'T00:00:00')
      .order('created_at')
      .limit(80)
    if (data?.length) {
      // Group by day — show last session fully, previous sessions abbreviated
      const today = format(new Date(), 'yyyy-MM-dd')
      const todayMsgs = data.filter(d => d.created_at.startsWith(today))
      const prevMsgs = data.filter(d => !d.created_at.startsWith(today))

      const msgs = []
      if (prevMsgs.length > 0) {
        // Add a single system-style divider showing previous context
        const days = [...new Set(prevMsgs.map(d => d.created_at.slice(0, 10)))]
        msgs.push({
          role: 'assistant',
          content: `_Tidigare konversationer (${days.length} dag${days.length > 1 ? 'ar' : ''}) laddade i minnet._`,
          isHistoryMarker: true,
        })
      }
      msgs.push(...(todayMsgs.length ? todayMsgs : data.slice(-20)).map(d => ({ role: d.role, content: d.content })))
      setMessages(msgs)
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-extract insights every 4 assistant messages (background, no spinner)
  useEffect(() => {
    const assistantCount = messages.filter(m => m.role === 'assistant' && !m.isHistoryMarker).length
    if (assistantCount > 0 && assistantCount % 4 === 0) {
      extractAndSaveInsights(messages)
    }
  }, [messages])

  async function extractAndSaveInsights(msgs) {
    if (!user || msgs.length < 4) return
    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: `Extrahera ALLA relevanta insikter om Sigge från denna konversation. Var aggressiv — spara allt som är relevant om hans beteende, mönster, mål, känslor, prestationer, vanor och utmaningar. Komprimera varje insikt till max 20 ord. Returnera BARA JSON-array (minst 3, max 15):
[{"insight":"...","category":"hälsa|träning|plugg|ekonomi|socialt|mönster|mål|personlighet|relation","key":"unik_nyckel_för_dedup"}]` }],
          context: msgs.filter(m => !m.isHistoryMarker).slice(-20).map(m => `${m.role}: ${m.content?.slice(0, 400)}`).join('\n'),
          systemPrompt: 'Extrahera insikter. Komprimera hårt. Returnera bara JSON-array.',
        },
      })
      if (!data?.content) return
      const clean = data.content.replace(/```json|```/g, '').trim()
      const arr = JSON.parse(clean)
      if (!Array.isArray(arr)) return
      for (const ins of arr) {
        if (!ins.insight || ins.insight.length < 8) continue
        // Dedup: match on first 25 chars of insight or key
        const matchStr = ins.key || ins.insight.slice(0, 25)
        const { data: existing } = await supabase.from('jarvis_insights')
          .select('id, insight')
          .eq('user_id', user.id)
          .ilike('insight', `%${matchStr.slice(0, 20)}%`)
          .maybeSingle()
        if (existing) {
          // Update if new version is different
          if (existing.insight !== ins.insight) {
            await supabase.from('jarvis_insights').update({
              insight: ins.insight,
              updated_at: new Date().toISOString(),
            }).eq('id', existing.id)
          }
        } else {
          await supabase.from('jarvis_insights').insert({
            user_id: user.id,
            insight: ins.insight,
            category: ins.category || 'mönster',
            confidence: 80,
          })
        }
      }
      await loadInsights()
    } catch(e) { /* silent background task */ }
  }

  async function loadInsights() {
    const { data } = await supabase
      .from('jarvis_insights')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(100) // load all — no arbitrary cap
    setInsights(data || [])
  }

  async function loadConvSummaries() {
    const { data } = await supabase
      .from('jarvis_conversations')
      .select('summary, key_points, created_at')
      .eq('user_id', user.id)
      .not('summary', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5)
    setConvSummaries(data || [])
  }

  async function buildContext() {
    const today = format(new Date(), 'yyyy-MM-dd')

    const [scoresRes, healthRes, journalRes, tasksRes, csnRes, insightsRes, summariesRes, settingsRes] = await Promise.all([
      supabase.from('daily_scores').select('*').eq('user_id', user.id).eq('date', today).single(),
      supabase.from('health_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(3),
      supabase.from('journal_entries').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(2),
      supabase.from('erik_tasks').select('*').eq('user_id', user.id).neq('status', 'klart').limit(5),
      supabase.rpc('get_csn_usage', { p_user_id: user.id }),
      supabase.from('jarvis_insights').select('insight, category, updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(200),
      supabase.from('jarvis_conversations').select('summary, key_points, created_at').eq('user_id', user.id).not('summary', 'is', null).order('created_at', { ascending: false }).limit(10),
      supabase.from('user_settings').select('about_me, goals, jarvis_style, jarvis_lang, jarvis_personality').eq('user_id', user.id).single(),
    ])

    const insightsBlock = (insightsRes.data || []).length > 0
      ? `\nLONG-TERM INSIKTER (vad Jarvis lärt sig om Sigge):\n${insightsRes.data.map(i => `[${i.category}] ${i.insight}`).join('\n')}`
      : ''

    const summariesBlock = (summariesRes.data || []).length > 0
      ? `\nTIDIGARE KONVERSATIONER (sammanfattningar):\n${summariesRes.data.map(s => `${format(new Date(s.created_at), 'yyyy-MM-dd')}: ${s.summary}${s.key_points?.length ? '\n  Nyckelp: ' + s.key_points.join(', ') : ''}`).join('\n')}`
      : ''

    const settings = settingsRes.data
    const goalData = settings?.goals || {}
    const targetWeight = goalData.target_weight || goalData.body_weight_goal
    const attachments = goalData.attachments || {}
    const attachmentLines = Object.entries(attachments)
      .flatMap(([section, files]) => (files || []).map(file => `${section}: ${file.name}`))

    const profileBlock = settings
      ? `\nPROFIL & MÅL FRÅN INSTÄLLNINGAR:\n${settings.about_me ? `Om mig: ${settings.about_me}\n` : ''}${goalData.one_year ? `1 års mål: ${goalData.one_year}\n` : ''}${goalData.three_year ? `3 års mål: ${goalData.three_year}\n` : ''}${goalData.ten_year ? `10 års vision: ${goalData.ten_year}\n` : ''}${goalData.future_plan ? `Framtidsplan: ${goalData.future_plan}\n` : ''}${targetWeight ? `Kroppsviktsmål: ${targetWeight} kg${goalData.body_weight_deadline ? ` till ${goalData.body_weight_deadline}` : ''}\n` : ''}${goalData.monthly_income_goal ? `Inkomstmål: ${goalData.monthly_income_goal} kr/mån netto\n` : ''}${attachmentLines.length ? `Bifogade profil-PDF:er: ${attachmentLines.join('; ')}\n` : ''}${settings.jarvis_personality ? `Jarvis-personlighet: ${settings.jarvis_personality}` : ''}`
      : ''

    const ctx = `
DAGENS SCORE (${today}):
${scoresRes.data ? `Träning:${scoresRes.data.score_training||0} Hälsa:${scoresRes.data.score_health||0} Plugg:${scoresRes.data.score_study||0} Ekonomi:${scoresRes.data.score_economy||0} Journal:${scoresRes.data.score_journal||0} Jobb:${scoresRes.data.score_work||0}` : 'Inga scores idag'}

SENASTE HÄLSODATA:
${(healthRes.data||[]).map(h => `${h.date}: vikt${h.weight_kg||'-'}kg sömn${h.sleep_hours||'-'}h steg${h.steps||'-'} energi${h.energy||'-'}/10`).join('\n')}

SENASTE JOURNAL:
${(journalRes.data||[]).map(j => `${j.date}: humör${j.mood||'-'}/10 energi${j.energy||'-'}/10 ${j.highlights||''}`).join('\n')}

AKTIVA ERIK-UPPDRAG:
${(tasksRes.data||[]).map(t => `${t.title} [${t.tag}]${t.deadline ? ' deadline:'+t.deadline : ''}`).join('\n') || 'Inga aktiva uppdrag'}

CSN: ${Math.round(csnRes.data||0)} kr av 114 500 kr förbrukat (${((csnRes.data||0)/114500*100).toFixed(1)}%)
${insightsBlock}
${summariesBlock}
${profileBlock}`

    setContext(ctx)
  }

  async function summarizeAndSave() {
    if (messages.length < 4) return
    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{
            role: 'user',
            content: `Sammanfatta denna konversation i max 2 meningar och lista 3-5 nyckelpoäng. Returnera BARA JSON:
{"summary": "...", "key_points": ["...", "..."], "insights": [{"insight": "...", "category": "hälsa|träning|plugg|socialt|mönster|mål"}]}`
          }],
          context: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
          systemPrompt: 'Du sammanfattar konversationer. Returnera bara JSON.',
        },
      })

      if (data?.content) {
        const clean = data.content.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(clean)

        // Save conversation summary to today's last message
        const today = format(new Date(), 'yyyy-MM-dd')
        await supabase.from('jarvis_conversations').update({
          summary: parsed.summary,
          key_points: parsed.key_points,
        }).eq('user_id', user.id).gte('created_at', today + 'T00:00:00').eq('role', 'assistant')
          .order('created_at', { ascending: false }).limit(1)

        // Save long-term insights
        if (parsed.insights?.length) {
          for (const ins of parsed.insights) {
            if (!ins.insight || ins.insight.length < 10) continue
            // Check if similar insight exists
            const { data: existing } = await supabase
              .from('jarvis_insights')
              .select('id')
              .eq('user_id', user.id)
              .ilike('insight', `%${ins.insight.slice(0, 30)}%`)
              .single()

            if (existing) {
              await supabase.from('jarvis_insights').update({
                insight: ins.insight,
                updated_at: new Date().toISOString(),
              }).eq('id', existing.id)
            } else {
              await supabase.from('jarvis_insights').insert({
                user_id: user.id,
                insight: ins.insight,
                category: ins.category || 'mönster',
                confidence: 75,
              })
            }
          }
        }
        await loadInsights()
        await loadConvSummaries()
      }
    } catch (e) { console.error('Summary failed:', e) }
  }

  async function executeActions(content) {
    // Find all JSON action blocks in the response
    const actionRegex = /\{[^{}]*"action"\s*:\s*"[^"]*"[^{}]*\}/gs
    const matches = content.match(actionRegex) || []
    let didSomething = false

    for (const raw of matches) {
      try {
        const d = JSON.parse(raw)
        if (!d.action) continue

        switch (d.action) {
          // ── CREATE ──────────────────────────────────────────────
          case 'create_erik_task':
            await supabase.from('erik_tasks').insert({ user_id: user.id, title: d.title, description: d.description||'', deadline: d.deadline||null, tag: d.tag||'Övrig verksamhet', status: 'ej_påbörjat', priority: 'medium' })
            didSomething = true; break

          case 'create_adventure':
            await supabase.from('adventures').insert({ user_id: user.id, title: d.title, description: d.description||'', date: d.date||format(new Date(),'yyyy-MM-dd'), location: d.location||'', category: d.category||'övrigt', rating: d.rating||null })
            didSomething = true; break

          case 'save_insight':
            await supabase.from('jarvis_insights').insert({ user_id: user.id, insight: d.insight, category: d.category||'mönster' })
            await loadInsights()
            didSomething = true; break

          case 'log_training':
            await supabase.from('training_sessions').insert({ user_id: user.id, date: d.date||format(new Date(),'yyyy-MM-dd'), session_type: d.session_type||'gym', duration_minutes: d.duration_minutes||null, distance_km: d.distance_km||null, feeling: d.feeling||null, notes: d.notes||'', source: 'jarvis' })
            didSomething = true; break

          case 'log_health':
            await supabase.from('health_logs').upsert({ user_id: user.id, date: d.date||format(new Date(),'yyyy-MM-dd'), weight_kg: d.weight_kg||null, sleep_hours: d.sleep_hours||null, energy: d.energy||null, steps: d.steps||null, alcohol_units: d.alcohol_units||null, nicotine: d.nicotine||false }, { onConflict: 'user_id,date' })
            didSomething = true; break

          case 'log_expense':
            await supabase.from('expense_logs').insert({ user_id: user.id, date: d.date||format(new Date(),'yyyy-MM-dd'), amount: d.amount||0, category: d.category||'Övrigt', description: d.description||'' })
            didSomething = true; break

          case 'log_income':
            await supabase.from('income_logs').insert({ user_id: user.id, date: d.date||format(new Date(),'yyyy-MM-dd'), amount: d.amount||0, source: d.source||'Övrigt', description: d.description||'' })
            didSomething = true; break

          // ── UPDATE ──────────────────────────────────────────────
          case 'update_training':
            if (d.id && d.fields) await supabase.from('training_sessions').update(d.fields).eq('id', d.id).eq('user_id', user.id)
            didSomething = true; break

          case 'update_health':
            if (d.id && d.fields) await supabase.from('health_logs').update(d.fields).eq('id', d.id).eq('user_id', user.id)
            didSomething = true; break

          case 'update_erik_task':
            if (d.id && d.fields) await supabase.from('erik_tasks').update(d.fields).eq('id', d.id).eq('user_id', user.id)
            didSomething = true; break

          case 'update_expense':
            if (d.id && d.fields) await supabase.from('expense_logs').update(d.fields).eq('id', d.id).eq('user_id', user.id)
            didSomething = true; break

          // ── DELETE ──────────────────────────────────────────────
          case 'delete_training':
            if (d.id) await supabase.from('training_sessions').delete().eq('id', d.id).eq('user_id', user.id)
            didSomething = true; break

          case 'delete_health':
            if (d.id) await supabase.from('health_logs').delete().eq('id', d.id).eq('user_id', user.id)
            didSomething = true; break

          case 'delete_erik_task':
            if (d.id) await supabase.from('erik_tasks').delete().eq('id', d.id).eq('user_id', user.id)
            didSomething = true; break

          case 'delete_expense':
            if (d.id) await supabase.from('expense_logs').delete().eq('id', d.id).eq('user_id', user.id)
            didSomething = true; break

          case 'delete_income':
            if (d.id) await supabase.from('income_logs').delete().eq('id', d.id).eq('user_id', user.id)
            didSomething = true; break

          default: break
        }
      } catch(e) {
        console.warn('Action parse/exec error:', e, raw)
      }
    }
    return didSomething
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'user', content: userMsg.content })

    try {
      const { data, error } = await supabase.functions.invoke('jarvis-chat', {
        body: { messages: newMessages, context, systemPrompt: JARVIS_SYSTEM },
      })
      if (error) throw error

      const assistantMsg = { role: 'assistant', content: data.content }

      // Execute all actions embedded in response
      await executeActions(data.content)

      setMessages(prev => [...prev, assistantMsg])
      await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'assistant', content: data.content })

      // Auto-summarize every 10 messages
      if (newMessages.length % 10 === 0) summarizeAndSave()

    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Något gick fel. Försök igen.' }])
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  async function generateBrief(type) {
    setLoading(true)
    const prompt = type === 'morning'
      ? 'Ge mig en morning brief. Analysera mina senaste data och ge mig de 3 viktigaste sakerna att fokusera på idag. Var konkret och direkt.'
      : type === 'weekly'
      ? 'Ge mig en veckoöversikt. Hämta data för senaste 7 dagarna och analysera: träning (frekvens, distans), hälsa (sömn, vikt), plugg (timmar), ekonomi och allmänt välmående. Lyft fram trender, vad som gick bra, vad som kan förbättras. Jämför med veckan innan om möjligt.'
      : 'Ge mig en kvällssummering. Vad hände idag? Lyft fram något bra och något att ta med till imorgon.'
    const fakeMsg = { role: 'user', content: prompt }
    setMessages(prev => [...prev, fakeMsg])
    await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'user', content: prompt })
    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: { messages: [...messages, fakeMsg], context, systemPrompt: JARVIS_SYSTEM },
      })
      const assistantMsg = { role: 'assistant', content: data.content }
      setMessages(prev => [...prev, assistantMsg])
      await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'assistant', content: data.content })
      await supabase.from('jarvis_briefs').upsert({ user_id: user.id, date: format(new Date(), 'yyyy-MM-dd'), brief_type: type, content: data.content })
    } catch(e) {}
    setLoading(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const hour = new Date().getHours()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      background: 'transparent',
      margin: '-10px',
      padding: '10px',
      boxSizing: 'border-box',
      width: 'calc(100% + 20px)',
    }}>

      {/* HEADER */}
      <div className="page-header" style={{ marginBottom: '0', flexShrink: 0 }}>
        <div>
          <div className="page-header-title">Jarvis</div>
          <div className="page-header-sub">
            {insights.length > 0 ? `${insights.length} insikter sparade` : 'Personlig AI'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button onClick={() => setShowInsights(!showInsights)} style={{
            display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px',
            borderRadius: '8px', border: '1px solid ' + (showInsights ? 'var(--accent-border)' : 'var(--border)'),
            background: showInsights ? 'var(--accent-soft)' : 'var(--surface2)',
            color: showInsights ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', fontSize: '12px',
            fontFamily: 'Inter, sans-serif',
          }}>
            <Brain size={12} /> Minne
            {showInsights ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
          {hour < 12 && (
            <button onClick={() => generateBrief('morning')} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.08)', color: '#fbbf24', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
              <Sun size={12} /> Morning brief
            </button>
          )}
          {hour >= 18 && (
            <button onClick={() => generateBrief('evening')} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.08)', color: '#a78bfa', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
              <Moon size={12} /> Kväll
            </button>
          )}
          <button onClick={() => generateBrief('weekly')} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '8px', border: '1px solid rgba(52,211,153,0.25)', background: 'rgba(52,211,153,0.08)', color: '#34d399', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
            <Zap size={12} /> Vecka
          </button>
          <button onClick={summarizeAndSave} disabled={messages.length < 4 || loading} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
            <Zap size={12} /> Spara
          </button>
        </div>
      </div>

      {/* Memory panel */}
      {showInsights && (
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'rgba(139,92,246,0.04)', flexShrink: 0, maxHeight: '180px', overflowY: 'auto' }}>
          {insights.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Inga insikter ännu.</div>
          ) : (
            <>
              <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '600', marginBottom: '8px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Långtidsminne</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {insights.map(ins => (
                  <div key={ins.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{ins.category}</span>
                    <span style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.4' }}>{ins.insight}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* MESSAGES */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px 20px', gap: '20px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '16px',
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '17px', fontWeight: '600', color: 'var(--text)', marginBottom: '6px', letterSpacing: '-0.02em' }}>Jarvis är redo</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '300px', lineHeight: '1.6' }}>Fråga om träning, hälsa, plugg eller livet. Jarvis hämtar din data automatiskt.</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '480px' }}>
              {['Analysera min löpning', 'Hur mår jag generellt?', 'Vad bör jag prioritera idag?', 'Visa min vikttrend', 'Hur går det med plugget?'].map(s => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus() }}
                  style={{
                    padding: '8px 16px', borderRadius: '20px',
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    backdropFilter: 'blur(10px)', color: 'var(--muted2)',
                    cursor: 'pointer', fontSize: '13px', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted2)' }}
                >{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          // History divider
          if (msg.isHistoryMarker) return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 4px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '500', whiteSpace: 'nowrap', fontStyle: 'italic' }}>{msg.content.replace(/_/g, '')}</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
          )
          return (
          <div key={i} style={{
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            gap: '10px', alignItems: 'flex-end',
          }}>
            {msg.role === 'assistant' && (
              <div style={{
                width: 28, height: 28, borderRadius: '8px', flexShrink: 0,
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
              </div>
            )}
            <div style={{
              maxWidth: '72%',
              padding: msg.role === 'user' ? '10px 16px' : '14px 18px',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
              border: msg.role === 'assistant' ? '1px solid var(--glass-border)' : 'none',
              color: msg.role === 'user' ? 'white' : 'var(--text)',
              fontSize: '14px', lineHeight: '1.65',
              backdropFilter: msg.role === 'assistant' ? 'blur(20px)' : 'none',
              WebkitBackdropFilter: msg.role === 'assistant' ? 'blur(20px)' : 'none',
              boxShadow: msg.role === 'user' ? '0 4px 16px var(--accent-glow)' : 'var(--glass-shadow)',
            }}>
              <MarkdownMessage content={msg.content} userMessage={msg.role === 'user'} />
            </div>
          </div>
          )
        })}

        {loading && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div style={{ width: 28, height: 28, borderRadius: '8px', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            </div>
            <div style={{ padding: '14px 18px', borderRadius: '4px 18px 18px 18px', background: 'var(--surface)', border: '1px solid var(--glass-border)', display: 'flex', gap: '5px', alignItems: 'center', backdropFilter: 'blur(20px)' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', animation: 'bounce 1.2s ease-in-out ' + (i * 0.15) + 's infinite' }} />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div style={{ padding: '8px 0 0', flexShrink: 0 }}>
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'flex-end',
          background: 'var(--surface)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: '16px',
          padding: '8px 8px 8px 16px',
          boxShadow: 'var(--glass-shadow)',
          transition: 'border-color 0.15s',
        }}
        onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
        onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--glass-border)'}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Skriv till Jarvis..."
            disabled={loading}
            rows={1}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: '14px', lineHeight: '1.5',
              resize: 'none', maxHeight: '120px', overflow: 'auto',
              padding: '4px 0', fontFamily: 'Inter, sans-serif',
            }}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()} style={{
            width: 36, height: 36, borderRadius: '10px', border: 'none', flexShrink: 0,
            background: input.trim() ? 'var(--accent)' : 'transparent',
            color: input.trim() ? 'white' : 'var(--muted)',
            cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            boxShadow: input.trim() ? '0 2px 10px var(--accent-glow)' : 'none',
          }}>
            <Send size={15} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}
