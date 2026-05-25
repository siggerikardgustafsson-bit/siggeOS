import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Plus, X, Save, Loader, Dumbbell, Timer, Footprints, ChevronDown, ChevronUp, Trophy, TrendingUp, Flame } from 'lucide-react'

const EXERCISE_LIBRARY = {
  'Bröst': ['Bänkpress', 'Lutande bänkpress', 'Cables korsning', 'Dips', 'Pushups'],
  'Rygg': ['Marklyft', 'Latsdrag', 'Rodd', 'Weighted pull-up', 'Pullups', 'Hyperextensions'],
  'Ben': ['Knäböj', 'Benpress', 'Utfall', 'Leg curl', 'Leg extension', 'Kalvhävningar'],
  'Axlar': ['Militärpress', 'Sidolyft', 'Framåtlyft', 'Face pulls', 'Shrugs'],
  'Armar': ['Bicepscurl', 'Hammercurl', 'Tryckkpress', 'Skullcrusher', 'Kabeldrag'],
  'Core': ['Plankan', 'Situps', 'Crunches', 'Russian twist', 'Bäckenlyft'],
  'Övrigt': [],
}

const RUN_PR_DISTANCES = [
  { label: '5 km',       meters: 5000 },
  { label: '10 km',      meters: 10000 },
  { label: 'Halvmaraton', meters: 21097 },
]

const SESSION_TYPES = [
  { id: 'gym', label: 'Gym', icon: Dumbbell, color: '#3b82f6' },
  { id: 'run', label: 'Löpning', icon: Timer, color: '#10b981' },
  { id: 'walk', label: 'Promenad', icon: Footprints, color: '#f59e0b' },
  { id: 'other', label: 'Annat', icon: Flame, color: '#ec4899' },
]

