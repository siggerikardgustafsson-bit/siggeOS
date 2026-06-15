import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Send, Zap, Sun, Moon, Brain, ChevronDown, ChevronUp, Plus, Trash2, Sparkles, Copy, RefreshCw, Check } from 'lucide-react'
import MarkdownMessage from '../components/MarkdownMessage'

const todayISO = () => format(new Date(), 'yyyy-MM-dd')

function stripAccidentalActionJson(content = '') {
  return content
    .replace(/<jarvis_actions>[\s\S]*?<\/jarvis_actions>/gi, '')
    .replace(/```json\s*\{[\s\S]*?"action"[\s\S]*?\}\s*```/gi, '')
    .trim()
}

// Contextual follow-up suggestions — derived locally from the last reply, no token cost.
const FOLLOWUP_RULES = [
  { kw: ['löp', 'pace', '5k', '10k', 'distans', 'tempo', 'km'], qs: ['Hur lägger jag upp nästa löppass?', 'Visa min pace-trend'] },
  { kw: ['styrka', 'bänk', 'knäböj', 'marklyft', 'gym', 'reps', 'pr', '1rm', 'e1rm', 'set'], qs: ['Vad kör jag på nästa gympass?', 'Hur går min progressive overload?'] },
  { kw: ['sömn', 'sov', 'vila', 'återhämt'], qs: ['Hur förbättrar jag min sömn?', 'Påverkar sömnen min prestation?'] },
  { kw: ['vikt', 'kalori', 'kost', 'protein', 'deff', 'bulk', 'målvikt'], qs: ['Ligger jag rätt mot min målvikt?', 'Vad bör jag äta idag?'] },
  { kw: ['ekonomi', 'spar', 'inkomst', 'utgift', 'budget', 'pengar', 'kr', 'förmögenhet'], qs: ['Hur ser min sparkvot ut?', 'Var kan jag spara mer?'] },
  { kw: ['plugg', 'tenta', 'kurs', 'studie', 'mastery', 'ki', 'lärande'], qs: ['Vad ska jag plugga härnäst?', 'Hur ligger jag till inför tentan?'] },
  { kw: ['stress', 'mår', 'humör', 'energi', 'ångest'], qs: ['Vad kan jag göra för att må bättre?', 'Vilka mönster ser du i mitt mående?'] },
  { kw: ['resa', 'trip', 'resor', 'äventyr'], qs: ['Hjälp mig planera nästa resa', 'Vilka resor har jag inbokade?'] },
]
const DEFAULT_FOLLOWUPS = ['Vad ska jag fokusera på idag?', 'Vad oroar dig mest i min data?', 'Sätt en plan för veckan']

