import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, differenceInDays, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { X, Send, Loader, Brain, Check, TrendingUp, Upload, FileText, Timer, Zap, BookOpen } from 'lucide-react'
import MarkdownMessage from './MarkdownMessage'

function applyDecay(mastery, lastStudied) {
  if (!lastStudied || mastery === 0) return mastery
  const days = differenceInDays(new Date(), parseISO(lastStudied))
  if (days < 3) return mastery
  if (days < 7) return Math.max(0, mastery - 5)
  if (days < 14) return Math.max(0, mastery - 10)
  if (days < 30) return Math.max(0, mastery - 20)
  return Math.max(0, mastery - 35)
}

function MasteryRing({ value, size = 36 }) {
  const r = (size - 4) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  const ringColor = value >= 80 ? '#10b981' : value >= 50 ? '#f59e0b' : value >= 20 ? '#3b82f6' : '#6b7280'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ringColor} strokeWidth={3}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <foreignObject x={0} y={0} width={size} height={size} style={{ transform: 'rotate(90deg)' }}>
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: size < 40 ? '9px' : '11px', fontWeight: '700', color: ringColor, fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
        </div>
      </foreignObject>
    </svg>
  )
}

function useTimer(running) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [running])
  const fmt = s => `${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor((s%3600)/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`
  return { seconds, formatted: fmt(seconds) }
}

