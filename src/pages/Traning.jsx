import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, addMonths, subMonths, parseISO, isSameMonth } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Plus, X, Save, Loader, Dumbbell, Timer, Footprints, ChevronDown, ChevronUp, Trophy, TrendingUp, Flame, Calendar, ChevronLeft, ChevronRight, RefreshCw, Link, Upload } from 'lucide-react'
import ExerciseModal from '../components/ExerciseModal'
import RunModal from '../components/RunModal'

const BASE_EXERCISE_LIBRARY = {
  'Bröst': ['Bänkpress', 'Lutande bänkpress', 'Cables korsning', 'Dips', 'Armhävningar'],
  'Rygg': ['Marklyft', 'Latsdrag', 'Rodd', 'Pull-ups', 'Weighted pull-up', 'Hyperextensions'],
  'Ben': ['Knäböj', 'Benpress', 'Utfall', 'Leg curl', 'Leg extension', 'Kalvhävningar'],
  'Axlar': ['Militärpress', 'Sidolyft', 'Framåtlyft', 'Face pulls', 'Shrugs'],
  'Armar': ['Bicepscurl', 'Hammercurl', 'Tryckkpress', 'Skullcrusher', 'Kabeldrag'],
  'Core': ['Plankan', 'Situps', 'Crunches', 'Russian twist', 'Bäckenlyft'],
  'Egna': [],
}

