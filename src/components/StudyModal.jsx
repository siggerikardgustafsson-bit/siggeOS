import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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

const MCQ_PATTERN = /^[ \t]*[○•◯][ \t]+.{5,}$/m
const MCQ_BULLET = /^[ \t]*[○•◯][ \t]+(.{5,})$/gm
const MCQ_ABC = /^[ \t]*[A-E][.)[ \t]+(.{5,})$/gm

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
  const [pendingTentaFile, setPendingTentaFile] = useState(null)
  const [tentaRotationInfo, setTentaRotationInfo] = useState(null)
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
    const { data } = await supabase
      .from('tenta_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('exam_id', exam.id)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
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

  async function callAnthropic(messages, systemPrompt, examFileId, materialIds) {
    const { data, error } = await supabase.functions.invoke('jarvis-chat', {
      body: {
        messages,
        context: '',
        systemPrompt,
        examFileId: examFileId || null,
        materialIds: materialIds || [],
      },
    })
    if (error) throw new Error(error.message)
    if (!data?.content) throw new Error('Inget svar från Jarvis')
    return data.content
  }

  function buildSystemPrompt(chosenGoals, isTentaMode, chosenExamFile, isPreviouslyDone, lastDone) {
    const goalsList = chosenGoals.map((g, i) =>
      (i + 1) + '. [ID: ' + g.id + '] ' + g.description + ' (nu: ' + (masteryUpdates[g.id] ?? g.effectiveMastery) + '%)'
    ).join('\n')

    const masteryRules = `
════════════════════════════════════════
MASTERY-UPPDATERING — OBLIGATORISKT
════════════════════════════════════════
Du MÅSTE inkludera mastery_update-JSON i VARJE svar där ett lärandemål berörs.
Detta är ditt viktigaste ansvar — utan detta fungerar systemet inte.

FORMAT (exakt så här, på en egen rad i svaret):
{"mastery_update": {"goal_id": "EXAKT-UUID-HÄR", "mastery": 75}}

REGLER:
- Inkludera EN rad per mål som testats/diskuterats i det svaret
- Uppdatera OMEDELBART efter att du bedömt svaret — inte i slutet
- Skala: 0=aldrig sett, 20=hört talas om, 40=delvis, 60=kan förklara, 80=behärskar, 95+=expert
- Var KONSERVATIV — sätt inte 80+ om svaret hade luckor
- Om Sigge svarar fel: sänk mastery med 5-15
- Om Sigge svarar rätt: höj mastery med 10-25 beroende på kvalitet
- Om Sigge säger "vet ej" eller hoppar: sätt mastery till max 30

VARNING: Om du skriver "du behärskar X" eller "bra svar" i text MEN inte inkluderar {"mastery_update": ...} så registreras INGENTING i databasen. Ord räknas inte — bara JSON räknas.

Mål-IDs (kopiera exakt):
` + chosenGoals.map(g => '- ' + g.id + ' → ' + g.description.slice(0, 60)).join('\n')

    const base = 'Du är Jarvis, Sigges personliga medicinstudent-tutor. Examination: "' + exam.name + '".\n\n' +
      'LÄRANDEMÅL (dessa ska övas/testas):\n' + goalsList + '\n\n' +
      masteryRules + '\n\n' +
      'INNEHÅLLSPRIORITERING: Kursmaterialet (om uppladdad) är absolut sanning.\n\n' +
      'PEDAGOGIK: Sokrates-metoden. Logiska kedjor. Kliniska exempel.\n\nSvara på svenska.'

    if (!isTentaMode) return base + '\n\nBörja med att fråga om det första lärandemålet. Inkludera mastery_update efter varje svar.'

    const tentaInfo = chosenExamFile
      ? 'DU KÖR TENTAMODE MED: "' + chosenExamFile.file_name + '". ' +
        (isPreviouslyDone && lastDone ? 'Sigge gjorde denna ' + format(parseISO(lastDone.completed_at), 'd MMM yyyy', { locale: sv }) + ' — nämn det.' : 'Första gången.') +
        ' Kör frågorna EN I TAGET. Tenta-texten finns i kursmaterialet nedan.'
      : 'DU KÖR TENTAMODE. Inga gamla tentor — generera realistiska frågor baserade på kursmaterialet.'

    return base + '\n\nTENTAMODE:\n' + tentaInfo +
      '\nKör EN fråga → vänta på svar → ge feedback → inkludera {"mastery_update": ...} för berörd/a mål → nästa fråga.' +
      '\nI SLUTET: summera score och inkludera mastery_update för ALLA mål som testades.' +
      '\nBÖRJA DIREKT med info om tentan och FRÅGA 1.'
  }

  async function processMasteryUpdates(content, goalsForSession) {
    // Match mastery_update JSON in various formats Jarvis might produce
    const patterns = [
      /\{"mastery_update"\s*:\s*\{"goal_id"\s*:\s*"([^"]+)"\s*,\s*"mastery"\s*:\s*(\d+)[^}]*\}\}/g,
      /\{"goal_id"\s*:\s*"([^"]+)"\s*,\s*"mastery"\s*:\s*(\d+)[^}]*\}/g,
    ]

    const updates = {}
    for (const regex of patterns) {
      let match
      while ((match = regex.exec(content)) !== null) {
        const goal_id = match[1]
        const mastery = Math.min(100, Math.max(0, parseInt(match[2])))
        if (!updates[goal_id]) updates[goal_id] = mastery
      }
    }

    if (Object.keys(updates).length > 0) {
      await Promise.all(Object.entries(updates).map(async ([goal_id, mastery]) => {
        const goal = goalsForSession.find(g => g.id === goal_id)
        if (!goal) return // skip if goal_id doesn't match any in session
        await supabase.from('learning_goals').update({
          mastery,
          last_studied: new Date().toISOString(),
          study_count: (goal?.study_count || 0) + 1,
        }).eq('id', goal_id)
      }))
      setMasteryUpdates(prev => ({ ...prev, ...updates }))
      onMasteryUpdate?.()
    }
    return Object.keys(updates).length
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

    // Always fetch FRESH history from DB — never rely on stale React state
    const { data: freshHistory } = await supabase
      .from('tenta_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('exam_id', exam.id)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
    const completedSessions = freshHistory || []

    let chosenExamFile = null
    let rotationInfo = null

    if (oldExamData && oldExamData.length > 0) {
      const doneIds = completedSessions.map(t => t.old_exam_file_id).filter(Boolean)
      const undone = oldExamData.filter(e => !doneIds.includes(e.id))

      if (undone.length > 0) {
        // Pick first untouched exam
        chosenExamFile = undone[0]
        rotationInfo = { type: 'new', remaining: undone.length - 1, total: oldExamData.length }
      } else {
        // All done — rotate: pick the one done longest ago
        const sortedByOldest = [...oldExamData].sort((a, b) => {
          const aLast = completedSessions.filter(t => t.old_exam_file_id === a.id)[0]?.completed_at || '1970-01-01'
          const bLast = completedSessions.filter(t => t.old_exam_file_id === b.id)[0]?.completed_at || '1970-01-01'
          return aLast < bLast ? -1 : 1
        })
        chosenExamFile = sortedByOldest[0]
        const lastDoneDate = completedSessions.find(t => t.old_exam_file_id === chosenExamFile.id)?.completed_at
        rotationInfo = { type: 'rotation', lastDone: lastDoneDate, total: oldExamData.length }
      }
      setCurrentTentaFileId(chosenExamFile.id)
    } else {
      rotationInfo = { type: 'generated' }
    }

    setTentaRotationInfo(rotationInfo)

    // Store file info for insertion at endSession — don't insert here
    setPendingTentaFile({
      old_exam_file_id: chosenExamFile?.id || null,
      file_name: chosenExamFile?.file_name || 'Genererad tenta',
    })

    const historyForFile = chosenExamFile
      ? completedSessions.filter(t => t.old_exam_file_id === chosenExamFile.id)
      : []
    const isPreviouslyDone = historyForFile.length > 0
    const lastDone = isPreviouslyDone ? historyForFile[0] : null

    const systemPrompt = buildSystemPrompt(chosen, true, chosenExamFile, isPreviouslyDone, lastDone)
    const materialIds = courseMaterials.map(m => m.id)
    try {
      const content = await callAnthropic(
        [{ role: 'user', content: 'Starta tentamode.' }],
        systemPrompt,
        chosenExamFile?.id || null,
        materialIds
      )
      setMessages([{ role: 'assistant', content: content || 'Kunde inte starta.' }])
      if (content) await processMasteryUpdates(content, chosen)
    } catch(e) {
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

    const systemPrompt = buildSystemPrompt(chosen, false, null, false, null)
    const materialIds = (await supabase.from('course_materials').select('id').eq('exam_id', exam.id).eq('user_id', user.id)).data?.map(m => m.id) || []
    try {
      const content = await callAnthropic([{ role: 'user', content: 'Starta studiesessionen.' }], systemPrompt, null, materialIds)
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

    // Smart compression: keep last 6 full, summarize older ones
    const cleanMessages = newMessages.map(msg => {
      if (typeof msg.content === 'string') return msg
      if (Array.isArray(msg.content)) {
        const textOnly = msg.content.filter(b => b.type === 'text')
        return { ...msg, content: textOnly.length === 1 ? textOnly[0].text : JSON.stringify(textOnly) }
      }
      return msg
    })

    let trimmedMessages
    if (cleanMessages.length <= 10) {
      trimmedMessages = cleanMessages
    } else {
      // Summarize older messages: keep question+answer pairs as single short entries
      const older = cleanMessages.slice(0, -10)
      const summary = older.reduce((acc, msg, i) => {
        if (msg.role === 'user') {
          acc.push({ role: 'user', content: msg.content.slice(0, 200) })
        } else {
          // Keep only score/mastery lines from assistant
          const lines = msg.content.split('\n').filter(l =>
            l.includes('Poäng:') || l.includes('RÄTT') || l.includes('FEL') || l.includes('mastery_update')
          ).slice(0, 3)
          if (lines.length > 0) acc.push({ role: 'assistant', content: lines.join('\n') })
        }
        return acc
      }, [])
      trimmedMessages = [...summary, ...cleanMessages.slice(-10)]
    }

    const systemPrompt = buildSystemPrompt(sessionGoals, mode === 'tenta', currentTentaFileId ? { id: currentTentaFileId, file_name: '' } : null, false, null)
    const materialIds = (await supabase.from('course_materials').select('id').eq('exam_id', exam.id).eq('user_id', user.id)).data?.map(m => m.id) || []
    try {
      const content = await callAnthropic(trimmedMessages, systemPrompt, currentTentaFileId || null, materialIds)
      const updatedCount = content ? await processMasteryUpdates(content, sessionGoals) : 0
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: content || 'Inget svar.',
        masteryCount: updatedCount,
      }])
    } catch(e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Något gick fel. Försök igen.' }])
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  async function endSession() {
    // Insert tenta_sessions record NOW (when actually completed) with completed_at timestamp
    if (mode === 'tenta' && pendingTentaFile) {
      await supabase.from('tenta_sessions').insert({
        user_id: user.id,
        exam_id: exam.id,
        old_exam_file_id: pendingTentaFile.old_exam_file_id,
        file_name: pendingTentaFile.file_name,
        completed_at: new Date().toISOString(),
      })
    }
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

  function detectMCQ(text) {
    const bullets = []
    let m
    const b = new RegExp(MCQ_BULLET.source, 'gm')
    while ((m = b.exec(text)) !== null) bullets.push(m[1].trim())
    if (bullets.length >= 2) return bullets
    const abcRe = new RegExp(MCQ_ABC.source, 'gm')
    const abc = []
    while ((m = abcRe.exec(text)) !== null) abc.push(m[1].trim())
    if (abc.length >= 2) return abc
    return []
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      {/* Overlay as sibling — plain dim, NO backdrop-filter so panel can blur through */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.52)' }}
        onClick={() => step === 'chat' ? endSession() : onClose()}
      />

      {/* Panel — same glass treatment as page-header and dashboard cards */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'var(--surface)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border)',
        borderRadius: '20px',
        width: '100%', maxWidth: '720px', height: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--glass-shadow)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
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
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '8px', background: improved ? 'rgba(16,185,129,0.1)' : 'var(--modal-surface2)', border: '1px solid ' + (improved ? 'rgba(16,185,129,0.2)' : 'var(--modal-border)') }}>
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
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button onClick={() => setMode('normal')} style={{
                  flex: 1, padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                  background: mode === 'normal' ? 'var(--accent)' : 'var(--modal-surface2)',
                  color: mode === 'normal' ? 'white' : 'var(--muted)',
                  fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}><Brain size={14} /> Studiesession</button>
                <button onClick={() => setMode('tenta')} style={{
                  flex: 1, padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                  background: mode === 'tenta' ? '#f59e0b' : 'var(--modal-surface2)',
                  color: mode === 'tenta' ? 'white' : 'var(--muted)',
                  fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}><Zap size={14} /> Tentamode</button>
              </div>

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
                  borderRadius: '7px', border: '1px solid var(--modal-border)', background: 'var(--modal-surface2)',
                  color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif',
                }}>
                  {uploadingMaterial ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Läser in...</> : <><Upload size={12} /> Ladda upp kursmaterial (PDF)</>}
                </button>
              </div>

              {mode === 'tenta' && (() => {
                // Deduplicate: one entry per unique file (most recent completion)
                const seen = new Set()
                const uniqueHistory = tentaHistory.filter(t => {
                  const key = t.old_exam_file_id || t.file_name || 'generated'
                  if (seen.has(key)) return false
                  seen.add(key)
                  return true
                })
                return (
                  <div style={{ borderRadius: '12px', border: '1px solid var(--modal-border)', overflow: 'hidden', background: 'var(--modal-surface2)' }}>
                    {/* Header row */}
                    <div style={{ padding: '12px 14px', borderBottom: uniqueHistory.length > 0 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Zap size={13} color="#f59e0b" />
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Tentamode</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>
                          Jarvis kör tenta fråga för fråga · {goalsWithDecay.length} lärandemål
                        </div>
                      </div>
                    </div>

                    {/* History list */}
                    {uniqueHistory.length > 0 ? (
                      <div style={{ padding: '8px 14px 10px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.06em', marginBottom: '7px' }}>AVKLARADE</div>
                        {uniqueHistory.map(t => (
                          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--modal-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                              <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Check size={8} color="#10b981" />
                              </div>
                              <span style={{ fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.file_name || 'Genererad tenta'}
                              </span>
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0, marginLeft: '10px' }}>
                              {format(parseISO(t.completed_at), 'd MMM', { locale: sv })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
                        Ingen avklarad tenta ännu — kör klart en session för att logga den.
                      </div>
                    )}
                  </div>
                )
              })()}

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
                          background: selected ? 'var(--accent-soft)' : 'var(--modal-surface2)',
                          border: '1px solid ' + (selected ? 'var(--accent-border)' : 'var(--modal-border)'),
                        }}>
                          <div style={{ width: '17px', height: '17px', borderRadius: '4px', flexShrink: 0, border: '2px solid ' + (selected ? 'var(--accent)' : 'var(--modal-border)'), background: selected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--glass-border)', flexShrink: 0 }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '12px', color: 'var(--muted)', fontSize: '13px' }}>
                  <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  {mode === 'tenta' ? 'Laddar tenta...' : 'Startar...'}
                </div>
              ) : (
                <button onClick={startSession} disabled={mode === 'normal' && selectedGoals.length === 0} className="btn btn-primary btn-full">
                  {mode === 'tenta' ? <><Zap size={15} /> Starta tentamode</> : <><Brain size={15} /> Starta · {selectedGoals.length} mål</>}
                </button>
              )}
            </div>
          </>
        )}

        {/* CHAT STEP */}
        {step === 'chat' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1
                const rawContent = typeof msg.content === 'string' ? msg.content : ''
                const cleaned = cleanContent(rawContent)
                const options = (msg.role === 'assistant' && isLast && !loading) ? detectMCQ(cleaned) : []
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '6px' }}>
                    <div style={{
                      maxWidth: '82%', padding: '11px 15px',
                      borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                      background: msg.role === 'user'
                        ? 'var(--accent)'
                        : 'var(--surface3)',
                      backdropFilter: msg.role === 'assistant' ? 'blur(10px)' : 'none',
                      WebkitBackdropFilter: msg.role === 'assistant' ? 'blur(10px)' : 'none',
                      border: msg.role === 'assistant' ? '1px solid var(--glass-border)' : 'none',
                      color: 'var(--text)',
                      boxShadow: msg.role === 'user' ? '0 4px 16px var(--accent-glow)' : '0 2px 12px rgba(0,0,0,0.15)',
                    }}>
                      <MarkdownMessage content={cleaned} userMessage={msg.role === 'user'} />
                    </div>
                    {/* Mastery update indicator */}
                    {msg.role === 'assistant' && typeof msg.masteryCount === 'number' && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        fontSize: '10px', padding: '2px 8px', borderRadius: '6px',
                        alignSelf: 'flex-start',
                        background: msg.masteryCount > 0 ? 'rgba(16,185,129,0.10)' : 'rgba(255,255,255,0.04)',
                        border: '1px solid ' + (msg.masteryCount > 0 ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.08)'),
                        color: msg.masteryCount > 0 ? '#10b981' : 'var(--muted)',
                      }}>
                        {msg.masteryCount > 0
                          ? <><Check size={9} /> {msg.masteryCount} mål loggade</>
                          : '— inga mål loggade'
                        }
                      </div>
                    )}
                    {options.length > 0 && (
                      <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: '5px', alignSelf: 'flex-start' }}>
                        {options.map((opt, oi) => (
                          <button key={oi} onClick={() => sendMessage(opt)} disabled={loading} style={{
                            padding: '9px 14px', borderRadius: '10px',
                            border: '1px solid var(--glass-border)',
                            background: 'var(--surface2)',
                            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                            color: 'var(--text)', cursor: 'pointer',
                            fontSize: '13px', fontFamily: 'Inter, sans-serif', textAlign: 'left', lineHeight: '1.4',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.background = 'var(--accent-soft)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.background = 'var(--surface2)' }}>
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
                  <div style={{
                    padding: '11px 16px', borderRadius: '4px 16px 16px 16px',
                    background: 'var(--surface3)',
                    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid var(--glass-border)',
                    display: 'flex', gap: '5px', alignItems: 'center',
                  }}>
                    {[0,1,2].map(idx => (
                      <div key={idx} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', animation: 'bounce 1.2s ease-in-out ' + (idx * 0.15) + 's infinite' }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: '12px 16px 16px',
              borderTop: '1px solid var(--glass-border)',
              background: 'rgba(0,0,0,0.18)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              flexShrink: 0,
            }}>
              <div style={{
                display: 'flex', gap: '8px', alignItems: 'flex-end',
                background: 'var(--surface2)',
                border: '1px solid var(--glass-border)',
                borderRadius: '14px', padding: '8px 8px 8px 14px',
                transition: 'border-color 0.15s',
              }}
              onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
              onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--glass-border)'}
              >
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                  placeholder="Svara... (Enter skickar, Shift+Enter ny rad)" disabled={loading} rows={2}
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none',
                    color: 'var(--text)', fontSize: '14px', fontFamily: 'Inter, sans-serif',
                    resize: 'none', lineHeight: '1.5', maxHeight: '120px', overflow: 'auto',
                    padding: '4px 0',
                  }}
                />
                <button onClick={() => sendMessage()} disabled={loading || !input.trim()} style={{
                  width: '36px', height: '36px', borderRadius: '10px', border: 'none', flexShrink: 0,
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
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
