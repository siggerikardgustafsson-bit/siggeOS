import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Send, Zap, Sun, Moon, Brain, ChevronDown, ChevronUp, Plus, Trash2, Check, X } from 'lucide-react'
import MarkdownMessage from '../components/MarkdownMessage'

const todayISO = () => format(new Date(), 'yyyy-MM-dd')
const clean = (value) => value === undefined || value === null || value === '' ? null : value

// System prompt built in edge function

const ACTION_LABELS = {
  create_erik_task: 'Skapa Erik-uppdrag',
  create_adventure: 'Skapa upplevelse',
  save_insight: 'Spara minne',
  log_training: 'Logga träning',
  log_health: 'Logga hälsa',
  log_expense: 'Logga utgift',
  log_income: 'Logga inkomst',
  update_training: 'Uppdatera träning',
  update_health: 'Uppdatera hälsa',
  update_erik_task: 'Uppdatera Erik-uppdrag',
  update_expense: 'Uppdatera utgift',
  delete_training: 'Radera träning',
  delete_health: 'Radera hälsologg',
  delete_erik_task: 'Radera Erik-uppdrag',
  delete_expense: 'Radera utgift',
  delete_income: 'Radera inkomst',
  create_project_task: 'Skapa projekt-task',
  update_project_task: 'Uppdatera projekt-task',
  delete_project_task: 'Radera projekt-task',
  create_trip: 'Skapa resa',
  update_trip: 'Uppdatera resa',
  update_friend: 'Uppdatera vän',
  save_preference: 'Spara preferens',
  update_memory_context: 'Uppdatera kontext',
}

function stripAccidentalActionJson(content = '') {
  return content
    .replace(/<jarvis_actions>[\s\S]*?<\/jarvis_actions>/gi, '')
    .replace(/```json\s*\{[\s\S]*?"action"[\s\S]*?\}\s*```/gi, '')
    .trim()
}

