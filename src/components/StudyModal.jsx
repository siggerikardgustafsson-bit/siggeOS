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
  const [mode, setMode] = useState('normal')
  const [step, setStep] = useState('select')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [masteryUpdates, setMasteryUpdates] = useState({})
  const [sessionGoals, setSessionGoals] = useState([])
  const [courseMaterials, setCourseMaterials] = useState([])
  const [tentaHistory, setTentaHistory] = useState([])
  const [currentTentaFileId, setCurrentTentaFileId] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [uploadingMaterial, setUploadingMaterial] = useState(false)
  const { seconds, formatted: timerFormatted } = useTimer(step === 'chat')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const materialRef = useRef(null)

  const goalsWithDecay = goals.map(g => ({
    ...g,
    effectiveMastery: applyDecay(g.mastery || 0, g.last_studied),
  }))

  useEffect(() => {
    if (user && exam?.id) {
      fetchCourseMaterials()
      fetchTentaHistory()
    }
  }, [user, exam])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchCourseMaterials() {
    const { data } = await supabase.from('course_materials').select('id, file_name, content').eq('exam_id', exam.id).eq('user_id', user.id)
    setCourseMaterials(data || [])
  }

  async function fetchTentaHistory() {
    const { data } = await supabase.from('tenta_sessions').select('*').eq('user_id', user.id).eq('exam_id', exam.id).order('completed_at', { ascending: false })
    setTentaHistory(data || [])
  }

  async function handleMaterialUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingMaterial(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1]
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extrahera allt textinnehåll ordagrant. Returnera bara texten.' }
          ]}],
          context: '',
          systemPrompt: 'Extrahera text från PDF. Returnera bara texten.',
        },
      })
      await supabase.from('course_materials').insert({
        user_id: user.id, exam_id: exam.id, course_id: courseId,
        file_name: file.name, content: data?.content || '',
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

  async function callAnthropic(messages, systemPrompt) {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages,
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || 'API error')
    return data.content?.[0]?.text || ''
  }
    const goalsList = chosenGoals.map((g, i) =>
      `${i + 1}. [ID: ${g.id}] ${g.description} (behärskningsgrad: ${masteryUpdates[g.id] ?? g.effectiveMastery}%)`
    ).join('\n')

    const materialsBlock = materials && materials.length > 0
      ? '\nKURSMATERIAL (ABSOLUT SANNING — basera allt på detta):\n' + materials.map(m => `--- ${m.file_name} ---\n${m.content || ''}`).join('\n\n')
      : ''

    const chosenExamBlock = chosenExamFile && chosenExamFile.content
      ? '\nVALD TENTA "' + chosenExamFile.file_name + '" — kör exakt dessa frågor:\n' + chosenExamFile.content
      : (chosenExamFile ? '\nVald tenta: "' + chosenExamFile.file_name + '" — generera liknande frågor.' : '')

    const base = 'Du är Jarvis, Sigges personliga medicinstudent-tutor. Examination: "' + exam.name + '".\n\n' +
      'LÄRANDEMÅL:\n' + goalsList + '\n' +
      materialsBlock + '\n' +
      chosenExamBlock + '\n\n' +
      'INNEHÅLLSPRIORITERING: ' + (materials && materials.length > 0 ? 'Kursmaterialet är absolut sanning. Basera ALLT på det.' : 'Inget kursmaterial. Basera på lärandemålen.') + '\n\n' +
      'MASTERY: Inkludera {"mastery_update": {"goal_id": "UUID", "mastery": 65}} när du bedömer svar. Uppdatera gradvis.\n\n' +
      'PEDAGOGIK: Sokrates-metoden. Logiska kedjor. Kliniska exempel. Löpande text.\n\nSvara på svenska.'

    if (!isTentaMode) return base + '\n\nBörja med att fråga om det första lärandemålet.'

    const tentaInfo = chosenExamFile
      ? ('DU KÖR TENTAMODE MED: "' + chosenExamFile.file_name + '". ' +
        (isPreviouslyDone && lastDone ? 'Sigge gjorde denna tenta ' + format(parseISO(lastDone.completed_at), 'd MMM yyyy', { locale: sv }) + ' — nämn det.' : 'Första gången Sigge gör denna tenta.') +
        ' Kör frågorna EN I TAGET.')
      : 'DU KÖR TENTAMODE. Inga gamla tentor uppladdade — generera realistiska frågor baserade på kursmaterialet och lärandemålen.'

    return base + '\n\nTENTAMODE:\n' + tentaInfo + '\nVänta på svar. Ge feedback + poäng 0-10. Uppdatera mastery. Summera i slutet.\nBÖRJA DIREKT med info om tentan och sedan FRÅGA 1.'
  }

  async function processMasteryUpdates(content, goalsForSession) {
    const regex = /\{"mastery_update"\s*:\s*\{"goal_id"\s*:\s*"([^"]+)"\s*,\s*"mastery"\s*:\s*(\d+)[^}]*\}\}/g
    const updates = {}
    let match
    while ((match = regex.exec(content)) !== null) {
      const goal_id = match[1]
      const mastery = Math.min(100, Math.max(0, parseInt(match[2])))
      updates[goal_id] = mastery
      const goal = goalsForSession.find(g => g.id === goal_id)
      await supabase.from('learning_goals').update({
        mastery, last_studied: new Date().toISOString(),
        study_count: (goal?.study_count || 0) + 1,
      }).eq('id', goal_id)
    }
    if (Object.keys(updates).length > 0) {
      setMasteryUpdates(prev => ({ ...prev, ...updates }))
      onMasteryUpdate?.()
    }
  }

  async function startTentaSession(chosen) {
    setSessionGoals(chosen)
    setStep('chat')
    setLoading(true)

    const { data: sessData } = await supabase.from('study_sessions').insert({
      user_id: user.id, course_id: courseId, hours: 0,
      date: format(new Date(), 'yyyy-MM-dd'), subject: exam.name, notes: 'Tentamode',
    }).select().single()
    if (sessData) setSessionId(sessData.id)

    const { data: oldExamData } = await supabase.from('exam_old_files').select('id, file_name, content').eq('exam_id', exam.id).eq('user_id', user.id)
    const { data: matData } = await supabase.from('course_materials').select('file_name, content').eq('exam_id', exam.id).eq('user_id', user.id)

    let chosenExamFile = null
    if (oldExamData && oldExamData.length > 0) {
      const doneIds = tentaHistory.map(t => t.old_exam_file_id).filter(Boolean)
      const undone = oldExamData.filter(e => !doneIds.includes(e.id))
      chosenExamFile = undone.length > 0 ? undone[0] : oldExamData[0]
      setCurrentTentaFileId(chosenExamFile.id)
    }

    const historyForFile = chosenExamFile ? tentaHistory.filter(t => t.old_exam_file_id === chosenExamFile.id) : []
    const isPreviouslyDone = historyForFile.length > 0
    const lastDone = isPreviouslyDone ? historyForFile[0] : null

    await supabase.from('tenta_sessions').insert({
      user_id: user.id, exam_id: exam.id,
      old_exam_file_id: chosenExamFile?.id || null,
      file_name: chosenExamFile?.file_name || 'Genererad tenta',
    })

    const systemPrompt = buildSystemPrompt(chosen, matData || [], true, oldExamData || [], chosenExamFile, isPreviouslyDone, lastDone)

    try {
      const content = await callAnthropic(
        [{ role: 'user', content: 'Starta tentamode.' }],
        systemPrompt
      )
      setMessages([{ role: 'assistant', content: content || 'Kunde inte starta.' }])
      if (content) await processMasteryUpdates(content, chosen)
    } catch(e) {
      console.error(e)
      setMessages([{ role: 'assistant', content: 'Fel: ' + e.message }])
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
    await fetchTentaHistory()
  }

  async function startSession() {
    if (mode === 'tenta') {
      await startTentaSession(goalsWithDecay)
      return
    }
    if (selectedGoals.length === 0) return
    const chosen = goalsWithDecay.filter(g => selectedGoals.includes(g.id))
    setSessionGoals(chosen)
    setStep('chat')
    setLoading(true)

    const { data: sessData } = await supabase.from('study_sessions').insert({
      user_id: user.id, course_id: courseId, hours: 0,
      date: format(new Date(), 'yyyy-MM-dd'), subject: exam.name, notes: 'Studiesession',
    }).select().single()
    if (sessData) setSessionId(sessData.id)

    const { data: matData } = await supabase.from('course_materials').select('file_name, content').eq('exam_id', exam.id).eq('user_id', user.id)
    const systemPrompt = buildSystemPrompt(chosen, matData || [], false, [], null, false, null)

    try {
      const content = await callAnthropic(
        [{ role: 'user', content: 'Starta studiesessionen.' }],
        systemPrompt
      )
      setMessages([{ role: 'assistant', content: content || '' }])
      if (content) await processMasteryUpdates(content, chosen)
    } catch(e) {
      setMessages([{ role: 'assistant', content: 'Något gick fel.' }])
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function sendMessage(textOverride) {
    const text = textOverride || input.trim()
    if (!text || loading) return
    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const cleanMessages = newMessages.map(msg => {
      if (typeof msg.content === 'string') return msg
      if (Array.isArray(msg.content)) {
        const textOnly = msg.content.filter(b => b.type === 'text')
        return { ...msg, content: textOnly.length === 1 ? textOnly[0].text : JSON.stringify(textOnly) }
      }
      return msg
    })

    // Fetch fresh context for every message so Jarvis doesn't forget
    const { data: matData } = await supabase.from('course_materials').select('file_name, content').eq('exam_id', exam.id).eq('user_id', user.id)
    const { data: oldExamData } = await supabase.from('exam_old_files').select('id, file_name, content').eq('exam_id', exam.id).eq('user_id', user.id)
    const chosenExamFile = currentTentaFileId ? (oldExamData || []).find(e => e.id === currentTentaFileId) : null
    const systemPrompt = buildSystemPrompt(sessionGoals, matData || [], mode === 'tenta', oldExamData || [], chosenExamFile, false, null)
    try {
      const content = await callAnthropic(cleanMessages, systemPrompt)
      const assistantMsg = { role: 'assistant', content: content || 'Inget svar.' }
      setMessages(prev => [...prev, assistantMsg])
      if (content) await processMasteryUpdates(content, sessionGoals)
    } catch(e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Något gick fel. Försök igen.' }])
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  async function endSession() {
    if (sessionId && seconds > 60) {
      await supabase.from('study_sessions').update({
        hours: Math.round(seconds / 360) / 10,
        notes: mode === 'tenta' ? 'Tentamode · ' + timerFormatted : 'Studiesession · ' + timerFormatted,
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
    if (typeof content !== 'string') return ''
    return content.replace(/\{"mastery_update"\s*:\s*\{[^}]*\}\}/g, '').trim()
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
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700' }}>📚 {exam.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                {step === 'chat' && (
                  <>
                    <span style={{ color: '#10b981', fontFamily: 'monospace', fontWeight: '600' }}>⏱ {timerFormatted}</span>
                    <span>{sessionGoals.length} mål · {mode === 'tenta' ? '📝 Tentamode' : '📖 Studiesession'}</span>
                  </>
                )}
                {step === 'select' && <span>{goals.length} lärandemål · {courseMaterials.length} kursmaterial</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {step === 'chat' && (
                <button onClick={endSession} style={{
                  fontSize: '12px', padding: '6px 12px', borderRadius: '7px',
                  border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)',
                  color: '#ef4444', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>Avsluta & spara</button>
              )}
              <button onClick={() => step === 'chat' ? endSession() : onClose()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={18} />
              </button>
            </div>
          </div>

          {step === 'chat' && mode === 'normal' && sessionGoals.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
              {sessionGoals.map(g => {
                const current = masteryUpdates[g.id] ?? g.effectiveMastery
                const improved = masteryUpdates[g.id] !== undefined && masteryUpdates[g.id] > g.effectiveMastery
                return (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '8px', background: improved ? 'rgba(16,185,129,0.1)' : 'var(--surface2)', border: '1px solid ' + (improved ? 'rgba(16,185,129,0.2)' : 'var(--border)') }}>
                    <MasteryRing value={current} size={26} />
                    <span style={{ fontSize: '10px', color: 'var(--muted2)', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description.slice(0, 25)}</span>
                    {improved && <TrendingUp size={9} color="#10b981" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* SELECT STEP */}
        {step === 'select' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>

              {/* Mode selector */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button onClick={() => setMode('normal')} style={{
                  flex: 1, padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                  background: mode === 'normal' ? 'var(--accent)' : 'var(--surface2)',
                  color: mode === 'normal' ? 'white' : 'var(--muted)',
                  fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}><Brain size={14} /> Studiesession</button>
                <button onClick={() => setMode('tenta')} style={{
                  flex: 1, padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                  background: mode === 'tenta' ? '#f59e0b' : 'var(--surface2)',
                  color: mode === 'tenta' ? 'white' : 'var(--muted)',
                  fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}><Zap size={14} /> Tentamode</button>
              </div>

              {/* Course materials */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '8px' }}>KURSMATERIAL ({courseMaterials.length})</div>
                {courseMaterials.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '7px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', marginBottom: '5px' }}>
                    <FileText size={12} color="#10b981" />
                    <span style={{ fontSize: '12px', flex: 1, color: '#10b981' }}>{m.file_name}</span>
                    <button onClick={() => deleteMaterial(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '14px' }}>×</button>
                  </div>
                ))}
                <input ref={materialRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleMaterialUpload} />
                <button onClick={() => materialRef.current?.click()} disabled={uploadingMaterial} style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px',
                  borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface2)',
                  color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif',
                }}>
                  {uploadingMaterial ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Läser in...</> : <><Upload size={12} /> Ladda upp kursmaterial (PDF)</>}
                </button>
              </div>

              {/* Tenta mode info */}
              {mode === 'tenta' && (
                <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#f59e0b', marginBottom: '6px' }}>📝 Tentamode</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6' }}>
                    Jarvis kör en gammal tenta med dig fråga för fråga och bedömer alla {goalsWithDecay.length} lärandemål.
                  </div>
                  {tentaHistory.length > 0 && (
                    <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '6px' }}>TIDIGARE GJORDA</div>
                      {tentaHistory.map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted2)', marginBottom: '3px' }}>
                          <span>{t.file_name || 'Genererad'}</span>
                          <span>{format(parseISO(t.completed_at), 'd MMM yyyy', { locale: sv })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Goal selector — normal mode only */}
              {mode === 'normal' && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600' }}>LÄRANDEMÅL ({selectedGoals.length}/{goalsWithDecay.length} valda)</div>
                    <button onClick={() => setSelectedGoals(goalsWithDecay.map(g => g.id))} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Välj alla</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {goalsWithDecay.map(goal => {
                      const selected = selectedGoals.includes(goal.id)
                      const m = goal.effectiveMastery
                      const needsReview = goal.last_studied && differenceInDays(new Date(), parseISO(goal.last_studied)) >= 3
                      return (
                        <div key={goal.id} onClick={() => setSelectedGoals(prev => prev.includes(goal.id) ? prev.filter(id => id !== goal.id) : [...prev, goal.id])} style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
                          borderRadius: '9px', cursor: 'pointer', transition: 'all 0.12s',
                          background: selected ? 'var(--accent-soft)' : 'var(--surface2)',
                          border: '1px solid ' + (selected ? 'var(--accent-border)' : 'var(--border)'),
                        }}>
                          <div style={{ width: '17px', height: '17px', borderRadius: '4px', flexShrink: 0, border: '2px solid ' + (selected ? 'var(--accent)' : 'var(--border)'), background: selected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                      <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)', fontSize: '13px' }}>Inga lärandemål tillagda</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '12px', color: 'var(--muted)', fontSize: '13px' }}>
                  <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  {mode === 'tenta' ? 'Laddar tenta...' : 'Startar...'}
                </div>
              ) : (
                <button onClick={startSession} disabled={mode === 'normal' && selectedGoals.length === 0} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}>
                  {mode === 'tenta' ? <><Zap size={15} /> Starta tentamode</> : <><Brain size={15} /> Starta · {selectedGoals.length} mål</>}
                </button>
              )}
            </div>
          </>
        )}

        {/* CHAT STEP */}
        {step === 'chat' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1
                const rawContent = typeof msg.content === 'string' ? msg.content : ''
                const cleaned = cleanContent(rawContent)
                const hasMCQ = msg.role === 'assistant' && isLast && !loading && /^[\s]*[○•◯A-E][.)]\s+\S.{4,}$/m.test(cleaned)
                const mcqOptions = hasMCQ ? (() => {
                  const bullet = cleaned.match(/^[\s]*[○•◯]\s+(.{5,})$/gm)
                  if (bullet && bullet.length >= 2) return bullet.map(l => l.replace(/^[\s]*[○•◯]\s+/, '').trim())
                  const abc = cleaned.match(/^[\s]*[A-E][.)]\s+(.{5,})$/gm)
                  if (abc && abc.length >= 2) return abc.map(l => l.replace(/^[\s]*[A-E][.)]\s+/, '').trim())
                  return []
                })() : []
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '6px' }}>
                    <div style={{
                      maxWidth: '85%', padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                      border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                      color: msg.role === 'user' ? 'white' : 'var(--text)',
                      boxShadow: msg.role === 'user' ? '0 2px 10px var(--accent-glow)' : 'none',
                    }}>
                      <MarkdownMessage content={cleaned} userMessage={msg.role === 'user'} />
                    </div>
                    {hasMCQ && mcqOptions.length > 0 && (
                      <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: '5px', alignSelf: 'flex-start' }}>
                        {mcqOptions.map((opt, oi) => (
                          <button key={oi} onClick={() => sendMessage(opt)} disabled={loading} style={{
                            padding: '9px 14px', borderRadius: '9px', border: '1px solid var(--border)',
                            background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
                            fontSize: '13px', fontFamily: 'Inter, sans-serif', textAlign: 'left', lineHeight: '1.4',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.background = 'var(--accent-soft)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '10px 14px', borderRadius: '14px', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', gap: '4px' }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', animation: 'bounce 1.2s ease-in-out ' + (i*0.15) + 's infinite' }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                  placeholder="Svara... (Enter skickar, Shift+Enter ny rad)" disabled={loading} rows={3}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid var(--border)', background: 'var(--surface2)',
                    color: 'var(--text)', fontSize: '14px', fontFamily: 'Inter, sans-serif',
                    resize: 'none', outline: 'none', lineHeight: '1.5', minHeight: '72px', maxHeight: '160px',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent-border)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
                <button onClick={() => sendMessage()} disabled={loading || !input.trim()} style={{
                  width: '42px', height: '42px', borderRadius: '10px', border: 'none',
                  background: input.trim() ? 'var(--accent)' : 'var(--surface2)',
                  color: input.trim() ? 'white' : 'var(--muted)',
                  cursor: input.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Send size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      </div>
      </div>
    </div>
  )
}