export default function StudyModal({ exam, courseId, goals, onClose, onMasteryUpdate }) {
  const { user } = useAuth()
  const [selectedGoals, setSelectedGoals] = useState([])
  const [mode, setMode] = useState('normal') // normal | tenta
  const [step, setStep] = useState('select') // select | chat
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [masteryUpdates, setMasteryUpdates] = useState({})
  const [sessionGoals, setSessionGoals] = useState([])
  const [courseMaterials, setCourseMaterials] = useState([])
  const [uploadingMaterial, setUploadingMaterial] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [sessionStartTime] = useState(new Date())
  const { seconds, formatted: timerFormatted } = useTimer(step === 'chat')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const materialRef = useRef(null)

  const goalsWithDecay = goals.map(g => ({
    ...g,
    effectiveMastery: applyDecay(g.mastery || 0, g.last_studied),
  }))

  useEffect(() => {
    if (user && exam?.id) fetchCourseMaterials()
  }, [user, exam])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchCourseMaterials() {
    const { data } = await supabase
      .from('course_materials')
      .select('id, file_name, created_at')
      .eq('exam_id', exam.id)
      .eq('user_id', user.id)
    setCourseMaterials(data || [])
  }

  async function handleMaterialUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingMaterial(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1]

      // Extract text content via Jarvis
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: 'Extrahera allt text-innehåll från detta kursmaterial ordagrant. Behåll alla detaljer, rubriker och struktur. Returnera bara texten.' }
            ]
          }],
          context: '',
          systemPrompt: 'Extrahera text från PDF. Returnera bara texten.',
        },
      })

      await supabase.from('course_materials').insert({
        user_id: user.id,
        exam_id: exam.id,
        course_id: courseId,
        file_name: file.name,
        content: data?.content || '',
      })

      await fetchCourseMaterials()
      setUploadingMaterial(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function deleteMaterial(id) {
    await supabase.from('course_materials').delete().eq('id', id)
    await fetchCourseMaterials()
  }

  function buildSystemPrompt(chosenGoals, materials, isTentaMode) {
    const goalsList = chosenGoals.map((g, i) =>
      `${i + 1}. [ID: ${g.id}] ${g.description} (nuvarande behärskningsgrad: ${masteryUpdates[g.id] ?? g.effectiveMastery}%)`
    ).join('\n')

    const materialsBlock = materials.length > 0
      ? `\nKURSMATERIAL (vad Sigge förväntas kunna):\n${materials.map(m => `--- ${m.file_name} ---\n${m.content?.slice(0, 3000)}`).join('\n\n')}`
      : ''

    const basePrompt = `Du är Jarvis, Sigges personliga medicinstudent-tutor. Examination: "${exam.name}".

LÄRANDEMÅL (med goal_id och nuvarande behärskningsgrad):
${goalsList}
${materialsBlock}

MASTERY-UPPDATERING (KRITISKT VIKTIGT):
- Du MÅSTE inkludera mastery_update JSON varje gång du bedömer ett svar
- Format: {"mastery_update": {"goal_id": "EXAKT-UUID-FRÅN-LISTAN", "mastery": 65}}
- Använd EXAKT goal_id från listan ovan — kopiera UUID ordagrant
- Uppdatera GRADVIS: om nuvarande är 0%, börja med 20-30% om svaret var okej, 40-60% om bra, 70-85% om mycket bra, 90-100% om perfekt
- Om Sigge förbättrar sitt svar, öka gradvis i steg om 10-20%
- Om Sigge ber dig höja ett mål, gör det direkt utan diskussion
- Du kan uppdatera flera mål i samma svar

PEDAGOGISK STIL:
- Sokrates-metoden: ställ frågor som tvingar fram resonemang, inte bara faktaåtergivning
- Bygg logiska kedjor: "X händer → därför Y → vilket leder till Z"
- Koppla till kliniska scenarier och patientfall
- Borra djupare om svaret är ytligt: "Rätt, men VARFÖR sker det? Vad är mekanismen?"
- Förklara i löpande text som en engagerad lärare — inte bara punktlistor
- Använd tabeller/jämförelser när det genuint hjälper (t.ex. DKA vs HHS)
- Om kursmaterial finns, se till att Sigge täcker allt som förväntas — inget mer, inget mindre

Svara på svenska. Var direkt och pedagogisk.`

    if (isTentaMode) {
      return basePrompt + `

TENTAMODE:
Du kör en simulerad tenta. Presentera en fråga i taget från den gamla tentan. 
Vänta på Sigges svar. Ge feedback och poäng (0-10). 
Gå sedan till nästa fråga. Summera resultatet i slutet och uppdatera behärskningsgrader baserat på prestationen.
Börja direkt med tentans första fråga.`
    }

    return basePrompt + '\n\nBörja med att fråga om det första lärandemålet.'
  }

  async function startSession() {
    if (selectedGoals.length === 0) return

    const chosen = goalsWithDecay.filter(g => selectedGoals.includes(g.id))
    setSessionGoals(chosen)

    // Fetch course material content
    const { data: matData } = await supabase
      .from('course_materials')
      .select('file_name, content')
      .eq('exam_id', exam.id)
      .eq('user_id', user.id)

    setStep('chat')

    // Create study session in DB
    const { data: sessData } = await supabase.from('study_sessions').insert({
      user_id: user.id,
      course_id: courseId,
      hours: 0,
      date: format(new Date(), 'yyyy-MM-dd'),
      subject: exam.name,
      notes: `Studiesession: ${chosen.length} lärandemål`,
    }).select().single()
    if (sessData) setSessionId(sessData.id)

    const systemPrompt = buildSystemPrompt(chosen, matData || [], mode === 'tenta')

    setLoading(true)
    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: mode === 'tenta' ? 'Kör tentamode.' : 'Starta studiesessionen.' }],
          context: '',
          systemPrompt,
        },
      })
      setMessages([{ role: 'assistant', content: data.content }])
      await processMasteryUpdates(data.content, chosen)
    } catch(e) { console.error(e) }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function processMasteryUpdates(content, goalsForSession) {
    // More robust regex that handles whitespace and newlines inside JSON
    const regex = /\{"mastery_update"\s*:\s*\{[^{}]*"goal_id"\s*:\s*"([^"]+)"[^{}]*"mastery"\s*:\s*(\d+)[^{}]*\}\}/g
    const updates = {}
    let match

    while ((match = regex.exec(content)) !== null) {
      const goal_id = match[1]
      const mastery = parseInt(match[2])
      if (goal_id && !isNaN(mastery)) {
        const clamped = Math.min(100, Math.max(0, mastery))
        updates[goal_id] = clamped
        const goal = goalsForSession.find(g => g.id === goal_id)
        await supabase.from('learning_goals').update({
          mastery: clamped,
          last_studied: new Date().toISOString(),
          study_count: (goal?.study_count || 0) + 1,
        }).eq('id', goal_id)
      }
    }

    // Also try simple JSON parse fallback
    const simpleMatches = content.match(/\{[^{}]*"mastery_update"[^{}]*\{[^{}]+\}[^{}]*\}/g) || []
    for (const m of simpleMatches) {
      try {
        const parsed = JSON.parse(m)
        const { goal_id, mastery } = parsed.mastery_update || {}
        if (goal_id && mastery !== undefined && !updates[goal_id]) {
          const clamped = Math.min(100, Math.max(0, Math.round(mastery)))
          updates[goal_id] = clamped
          const goal = goalsForSession.find(g => g.id === goal_id)
          await supabase.from('learning_goals').update({
            mastery: clamped,
            last_studied: new Date().toISOString(),
            study_count: (goal?.study_count || 0) + 1,
          }).eq('id', goal_id)
        }
      } catch(e) {}
    }

    if (Object.keys(updates).length > 0) {
      setMasteryUpdates(prev => ({ ...prev, ...updates }))
      onMasteryUpdate?.()
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const { data: matData } = await supabase
      .from('course_materials')
      .select('file_name, content')
      .eq('exam_id', exam.id)
      .eq('user_id', user.id)

    const systemPrompt = buildSystemPrompt(sessionGoals, matData || [], mode === 'tenta')

    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: { messages: newMessages, context: '', systemPrompt },
      })
      const assistantMsg = { role: 'assistant', content: data.content }
      setMessages(prev => [...prev, assistantMsg])
      await processMasteryUpdates(data.content, sessionGoals)
    } catch(e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Något gick fel. Försök igen.' }])
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  async function endSession() {
    // Update study session with actual time
    if (sessionId && seconds > 60) {
      await supabase.from('study_sessions').update({
        hours: Math.round(seconds / 360) / 10, // round to 1 decimal
        notes: `Studiesession: ${sessionGoals.length} lärandemål · ${timerFormatted}`,
      }).eq('id', sessionId)
    } else if (sessionId) {
      await supabase.from('study_sessions').delete().eq('id', sessionId)
    }
    onMasteryUpdate?.()
    onClose()
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function cleanContent(content) {
    return content
      .replace(/\{"mastery_update"\s*:\s*\{[^{}]*\}\}/g, '')
      .replace(/\{[^{}]*"mastery_update"[^{}]*\{[^{}]+\}[^{}]*\}/g, '')
      .trim()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }} onClick={e => e.target === e.currentTarget && (step === 'chat' ? endSession() : onClose())}>
      <div style={{
        background: 'var(--surface)', backdropFilter: 'blur(20px)',
        border: '1px solid var(--border)', borderRadius: '20px',
        width: '100%', maxWidth: '720px', height: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700' }}>📚 {exam.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                {step === 'chat' && (
                  <>
                    <span style={{ color: '#10b981', fontFamily: 'monospace', fontWeight: '600' }}>
                      <Timer size={11} style={{ display: 'inline', marginRight: '3px' }} />{timerFormatted}
                    </span>
                    <span>{sessionGoals.length} lärandemål</span>
                  </>
                )}
                {step === 'select' && <span>{goals.length} lärandemål · {courseMaterials.length} kursmaterial</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {step === 'chat' && (
                <button onClick={endSession} style={{
                  fontSize: '12px', padding: '6px 12px', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>
                  Avsluta & spara
                </button>
              )}
              <button onClick={() => step === 'chat' ? endSession() : onClose()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Mastery overview during chat */}
          {step === 'chat' && sessionGoals.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
              {sessionGoals.map(g => {
                const current = masteryUpdates[g.id] ?? g.effectiveMastery
                const prev = g.effectiveMastery
                const improved = masteryUpdates[g.id] !== undefined && masteryUpdates[g.id] > prev
                return (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '8px', background: improved ? 'rgba(16,185,129,0.1)' : 'var(--surface2)', border: `1px solid ${improved ? 'rgba(16,185,129,0.2)' : 'var(--border)'}` }}>
                    <MasteryRing value={current} size={26} />
                    <span style={{ fontSize: '10px', color: 'var(--muted2)', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.description.slice(0, 25)}
                    </span>
                    {improved && <TrendingUp size={9} color="#10b981" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* STEP 1: Select goals */}
        {step === 'select' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>

              {/* Mode selector */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button onClick={() => setMode('normal')} style={{
                  flex: 1, padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                  background: mode === 'normal' ? 'var(--accent)' : 'var(--surface2)',
                  color: mode === 'normal' ? 'white' : 'var(--muted)',
                  fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>
                  <Brain size={14} /> Studiesession
                </button>
                <button onClick={() => setMode('tenta')} style={{
                  flex: 1, padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                  background: mode === 'tenta' ? '#f59e0b' : 'var(--surface2)',
                  color: mode === 'tenta' ? 'white' : 'var(--muted)',
                  fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>
                  <Zap size={14} /> Tentamode
                </button>
              </div>

              {mode === 'tenta' && (
                <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', marginBottom: '12px', fontSize: '12px', color: '#f59e0b' }}>
                  Tentamode: Jarvis kör en gammal tenta med dig och bedömer dina svar. Se till att du har laddat upp gamla tentor under "Gamla tentor" på examinationen.
                </div>
              )}

              {/* Course materials */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '8px', letterSpacing: '0.05em' }}>
                  KURSMATERIAL ({courseMaterials.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '8px' }}>
                  {courseMaterials.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '7px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                      <FileText size={12} color="#10b981" />
                      <span style={{ fontSize: '12px', flex: 1, color: '#10b981' }}>{m.file_name}</span>
                      <button onClick={() => deleteMaterial(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px', fontSize: '12px' }}>×</button>
                    </div>
                  ))}
                </div>
                <input ref={materialRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleMaterialUpload} />
                <button onClick={() => materialRef.current?.click()} disabled={uploadingMaterial} style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px',
                  borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface2)',
                  color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif',
                }}>
                  {uploadingMaterial ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Läser in...</> : <><Upload size={12} /> Ladda upp kursmaterial (PDF)</>}
                </button>
              </div>

              {/* Goal selector */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.05em' }}>
                    LÄRANDEMÅL ({selectedGoals.length}/{goalsWithDecay.length} valda)
                  </div>
                  <button onClick={() => setSelectedGoals(goalsWithDecay.map(g => g.id))} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    Välj alla
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {goalsWithDecay.map(goal => {
                    const selected = selectedGoals.includes(goal.id)
                    const m = goal.effectiveMastery
                    const needsReview = goal.last_studied && differenceInDays(new Date(), parseISO(goal.last_studied)) >= 3
                    return (
                      <div key={goal.id} onClick={() => {
                        setSelectedGoals(prev => prev.includes(goal.id) ? prev.filter(id => id !== goal.id) : [...prev, goal.id])
                      }} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
                        borderRadius: '9px', cursor: 'pointer', transition: 'all 0.12s',
                        background: selected ? 'var(--accent-soft)' : 'var(--surface2)',
                        border: `1px solid ${selected ? 'var(--accent-border)' : 'var(--border)'}`,
                      }}>
                        <div style={{
                          width: '17px', height: '17px', borderRadius: '4px', flexShrink: 0,
                          border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                          background: selected ? 'var(--accent)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {selected && <Check size={10} color="white" />}
                        </div>
                        <MasteryRing value={m} size={34} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', lineHeight: '1.4' }}>{goal.description}</div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '2px', fontSize: '10px', color: 'var(--muted)' }}>
                            {needsReview && <span style={{ color: '#f59e0b' }}>⚠️ Repeteras</span>}
                            {goal.last_studied ? <span>Senast {format(parseISO(goal.last_studied), 'd MMM', { locale: sv })}</span> : <span>Ej studerad</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {goalsWithDecay.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)', fontSize: '13px' }}>
                      Inga lärandemål tillagda för denna examination
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button onClick={startSession} disabled={selectedGoals.length === 0} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}>
                {mode === 'tenta' ? <><Zap size={15} /> Starta tentamode</> : <><Brain size={15} /> Starta session · {selectedGoals.length} mål</>}
              </button>
            </div>
          </>
        )}

        {/* STEP 2: Chat */}
        {step === 'chat' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%', padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                    color: msg.role === 'user' ? 'white' : 'var(--text)',
                    boxShadow: msg.role === 'user' ? '0 2px 10px var(--accent-glow)' : 'none',
                  }}>
                    <MarkdownMessage content={cleanContent(msg.content)} userMessage={msg.role === 'user'} />
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '10px 14px', borderRadius: '14px', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', gap: '4px' }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', animation: `bounce 1.2s ease-in-out ${i*0.15}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                  placeholder="Svara på Jarvis frågor... (Enter för att skicka, Shift+Enter för ny rad)"
                  disabled={loading} rows={3}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid var(--border)', background: 'var(--surface2)',
                    color: 'var(--text)', fontSize: '14px', fontFamily: 'Inter, sans-serif',
                    resize: 'none', outline: 'none', lineHeight: '1.5',
                    minHeight: '72px', maxHeight: '160px', overflow: 'auto',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent-border)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
                <button onClick={sendMessage} disabled={loading || !input.trim()} style={{
                  width: '42px', height: '42px', borderRadius: '10px', border: 'none',
                  background: input.trim() ? 'var(--accent)' : 'var(--surface2)',
                  color: input.trim() ? 'white' : 'var(--muted)', cursor: input.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  boxShadow: input.trim() ? '0 2px 10px var(--accent-glow)' : 'none',
                }}>
                  <Send size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <style>{`
        @keyframes bounce { 0%,60%,100% { transform:translateY(0) } 30% { transform:translateY(-5px) } }
        @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
      `}</style>
    </div>
  )
}
