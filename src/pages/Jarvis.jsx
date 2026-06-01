import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subDays } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Send, Zap, Sun, Moon, Brain, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import MarkdownMessage from '../components/MarkdownMessage'

// ── System prompt — NO hardcoded user data, all from context ──────────────
const JARVIS_SYSTEM_TEMPLATE = `Du är Jarvis – en personlig AI-assistent inbyggd i ett livs-OS.

VEM DU ÄR:
Du är inte en generisk AI. Du känner användaren på djupet via kontext, insikter och historik.

DIN PERSONLIGHET:
- Läser av läget och anpassar ton — direkt och kortfattad som default
- Konfronterar och utmanar dåliga beslut utan att vara elak
- Analytisk: data först, sedan slutsats
- Aldrig sycophantisk — sanningen även om det är obekvämt
- Refererar naturligt till användarens vänner, historia och mål
- Du har VERKTYG för att hämta data — använd dem proaktivt
- Du kan ÄNDRA DATA direkt i databasen — använd actions nedan

DATABAS-ACTIONS (embed JSON i svaret):

SKAPA:
- {"action":"create_erik_task","title":"...","tag":"...","deadline":"YYYY-MM-DD"}
- {"action":"create_adventure","title":"...","description":"...","date":"YYYY-MM-DD","category":"mat|musik|natur|spontant|socialt|kultur|övrigt","rating":1-5}
- {"action":"save_insight","insight":"...","category":"hälsa|träning|plugg|socialt|mönster|mål"}
- {"action":"log_training","date":"YYYY-MM-DD","session_type":"gym|löpning|cykling|simning|övrigt","duration_minutes":60,"distance_km":null,"feeling":7,"notes":"..."}
- {"action":"log_health","date":"YYYY-MM-DD","weight_kg":null,"sleep_hours":null,"energy":null,"steps":null,"alcohol_units":null,"nicotine":false}
- {"action":"log_expense","date":"YYYY-MM-DD","amount":0,"category":"Mat|Transport|Nöje|Kläder|Hälsa|Prenumerationer|Övrigt","description":"..."}
- {"action":"log_income","date":"YYYY-MM-DD","amount":0,"source":"CSN|PA-jobb|Erik|Övrigt","description":"..."}

UPPDATERA:
- {"action":"update_training","id":"UUID","fields":{"feeling":8,"notes":"..."}}
- {"action":"update_health","id":"UUID","fields":{"weight_kg":76.5}}
- {"action":"update_erik_task","id":"UUID","fields":{"status":"pågående|klart|ej_påbörjat"}}
- {"action":"update_expense","id":"UUID","fields":{"amount":0,"category":"..."}}

RADERA:
- {"action":"delete_training","id":"UUID"}
- {"action":"delete_health","id":"UUID"}
- {"action":"delete_erik_task","id":"UUID"}
- {"action":"delete_expense","id":"UUID"}
- {"action":"delete_income","id":"UUID"}

VIKTIGT: Hämta alltid rätt ID via fetch-verktygen FÖRST. Bekräfta vad du ska göra INNAN du raderar.

KONTEXT (uppdateras automatiskt med live-data):
{CONTEXT}

Svara alltid på samma språk som användaren skriver på. Kortfattat om inte lång analys efterfrågas.`