function normalizeHealthFields(fields = {}) {
  const f = { ...fields }
  if (f.energy != null && f.energy_level == null) f.energy_level = f.energy
  if (f.energy_level != null && f.energy == null) f.energy = f.energy_level
  return f
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
  const [pendingActions, setPendingActions] = useState([])
  const [actionLoading, setActionLoading] = useState(null)
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
  }, [messages, loading, pendingActions])

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

  async function executeAction(action) {
    if (!action?.action || !user) return
    setActionLoading(action._id)
    const d = action
    try {
      let res
      switch (d.action) {
        case 'create_erik_task':
          res = await supabase.from('erik_tasks').insert({ user_id: user.id, title: d.title, description: d.description || '', deadline: clean(d.deadline), tag: d.tag || 'Övrig verksamhet', status: d.status || 'ej_påbörjat', priority: d.priority || 'medium' })
          break
        case 'create_adventure':
          res = await supabase.from('adventures').insert({ user_id: user.id, title: d.title, description: d.description || '', date: d.date || todayISO(), location: d.location || '', category: d.category || 'övrigt', rating: clean(d.rating) })
          break
        case 'save_insight':
          res = await supabase.from('jarvis_insights').insert({ user_id: user.id, insight: d.insight, category: d.category || 'mönster', confidence: d.confidence || 80 })
          break
        case 'log_training':
          res = await supabase.from('training_sessions').insert({ user_id: user.id, date: d.date || todayISO(), session_type: d.session_type || 'övrigt', duration_minutes: clean(d.duration_minutes), distance_km: clean(d.distance_km), time_seconds: clean(d.time_seconds), pace_per_km: clean(d.pace_per_km), feeling: clean(d.feeling), notes: d.notes || '', source: 'jarvis' })
          break
        case 'log_health': {
          const date = d.date || todayISO()
          const fields = normalizeHealthFields({ weight_kg: clean(d.weight_kg), sleep_hours: clean(d.sleep_hours), energy: clean(d.energy), energy_level: clean(d.energy_level), steps: clean(d.steps), alcohol_units: clean(d.alcohol_units), nicotine: d.nicotine || false, mood: clean(d.mood), stress_level: clean(d.stress_level), sleep_quality: clean(d.sleep_quality), caffeine_mg: clean(d.caffeine_mg), source: 'jarvis' })
          Object.keys(fields).forEach(k => fields[k] == null && delete fields[k])
          const { data: existing } = await supabase.from('health_logs').select('id').eq('user_id', user.id).eq('date', date).limit(1).maybeSingle()
          res = existing?.id
            ? await supabase.from('health_logs').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('user_id', user.id)
            : await supabase.from('health_logs').insert({ user_id: user.id, date, ...fields })
          break
        }
        case 'log_expense':
          res = await supabase.from('expense_logs').insert({ user_id: user.id, date: d.date || todayISO(), amount: Number(d.amount || 0), category: d.category || 'Övrigt', description: d.description || '' })
          break
        case 'log_income':
          res = await supabase.from('income_logs').insert({ user_id: user.id, date: d.date || todayISO(), amount: Number(d.amount || 0), source: d.source || 'Övrigt', notes: d.notes || d.description || '' })
          break
        case 'update_training':
          res = d.id && d.fields ? await supabase.from('training_sessions').update(d.fields).eq('id', d.id).eq('user_id', user.id) : { error: new Error('Saknar id/fields') }
          break
        case 'update_health':
          res = d.id && d.fields ? await supabase.from('health_logs').update(normalizeHealthFields(d.fields)).eq('id', d.id).eq('user_id', user.id) : { error: new Error('Saknar id/fields') }
          break
        case 'update_erik_task':
          res = d.id && d.fields ? await supabase.from('erik_tasks').update(d.fields).eq('id', d.id).eq('user_id', user.id) : { error: new Error('Saknar id/fields') }
          break
        case 'update_expense':
          res = d.id && d.fields ? await supabase.from('expense_logs').update(d.fields).eq('id', d.id).eq('user_id', user.id) : { error: new Error('Saknar id/fields') }
          break
        case 'delete_training':
          res = d.id ? await supabase.from('training_sessions').delete().eq('id', d.id).eq('user_id', user.id) : { error: new Error('Saknar id') }
          break
        case 'delete_health':
          res = d.id ? await supabase.from('health_logs').delete().eq('id', d.id).eq('user_id', user.id) : { error: new Error('Saknar id') }
          break
        case 'delete_erik_task':
          res = d.id ? await supabase.from('erik_tasks').delete().eq('id', d.id).eq('user_id', user.id) : { error: new Error('Saknar id') }
          break
        case 'delete_expense':
          res = d.id ? await supabase.from('expense_logs').delete().eq('id', d.id).eq('user_id', user.id) : { error: new Error('Saknar id') }
          break
        case 'delete_income':
          res = d.id ? await supabase.from('income_logs').delete().eq('id', d.id).eq('user_id', user.id) : { error: new Error('Saknar id') }
          break
        case 'create_project_task':
          res = await supabase.from('project_tasks').insert({
            user_id: user.id,
            project_id: d.project_id,
            title: d.title,
            description: d.description || null,
            deadline: clean(d.deadline),
            priority: d.priority || 'medium',
            notes: d.notes || null,
            status: d.status || 'ej_påbörjat',
          })
          break
        case 'update_project_task':
          res = d.id && d.fields
            ? await supabase.from('project_tasks').update(d.fields).eq('id', d.id).eq('user_id', user.id)
            : { error: new Error('Saknar id/fields') }
          break
        case 'delete_project_task':
          res = d.id
            ? await supabase.from('project_tasks').delete().eq('id', d.id).eq('user_id', user.id)
            : { error: new Error('Saknar id') }
          break
        case 'create_trip':
          res = await supabase.from('trips').insert({
            user_id: user.id,
            title: d.title,
            countries: d.countries || [],
            country: d.countries?.[0] || '',
            city: d.city || '',
            start_date: clean(d.start_date),
            end_date: clean(d.end_date),
            status: d.status || 'idea',
            planning_doc: d.planning_doc || null,
            budget_items: d.budget_items || null,
            budget_sek: clean(d.budget_sek),
            notes: d.planning_doc || d.notes || null,
            highlights: d.highlights || null,
          })
          break
        case 'update_trip':
          res = d.id && d.fields ? await supabase.from('trips').update({ ...d.fields, notes: d.fields.planning_doc || d.fields.notes }).eq('id', d.id).eq('user_id', user.id) : { error: new Error('Saknar id/fields') }
          break
        default:
          res = { error: new Error('Okänd action: ' + d.action) }
      }
      if (res?.error) throw res.error
      setPendingActions(prev => prev.filter(a => a._id !== action._id))
      setMessages(prev => [...prev, { role: 'assistant', content: `Klart — ${ACTION_LABELS[d.action] || d.action} genomförd.` }])
      await refreshContext(true)
      if (d.action === 'save_insight') await loadInsights()
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Action misslyckades: ${err?.message || 'okänt fel'}` }])
    } finally {
      setActionLoading(null)
    }
  }

  function addPendingActions(actions = []) {
    const normalized = actions.filter(a => a?.action).map((a, idx) => ({ ...a, _id: `${Date.now()}-${idx}-${Math.random().toString(16).slice(2)}` }))
    if (normalized.length) setPendingActions(prev => [...prev, ...normalized])
  }

  async function sendToJarvis(promptText, visible = true) {
    if (!promptText.trim() || loading) return
    const userMsg = { role: 'user', content: promptText.trim() }
    setLoading(true)
    setInput('')

    const freshCtx = await refreshContext()
    const current = messages.filter(m => !m.isSeparator && !m.isHistoryMarker)
    const newMessages = [...current, userMsg]
    if (visible) setMessages(prev => [...prev, userMsg])

    const { error: saveUserErr } = await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'user', content: userMsg.content })
    if (saveUserErr) console.error('Failed to save user message:', saveUserErr)

    try {
      const { data, error } = await supabase.functions.invoke('jarvis-chat', {
        body: { messages: newMessages, context: freshCtx || contextRef.current },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const content = stripAccidentalActionJson(data?.content || '')
      const assistantMsg = { role: 'assistant', content: content || 'Jag fick inget svar från modellen.' }
      setMessages(prev => [...prev, assistantMsg])
      const { error: saveAsstErr } = await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'assistant', content: assistantMsg.content })
      if (saveAsstErr) console.error('Failed to save assistant message:', saveAsstErr)
      addPendingActions(data?.actions || [])
      if (data?.savedMemory) loadInsights()
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Något gick fel: ${err?.message || 'Okänt fel'}.` }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function sendMessage() {
    await sendToJarvis(input, true)
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

  function actionSummary(action) {
    const copy = { ...action }
    delete copy._id
    return Object.entries(copy).filter(([k]) => k !== 'action').slice(0, 6).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')
  }

  const hour = new Date().getHours()

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
              <div style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '320px', lineHeight: '1.6' }}>Han hämtar live-data vid behov och ber om godkännande innan han skriver större saker till databasen.</div>
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
          return (
            <div key={i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '10px', alignItems: 'flex-end' }}>
              {msg.role === 'assistant' && <div className="jvs-orb" style={{ width: 28, height: 28 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg></div>}
              <div className={msg.role === 'user' ? 'jvs-bubble-user' : 'jvs-bubble-ai'}>
                <MarkdownMessage content={msg.content} userMessage={msg.role === 'user'} />
              </div>
            </div>
          )
        })}

        {pendingActions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: 38, maxWidth: 680 }}>
            {pendingActions.map(action => (
              <div key={action._id} className="jvs-action">
                <div style={{ minWidth: 0, position: 'relative', paddingLeft: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{ACTION_LABELS[action.action] || action.action}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted2)', overflowWrap: 'anywhere' }}>{actionSummary(action)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-primary btn-sm" disabled={actionLoading === action._id} onClick={() => executeAction(action)}><Check size={13} /> Godkänn</button>
                  <button className="btn btn-ghost btn-sm" disabled={actionLoading === action._id} onClick={() => setPendingActions(prev => prev.filter(a => a._id !== action._id))}><X size={13} /> Avbryt</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div className="jvs-orb" style={{ width: 28, height: 28 }} />
            <div className="jvs-bubble-ai" style={{ display: 'flex', gap: '5px', alignItems: 'center', padding: '14px 18px' }}>{[0,1,2].map(j => <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'bounce 1.2s ease-in-out ' + (j * 0.15) + 's infinite' }} />)}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '8px 0 0', flexShrink: 0 }} className="jarvis-input-area">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', background: 'var(--surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: '16px', padding: '8px 8px 8px 16px', boxShadow: 'var(--glass-shadow)', transition: 'border-color 0.15s' }}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} placeholder="Skriv till Jarvis..." disabled={loading} rows={1} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '14px', lineHeight: '1.5', resize: 'none', maxHeight: '120px', overflow: 'auto', padding: '4px 0', fontFamily: 'Inter, sans-serif' }} />
          <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ width: 36, height: 36, borderRadius: '10px', border: 'none', flexShrink: 0, background: input.trim() ? 'var(--accent)' : 'transparent', color: input.trim() ? 'white' : 'var(--muted)', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', boxShadow: input.trim() ? '0 2px 10px var(--accent-glow)' : 'none' }}><Send size={15} /></button>
        </div>
      </div>

      <style>{`@keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }`}</style>
    </div>
  )
}
