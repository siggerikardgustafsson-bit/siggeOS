import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, differenceInDays, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { X, Send, Loader, Brain, Check, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react'

// Decay: mastery reduces conservatively over time
// 3 days: -5%, 7 days: -10%, 14 days: -20%, 30 days: -35%
function applyDecay(mastery, lastStudied) {
  if (!lastStudied || mastery === 0) return mastery
  const days = differenceInDays(new Date(), parseISO(lastStudied))
  if (days < 3) return mastery
  if (days < 7) return Math.max(0, mastery - 5)
  if (days < 14) return Math.max(0, mastery - 10)
  if (days < 30) return Math.max(0, mastery - 20)
  return Math.max(0, mastery - 35)
}

function MasteryRing({ value, size = 36, color }) {
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

export default function StudyModal({ exam, courseId, goals, onClose, onMasteryUpdate }) {
  const { user } = useAuth()
  const [selectedGoals, setSelectedGoals] = useState([])
  const [step, setStep] = useState('select') // select | chat
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [masteryUpdates, setMasteryUpdates] = useState({}) // goalId -> new mastery
  const [sessionGoals, setSessionGoals] = useState([])
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Apply decay to goals
  const goalsWithDecay = goals.map(g => ({
    ...g,
    effectiveMastery: applyDecay(g.mastery || 0, g.last_studied),
  }))

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function toggleGoal(goalId) {
    setSelectedGoals(prev =>
      prev.includes(goalId) ? prev.filter(id => id !== goalId) : [...prev, goalId]
    )
  }

  function selectAll() {
    setSelectedGoals(goalsWithDecay.map(g => g.id))
  }

  async function startSession() {
    if (selectedGoals.length === 0) return
    const chosen = goalsWithDecay.filter(g => selectedGoals.includes(g.id))
    setSessionGoals(chosen)
    setStep('chat')

    // Build system context
    const goalsList = chosen.map((g, i) =>
      `${i + 1}. ${g.description} (nuvarande behärskningsgrad: ${g.effectiveMastery}%)`
    ).join('\n')

    const systemPrompt = `Du är Jarvis, Sigges personliga studieassistent. Du håller en studiesession för examination: "${exam.name}".

LÄRANDEMÅL FÖR DENNA SESSION:
${goalsList}

INSTRUKTIONER:
- Testa Sigge systematiskt på varje lärandemål
- Ställ konkreta frågor, be honom förklara, resonera och koppla till kliniska sammanhang
- Bedöm hans svar och ge konstruktiv feedback
- När du känner att du har tillräckligt underlag för ett lärandemål, uppdatera behärskningsgraden
- Uppdatera genom att inkludera JSON i ditt svar: {"mastery_update": {"goal_id": "UUID", "mastery": 75, "reason": "Förklarade mekanismen korrekt men missade..."}}
- Du kan uppdatera flera mål i samma meddelande
- Om Sigge ber dig höja ett specifikt mål, gör det utan diskussion
- Var direkt och pedagogisk. Inga onödiga hälsningar.
- Kör på svenska.

Börja med att fråga om det första lärandemålet.`

    setLoading(true)
    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: 'Starta studiesessionen.' }],
          context: '',
          systemPrompt,
        },
      })
      const msg = { role: 'assistant', content: data.content }
      setMessages([msg])
      await processMasteryUpdates(data.content, chosen)
    } catch(e) { console.error(e) }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function processMasteryUpdates(content, goalsForSession) {
    // Parse all mastery updates from response
    const regex = /\{"mastery_update":\s*\{[^}]+\}\}/g
    const matches = content.match(regex) || []
    const updates = {}

    for (const match of matches) {
      try {
        const parsed = JSON.parse(match)
        const { goal_id, mastery } = parsed.mastery_update
        if (goal_id && mastery !== undefined) {
          const clampedMastery = Math.min(100, Math.max(0, Math.round(mastery)))
          updates[goal_id] = clampedMastery

          // Update in database
          await supabase.from('learning_goals').update({
            mastery: clampedMastery,
            last_studied: new Date().toISOString(),
            study_count: (goalsForSession.find(g => g.id === goal_id)?.study_count || 0) + 1,
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

    const goalsList = sessionGoals.map((g, i) =>
      `${i + 1}. ${g.description} (behärskningsgrad: ${masteryUpdates[g.id] ?? g.effectiveMastery}%)`
    ).join('\n')

    const systemPrompt = `Du är Jarvis, Sigges studieassistent. Examination: "${exam.name}".

LÄRANDEMÅL:
${goalsList}

Uppdatera behärskningsgrader via JSON: {"mastery_update": {"goal_id": "UUID", "mastery": 75, "reason": "..."}}
Kör på svenska. Var direkt och pedagogisk.`

    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: newMessages,
          context: '',
          systemPrompt,
        },
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

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // Clean message content — remove JSON mastery updates from display
  function cleanContent(content) {
    return content.replace(/\{"mastery_update":\s*\{[^}]+\}\}/g, '').trim()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--surface)', backdropFilter: 'blur(20px)',
        border: '1px solid var(--border)', borderRadius: '20px',
        width: '100%', maxWidth: '680px', height: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700' }}>📚 Studiesession</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{exam.name}</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
              <X size={20} />
            </button>
          </div>

          {/* Mastery overview during chat */}
          {step === 'chat' && sessionGoals.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              {sessionGoals.map(g => {
                const current = masteryUpdates[g.id] ?? g.effectiveMastery
                return (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '8px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <MasteryRing value={current} size={28} />
                    <span style={{ fontSize: '11px', color: 'var(--muted2)', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.description.slice(0, 30)}...
                    </span>
                    {masteryUpdates[g.id] !== undefined && masteryUpdates[g.id] !== g.effectiveMastery && (
                      <TrendingUp size={10} color="#10b981" />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* STEP 1: Select goals */}
        {step === 'select' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                Välj lärandemål att öva på ({selectedGoals.length}/{goalsWithDecay.length} valda)
              </div>
              <button onClick={selectAll} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                Välj alla
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {goalsWithDecay.map(goal => {
                const selected = selectedGoals.includes(goal.id)
                const m = goal.effectiveMastery
                const masteryColor = m >= 80 ? '#10b981' : m >= 50 ? '#f59e0b' : m >= 20 ? '#3b82f6' : '#6b7280'
                const needsReview = goal.last_studied && differenceInDays(new Date(), parseISO(goal.last_studied)) >= 3
                return (
                  <div key={goal.id} onClick={() => toggleGoal(goal.id)} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                    borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
                    background: selected ? 'var(--accent-soft)' : 'var(--surface2)',
                    border: `1px solid ${selected ? 'var(--accent-border)' : 'var(--border)'}`,
                  }}>
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {selected && <Check size={11} color="white" />}
                    </div>
                    <MasteryRing value={m} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', lineHeight: '1.4' }}>{goal.description}</div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '3px', alignItems: 'center' }}>
                        <span className="mono" style={{ fontSize: '11px', color: masteryColor, fontWeight: '600' }}>{m}%</span>
                        {needsReview && <span style={{ fontSize: '10px', color: '#f59e0b' }}>⚠️ Behöver repeteras</span>}
                        {goal.last_studied && <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                          Senast {format(parseISO(goal.last_studied), 'd MMM', { locale: sv })}
                        </span>}
                        {!goal.last_studied && <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Ej studerad</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {goalsWithDecay.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                Inga lärandemål tillagda för denna examination
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Chat */}
        {step === 'chat' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  color: msg.role === 'user' ? 'white' : 'var(--text)',
                  fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap',
                }}>
                  {cleanContent(msg.content)}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', gap: '4px' }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', animation: `bounce 1.2s ease-in-out ${i*0.15}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {step === 'select' ? (
            <button onClick={startSession} disabled={selectedGoals.length === 0} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              <Brain size={16} /> Starta session med {selectedGoals.length} lärandemål
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                placeholder="Svara på Jarvis frågor..." disabled={loading} rows={1}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid var(--border)', background: 'var(--surface2)',
                  color: 'var(--text)', fontSize: '14px', fontFamily: 'Inter, sans-serif',
                  resize: 'none', outline: 'none', lineHeight: '1.5', maxHeight: '100px',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--accent-border)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              <button onClick={sendMessage} disabled={loading || !input.trim()} style={{
                width: '40px', height: '40px', borderRadius: '10px', border: 'none',
                background: input.trim() ? 'var(--accent)' : 'var(--surface2)',
                color: input.trim() ? 'white' : 'var(--muted)', cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: input.trim() ? '0 2px 10px var(--accent-glow)' : 'none',
              }}>
                <Send size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes bounce { 0%,60%,100% { transform:translateY(0) } 30% { transform:translateY(-5px) } }
      `}</style>
    </div>
  )
}