function formatPace(secondsPerKm) {
  if (!secondsPerKm) return '—'
  const min = Math.floor(secondsPerKm / 60)
  const sec = secondsPerKm % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function formatDuration(seconds) {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function WeekBar({ sessions }) {
  const days = ['M', 'T', 'O', 'T', 'F', 'L', 'S']
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(today, { weekStartsOn: 1 }) })

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
      {weekDays.map((day, i) => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const hasSession = sessions.some(s => s.date === dateStr)
        const isToday = format(today, 'yyyy-MM-dd') === dateStr
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: '100%',
              height: '32px',
              borderRadius: '4px',
              background: hasSession ? '#3b82f6' : isToday ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
              border: isToday && !hasSession ? '1px solid rgba(59,130,246,0.4)' : 'none',
              transition: 'all 0.3s',
            }} />
            <span style={{ fontSize: '10px', color: isToday ? 'var(--blue)' : 'var(--muted)' }}>{days[i]}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function TraningPage() {
  const { user } = useAuth()
  const [view, setView] = useState('overview') // overview | log
  const [sessionType, setSessionType] = useState('gym')
  const [sessions, setSessions] = useState([])
  const [prs, setPrs] = useState([])
  const [saving, setSaving] = useState(false)
  const [expandedSession, setExpandedSession] = useState(null)
  const [showExercisePicker, setShowExercisePicker] = useState(false)
  const [customExercise, setCustomExercise] = useState('')

  // Gym form
  const [exercises, setExercises] = useState([
    { name: '', sets: [{ reps: '', weight: '' }] }
  ])
  const [gymForm, setGymForm] = useState({ duration: '', feeling: 7, notes: '', date: format(new Date(), 'yyyy-MM-dd') })

  // Run form
  const [runForm, setRunForm] = useState({
    distance: '', hours: '', minutes: '', seconds: '', feeling: 7, notes: '', steps: '', date: format(new Date(), 'yyyy-MM-dd')
  })

  // Other form
  const [otherForm, setOtherForm] = useState({ activity: '', duration: '', feeling: 7, notes: '', steps: '', date: format(new Date(), 'yyyy-MM-dd') })
  const [runPRs, setRunPRs] = useState([])

  useEffect(() => {
    if (user) { fetchSessions(); fetchPRs(); fetchRunPRs() }
  }, [user])

  async function fetchSessions() {
    const { data } = await supabase
      .from('training_sessions')
      .select(`*, training_exercises(*)`)
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(30)
    setSessions(data || [])
  }

  async function fetchPRs() {
    const { data } = await supabase
      .from('personal_records')
      .select('*')
      .eq('user_id', user.id)
      .order('exercise_name')
    setPrs(data || [])
  }

  async function fetchRunPRs() {
    // Get best time for each standard distance from run sessions
    const { data } = await supabase
      .from('training_sessions')
      .select('distance_km, time_seconds, date')
      .eq('user_id', user.id)
      .eq('session_type', 'run')
      .not('distance_km', 'is', null)
      .not('time_seconds', 'is', null)
      .order('time_seconds')

    if (!data) return

    const bests = RUN_PR_DISTANCES.map(({ label, meters }) => {
      const kmTarget = meters / 1000
      // Find runs at or very close to this distance (within 5%)
      const matching = data.filter(r => Math.abs(r.distance_km - kmTarget) / kmTarget < 0.05)
      if (matching.length === 0) return { label, time: null, date: null }
      const best = matching.reduce((a, b) => a.time_seconds < b.time_seconds ? a : b)
      return { label, time: best.time_seconds, date: best.date }
    })

    setRunPRs(bests)
  }

  function addExercise(name = '') {
    setExercises(prev => [...prev, { name, sets: [{ reps: '', weight: '' }] }])
    setShowExercisePicker(false)
  }

  function removeExercise(idx) {
    setExercises(prev => prev.filter((_, i) => i !== idx))
  }

  function updateExerciseName(idx, name) {
    setExercises(prev => prev.map((ex, i) => i === idx ? { ...ex, name } : ex))
  }

  function addSet(exIdx) {
    setExercises(prev => prev.map((ex, i) => i === exIdx
      ? { ...ex, sets: [...ex.sets, { reps: '', weight: '' }] }
      : ex
    ))
  }

  function removeSet(exIdx, setIdx) {
    setExercises(prev => prev.map((ex, i) => i === exIdx
      ? { ...ex, sets: ex.sets.filter((_, si) => si !== setIdx) }
      : ex
    ))
  }

  function updateSet(exIdx, setIdx, field, value) {
    setExercises(prev => prev.map((ex, i) => i === exIdx
      ? { ...ex, sets: ex.sets.map((s, si) => si === setIdx ? { ...s, [field]: value } : s) }
      : ex
    ))
  }

  async function saveGymSession() {
    setSaving(true)
    const sessionDate = gymForm.date || format(new Date(), 'yyyy-MM-dd')

    const { data: session, error } = await supabase
      .from('training_sessions')
      .insert({
        user_id: user.id,
        date: sessionDate,
        session_type: 'gym',
        duration_minutes: gymForm.duration ? parseInt(gymForm.duration) : null,
        feeling: gymForm.feeling,
        notes: gymForm.notes,
        source: 'manual',
      })
      .select()
      .single()

    if (!error && session) {
      // Save exercises
      const exerciseRows = exercises.flatMap(ex =>
        ex.sets.map((s, setIdx) => ({
          session_id: session.id,
          exercise_name: ex.name,
          set_number: setIdx + 1,
          reps: s.reps ? parseInt(s.reps) : null,
          weight_kg: s.weight ? parseFloat(s.weight) : null,
        }))
      ).filter(r => r.exercise_name)

      if (exerciseRows.length > 0) {
        await supabase.from('training_exercises').insert(exerciseRows)
      }

      // Check and update PRs
      for (const ex of exercises) {
        const maxWeight = Math.max(...ex.sets.map(s => parseFloat(s.weight) || 0))
        if (maxWeight > 0) {
          const existingPR = prs.find(p => p.exercise_name === ex.name)
          if (!existingPR || maxWeight > existingPR.weight_kg) {
            await supabase.from('personal_records').upsert({
              user_id: user.id,
              exercise_name: ex.name,
              weight_kg: maxWeight,
              date: sessionDate,
            }, { onConflict: 'user_id,exercise_name' })
          }
        }
      }

      await updateTrainingScore(sessionDate, gymForm.feeling)
      await fetchSessions()
      await fetchPRs()

      setExercises([{ name: '', sets: [{ reps: '', weight: '' }] }])
      setGymForm({ duration: '', feeling: 7, notes: '', date: format(new Date(), 'yyyy-MM-dd') })
      setView('overview')
    }
    setSaving(false)
  }

  async function saveRunSession() {
    setSaving(true)
    const sessionDate = runForm.date || format(new Date(), 'yyyy-MM-dd')
    const totalSeconds = (parseInt(runForm.hours || 0) * 3600) + (parseInt(runForm.minutes || 0) * 60) + parseInt(runForm.seconds || 0)
    const distanceKm = parseFloat(runForm.distance)
    const pacePerKm = distanceKm > 0 && totalSeconds > 0 ? Math.round(totalSeconds / distanceKm) : null

    await supabase.from('training_sessions').insert({
      user_id: user.id,
      date: sessionDate,
      session_type: 'run',
      duration_minutes: Math.round(totalSeconds / 60),
      feeling: runForm.feeling,
      notes: runForm.notes,
      distance_km: distanceKm || null,
      time_seconds: totalSeconds || null,
      pace_per_km: pacePerKm,
      source: 'manual',
    })

    await updateTrainingScore(sessionDate, runForm.feeling)
    await fetchSessions()
    await fetchRunPRs()
    setRunForm({ distance: '', hours: '', minutes: '', seconds: '', feeling: 7, notes: '', steps: '', date: format(new Date(), 'yyyy-MM-dd') })
    setView('overview')
    setSaving(false)
  }

  async function saveOtherSession() {
    setSaving(true)
    const sessionDate = otherForm.date || format(new Date(), 'yyyy-MM-dd')

    await supabase.from('training_sessions').insert({
      user_id: user.id,
      date: sessionDate,
      session_type: 'other',
      duration_minutes: otherForm.duration ? parseInt(otherForm.duration) : null,
      feeling: otherForm.feeling,
      notes: `${otherForm.activity}${otherForm.notes ? ' — ' + otherForm.notes : ''}`,
      source: 'manual',
    })

    if (otherForm.steps) {
      await supabase.from('health_logs').upsert({
        user_id: user.id,
        date: sessionDate,
        steps: parseInt(otherForm.steps),
      }, { onConflict: 'user_id,date' })
    }

    await updateTrainingScore(sessionDate, otherForm.feeling)
    await fetchSessions()
    setOtherForm({ activity: '', duration: '', feeling: 7, notes: '', steps: '', date: format(new Date(), 'yyyy-MM-dd') })
    setView('overview')
    setSaving(false)
  }

  async function updateTrainingScore(dateStr, feeling) {
    const score = Math.min(50 + (feeling / 10) * 50, 100)
    const { data: existing } = await supabase
      .from('daily_scores').select('*').eq('user_id', user.id).eq('date', dateStr).single()

    if (existing) {
      await supabase.from('daily_scores').update({ score_training: score }).eq('id', existing.id)
    } else {
      await supabase.from('daily_scores').insert({ user_id: user.id, date: dateStr, score_training: score })
    }
  }

  const recentSessions = sessions.slice(0, 10)
  const thisWeekSessions = sessions.filter(s => {
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    return s.date >= weekStart
  })

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '600' }}>Träning</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{thisWeekSessions.length} pass denna vecka</div>
        </div>
        <button onClick={() => setView(view === 'log' ? 'overview' : 'log')} className="btn btn-primary">
          {view === 'log' ? <><X size={15} /> Avbryt</> : <><Plus size={15} /> Logga pass</>}
        </button>
      </div>

      {view === 'overview' && (
        <>
          {/* Week overview */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '12px' }}>DENNA VECKA</div>
            <WeekBar sessions={sessions} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '16px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Pass</div>
                <div className="mono" style={{ fontSize: '24px', fontWeight: '600', color: '#3b82f6' }}>{thisWeekSessions.length}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Total tid</div>
                <div className="mono" style={{ fontSize: '24px', fontWeight: '600' }}>
                  {thisWeekSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0)}
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>min</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Km löpt</div>
                <div className="mono" style={{ fontSize: '24px', fontWeight: '600', color: '#10b981' }}>
                  {thisWeekSessions.filter(s => s.session_type === 'run').reduce((sum, s) => sum + (s.distance_km || 0), 0).toFixed(1)}
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>km</span>
                </div>
              </div>
            </div>
          </div>

          {/* Strength PRs */}
          {prs.length > 0 && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Trophy size={12} color="#f59e0b" /> STYRKA — PERSONLIGA REKORD
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                {prs.map(pr => (
                  <div key={pr.id} className="card-sm">
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{pr.exercise_name}</div>
                    <div className="mono" style={{ fontSize: '18px', fontWeight: '600', color: '#f59e0b' }}>
                      {pr.weight_kg}<span style={{ fontSize: '11px', color: 'var(--muted)' }}>kg</span>
                    </div>
                    {pr.date && <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{format(new Date(pr.date), 'd MMM yyyy', { locale: sv })}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Run PRs */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Trophy size={12} color="#10b981" /> LÖPNING — PERSONLIGA REKORD
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {RUN_PR_DISTANCES.map(({ label }) => {
                const pr = runPRs.find(r => r.label === label)
                const hasTime = pr?.time
                return (
                  <div key={label} className="card-sm">
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
                    {hasTime ? (
                      <>
                        <div className="mono" style={{ fontSize: '16px', fontWeight: '600', color: '#10b981' }}>
                          {formatDuration(pr.time)}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                          {format(new Date(pr.date), 'd MMM yyyy', { locale: sv })}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Ej loggat</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent sessions */}
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '12px' }}>SENASTE PASS</div>
            {recentSessions.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                <Dumbbell size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <div>Inga pass loggade ännu</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentSessions.map(session => {
                  const typeInfo = SESSION_TYPES.find(t => t.id === session.session_type) || SESSION_TYPES[3]
                  const Icon = typeInfo.icon
                  const isExpanded = expandedSession === session.id
                  return (
                    <div key={session.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setExpandedSession(isExpanded ? null : session.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: typeInfo.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={15} color={typeInfo.color} />
                          </div>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: '500' }}>
                              {session.session_type === 'gym' ? 'Gympass' :
                               session.session_type === 'run' ? `Löpning ${session.distance_km ? session.distance_km + ' km' : ''}` :
                               session.notes?.split(' — ')[0] || 'Aktivitet'}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                              {format(new Date(session.date), 'd MMM', { locale: sv })}
                              {session.duration_minutes && ` · ${session.duration_minutes} min`}
                              {session.pace_per_km && ` · ${formatPace(session.pace_per_km)}/km`}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {session.feeling && (
                            <div className="mono" style={{ fontSize: '13px', color: session.feeling >= 7 ? '#10b981' : session.feeling >= 5 ? '#f59e0b' : '#ef4444' }}>
                              {session.feeling}/10
                            </div>
                          )}
                          {isExpanded ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
                        </div>
                      </div>

                      {isExpanded && session.training_exercises?.length > 0 && (
                        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                          {Object.entries(
                            session.training_exercises.reduce((acc, ex) => {
                              if (!acc[ex.exercise_name]) acc[ex.exercise_name] = []
                              acc[ex.exercise_name].push(ex)
                              return acc
                            }, {})
                          ).map(([name, sets]) => (
                            <div key={name} style={{ marginBottom: '8px' }}>
                              <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>{name}</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {sets.map((s, i) => (
                                  <span key={i} className="mono" style={{ fontSize: '12px', padding: '3px 8px', background: 'rgba(59,130,246,0.1)', borderRadius: '4px', color: '#93c5fd' }}>
                                    {s.reps}×{s.weight_kg}kg
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'log' && (
        <div className="card">
          {/* Session type selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '24px' }}>
            {SESSION_TYPES.map(type => {
              const Icon = type.icon
              return (
                <button
                  key={type.id}
                  onClick={() => setSessionType(type.id)}
                  style={{
                    padding: '12px 8px',
                    borderRadius: '8px',
                    border: `1px solid ${sessionType === type.id ? type.color : 'var(--border)'}`,
                    background: sessionType === type.id ? type.color + '15' : 'transparent',
                    color: sessionType === type.id ? type.color : 'var(--muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontFamily: 'DM Sans, sans-serif',
                    fontWeight: '500',
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={18} />
                  {type.label}
                </button>
              )
            })}
          </div>

          {/* GYM FORM */}
          {sessionType === 'gym' && (
            <>
              {exercises.map((ex, exIdx) => (
                <div key={exIdx} style={{ marginBottom: '20px', padding: '14px', background: 'var(--surface2)', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                    <input
                      className="input"
                      value={ex.name}
                      onChange={e => updateExerciseName(exIdx, e.target.value)}
                      placeholder="Övning..."
                      style={{ flex: 1 }}
                    />
                    <button onClick={() => setShowExercisePicker(exIdx)} className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: '12px', flexShrink: 0 }}>
                      Välj
                    </button>
                    {exercises.length > 1 && (
                      <button onClick={() => removeExercise(exIdx)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  {/* Sets */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 1fr 30px', gap: '6px', fontSize: '11px', color: 'var(--muted)', padding: '0 4px' }}>
                      <span>Set</span><span>Reps</span><span>Kg</span><span></span>
                    </div>
                    {ex.sets.map((set, setIdx) => (
                      <div key={setIdx} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 1fr 30px', gap: '6px', alignItems: 'center' }}>
                        <span className="mono" style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center' }}>{setIdx + 1}</span>
                        <input className="input" type="number" placeholder="Reps" value={set.reps} onChange={e => updateSet(exIdx, setIdx, 'reps', e.target.value)} style={{ padding: '8px 10px', textAlign: 'center' }} />
                        <input className="input" type="number" placeholder="Kg" value={set.weight} onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)} style={{ padding: '8px 10px', textAlign: 'center' }} />
                        {ex.sets.length > 1 && (
                          <button onClick={() => removeSet(exIdx, setIdx)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => addSet(exIdx)} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '6px', color: 'var(--muted)', padding: '6px', cursor: 'pointer', fontSize: '12px', marginTop: '4px' }}>
                      + Set
                    </button>
                  </div>
                </div>
              ))}

              {/* Exercise picker modal */}
              {showExercisePicker !== false && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                  <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '400px', maxHeight: '70vh', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ fontWeight: '600' }}>Välj övning</div>
                      <button onClick={() => setShowExercisePicker(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
                    </div>
                    {Object.entries(EXERCISE_LIBRARY).map(([category, exs]) => (
                      <div key={category} style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '6px' }}>{category.toUpperCase()}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {exs.map(ex => (
                            <button key={ex} onClick={() => { updateExerciseName(showExercisePicker, ex); setShowExercisePicker(false) }}
                              style={{ padding: '5px 10px', borderRadius: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '13px', cursor: 'pointer' }}>
                              {ex}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <input className="input" value={customExercise} onChange={e => setCustomExercise(e.target.value)} placeholder="Egen övning..." />
                      <button onClick={() => { if (customExercise) { updateExerciseName(showExercisePicker, customExercise); setShowExercisePicker(false); setCustomExercise('') } }} className="btn btn-primary" style={{ flexShrink: 0 }}>Lägg till</button>
                    </div>
                  </div>
                </div>
              )}

              <button onClick={() => addExercise()} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: '20px' }}>
                <Plus size={14} /> Lägg till övning
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Tid (minuter)</label>
                  <input className="input" type="number" placeholder="60" value={gymForm.duration} onChange={e => setGymForm(f => ({ ...f, duration: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Känsla {gymForm.feeling}/10</label>
                  <input type="range" min="1" max="10" value={gymForm.feeling} onChange={e => setGymForm(f => ({ ...f, feeling: parseInt(e.target.value) }))} style={{ width: '100%', accentColor: '#3b82f6', marginTop: '8px' }} />
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
                <input className="input" type="date" value={gymForm.date} onChange={e => setGymForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <input className="input" placeholder="Anteckningar (valfritt)" value={gymForm.notes} onChange={e => setGymForm(f => ({ ...f, notes: e.target.value }))} style={{ marginBottom: '16px' }} />
              <button onClick={saveGymSession} className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Save size={14} /> Spara gympass</>}
              </button>
            </>
          )}

          {/* RUN FORM */}
          {sessionType === 'run' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Distans (km)</label>
                  <input className="input" type="number" step="0.01" placeholder="10.0" value={runForm.distance} onChange={e => setRunForm(f => ({ ...f, distance: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Tid</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                    <input className="input" type="number" placeholder="HH" value={runForm.hours} onChange={e => setRunForm(f => ({ ...f, hours: e.target.value }))} style={{ padding: '10px 8px', textAlign: 'center' }} />
                    <input className="input" type="number" placeholder="MM" value={runForm.minutes} onChange={e => setRunForm(f => ({ ...f, minutes: e.target.value }))} style={{ padding: '10px 8px', textAlign: 'center' }} />
                    <input className="input" type="number" placeholder="SS" value={runForm.seconds} onChange={e => setRunForm(f => ({ ...f, seconds: e.target.value }))} style={{ padding: '10px 8px', textAlign: 'center' }} />
                  </div>
                </div>
              </div>

              {/* Calculated pace */}
              {runForm.distance && (runForm.minutes || runForm.hours) && (
                <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.1)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#10b981' }}>
                  Pace: <span className="mono" style={{ fontWeight: '600' }}>
                    {formatPace(Math.round(((parseInt(runForm.hours || 0) * 3600) + (parseInt(runForm.minutes || 0) * 60) + parseInt(runForm.seconds || 0)) / parseFloat(runForm.distance)))}
                  </span>/km
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Känsla {runForm.feeling}/10</label>
                <input type="range" min="1" max="10" value={runForm.feeling} onChange={e => setRunForm(f => ({ ...f, feeling: parseInt(e.target.value) }))} style={{ width: '100%', accentColor: '#10b981' }} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
                <input className="input" type="date" value={runForm.date} onChange={e => setRunForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <input className="input" placeholder="Anteckningar (valfritt)" value={runForm.notes} onChange={e => setRunForm(f => ({ ...f, notes: e.target.value }))} style={{ marginBottom: '16px' }} />
              <button onClick={saveRunSession} className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center', background: '#10b981' }}>
                {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Save size={14} /> Spara löppass</>}
              </button>
            </>
          )}

          {/* WALK/OTHER FORM */}
          {(sessionType === 'walk' || sessionType === 'other') && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Aktivitet</label>
                <input className="input" placeholder={sessionType === 'walk' ? 'Promenad' : 'Yoga, cykling, simning...'} value={otherForm.activity} onChange={e => setOtherForm(f => ({ ...f, activity: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Tid (minuter)</label>
                  <input className="input" type="number" placeholder="30" value={otherForm.duration} onChange={e => setOtherForm(f => ({ ...f, duration: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Steg (valfritt)</label>
                  <input className="input" type="number" placeholder="8000" value={otherForm.steps} onChange={e => setOtherForm(f => ({ ...f, steps: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Känsla {otherForm.feeling}/10</label>
                <input type="range" min="1" max="10" value={otherForm.feeling} onChange={e => setOtherForm(f => ({ ...f, feeling: parseInt(e.target.value) }))} style={{ width: '100%', accentColor: '#ec4899' }} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
                <input className="input" type="date" value={otherForm.date} onChange={e => setOtherForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <input className="input" placeholder="Anteckningar (valfritt)" value={otherForm.notes} onChange={e => setOtherForm(f => ({ ...f, notes: e.target.value }))} style={{ marginBottom: '16px' }} />
              <button onClick={saveOtherSession} className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Save size={14} /> Spara</>}
              </button>
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
