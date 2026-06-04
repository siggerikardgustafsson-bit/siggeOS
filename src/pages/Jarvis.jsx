import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subDays } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Send, Zap, Sun, Moon, Brain, ChevronDown, ChevronUp, Plus, Trash2, Check, X } from 'lucide-react'
import MarkdownMessage from '../components/MarkdownMessage'

const todayISO = () => format(new Date(), 'yyyy-MM-dd')
const clean = (value) => value === undefined || value === null || value === '' ? null : value

const JARVIS_SYSTEM_TEMPLATE = `Du är Jarvis – en personlig AI-assistent inbyggd i MaxxIt.

ROLL:
Du är coach, assistent, analytiker och minne i samma system. Välj själv läge utifrån prompten. Var datadriven, konkret och direkt. Du ska inte vara generisk.

ARBETSSÄTT:
- Använd kontexten, men anta inte att den är komplett.
- När frågan kräver data: använd serververktyg proaktivt.
- Vid kväll/vecka/morgon: hämta relevant data och gör coachande reflektion, inte bara sammanfattning.
- När användaren ber dig logga, ändra, skapa, komma ihåg eller glömma: föreslå en action. UI visar godkänn-knapp.
- Radera eller större ändringar ska alltid kräva tydlig bekräftelse via action-knapp.
- Skriv ALDRIG JSON synligt för användaren.

KONTEXT FRÅN APPEN:
{CONTEXT}

Svara på samma språk som användaren skriver på. Kort om inget annat behövs.`

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

  useEffect(() => {
    const count = messages.filter(m => m.role === 'assistant' && !m.isHistoryMarker && !m.isSeparator).length
    if (count > 0 && count % 4 === 0) extractInsights(messages)
  }, [messages])

  const refreshContext = useCallback(async (force = false) => {
    if (!user) return ''
    // Return cached context if fresh and not forced
    if (!force && contextRef.current && (Date.now() - contextCacheTimeRef.current) < CONTEXT_TTL_MS) {
      return contextRef.current
    }
    const now = new Date()
    const today = format(now, 'yyyy-MM-dd')
    const since30 = format(subDays(now, 30), 'yyyy-MM-dd')
    const since7 = format(subDays(now, 7), 'yyyy-MM-dd')
    const datetime = format(now, "EEEE d MMMM yyyy, HH:mm", { locale: sv })

    const [scoresRes, healthRes, journalRes, tasksRes, settingsRes, trainingRes, expenseRes, incomeRes, examsRes, insightsRes] = await Promise.all([
      supabase.from('daily_scores').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('health_logs').select('*').eq('user_id', user.id).gte('date', since7).order('date', { ascending: false }).limit(7),
      supabase.from('journal_entries').select('id,date,content,mood,energy,sleep_hours,social_score,ai_summary,sleep_type,sleep_note').eq('user_id', user.id).order('date', { ascending: false }).limit(7),
      supabase.from('erik_tasks').select('*').eq('user_id', user.id).neq('status', 'klart').limit(10),
      supabase.from('user_settings').select('about_me, goals, jarvis_personality, jarvis_style, jarvis_lang').eq('user_id', user.id).maybeSingle(),
      supabase.from('training_sessions').select('date,session_type,duration_minutes,distance_km,feeling,notes,pace_per_km').eq('user_id', user.id).order('date', { ascending: false }).limit(10),
      supabase.from('expense_logs').select('date,amount,category,description').eq('user_id', user.id).gte('date', since30).order('date', { ascending: false }).limit(40),
      supabase.from('income_logs').select('date,amount,source,notes').eq('user_id', user.id).gte('date', since30),
      supabase.from('course_exams').select('exam_date,name,course_id').eq('user_id', user.id).gte('exam_date', today).order('exam_date', { ascending: true }).limit(5),
      supabase.from('jarvis_insights').select('insight, category, confidence').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(150),
    ])

    const s = settingsRes.data || {}
    const g = s.goals || {}
    const csnLimit = g.csn_fribelopp || 114500
    const totalExp = (expenseRes.data || []).reduce((sum, e) => sum + Number(e.amount || 0), 0)
    const totalInc = (incomeRes.data || []).reduce((sum, i) => sum + Number(i.amount || 0), 0)
    const topCats = Object.entries((expenseRes.data || []).reduce((acc, e) => {
      acc[e.category || 'Övrigt'] = (acc[e.category || 'Övrigt'] || 0) + Number(e.amount || 0)
      return acc
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, a]) => `${c}:${Math.round(a)}kr`).join(', ')

    const profileLines = [
      s.about_me && `Profil: ${s.about_me}`,
      g.one_year && `1 års mål: ${g.one_year}`,
      g.three_year && `3 års mål: ${g.three_year}`,
      g.ten_year && `10 års vision: ${g.ten_year}`,
      g.future_plan && `Framtidsplan: ${g.future_plan}`,
      (g.target_weight || g.body_weight_goal) && `Viktmål: ${g.target_weight || g.body_weight_goal} kg${g.body_weight_deadline ? ` till ${g.body_weight_deadline}` : ''}`,
      g.monthly_income_goal && `Inkomstmål: ${g.monthly_income_goal} kr/mån netto`,
      s.jarvis_personality && `Instruktion: ${s.jarvis_personality}`,
    ].filter(Boolean).join('\n')

    const insBlock = (insightsRes.data || []).length
      ? (insightsRes.data || []).map(i => `[${i.category || 'mönster'}] ${i.insight}`).join('\n')
      : 'Inga insikter ännu.'

    const healthBlock = (healthRes.data || []).map(h => {
      const energy = h.energy_level ?? h.energy
      return `${h.date}:${h.weight_kg ? ' vikt ' + h.weight_kg + 'kg' : ''}${h.sleep_hours ? ' sömn ' + h.sleep_hours + 'h' : ''}${h.steps ? ' steg ' + h.steps : ''}${energy ? ' energi ' + energy + '/10' : ''}${h.mood ? ' humör ' + h.mood + '/10' : ''}${h.stress_level ? ' stress ' + h.stress_level + '/10' : ''}`
    }).join('\n') || 'Ingen hälsodata senaste 7 dagarna.'

    const journalBlock = (journalRes.data || []).map(j => `${j.date}: humör ${j.mood || '-'}/10 energi ${j.energy || '-'}/10${j.sleep_hours ? ' sömn ' + j.sleep_hours + 'h' : ''}${j.social_score ? ' socialt ' + j.social_score + '/10' : ''}${j.ai_summary ? '\n  AI: ' + j.ai_summary.slice(0, 220) : ''}${j.content ? '\n  "' + j.content.slice(0, 450) + (j.content.length > 450 ? '…' : '') + '"' : ''}`).join('\n') || 'Ingen journaldata.'

    const trainBlock = (trainingRes.data || []).map(t => `${t.date}: ${t.session_type || 'pass'}${t.duration_minutes ? ' ' + t.duration_minutes + 'min' : ''}${t.distance_km ? ' ' + t.distance_km + 'km' : ''}${t.feeling ? ' känsla:' + t.feeling + '/10' : ''}${t.notes ? ' – ' + t.notes.slice(0, 160) : ''}`).join('\n') || 'Inga pass loggade.'

    const upcomingExams = (examsRes.data || []).length ? (examsRes.data || []).map(e => {
      const daysLeft = Math.ceil((new Date(e.exam_date) - now) / 86400000)
      return `${e.exam_date} (${daysLeft}d): ${e.name}`
    }).join('\n') : 'Inga kommande tentor.'

    const ctx = `TIDPUNKT: ${datetime}

PROFIL & MÅL:
${profileLines || '(ej konfigurerat)'}

LÅNGTIDSMINNE:
${insBlock}

DAGENS SCORE (${today}):
${scoresRes.data ? `Total:${scoresRes.data.total_score || 0} Träning:${scoresRes.data.score_training || 0} Hälsa:${scoresRes.data.score_health || 0} Plugg:${scoresRes.data.score_study || 0} Ekonomi:${scoresRes.data.score_economy || 0}` : 'Inga scores'}

HÄLSODATA SENASTE 7 DAGAR:
${healthBlock}

JOURNAL SENASTE 7 ENTRIES:
${journalBlock}

TRÄNING SENASTE 10 PASS:
${trainBlock}

EKONOMI SENASTE 30 DAGAR:
Inkomst: ${Math.round(totalInc).toLocaleString('sv-SE')} kr | Utgifter: ${Math.round(totalExp).toLocaleString('sv-SE')} kr | Netto: ${Math.round(totalInc - totalExp).toLocaleString('sv-SE')} kr
Kategorier: ${topCats || '—'}
CSN riktvärde: ${csnLimit.toLocaleString('sv-SE')} kr

AKTIVA ERIK-UPPDRAG:
${(tasksRes.data || []).map(t => `${t.title} [${t.tag}]${t.deadline ? ' deadline:' + t.deadline : ''}${t.status ? ' [' + t.status + ']' : ''}`).join('\n') || 'Inga aktiva uppdrag.'}

KOMMANDE TENTOR:
${upcomingExams}`

    setContext(ctx)
    contextRef.current = ctx
    contextCacheTimeRef.current = Date.now()
    return ctx
  }, [user])

  async function loadHistory() {
    const since = format(subDays(new Date(), 14), 'yyyy-MM-dd')
    const { data } = await supabase.from('jarvis_conversations')
      .select('role,content,created_at')
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

  async function extractInsights(msgs) {
    if (!user || msgs.length < 4) return
    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: `Extrahera nya långsiktiga insikter om användaren. Max 20 ord per insikt. Returnera bara JSON-array utan markdown: [{"insight":"...","category":"hälsa|träning|plugg|ekonomi|socialt|mönster|mål|personlighet"}]` }],
          context: msgs.filter(m => !m.isHistoryMarker && !m.isSeparator).slice(-20).map(m => `${m.role}: ${m.content?.slice(0, 400)}`).join('\n'),
          systemPrompt: 'Du extraherar minnesinsikter. Returnera endast giltig JSON-array, ingen annan text.',
        },
      })
      if (!data?.content) return
      const arr = JSON.parse(data.content.replace(/```json|```/g, '').trim())
      if (!Array.isArray(arr)) return
      for (const ins of arr) {
        if (!ins.insight || ins.insight.length < 8) continue
        const { data: existing } = await supabase.from('jarvis_insights')
          .select('id,insight').eq('user_id', user.id).ilike('insight', `%${ins.insight.slice(0, 20)}%`).maybeSingle()
        if (existing) {
          if (existing.insight !== ins.insight) await supabase.from('jarvis_insights').update({ insight: ins.insight, updated_at: new Date().toISOString() }).eq('id', existing.id)
        } else {
          await supabase.from('jarvis_insights').insert({ user_id: user.id, insight: ins.insight, category: ins.category || 'mönster', confidence: 80 })
        }
      }
      await loadInsights()
      await refreshContext(true)
    } catch (_) {}
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

    await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'user', content: userMsg.content })

    try {
      const systemPrompt = JARVIS_SYSTEM_TEMPLATE.replace('{CONTEXT}', freshCtx || contextRef.current)
      const { data, error } = await supabase.functions.invoke('jarvis-chat', {
        body: { messages: newMessages, context: freshCtx || contextRef.current, systemPrompt },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const content = stripAccidentalActionJson(data?.content || '')
      const assistantMsg = { role: 'assistant', content: content || 'Jag fick inget svar från modellen.' }
      setMessages(prev => [...prev, assistantMsg])
      await supabase.from('jarvis_conversations').insert({ user_id: user.id, role: 'assistant', content: assistantMsg.content })
      addPendingActions(data?.actions || [])
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
          {hour < 12 && <button onClick={() => generateBrief('morning')} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.08)', color: '#fbbf24', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}><Sun size={12} /> Morning brief</button>}
          {hour >= 18 && <button onClick={() => generateBrief('evening')} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.08)', color: '#a78bfa', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}><Moon size={12} /> Kväll</button>}
          <button onClick={() => generateBrief('weekly')} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '8px', border: '1px solid rgba(52,211,153,0.25)', background: 'rgba(52,211,153,0.08)', color: '#34d399', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}><Zap size={12} /> Vecka</button>
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
            <div style={{ width: 56, height: 56, borderRadius: '16px', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              {msg.role === 'assistant' && <div style={{ width: 28, height: 28, borderRadius: '8px', flexShrink: 0, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg></div>}
              <div style={{ maxWidth: '72%', padding: msg.role === 'user' ? '10px 16px' : '14px 18px', borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px', background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)', border: msg.role === 'assistant' ? '1px solid var(--glass-border)' : 'none', color: msg.role === 'user' ? 'white' : 'var(--text)', fontSize: '14px', lineHeight: '1.65', backdropFilter: msg.role === 'assistant' ? 'blur(20px)' : 'none', WebkitBackdropFilter: msg.role === 'assistant' ? 'blur(20px)' : 'none', boxShadow: msg.role === 'user' ? '0 4px 16px var(--accent-glow)' : 'var(--glass-shadow)' }}>
                <MarkdownMessage content={msg.content} userMessage={msg.role === 'user'} />
              </div>
            </div>
          )
        })}

        {pendingActions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: 38, maxWidth: 680 }}>
            {pendingActions.map(action => (
              <div key={action._id} style={{ border: '1px solid var(--accent-border)', background: 'var(--accent-soft)', borderRadius: 14, padding: 12, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
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
            <div style={{ width: 28, height: 28, borderRadius: '8px', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
            <div style={{ padding: '14px 18px', borderRadius: '4px 18px 18px 18px', background: 'var(--surface)', border: '1px solid var(--glass-border)', display: 'flex', gap: '5px', alignItems: 'center', backdropFilter: 'blur(20px)' }}>{[0,1,2].map(j => <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'bounce 1.2s ease-in-out ' + (j * 0.15) + 's infinite' }} />)}</div>
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