// Exercises where weight_kg = added weight above BW (0 = bodyweight only)
const BW_EXERCISES = new Set([
  'pull-ups','pullups','pull up','pull-up','weighted pull-up',
  'dips','dip',
  'armhävningar','pushups','push-ups','push ups',
  'chin-ups','chinups','chins',
  'muscle up','muscle-up',
  'ring dips','plankan',
])

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
  const [editingSession, setEditingSession] = useState(null) // session being edited
  const [customExercise, setCustomExercise] = useState('')
  const [exerciseLibrary, setExerciseLibrary] = useState(BASE_EXERCISE_LIBRARY)

  // Strava
  const [stravaConnected, setStravaConnected] = useState(false)
  const [stravaSyncing, setStravaSyncing] = useState(false)
  const [stravaResult, setStravaResult] = useState(null)
  const [fetchingPrs, setFetchingPrs] = useState(false)
  const [csvImporting, setCsvImporting] = useState(false)
  const csvRef = useRef(null)

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
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selectedExercise, setSelectedExercise] = useState(null)
  const [showRunModal, setShowRunModal] = useState(false)

  useEffect(() => {
    if (user) { fetchSessions(); fetchPRs(); fetchRunPRs(); checkStravaStatus(); loadCustomExercises() }
  }, [user])

  async function loadCustomExercises() {
    const [settingsRes, historyRes] = await Promise.all([
      supabase.from('user_settings').select('goals').eq('user_id', user.id).single(),
      supabase.from('training_exercises')
        .select('exercise_name, training_sessions!inner(user_id)')
        .eq('training_sessions.user_id', user.id),
    ])

    const custom = settingsRes.data?.goals?.custom_exercises || []

    // All base exercise names (flat)
    const baseNames = new Set(Object.values(BASE_EXERCISE_LIBRARY).flat().map(n => n.toLowerCase()))

    // Unique names from history that aren't in the base library
    const fromHistory = [...new Set((historyRes.data || []).map(r => r.exercise_name).filter(Boolean))]
      .filter(name => !baseNames.has(name.toLowerCase()))

    // Merge: custom settings + history, deduplicated
    const allCustom = [...new Set([...custom, ...fromHistory])]

    setExerciseLibrary(prev => ({ ...prev, 'Egna': allCustom }))
  }

  async function saveCustomExercise(name) {
    const { data } = await supabase.from('user_settings').select('goals').eq('user_id', user.id).single()
    const existing = data?.goals?.custom_exercises || []
    if (existing.includes(name)) return
    const updated = [...existing, name]
    await supabase.from('user_settings').upsert({
      user_id: user.id,
      goals: { ...(data?.goals || {}), custom_exercises: updated }
    }, { onConflict: 'user_id' })
    setExerciseLibrary(prev => ({ ...prev, 'Egna': updated }))
  }

  async function checkStravaStatus() {
    try {
      const { data, error } = await supabase.functions.invoke('strava-sync', {
        body: null, headers: { 'x-action': 'status' }
      })
      // Use query param approach instead
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strava-sync?action=status`, {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        }
      })
      const json = await res.json()
      setStravaConnected(json.connected)
    } catch (e) { console.error(e) }
  }

  async function connectStrava() {
    const redirectUri = `${window.location.origin}/strava-callback`
    const scope = 'activity:read_all'
    const url = `https://www.strava.com/oauth/authorize?client_id=250984&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`
    window.location.href = url
  }

  async function syncStrava() {
    setStravaSyncing(true)
    setStravaResult(null)
    try {
      const session = (await supabase.auth.getSession()).data.session
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strava-sync?action=sync`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        }
      })
      const json = await res.json()
      setStravaResult(json)
      if (json.synced > 0) await fetchSessions()
    } catch (e) { console.error(e) }
    setStravaSyncing(false)
  }

  async function fetchStravaPrs() {
    setFetchingPrs(true)
    try {
      const session = (await supabase.auth.getSession()).data.session
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strava-sync?action=fetch_prs`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        }
      })
      const json = await res.json()
      setStravaResult({ ...json, synced: 0, skipped: 0, total: json.processed, prsUpdated: json.prsUpdated })
    } catch (e) { console.error(e) }
    setFetchingPrs(false)
  }

  // CSV Import from Strava export
  async function handleCsvImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setCsvImporting(true)
    const text = await file.text()

    // Robust CSV parser handling quoted fields with commas/newlines
    function parseCSVLine(line) {
      const result = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          inQuotes = !inQuotes
        } else if (ch === ',' && !inQuotes) {
          result.push(current)
          current = ''
        } else {
          current += ch
        }
      }
      result.push(current)
      return result
    }

    const lines = text.split('\n').filter(l => l.trim())
    const headers = parseCSVLine(lines[0])

    // Find column indices — for duplicates, take FIRST occurrence
    const idx = {}
    headers.forEach((h, i) => { if (!(h in idx)) idx[h] = i })

    // Log what we found for debugging
    console.log('Distance col index:', idx['Distance'], 'Moving Time col index:', idx['Moving Time'])

    const typeMap = {
      'Run': 'run', 'Trail Run': 'run', 'Virtual Run': 'run',
      'Ride': 'other', 'Virtual Ride': 'other', 'EBikeRide': 'other',
      'Swim': 'other', 'Walk': 'walk', 'Hike': 'walk',
      'Weight Training': 'gym', 'Workout': 'gym', 'CrossFit': 'gym',
    }

    // Clear previous bad strava imports
    await supabase.from('training_sessions')
      .delete()
      .eq('user_id', user.id)
      .eq('source', 'strava')

    let imported = 0
    let skipped = 0

    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i])
      if (vals.length < 7) continue

      // Use explicit column indices to avoid duplicate-column confusion
      const stravaId    = vals[idx['Activity ID']]?.trim() || null
      const dateStr     = vals[idx['Activity Date']]?.trim() || ''
      const name        = vals[idx['Activity Name']]?.trim() || ''
      const activityType = vals[idx['Activity Type']]?.trim() || ''
      const movingTimeSec = parseInt(vals[idx['Moving Time']] || '0')
      const distanceKm  = parseFloat(vals[idx['Distance']] || '0') || null  // col 6 = km
      const elevationM  = parseFloat(vals[idx['Elevation Gain']] || '0') || null
      const avgHr       = parseFloat(vals[idx['Average Heart Rate']] || '0') || null

      if (!dateStr || !activityType) continue

      const sessionType = typeMap[activityType] || 'other'

      let date
      try {
        const parsed = new Date(dateStr)
        if (isNaN(parsed.getTime())) { skipped++; continue }
        date = parsed.toISOString().slice(0, 10)
      } catch { skipped++; continue }

      const durationMin = movingTimeSec > 0 ? Math.round(movingTimeSec / 60) : null
      const pacePerKm = distanceKm && movingTimeSec ? Math.round(movingTimeSec / distanceKm) : null

      const notes = [
        name,
        elevationM ? `${Math.round(elevationM)}m↑` : '',
        avgHr ? `${Math.round(avgHr)}bpm` : ''
      ].filter(Boolean).join(' · ')

      const { error } = await supabase.from('training_sessions').insert({
        user_id: user.id,
        date,
        session_type: sessionType,
        duration_minutes: durationMin,
        distance_km: distanceKm,
        pace_per_km: pacePerKm,
        notes,
        source: 'strava',
        strava_id: stravaId,
      })
      if (!error) imported++
      else skipped++
    }

    setStravaResult({ synced: imported, skipped, total: lines.length - 1 })
    if (imported > 0) { await fetchSessions(); await fetchRunPRs() }
    setCsvImporting(false)
    e.target.value = ''
  }

  function openEditSession(session) {
    const grouped = {}
    for (const ex of session.training_exercises || []) {
      if (!grouped[ex.exercise_name]) grouped[ex.exercise_name] = []
      grouped[ex.exercise_name].push({ reps: ex.reps ?? '', weight: ex.weight_kg ?? '', is_dropset: ex.is_dropset || false })
    }
    const exList = Object.entries(grouped).map(([name, sets]) => ({ name, sets }))
    setEditingSession({ id: session.id, date: session.date, sessionType: session.session_type, feeling: session.feeling || '', notes: session.notes || '', exercises: exList.length ? exList : [{ name: '', sets: [{ reps: '', weight: '', is_dropset: false }] }] })
  }

  async function saveEditSession() {
    if (!editingSession) return
    const { id, date, sessionType, feeling, notes, exercises } = editingSession
    await supabase.from('training_sessions').update({ date, session_type: sessionType, feeling: feeling ? parseInt(feeling) : null, notes: notes || null }).eq('id', id)
    await supabase.from('training_exercises').delete().eq('session_id', id)
    const rows = exercises.flatMap((ex, _) => ex.sets.map((s, si) => ({ session_id: id, exercise_name: ex.name, set_number: si + 1, reps: s.reps ? parseInt(s.reps) : null, weight_kg: s.weight !== '' ? parseFloat(s.weight) : null, is_dropset: s.is_dropset || false }))).filter(r => r.exercise_name)
    if (rows.length) await supabase.from('training_exercises').insert(rows)
    setEditingSession(null)
    fetchSessions()
  }

  function updateEditSet(exIdx, setIdx, field, value) {
    setEditingSession(prev => ({ ...prev, exercises: prev.exercises.map((ex, i) => i !== exIdx ? ex : { ...ex, sets: ex.sets.map((s, si) => si === setIdx ? { ...s, [field]: value } : s) }) }))
  }
  function addEditSet(exIdx) {
    setEditingSession(prev => ({ ...prev, exercises: prev.exercises.map((ex, i) => i !== exIdx ? ex : { ...ex, sets: [...ex.sets, { reps: '', weight: '', is_dropset: false }] }) }))
  }
  function removeEditSet(exIdx, setIdx) {
    setEditingSession(prev => ({ ...prev, exercises: prev.exercises.map((ex, i) => i !== exIdx ? ex : { ...ex, sets: ex.sets.filter((_, si) => si !== setIdx) }) }))
  }
  function deleteSession(id) {
    if (!window.confirm('Ta bort detta pass?')) return
    supabase.from('training_sessions').delete().eq('id', id).then(() => fetchSessions())
  }

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
    const { data } = await supabase
      .from('training_sessions')
      .select('distance_km, duration_minutes, pace_per_km, time_seconds, date')
      .eq('user_id', user.id)
      .eq('session_type', 'run')
      .not('distance_km', 'is', null)
      .order('date')

    if (!data) return

    const bests = RUN_PR_DISTANCES.map(({ label, meters }) => {
      const kmTarget = meters / 1000

      // Accept runs that are at least 95% of the target distance
      const eligible = data.filter(r => r.distance_km >= kmTarget * 0.95)
      if (eligible.length === 0) return { label, time: null, date: null }

      // Calculate estimated time for target distance using pace_per_km
      const withTime = eligible.map(r => {
        let seconds = null
        if (r.time_seconds && Math.abs(r.distance_km - kmTarget) / kmTarget < 0.05) {
          // Exact distance match — use real time
          seconds = r.time_seconds
        } else if (r.pace_per_km) {
          // Estimate time from pace × target distance
          seconds = Math.round(r.pace_per_km * kmTarget)
        } else if (r.duration_minutes && r.distance_km) {
          // Derive pace from duration and use it
          const pacePerKm = (r.duration_minutes * 60) / r.distance_km
          seconds = Math.round(pacePerKm * kmTarget)
        }
        return { ...r, estSeconds: seconds }
      }).filter(r => r.estSeconds)

      if (!withTime.length) return { label, time: null, date: null }

      const best = withTime.reduce((a, b) => a.estSeconds < b.estSeconds ? a : b)
      return { label, time: best.estSeconds, date: best.date }
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
      ? { ...ex, sets: [...ex.sets, { reps: '', weight: '', is_dropset: false }] }
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
          is_dropset: s.is_dropset || false,
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
    <div className="page-wrap">

      {/* Sticky header */}
      <div className="page-header">
        <div>
          <div className="page-header-title">Träning</div>
          <div className="page-header-sub">{thisWeekSessions.length} pass denna vecka</div>
        </div>
        <div className="page-header-actions">
          <input ref={csvRef} type="file" accept=".csv" onChange={handleCsvImport} style={{ display: 'none' }} />
          {stravaConnected ? (
            <>
            <button onClick={syncStrava} disabled={stravaSyncing} className="btn btn-ghost" style={{ color: '#fc4c02', borderColor: 'rgba(252,76,2,0.20)', background: 'rgba(252,76,2,0.06)' }}>
              {stravaSyncing ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Synkar...</> : <><RefreshCw size={13} /> Strava</>}
            </button>
            <button onClick={fetchStravaPrs} disabled={fetchingPrs} className="btn btn-ghost" style={{ color: '#fc4c02', borderColor: 'rgba(252,76,2,0.20)', background: 'rgba(252,76,2,0.06)', fontSize: '11px' }}>
              {fetchingPrs ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Synkar PBn…</> : 'Synka PBn'}
            </button>
            </>
          ) : (
            <button onClick={connectStrava} className="btn btn-ghost" style={{ color: '#fc4c02', borderColor: 'rgba(252,76,2,0.20)', background: 'rgba(252,76,2,0.06)' }}>
              <Link size={13} /> Koppla Strava
            </button>
          )}
          <button onClick={() => csvRef.current?.click()} disabled={csvImporting} className="btn btn-ghost">
            {csvImporting ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Importerar CSV…</> : <><Upload size={13} /> Importera</>}
          </button>
          <button onClick={() => setView(view === 'calendar' ? 'overview' : 'calendar')} className="btn btn-ghost">
            <Calendar size={14} /> {view === 'calendar' ? 'Översikt' : 'Kalender'}
          </button>
          <button onClick={() => setView(view === 'log' ? 'overview' : 'log')} className="btn btn-primary">
            {view === 'log' ? <><X size={15} /> Avbryt</> : <><Plus size={15} /> Logga pass</>}
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="page-content-scroll">
      <div style={{ padding: '16px 16px 0', maxWidth: '900px', margin: '0 auto' }}>

      {/* Strava result */}
      {stravaResult && (
        <div style={{ padding: '12px 16px', background: 'rgba(252,76,2,0.08)', border: '1px solid rgba(252,76,2,0.2)', borderRadius: '10px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#fc4c02' }}>
            ✓ {stravaResult.synced > 0 ? `Importerade ${stravaResult.synced} pass (${stravaResult.skipped} redan synkade av ${stravaResult.total} totalt)` : `Analyserade ${stravaResult.total} pass`}{stravaResult.prsUpdated > 0 ? ` · ${stravaResult.prsUpdated} PRs uppdaterade` : ''}
          </span>
          <button onClick={() => setStravaResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={14} /></button>
        </div>
      )}

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
                  <div key={pr.id} className="card-sm" onClick={() => setSelectedExercise(pr.exercise_name)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{pr.exercise_name}</div>
                    <div className="mono" style={{ fontSize: '18px', fontWeight: '600', color: '#f59e0b' }}>
                      {pr.weight_kg}<span style={{ fontSize: '11px', color: 'var(--muted)' }}>kg</span>
                    </div>
                    {pr.date && <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{format(new Date(pr.date), 'd MMM yyyy', { locale: sv })}</div>}
                    <div style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <TrendingUp size={10} /> Se historik
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Run PRs */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Trophy size={12} color="#10b981" /> LÖPNING — PERSONLIGA REKORD</span>
              <button onClick={() => setShowRunModal(true)} style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                Se all löphistorik →
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {RUN_PR_DISTANCES.map(({ label }) => {
                const pr = runPRs.find(r => r.label === label)
                const hasTime = pr?.time
                return (
                  <div key={label} className="card-sm" onClick={() => setShowRunModal(true)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
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
                    <div style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <TrendingUp size={10} /> Se historik
                    </div>
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

                      {isExpanded && (
                        <>
                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }} onClick={e => e.stopPropagation()}>
                            <button onClick={e => { e.stopPropagation(); openEditSession(session) }} className="btn btn-ghost btn-sm">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              Redigera
                            </button>
                            <button onClick={e => { e.stopPropagation(); deleteSession(session.id) }} className="btn btn-danger btn-sm">
                              <X size={12} /> Ta bort
                            </button>
                          </div>

                          {session.training_exercises?.length > 0 && (
                            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                              {Object.entries(
                                session.training_exercises.reduce((acc, ex) => {
                                  if (!acc[ex.exercise_name]) acc[ex.exercise_name] = []
                                  acc[ex.exercise_name].push(ex)
                                  return acc
                                }, {})
                              ).map(([name, sets]) => (
                                <div key={name} style={{ marginBottom: '10px' }}>
                                  <div
                                    onClick={e => { e.stopPropagation(); setSelectedExercise(name) }}
                                    style={{ fontSize: '13px', fontWeight: '600', marginBottom: '5px', color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    {name}
                                    <TrendingUp size={11} />
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                    {sets.map((s, i) => (
                                      <span key={i} className="mono" style={{
                                        fontSize: '12px', padding: '3px 8px', borderRadius: '5px',
                                        background: s.is_dropset ? 'rgba(245,158,11,0.12)' : 'var(--accent-soft)',
                                        color: s.is_dropset ? '#f59e0b' : 'var(--accent)',
                                        border: s.is_dropset ? '1px solid rgba(245,158,11,0.25)' : 'none',
                                      }}>
                                        {s.reps}×{s.weight_kg}kg{s.is_dropset ? ' ↓' : ''}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'calendar' && (
        <div>
          {/* Month navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="btn btn-ghost btn-icon">
              <ChevronLeft size={15} />
            </button>
            <div style={{ fontSize: '15px', fontWeight: '600', textTransform: 'capitalize' }}>
              {format(calendarMonth, 'MMMM yyyy', { locale: sv })}
            </div>
            <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="btn btn-ghost btn-icon">
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Calendar grid */}
          {(() => {
            const monthStart = startOfMonth(calendarMonth)
            const monthEnd = endOfMonth(calendarMonth)
            const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
            const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
            const days = eachDayOfInterval({ start: calStart, end: calEnd })
            const dayHeaders = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']

            return (
              <div className="card">
                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                  {dayHeaders.map(d => (
                    <div key={d} style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', fontWeight: '600', padding: '4px 0' }}>{d}</div>
                  ))}
                </div>

                {/* Day cells */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                  {days.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd')
                    const daySessions = sessions.filter(s => s.date === dateStr)
                    const isCurrentMonth = isSameMonth(day, calendarMonth)
                    const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr
                    const hasGym = daySessions.some(s => s.session_type === 'gym')
                    const hasRun = daySessions.some(s => s.session_type === 'run')
                    const hasOther = daySessions.some(s => s.session_type !== 'gym' && s.session_type !== 'run')
                    const isSelected = expandedSession === dateStr

                    return (
                      <div key={dateStr} style={{
                        minHeight: '64px', padding: '6px', borderRadius: '8px',
                        background: isSelected ? 'var(--accent-soft)' : isToday ? 'rgba(79,142,247,0.08)' : daySessions.length > 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                        border: `1px solid ${isSelected ? 'var(--accent-border)' : isToday ? 'var(--accent-border)' : daySessions.length > 0 ? 'var(--border)' : 'transparent'}`,
                        opacity: isCurrentMonth ? 1 : 0.3,
                        cursor: daySessions.length > 0 ? 'pointer' : 'default',
                        transition: 'all 0.15s',
                      }} onClick={() => daySessions.length > 0 && setExpandedSession(isSelected ? null : dateStr)}>
                        <div style={{ fontSize: '11px', fontWeight: isToday ? '700' : '400', color: isToday ? 'var(--accent)' : 'var(--muted)', marginBottom: '4px' }}>
                          {format(day, 'd')}
                        </div>
                        {daySessions.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {hasGym && <div style={{ fontSize: '10px', padding: '2px 5px', borderRadius: '3px', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: '500' }}>Gym</div>}
                            {hasRun && <div style={{ fontSize: '10px', padding: '2px 5px', borderRadius: '3px', background: 'rgba(16,185,129,0.15)', color: '#34d399', fontWeight: '500' }}>
                              {daySessions.find(s => s.session_type === 'run')?.distance_km ? `${daySessions.find(s => s.session_type === 'run').distance_km}km` : 'Löp'}
                            </div>}
                            {hasOther && <div style={{ fontSize: '10px', padding: '2px 5px', borderRadius: '3px', background: 'rgba(236,72,153,0.15)', color: '#f472b6', fontWeight: '500' }}>Aktivitet</div>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Day detail — shows when a calendar day is clicked */}
                {expandedSession && (() => {
                  const dayStr = expandedSession
                  const daySess = sessions.filter(s => s.date === dayStr)
                  if (daySess.length === 0) return null
                  const gymSess = daySess.find(s => s.session_type === 'gym')
                  return (
                    <div className="card" style={{ marginTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontWeight: '600', fontSize: '14px', textTransform: 'capitalize' }}>
                          {format(parseISO(dayStr), 'EEEE d MMMM', { locale: sv })}
                        </div>
                        <button onClick={() => setExpandedSession(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={14} /></button>
                      </div>
                      {gymSess && gymSess.training_exercises?.length > 0 && (
                        <>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '8px' }}>ÖVNINGAR — klicka för historik</div>
                          {Object.entries(gymSess.training_exercises.reduce((acc, ex) => {
                            if (!acc[ex.exercise_name]) acc[ex.exercise_name] = []
                            acc[ex.exercise_name].push(ex)
                            return acc
                          }, {})).map(([name, sets]) => (
                            <div key={name} style={{ marginBottom: '10px' }}>
                              <div onClick={() => setSelectedExercise(name)} style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent)', cursor: 'pointer', marginBottom: '5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                {name} <TrendingUp size={11} />
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {sets.sort((a,b) => a.set_number - b.set_number).map((s, i) => (
                                  <span key={i} className="mono" style={{ fontSize: '12px', padding: '3px 8px', background: 'var(--accent-soft)', borderRadius: '5px', color: 'var(--accent)' }}>
                                    {s.reps}×{s.weight_kg}kg
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {daySess.filter(s => s.session_type === 'run').map(s => (
                        <div key={s.id} style={{ fontSize: '13px', color: '#34d399' }}>{s.distance_km}km {s.duration_minutes && `· ${s.duration_minutes}min`}</div>
                      ))}
                    </div>
                  )
                })()}

                {/* Month summary */}
                {(() => {
                  const monthSessions = sessions.filter(s => s.date >= format(monthStart, 'yyyy-MM-dd') && s.date <= format(monthEnd, 'yyyy-MM-dd'))
                  const gymCount = monthSessions.filter(s => s.session_type === 'gym').length
                  const runCount = monthSessions.filter(s => s.session_type === 'run').length
                  const totalKm = monthSessions.filter(s => s.session_type === 'run').reduce((sum, s) => sum + (s.distance_km || 0), 0)
                  return monthSessions.length > 0 ? (
                    <div style={{ display: 'flex', gap: '16px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        <span className="mono" style={{ color: '#3b82f6', fontWeight: '600' }}>{gymCount}</span> gympass
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        <span className="mono" style={{ color: '#10b981', fontWeight: '600' }}>{runCount}</span> löppass
                      </div>
                      {totalKm > 0 && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        <span className="mono" style={{ color: '#10b981', fontWeight: '600' }}>{totalKm.toFixed(1)}</span> km totalt
                      </div>}
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        <span className="mono" style={{ color: 'var(--text)', fontWeight: '600' }}>{monthSessions.length}</span> pass totalt
                      </div>
                    </div>
                  ) : null
                })()}
              </div>
            )
          })()}
        </div>
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
                    fontFamily: 'Inter, sans-serif',
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
                  {(() => {
                    const isBW = BW_EXERCISES.has(ex.name.toLowerCase().trim())
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 32px 28px', gap: '6px', fontSize: '11px', color: 'var(--muted)', padding: '0 4px' }}>
                          <span>Set</span><span>Reps</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            {isBW ? '+Kg' : 'Kg'}
                            {isBW && <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 600 }}>BW</span>}
                          </span>
                          <span style={{ textAlign: 'center' }}>DS</span><span></span>
                        </div>
                        {ex.sets.map((set, setIdx) => (
                          <div key={setIdx} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 32px 28px', gap: '6px', alignItems: 'center' }}>
                            <span className="mono" style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center' }}>{setIdx + 1}</span>
                            <input className="input" type="number" placeholder="Reps" value={set.reps} onChange={e => updateSet(exIdx, setIdx, 'reps', e.target.value)} style={{ padding: '8px 10px', textAlign: 'center' }} />
                            <input className="input" type="number"
                              placeholder={isBW ? '0 = BW' : 'Kg'}
                              value={set.weight}
                              onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                              style={{ padding: '8px 10px', textAlign: 'center' }}
                            />
                            <button onClick={() => updateSet(exIdx, setIdx, 'is_dropset', !set.is_dropset)} title="Dropset" style={{ width: '32px', height: '32px', borderRadius: '7px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: set.is_dropset ? 'rgba(245,158,11,0.15)' : 'var(--surface)', border: '1px solid ' + (set.is_dropset ? 'rgba(245,158,11,0.4)' : 'var(--border)'), transition: 'all 0.15s' }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={set.is_dropset ? '#f59e0b' : 'var(--muted)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                            </button>
                            {ex.sets.length > 1 ? (
                              <button onClick={() => removeSet(exIdx, setIdx)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={13} /></button>
                            ) : <span />}
                          </div>
                        ))}
                        <button onClick={() => addSet(exIdx)} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '6px', color: 'var(--muted)', padding: '6px', cursor: 'pointer', fontSize: '12px', marginTop: '4px' }}>+ Set</button>
                      </div>
                    )
                  })()}
                </div>
              ))}

              {/* Exercise picker modal */}
              {showExercisePicker !== false && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px', width: '100%', maxWidth: '560px', maxHeight: '75vh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,0.5)' }}>
                    {/* Handle */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border2)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingTop: '8px' }}>
                      <div style={{ fontWeight: '600', fontSize: '15px' }}>Välj övning</div>
                      <button onClick={() => setShowExercisePicker(false)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)' }}><X size={14} /></button>
                    </div>
                    {Object.entries(exerciseLibrary).map(([category, exs]) => (
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
                      <button onClick={() => {
                        if (customExercise.trim()) {
                          updateExerciseName(showExercisePicker, customExercise.trim())
                          saveCustomExercise(customExercise.trim())
                          setShowExercisePicker(false)
                          setCustomExercise('')
                        }
                      }} className="btn btn-primary" style={{ flexShrink: 0 }}>Spara</button>
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

      {selectedExercise && (
        <ExerciseModal exerciseName={selectedExercise} onClose={() => setSelectedExercise(null)} />
      )}

      {showRunModal && (
        <RunModal onClose={() => setShowRunModal(false)} />
      )}

      {/* EDIT SESSION MODAL */}
      {editingSession && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={e => e.target === e.currentTarget && setEditingSession(null)}>
          <div style={{ background: 'var(--surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: '18px', width: '100%', maxWidth: '560px', maxHeight: '85vh', overflowY: 'auto', padding: '20px', boxShadow: 'var(--glass-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ fontSize: '15px', fontWeight: '600' }}>Redigera pass</div>
              <button onClick={() => setEditingSession(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>DATUM</label>
                <input className="input" type="date" value={editingSession.date} onChange={e => setEditingSession(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>KÄNSLA (1–10)</label>
                <input className="input" type="number" min="1" max="10" value={editingSession.feeling} onChange={e => setEditingSession(p => ({ ...p, feeling: e.target.value }))} placeholder="—" />
              </div>
            </div>

            {editingSession.exercises.map((ex, exIdx) => (
              <div key={exIdx} style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface2)', borderRadius: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input className="input" value={ex.name} onChange={e => setEditingSession(p => ({ ...p, exercises: p.exercises.map((x, i) => i !== exIdx ? x : { ...x, name: e.target.value }) }))} placeholder="Övning..." style={{ flex: 1 }} />
                  {editingSession.exercises.length > 1 && (
                    <button onClick={() => setEditingSession(p => ({ ...p, exercises: p.exercises.filter((_, i) => i !== exIdx) }))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}><X size={15} /></button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 24px', gap: '6px', fontSize: '11px', color: 'var(--muted)', padding: '0 2px', marginBottom: '4px' }}>
                  <span>Set</span><span>Reps</span><span>{BW_EXERCISES.has(ex.name.toLowerCase().trim()) ? '+Kg' : 'Kg'}</span><span></span>
                </div>
                {ex.sets.map((s, si) => (
                  <div key={si} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 24px', gap: '6px', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>{si + 1}</span>
                    <input className="input" type="number" placeholder="Reps" value={s.reps} onChange={e => updateEditSet(exIdx, si, 'reps', e.target.value)} style={{ padding: '7px 10px', textAlign: 'center' }} />
                    <input className="input" type="number" placeholder={BW_EXERCISES.has(ex.name.toLowerCase().trim()) ? '0=BW' : 'Kg'} value={s.weight} onChange={e => updateEditSet(exIdx, si, 'weight', e.target.value)} style={{ padding: '7px 10px', textAlign: 'center' }} />
                    {ex.sets.length > 1 ? <button onClick={() => removeEditSet(exIdx, si)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={12} /></button> : <span />}
                  </div>
                ))}
                <button onClick={() => addEditSet(exIdx)} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '6px', color: 'var(--muted)', padding: '5px', cursor: 'pointer', fontSize: '12px', width: '100%', marginTop: '4px' }}>+ Set</button>
              </div>
            ))}

            <button
              onClick={() => setEditingSession(p => ({ ...p, exercises: [...p.exercises, { name: '', sets: [{ reps: '', weight: '', is_dropset: false }] }] }))}
              style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', padding: '8px', cursor: 'pointer', fontSize: '13px', width: '100%', marginBottom: '14px' }}
            >
              + Lägg till övning
            </button>

            <button onClick={saveEditSession} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              <Save size={14} /> Spara ändringar
            </button>
          </div>
        </div>
      )}
    </div>
      </div>
    </div>
  )
}