export default function Jarvis() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState('')
  const [insights, setInsights] = useState([])
  const [showInsights, setShowInsights] = useState(false)
  const [newInsight, setNewInsight] = useState('')
  const [addingInsight, setAddingInsight] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const contextRef = useRef('')

  // Keep contextRef in sync so sendMessage always uses fresh context
  useEffect(() => { contextRef.current = context }, [context])

  useEffect(() => {
    if (!user) return
    loadHistory()
    refreshContext()
    loadInsights()
    return () => { autoSave() }
  }, [user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Keep messages accessible for autoSave on unmount
  useEffect(() => { window.__jarvisMessages = messages }, [messages])

  // Extract insights every 4 assistant messages (background)
  useEffect(() => {
    const count = messages.filter(m => m.role === 'assistant' && !m.isHistoryMarker && !m.isSeparator).length
    if (count > 0 && count % 4 === 0) extractInsights(messages)
  }, [messages])

  // ── Context builder ──────────────────────────────────────────────────────
  const refreshContext = useCallback(async () => {
    if (!user) return
    const now = new Date()
    const today = format(now, 'yyyy-MM-dd')
    const since30 = format(subDays(now, 30), 'yyyy-MM-dd')
    const since7  = format(subDays(now, 7),  'yyyy-MM-dd')
    const datetime = format(now, "EEEE d MMMM yyyy, HH:mm", { locale: sv })

    const [
      scoresRes, healthRes, journalRes, tasksRes, csnRes,
      settingsRes, trainingRes, expenseRes, incomeRes, examsRes, insightsRes,
    ] = await Promise.all([
      supabase.from('daily_scores').select('*').eq('user_id', user.id).eq('date', today).single(),
      supabase.from('health_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(7),
      supabase.from('journal_entries').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(3),
      supabase.from('erik_tasks').select('*').eq('user_id', user.id).neq('status', 'klart').limit(10),
      supabase.rpc('get_csn_usage', { p_user_id: user.id }),
      supabase.from('user_settings').select('about_me, goals, jarvis_personality, display_name').eq('user_id', user.id).single(),
      supabase.from('training_sessions').select('date,session_type,duration_minutes,distance_km,feeling,notes').eq('user_id', user.id).order('date', { ascending: false }).limit(10),
      supabase.from('expense_logs').select('date,amount,category,description').eq('user_id', user.id).gte('date', since30).order('date', { ascending: false }).limit(40),
      supabase.from('income_logs').select('date,amount,source,description').eq('user_id', user.id).gte('date', since30),
      supabase.from('course_exams').select('exam_date,name,courses(name)').eq('user_id', user.id).gte('exam_date', today).order('exam_date', { ascending: true }).limit(5),
      supabase.from('jarvis_insights').select('insight, category').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(150),
    ])

    const s = settingsRes.data
    const g = s?.goals || {}
    const csnLimit = g.csn_fribelopp || 114500

    // Profile block — from settings only, no hardcoding
    const profileLines = [
      s?.display_name && `Namn: ${s.display_name}`,
      s?.about_me && `Profil: ${s.about_me}`,
      g.one_year && `1 års mål: ${g.one_year}`,
      g.three_year && `3 års mål: ${g.three_year}`,
      g.ten_year && `10 års vision: ${g.ten_year}`,
      g.future_plan && `Framtidsplan: ${g.future_plan}`,
      (g.target_weight || g.body_weight_goal) && `Viktmål: ${g.target_weight || g.body_weight_goal} kg${g.body_weight_deadline ? ` till ${g.body_weight_deadline}` : ''}`,
      g.monthly_income_goal && `Inkomstmål: ${g.monthly_income_goal} kr/mån netto`,
      s?.jarvis_personality && `Instruktion: ${s.jarvis_personality}`,
    ].filter(Boolean).join('\n')

    // Training block
    const trainBlock = (trainingRes.data || []).length > 0
      ? (trainingRes.data || []).map(t =>
          `${t.date}: ${t.session_type||'pass'}${t.duration_minutes ? ' '+t.duration_minutes+'min' : ''}${t.distance_km ? ' '+t.distance_km+'km' : ''}${t.feeling ? ' känsla:'+t.feeling+'/10' : ''}${t.notes ? ' – '+t.notes : ''}`
        ).join('\n')
      : 'Inga pass loggade de senaste 30 dagarna.'

    // Economy block
    const totalExp = (expenseRes.data || []).reduce((s, e) => s + (e.amount || 0), 0)
    const totalInc = (incomeRes.data  || []).reduce((s, i) => s + (i.amount || 0), 0)
    const topCats = Object.entries(
      (expenseRes.data || []).reduce((acc, e) => { acc[e.category] = (acc[e.category]||0)+e.amount; return acc }, {})
    ).sort((a,b) => b[1]-a[1]).slice(0,4).map(([c,a]) => `${c}:${Math.round(a)}kr`).join(', ')

    // Insights block
    const insBlock = (insightsRes.data || []).length > 0
      ? (insightsRes.data || []).map(i => `[${i.category}] ${i.insight}`).join('\n')
      : 'Inga insikter ännu.'

    const ctx = `TIDPUNKT: ${datetime}

PROFIL & MÅL:
${profileLines || '(ej konfigurerat — be användaren fylla i Inställningar → Profil & mål)'}

LÅNGTIDSINSIKTER (vad Jarvis lärt sig):
${insBlock}

DAGENS SCORE (${today}):
${scoresRes.data ? `Träning:${scoresRes.data.score_training||0} Hälsa:${scoresRes.data.score_health||0} Plugg:${scoresRes.data.score_study||0} Ekonomi:${scoresRes.data.score_economy||0}` : 'Inga scores'}

HÄLSODATA (senaste 7 dagar):
${(healthRes.data||[]).map(h => `${h.date}: ${h.weight_kg ? 'vikt '+h.weight_kg+'kg' : ''} ${h.sleep_hours ? 'sömn '+h.sleep_hours+'h' : ''} ${h.steps ? 'steg '+h.steps : ''} ${h.energy ? 'energi '+h.energy+'/10' : ''}`).join('\n') || 'Ingen data'}

JOURNAL (senaste 3 dagar):
${(journalRes.data||[]).map(j => `${j.date}: humör${j.mood||'-'}/10 energi${j.energy||'-'}/10 ${j.highlights||''}`).join('\n') || 'Ingen data'}

TRÄNING (senaste 10 pass):
${trainBlock}

EKONOMI (senaste 30 dagar):
Inkomst: ${Math.round(totalInc).toLocaleString('sv-SE')} kr | Utgifter: ${Math.round(totalExp).toLocaleString('sv-SE')} kr | Netto: ${Math.round(totalInc-totalExp).toLocaleString('sv-SE')} kr
Kategorier: ${topCats || '—'}

CSN: ${Math.round(csnRes.data||0).toLocaleString('sv-SE')} / ${csnLimit.toLocaleString('sv-SE')} kr (${((csnRes.data||0)/csnLimit*100).toFixed(1)}%) — kvar: ${Math.round(csnLimit-(csnRes.data||0)).toLocaleString('sv-SE')} kr

AKTIVA ERIK-UPPDRAG:
${(tasksRes.data||[]).map(t => `${t.title} [${t.tag}]${t.deadline ? ' deadline:'+t.deadline : ''}${t.status ? ' ['+t.status+']' : ''}`).join('\n') || 'Inga aktiva uppdrag'}

KOMMANDE TENTOR:
${(examsRes.data||[]).length > 0 ? (examsRes.data||[]).map(e => {
  const daysLeft = Math.ceil((new Date(e.exam_date) - now) / 86400000)
  return `${e.exam_date} (${daysLeft}d): ${e.name}${e.courses?.name ? ' – '+e.courses.name : ''}`
}).join('\n') : 'Inga kommande tentor'}`

    setContext(ctx)
    contextRef.current = ctx
  }, [user])

  // ── History loader ────────────────────────────────────────────────────────
  async function loadHistory() {
    // Load last 14 days — show dividers between days, no abbreviation
    const since = format(subDays(new Date(), 14), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('jarvis_conversations')
      .select('role, content, created_at')
      .eq('user_id', user.id)
      .gte('created_at', since + 'T00:00:00')
      .order('created_at')
      .limit(200)

    if (!data?.length) return

    const msgs = []
    let lastDay = null

    for (const row of data) {
      const day = row.created_at.slice(0, 10)
      if (day !== lastDay) {
        // Day separator
        const isToday = day === format(new Date(), 'yyyy-MM-dd')
        const label = isToday ? 'Idag' : format(new Date(day + 'T12:00:00'), 'd MMMM', { locale: sv })
        msgs.push({ role: 'separator', content: label, isSeparator: true })
        lastDay = day
      }
      msgs.push({ role: row.role, content: row.content })
    }
    setMessages(msgs)
  }

  // ── Insights ──────────────────────────────────────────────────────────────
  async function loadInsights() {
    const { data } = await supabase
      .from('jarvis_insights')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(150)
    setInsights(data || [])
  }

  async function addManualInsight() {
    if (!newInsight.trim()) return
    setAddingInsight(true)
    await supabase.from('jarvis_insights').insert({
      user_id: user.id,
      insight: newInsight.trim(),
      category: 'mönster',
      confidence: 100,
    })
    setNewInsight('')
    await loadInsights()
    setAddingInsight(false)
  }

  async function deleteInsight(id) {
    await supabase.from('jarvis_insights').delete().eq('id', id)
    setInsights(prev => prev.filter(i => i.id !== id))
  }

  async function extractInsights(msgs) {
    if (!user || msgs.length < 4) return
    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: `Extrahera insikter om användaren. Var aggressiv — spara allt relevant om beteende, mönster, mål, känslor, vanor. Max 20 ord per insikt. Returnera BARA JSON-array (3-15 st):
[{"insight":"...","category":"hälsa|träning|plugg|ekonomi|socialt|mönster|mål|personlighet"}]` }],
          context: msgs.filter(m => !m.isHistoryMarker && !m.isSeparator).slice(-20).map(m => `${m.role}: ${m.content?.slice(0, 400)}`).join('\n'),
          systemPrompt: 'Extrahera insikter. Returnera bara JSON-array.',
        },
      })
      if (!data?.content) return
      const arr = JSON.parse(data.content.replace(/```json|```/g, '').trim())
      if (!Array.isArray(arr)) return
      for (const ins of arr) {
        if (!ins.insight || ins.insight.length < 8) continue
        const { data: existing } = await supabase.from('jarvis_insights')
          .select('id, insight').eq('user_id', user.id)
          .ilike('insight', `%${ins.insight.slice(0, 20)}%`).maybeSingle()
        if (existing) {
          if (existing.insight !== ins.insight)
            await supabase.from('jarvis_insights').update({ insight: ins.insight, updated_at: new Date().toISOString() }).eq('id', existing.id)
        } else {
          await supabase.from('jarvis_insights').insert({ user_id: user.id, insight: ins.insight, category: ins.category || 'mönster', confidence: 80 })
        }
      }
      await loadInsights()
      // Refresh context so new insights are included in next message
      await refreshContext()
    } catch(e) { /* silent */ }
  }

  // ── Auto-save on unmount ──────────────────────────────────────────────────
  async function autoSave() {
    try {
      const msgs = (window.__jarvisMessages || []).filter(m => !m.isHistoryMarker && !m.isSeparator)
      if (msgs.length < 4) return
      const today = format(new Date(), 'yyyy-MM-dd')
      // Save summary to last assistant message of today
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: 'Sammanfatta konversationen i 1-2 meningar + 3-5 nyckelpoäng. BARA JSON: {"summary":"...","key_points":["..."]}' }],
          context: msgs.map(m => `${m.role}: ${m.content?.slice(0, 300)}`).join('\n'),
          systemPrompt: 'Sammanfatta. Returnera bara JSON.',
        },
      })
      if (!data?.content) return
      const parsed = JSON.parse(data.content.replace(/```json|```/g, '').trim())
      // Find the last assistant message saved today and update it with summary
      const { data: rows } = await supabase.from('jarvis_conversations')
        .select('id').eq('user_id', user.id).eq('role', 'assistant')
        .gte('created_at', today + 'T00:00:00')
        .order('created_at', { ascending: false }).limit(1)
      if (rows?.[0]) {
        await supabase.from('jarvis_conversations').update({
          summary: parsed.summary,
          key_points: parsed.key_points,
        }).eq('id', rows[0].id)
      }
    } catch(e) { /* silent */ }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function executeActions(content) {
    const matches = content.match(/\{[^{}]*"action"\s*:\s*"[^"]*"[^{}]*\}/gs) || []
    let didSomething = false
    for (const raw of matches) {
      try {
        const d = JSON.parse(raw)
        if (!d.action) continue
        switch (d.action) {
          case 'create_erik_task':
            await supabase.from('erik_tasks').insert({ user_id: user.id, title: d.title, description: d.description||'', deadline: d.deadline||null, tag: d.tag||'Övrig verksamhet', status: 'ej_påbörjat', priority: 'medium' })
            break
          case 'create_adventure':
            await supabase.from('adventures').insert({ user_id: user.id, title: d.title, description: d.description||'', date: d.date||format(new Date(),'yyyy-MM-dd'), location: d.location||'', category: d.category||'övrigt', rating: d.rating||null })
            break
          case 'save_insight':
            await supabase.from('jarvis_insights').insert({ user_id: user.id, insight: d.insight, category: d.category||'mönster' })
            await loadInsights()
            break
          case 'log_training':
            await supabase.from('training_sessions').insert({ user_id: user.id, date: d.date||format(new Date(),'yyyy-MM-dd'), session_type: d.session_type||'gym', duration_minutes: d.duration_minutes||null, distance_km: d.distance_km||null, feeling: d.feeling||null, notes: d.notes||'', source: 'jarvis' })
            break
          case 'log_health':
            await supabase.from('health_logs').upsert({ user_id: user.id, date: d.date||format(new Date(),'yyyy-MM-dd'), weight_kg: d.weight_kg||null, sleep_hours: d.sleep_hours||null, energy: d.energy||null, steps: d.steps||null, alcohol_units: d.alcohol_units||null, nicotine: d.nicotine||false }, { onConflict: 'user_id,date' })
            break
          case 'log_expense':
            await supabase.from('expense_logs').insert({ user_id: user.id, date: d.date||format(new Date(),'yyyy-MM-dd'), amount: d.amount||0, category: d.category||'Övrigt', description: d.description||'' })
            break
          case 'log_income':
            await supabase.from('income_logs').insert({ user_id: user.id, date: d.date||format(new Date(),'yyyy-MM-dd'), amount: d.amount||0, source: d.source||'Övrigt', description: d.description||'' })
            break
          case 'update_training':
            if (d.id && d.fields) await supabase.from('training_sessions').update(d.fields).eq('id', d.id).eq('user_id', user.id)
            break
          case 'update_health':
            if (d.id && d.fields) await supabase.from('health_logs').update(d.fields).eq('id', d.id).eq('user_id', user.id)
            break
          case 'update_erik_task':
            if (d.id && d.fields) await supabase.from('erik_tasks').update(d.fields).eq('id', d.id).eq('user_id', user.id)
            break
          case 'update_expense':
            if (d.id && d.fields) await supabase.from('expense_logs').update(d.fields).eq('id', d.id).eq('user_id', user.id)
            break
          case 'delete_training':
            if (d.id) await supabase.from('training_sessions').delete().eq('id', d.id).eq('user_id', user.id)
            break
          case 'delete_health':
            if (d.id) await supabase.from('health_logs').delete().eq('id', d.id).eq('user_id', user.id)
            break
          case 'delete_erik_task':
            if (d.id) await supabase.from('erik_tasks').delete().eq('id', d.id).eq('user_id', user.id)
            break
          case 'delete_expense':
            if (d.id) await supabase.from('expense_logs').delete().eq('id', d.id).eq('user_id', user.id)
            break
          case 'delete_income':
            if (d.id) await supabase.from('income_logs').delete().eq('id', d.id).eq('user_id', user.id)
            break
        }
        didSomething = true
      } catch(e) { console.warn('Action error:', e, raw) }
    }
    return didSomething
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input.trim() }

    // Refresh context before every send — Jarvis always has fresh data
    await refreshContext()

    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'user', content: userMsg.content })

    try {
      // Only send actual chat messages to API (no separators/markers)
      const apiMessages = newMessages.filter(m => !m.isSeparator && !m.isHistoryMarker)
      const systemPrompt = JARVIS_SYSTEM_TEMPLATE.replace('{CONTEXT}', contextRef.current)

      const { data, error } = await supabase.functions.invoke('jarvis-chat', {
        body: { messages: apiMessages, context: contextRef.current, systemPrompt },
      })
      if (error) throw error

      const assistantMsg = { role: 'assistant', content: data.content }
      await executeActions(data.content)
      setMessages(prev => [...prev, assistantMsg])
      await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'assistant', content: data.content })
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Något gick fel. Försök igen.' }])
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  async function generateBrief(type) {
    // Refresh context first
    await refreshContext()
    setLoading(true)
    const prompt = type === 'morning'
      ? 'Morning brief: analysera mina senaste data och ge mig de 3 viktigaste sakerna att fokusera på idag. Konkret och direkt.'
      : type === 'weekly'
      ? 'Veckoöversikt: analysera senaste 7 dagarna — träning, hälsa, plugg, ekonomi, välmående. Lyft trender, vad som gick bra, vad som kan förbättras.'
      : 'Kvällssummering: vad hände idag? Lyft något bra och något att ta med till imorgon.'
    const fakeMsg = { role: 'user', content: prompt }
    setMessages(prev => [...prev, fakeMsg])
    await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'user', content: prompt })
    try {
      const apiMessages = [...messages, fakeMsg].filter(m => !m.isSeparator && !m.isHistoryMarker)
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: { messages: apiMessages, context: contextRef.current, systemPrompt: JARVIS_SYSTEM_TEMPLATE.replace('{CONTEXT}', contextRef.current) },
      })
      const assistantMsg = { role: 'assistant', content: data.content }
      setMessages(prev => [...prev, assistantMsg])
      await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'assistant', content: data.content })
    } catch(e) {}
    setLoading(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const hour = new Date().getHours()

  return (
    <div className="jarvis-container" style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      background: 'transparent', margin: '-10px', padding: '10px',
      boxSizing: 'border-box', width: 'calc(100% + 20px)', maxHeight: '100%',
    }}>

      {/* HEADER */}
      <div className="page-header" style={{ marginBottom: '0', flexShrink: 0 }}>
        <div>
          <div className="page-header-title">Jarvis</div>
          <div className="page-header-sub">{insights.length > 0 ? `${insights.length} insikter sparade` : 'Personlig AI'}</div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setShowInsights(!showInsights)} style={{
            display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px',
            borderRadius: '8px', border: '1px solid ' + (showInsights ? 'var(--accent-border)' : 'var(--border)'),
            background: showInsights ? 'var(--accent-soft)' : 'var(--surface2)',
            color: showInsights ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif',
          }}>
            <Brain size={12} /> Minne {showInsights ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
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
        </div>
      </div>

      {/* MEMORY PANEL */}
      {showInsights && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(139,92,246,0.04)', flexShrink: 0, maxHeight: '220px', overflowY: 'auto' }}>
          <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Långtidsminne — {insights.length} insikter
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
            {insights.map(ins => (
              <div key={ins.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>{ins.category}</span>
                <span style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.4', flex: 1 }}>{ins.insight}</span>
                <button onClick={() => deleteInsight(ins.id)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '0', flexShrink: 0, opacity: 0.4, lineHeight: 1 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
          {/* Add manual insight */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <input className="input" placeholder="Lägg till insikt manuellt..." value={newInsight}
              onChange={e => setNewInsight(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addManualInsight()}
              style={{ fontSize: '12px', padding: '5px 10px' }} />
            <button onClick={addManualInsight} disabled={addingInsight || !newInsight.trim()} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: '12px', flexShrink: 0 }}>
              <Plus size={12} />
            </button>
          </div>
        </div>
      )}

      {/* MESSAGES */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px 20px', gap: '20px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '16px', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '17px', fontWeight: '600', color: 'var(--text)', marginBottom: '6px' }}>Jarvis är redo</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '300px', lineHeight: '1.6' }}>Din data uppdateras automatiskt varje gång du skickar ett meddelande.</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '480px' }}>
              {['Analysera min löpning', 'Hur mår jag generellt?', 'Vad bör jag prioritera idag?', 'Visa min vikttrend', 'Hur går det med plugget?'].map(s => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus() }}
                  style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border)', background: 'var(--surface)', backdropFilter: 'blur(10px)', color: 'var(--muted2)', cursor: 'pointer', fontSize: '13px', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted2)' }}
                >{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          // Day separator
          if (msg.isSeparator) return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>{msg.content}</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
          )
          if (msg.isHistoryMarker) return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontStyle: 'italic' }}>{msg.content.replace(/_/g, '')}</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
          )
          return (
            <div key={i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '10px', alignItems: 'flex-end' }}>
              {msg.role === 'assistant' && (
                <div style={{ width: 28, height: 28, borderRadius: '8px', flexShrink: 0, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                </div>
              )}
              <div style={{
                maxWidth: '72%', padding: msg.role === 'user' ? '10px 16px' : '14px 18px',
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
              {[0,1,2].map(j => (
                <div key={j} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', animation: 'bounce 1.2s ease-in-out ' + (j*0.15) + 's infinite' }} />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div style={{ padding: '8px 0 0', flexShrink: 0 }} className="jarvis-input-area">
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'flex-end',
          background: 'var(--surface)', backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)',
          borderRadius: '16px', padding: '8px 8px 8px 16px', boxShadow: 'var(--glass-shadow)', transition: 'border-color 0.15s',
        }}
        onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
        onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--glass-border)'}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey} placeholder="Skriv till Jarvis..." disabled={loading} rows={1}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '14px', lineHeight: '1.5', resize: 'none', maxHeight: '120px', overflow: 'auto', padding: '4px 0', fontFamily: 'Inter, sans-serif' }} />
          <button onClick={sendMessage} disabled={loading || !input.trim()} style={{
            width: 36, height: 36, borderRadius: '10px', border: 'none', flexShrink: 0,
            background: input.trim() ? 'var(--accent)' : 'transparent',
            color: input.trim() ? 'white' : 'var(--muted)',
            cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
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