function getFollowUps(messages) {
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && !m.isSeparator)
  if (!lastAssistant) return []
  const text = (lastAssistant.content || '').toLowerCase()
  const picks = []
  for (const r of FOLLOWUP_RULES) {
    if (r.kw.some(k => text.includes(k))) picks.push(...r.qs)
    if (picks.length >= 4) break
  }
  return [...new Set([...picks, ...DEFAULT_FOLLOWUPS])].slice(0, 3)
}

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
  const [copiedIdx, setCopiedIdx] = useState(null)
  const [reveal, setReveal] = useState(null) // { full, shown } — progressive reveal of the latest reply
  const revealRef = useRef(null)

  useEffect(() => () => clearInterval(revealRef.current), [])

  // Smoothly reveal the newest assistant reply (streaming feel, no backend change).
  function startReveal(full) {
    clearInterval(revealRef.current)
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || !full || full.length < 40) { setReveal(null); return }
    setReveal({ full, shown: '' })
    let i = 0
    const step = Math.max(3, Math.round(full.length / 80))
    revealRef.current = setInterval(() => {
      i += step
      if (i >= full.length) { clearInterval(revealRef.current); setReveal(null) }
      else setReveal(r => (r ? { ...r, shown: full.slice(0, i) } : r))
    }, 18)
  }
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const contextRef = useRef('')
  const contextCacheTimeRef = useRef(0)
  const CONTEXT_TTL_MS = 5 * 60 * 1000

  useEffect(() => { contextRef.current = context }, [context])

  useEffect(() => {
    if (!user) return
    loadHistory()
    refreshContext()
    loadInsights()
  }, [user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Keep pinned to bottom while the reply reveals.
  useEffect(() => { if (reveal) messagesEndRef.current?.scrollIntoView({ block: 'end' }) }, [reveal])

  useEffect(() => { window.__jarvisMessages = messages }, [messages])


  const refreshContext = useCallback(async (force = false) => {
    if (!user) return ''
    if (!force && contextRef.current && (Date.now() - contextCacheTimeRef.current) < CONTEXT_TTL_MS) {
      return contextRef.current
    }
    const now = new Date()
    const today = format(now, 'yyyy-MM-dd')
    const datetime = format(now, "EEEE d MMMM yyyy, HH:mm", { locale: sv })

    // Lean context — only immediate snapshot. Everything else fetched via tools on demand.
    const [scoreRes, examsRes, projectsRes, tripsRes, todayHealthRes] = await Promise.all([
      supabase.from('daily_scores').select('total_score,score_training,score_health,score_study,score_economy,score_social,peak_mode').eq('user_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('course_exams').select('exam_date,name').eq('user_id', user.id).gte('exam_date', today).order('exam_date', { ascending: true }).limit(3),
      supabase.from('projects').select('id,name,type,client').eq('user_id', user.id).order('created_at'),
      supabase.from('trips').select('id,title,countries,start_date,end_date,status,budget_sek').eq('user_id', user.id).in('status', ['planned', 'idea']).order('start_date', { ascending: true }).limit(5),
      supabase.from('health_logs').select('weight_kg,sleep_hours,energy,energy_level,mood,steps').eq('user_id', user.id).eq('date', today).maybeSingle(),
    ])

    const score = scoreRes.data
    const todayHealth = todayHealthRes.data
    const energy = todayHealth?.energy_level ?? todayHealth?.energy

    const upcomingExams = (examsRes.data || []).map(e => {
      const d = Math.ceil((new Date(e.exam_date) - now) / 86400000)
      return `${e.exam_date} (${d}d): ${e.name}`
    }).join(', ') || 'Inga'

    const projectsBlock = (projectsRes.data || []).map(p =>
      `${p.name} [id:${p.id}] (${p.type}${p.client ? ', ' + p.client : ''})`
    ).join(' | ') || 'Inga projekt'

    const tripsBlock = (tripsRes.data || []).map(t =>
      `[id:${t.id}] ${t.title} (${t.status}) ${t.countries?.join(',') || ''} ${t.start_date || '?'}→${t.end_date || '?'}${t.budget_sek ? ' ' + t.budget_sek + 'kr' : ''}`
    ).join(' | ') || 'Inga planerade resor'

    const healthLine = todayHealth
      ? [todayHealth.weight_kg && 'vikt ' + todayHealth.weight_kg + 'kg', todayHealth.sleep_hours && 'sömn ' + todayHealth.sleep_hours + 'h', energy && 'energi ' + energy + '/10', todayHealth.mood && 'humör ' + todayHealth.mood + '/10', todayHealth.steps && 'steg ' + todayHealth.steps].filter(Boolean).join(' | ')
      : 'ej loggat idag'

    const ctx = [
      'TID: ' + datetime,
      score ? 'SCORE IDAG: total:' + score.total_score + ' tr:' + score.score_training + ' hä:' + score.score_health + ' pl:' + score.score_study + ' ek:' + score.score_economy + ' soc:' + score.score_social + (score.peak_mode ? ' PEAK' : '') : 'SCORE: saknas idag',
      'HÄLSA IDAG: ' + healthLine,
      'NÄSTA TENTOR: ' + upcomingExams,
      'PROJEKT: ' + projectsBlock,
      'PLANERADE RESOR: ' + tripsBlock,
    ].join('\n')

    setContext(ctx)
    contextRef.current = ctx
    contextCacheTimeRef.current = Date.now()
    return ctx
  }, [user])
  async function loadHistory() {
    const { data } = await supabase.from('jarvis_conversations')
      .select('role,content,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300)
    if (data) data.reverse()

    if (!data?.length) return
    const msgs = []
    let lastDay = null
    for (const row of data) {
      const day = row.created_at.slice(0, 10)
      if (day !== lastDay) {
        const isToday = day === todayISO()
        msgs.push({ role: 'separator', content: isToday ? 'Idag' : format(new Date(day + 'T12:00:00'), 'd MMMM', { locale: sv }), isSeparator: true })
        lastDay = day
      }
      msgs.push({ role: row.role, content: stripAccidentalActionJson(row.content) })
    }
    setMessages(msgs)
  }

  async function loadInsights() {
    const { data } = await supabase.from('jarvis_insights')
      .select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(150)
    setInsights(data || [])
  }

  async function addManualInsight() {
    if (!newInsight.trim()) return
    setAddingInsight(true)
    await supabase.from('jarvis_insights').insert({ user_id: user.id, insight: newInsight.trim(), category: 'mönster', confidence: 100 })
    setNewInsight('')
    await loadInsights()
    setAddingInsight(false)
  }

  async function deleteInsight(id) {
    await supabase.from('jarvis_insights').delete().eq('id', id).eq('user_id', user.id)
    setInsights(prev => prev.filter(i => i.id !== id))
  }

  async function sendToJarvis(promptText, visible = true, { baseMessages = null, skipUserSave = false } = {}) {
    if (!promptText.trim() || loading) return
    const userMsg = { role: 'user', content: promptText.trim() }
    setLoading(true)
    setInput('')

    const freshCtx = await refreshContext()
    const current = (baseMessages || messages).filter(m => !m.isSeparator && !m.isHistoryMarker && !m.isError && !m.streaming)
    const newMessages = [...current, userMsg]
    if (visible) setMessages(prev => [...prev, userMsg])

    if (!skipUserSave) {
      const { error: saveUserErr } = await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'user', content: userMsg.content })
      if (saveUserErr) console.error('Failed to save user message:', saveUserErr)
    }

    const reqBody = { messages: newMessages, context: freshCtx || contextRef.current }
    const saveAssistant = async (raw) => {
      const clean = stripAccidentalActionJson(raw || '') || 'Jag fick inget svar från modellen.'
      const { error: saveErr } = await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'assistant', content: clean })
      if (saveErr) console.error('Failed to save assistant message:', saveErr)
      return clean
    }
    const replaceStreaming = (msg) => setMessages(prev => {
      const n = [...prev]
      for (let i = n.length - 1; i >= 0; i--) { if (n[i].streaming) { n[i] = msg; return n } }
      return [...n, msg]
    })

    try {
      try {
        // Primary path: raw fetch with stream:true. Handles BOTH a streaming
        // (text/event-stream) response and a plain JSON response from an older
        // (not-yet-redeployed) function — single round-trip either way.
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/jarvis-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ ...reqBody, stream: true }),
        })
        const ctype = resp.headers.get('content-type') || ''

        if (resp.ok && ctype.includes('text/event-stream') && resp.body) {
          // Real token streaming
          setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])
          const updateStreaming = (c) => setMessages(prev => {
            const n = [...prev]
            for (let i = n.length - 1; i >= 0; i--) { if (n[i].streaming) { n[i] = { ...n[i], content: c }; break } }
            return n
          })
          const reader = resp.body.getReader()
          const decoder = new TextDecoder()
          let buffer = '', acc = '', savedMemory = false, streamErr = null, done = false
          while (!done) {
            const { done: rDone, value } = await reader.read()
            if (rDone) break
            buffer += decoder.decode(value, { stream: true })
            let sep
            while ((sep = buffer.indexOf('\n\n')) >= 0) {
              const chunk = buffer.slice(0, sep); buffer = buffer.slice(sep + 2)
              const dataLine = chunk.split('\n').find(l => l.startsWith('data:'))
              if (!dataLine) continue
              let ev; try { ev = JSON.parse(dataLine.slice(5).trim()) } catch { continue }
              if (ev.type === 'text') { acc += ev.text; updateStreaming(acc) }
              else if (ev.type === 'done') { savedMemory = ev.savedMemory; done = true; break }
              else if (ev.type === 'error') { streamErr = ev.error || 'Streamingfel'; done = true; break }
            }
          }
          if (streamErr && !acc) throw new Error(streamErr)
          const clean = await saveAssistant(acc)
          replaceStreaming({ role: 'assistant', content: clean })
          if (savedMemory) loadInsights()
        } else {
          // JSON response (function without streaming, or non-SSE)
          const data = await resp.json().catch(() => null)
          if (!resp.ok || !data || data.error) throw new Error(data?.error || `HTTP ${resp.status}`)
          const clean = await saveAssistant(data.content)
          setMessages(prev => [...prev, { role: 'assistant', content: clean }])
          startReveal(clean)
          if (data.savedMemory) loadInsights()
        }
      } catch (primaryErr) {
        // Robust fallback: the supabase SDK invoke (handles auth/url internally).
        setMessages(prev => prev.filter(m => !m.streaming))
        try {
          const { data, error } = await supabase.functions.invoke('jarvis-chat', { body: reqBody })
          if (error) throw error
          if (data?.error) throw new Error(data.error)
          const clean = await saveAssistant(data?.content)
          setMessages(prev => [...prev, { role: 'assistant', content: clean }])
          startReveal(clean)
          if (data?.savedMemory) loadInsights()
        } catch {
          // Surface the primary error — it carries the real server message
          // (e.g. Anthropic billing) which the SDK fallback hides as a generic 2xx error.
          throw primaryErr
        }
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => !m.streaming))
      const raw = err?.message || ''
      const isBilling = /credit balance|too low|billing|quota|insufficient_quota/i.test(raw)
      const text = isBilling
        ? 'Jarvis kunde inte svara: **Anthropic API-krediterna är slut.** Fyll på i Anthropic Console → Plans & Billing, så funkar han igen direkt.'
        : `Jag nådde inte servern just nu${raw ? ` (${raw})` : ''}. Kontrollera anslutningen och tryck **Försök igen** nedan.`
      setMessages(prev => [...prev, { role: 'assistant', content: text, isError: true, retryPrompt: promptText.trim() }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function sendMessage() {
    await sendToJarvis(input, true)
  }

  // Re-run the most recent user prompt — drops any trailing assistant/error
  // bubble and re-requests, without duplicating the user turn or its DB row.
  // Powers both "Regenerera" and "Försök igen".
  async function rerunLastUserPrompt() {
    if (loading) return
    let ui = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && !messages[i].isSeparator) { ui = i; break }
    }
    if (ui < 0) return
    const prompt = messages[ui].content
    const base = messages.slice(0, ui)
    setMessages(messages.slice(0, ui + 1))
    await sendToJarvis(prompt, false, { baseMessages: base, skipUserSave: true })
  }

  function copyMessage(content, idx) {
    navigator.clipboard?.writeText(content)
      .then(() => { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(c => c === idx ? null : c), 1500) })
      .catch(() => {})
  }

  async function generateBrief(type) {
    if (loading) return
    const prompt = type === 'morning'
      ? 'Morning brief: hämta relevant data från idag/senaste dagarna och ge mig de 3 viktigaste prioriteringarna idag. Var konkret och coachande.'
      : type === 'weekly'
      ? 'Veckoöversikt: hämta och analysera senaste 7 dagarna från journal, hälsa, träning, scores, ekonomi, plugg och tasks. Lyft mönster, starka signaler och exakt nästa steg.'
      : 'Kvällssummering: hämta dagens och senaste relevanta data, särskilt senaste journalen om den finns. Gör en coachande reflektion: vad var viktigt, vad säger datan, och vad ska jag ta med till imorgon?'
    await sendToJarvis(prompt, true)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const hour = new Date().getHours()
  const suggestions = useMemo(() => getFollowUps(messages), [messages])
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && !messages[i].isSeparator && !messages[i].isError) return i
    }
    return -1
  }, [messages])

  return (
    <div className="jarvis-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'transparent', margin: '-10px', padding: '10px', boxSizing: 'border-box', width: 'calc(100% + 20px)', maxHeight: '100%' }}>
      <div className="page-header" style={{ marginBottom: '0', flexShrink: 0 }}>
        <div>
          <div className="page-header-title">Jarvis</div>
          <div className="page-header-sub">{insights.length > 0 ? `${insights.length} insikter sparade` : 'Personlig AI'}</div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setShowInsights(!showInsights)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '8px', border: '1px solid ' + (showInsights ? 'var(--accent-border)' : 'var(--border)'), background: showInsights ? 'var(--accent-soft)' : 'var(--surface2)', color: showInsights ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
            <Brain size={12} /> Minne {showInsights ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
          {hour < 12 && <button onClick={() => generateBrief('morning')} disabled={loading} className="jvs-brief" style={{ '--jvs-c': '#fbbf24' }}><Sun size={12} /> Morning brief</button>}
          {hour >= 18 && <button onClick={() => generateBrief('evening')} disabled={loading} className="jvs-brief" style={{ '--jvs-c': '#a78bfa' }}><Moon size={12} /> Kväll</button>}
          <button onClick={() => generateBrief('weekly')} disabled={loading} className="jvs-brief" style={{ '--jvs-c': '#34d399' }}><Zap size={12} /> Vecka</button>
        </div>
      </div>

      {showInsights && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(139,92,246,0.04)', flexShrink: 0, maxHeight: '220px', overflowY: 'auto' }}>
          <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Långtidsminne — {insights.length} insikter</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
            {insights.map(ins => (
              <div key={ins.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>{ins.category}</span>
                <span style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.4', flex: 1 }}>{ins.insight}</span>
                <button onClick={() => deleteInsight(ins.id)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '0', flexShrink: 0, opacity: 0.4, lineHeight: 1 }}><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input className="input" placeholder="Lägg till insikt manuellt..." value={newInsight} onChange={e => setNewInsight(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManualInsight()} style={{ fontSize: '12px', padding: '5px 10px' }} />
            <button onClick={addManualInsight} disabled={addingInsight || !newInsight.trim()} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: '12px', flexShrink: 0 }}><Plus size={12} /></button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px 20px', gap: '20px' }}>
            <div className="jvs-orb jvs-orb-lg" style={{ width: 56, height: 56, borderRadius: '16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '17px', fontWeight: '600', color: 'var(--text)', marginBottom: '6px' }}>Jarvis är redo</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '320px', lineHeight: '1.6' }}>Han hämtar live-data vid behov och kan logga, uppdatera och skapa direkt åt dig i appen.</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '520px' }}>
              {['Visa min senaste journal entry', 'Kvällssummering', 'Hur mår jag generellt?', 'Analysera min löpning', 'Vad vet du om mig?'].map(s => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus() }} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted2)', cursor: 'pointer', fontSize: '13px' }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.isSeparator) return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}><div style={{ flex: 1, height: '1px', background: 'var(--border)' }} /><span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>{msg.content}</span><div style={{ flex: 1, height: '1px', background: 'var(--border)' }} /></div>
          const isRevealing = !!reveal && msg.role === 'assistant' && i === lastAssistantIndex
          const displayContent = isRevealing ? reveal.shown : msg.content
          const showActions = msg.role === 'assistant' && !msg.isError && !isRevealing && !msg.streaming
          return (
            <div key={i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '10px', alignItems: 'flex-end' }}>
              {msg.role === 'assistant' && <div className="jvs-orb" style={{ width: 28, height: 28 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg></div>}
              <div className={msg.role === 'user' ? 'jvs-bubble-user' : 'jvs-bubble-ai'}>
                <MarkdownMessage content={displayContent} userMessage={msg.role === 'user'} />
                {(isRevealing || msg.streaming) && <span className="jvs-caret" aria-hidden="true" />}
                {showActions && (
                  <div className="jvs-msg-actions">
                    <button onClick={() => copyMessage(msg.content, i)} title="Kopiera svar">
                      {copiedIdx === i ? <><Check size={11} /> Kopierat</> : <><Copy size={11} /> Kopiera</>}
                    </button>
                    {i === lastAssistantIndex && (
                      <button onClick={rerunLastUserPrompt} disabled={loading} title="Generera nytt svar">
                        <RefreshCw size={11} /> Regenerera
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {loading && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div className="jvs-orb" style={{ width: 28, height: 28 }} />
            <div className="jvs-bubble-ai" style={{ display: 'flex', gap: '5px', alignItems: 'center', padding: '14px 18px' }}>{[0,1,2].map(j => <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'bounce 1.2s ease-in-out ' + (j * 0.15) + 's infinite' }} />)}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '8px 0 0', flexShrink: 0 }} className="jarvis-input-area">
        {(() => {
          const last = messages.filter(m => !m.isSeparator).slice(-1)[0]
          if (loading || !last || last.role !== 'assistant') return null
          if (last.isError && last.retryPrompt) {
            return (
              <div className="jvs-suggest-row">
                <button className="jvs-suggest jvs-suggest-retry" onClick={rerunLastUserPrompt}>↻ Försök igen</button>
              </div>
            )
          }
          if (!suggestions.length) return null
          return (
            <div className="jvs-suggest-row">
              <span className="jvs-suggest-lead"><Sparkles size={11} /> Nästa</span>
              {suggestions.map(s => (
                <button key={s} className="jvs-suggest" onClick={() => sendToJarvis(s, true)}>{s}</button>
              ))}
            </div>
          )
        })()}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', background: 'var(--surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: '16px', padding: '8px 8px 8px 16px', boxShadow: 'var(--glass-shadow)', transition: 'border-color 0.15s' }}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} placeholder="Skriv till Jarvis..." disabled={loading} rows={1} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '14px', lineHeight: '1.5', resize: 'none', maxHeight: '120px', overflow: 'auto', padding: '4px 0', fontFamily: 'Inter, sans-serif' }} />
          <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ width: 36, height: 36, borderRadius: '10px', border: 'none', flexShrink: 0, background: input.trim() ? 'var(--accent)' : 'transparent', color: input.trim() ? 'white' : 'var(--muted)', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', boxShadow: input.trim() ? '0 2px 10px var(--accent-glow)' : 'none' }}><Send size={15} /></button>
        </div>
      </div>

      <style>{`@keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }`}</style>
    </div>
  )
}
