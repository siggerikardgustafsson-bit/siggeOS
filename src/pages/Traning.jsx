import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, addMonths, subMonths, parseISO, isSameMonth } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Plus, X, Save, Loader, Dumbbell, Timer, Footprints, ChevronDown, ChevronUp, Trophy, TrendingUp, Flame, Calendar, ChevronLeft, ChevronRight, RefreshCw, Link, Upload, Search, Edit3, Library, Check } from 'lucide-react'
import ExerciseModal from '../components/ExerciseModal'
import RunModal from '../components/RunModal'
import Modal from '../components/Modal'

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
  { label: '1 km',       meters: 1000 },
  { label: '5 km',       meters: 5000 },
  { label: '10 km',      meters: 10000 },
  { label: 'Halvmaraton', meters: 21097 },
]


const FEATURED_STRENGTH_PBS = [
  { label: 'Bänkpress', aliases: ['bänkpress', 'bankpress', 'bench press', 'bänk'] },
  { label: 'Marklyft', aliases: ['marklyft', 'deadlift'] },
  { label: 'Knäböj', aliases: ['knäböj', 'knaboj', 'squat', 'böj'] },
  { label: 'Pull-ups', aliases: ['pull-ups', 'pullups', 'pull up', 'pull-up', 'weighted pull-up', 'chins'] },
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
    <div className="tr-week">
      {weekDays.map((day, i) => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const hasSession = sessions.some(s => s.date === dateStr)
        const isToday = format(today, 'yyyy-MM-dd') === dateStr
        return (
          <div key={i} className="tr-week-day">
            <div className={`tr-week-bar ${hasSession ? 'on' : ''} ${isToday ? 'today' : ''}`} />
            <span className={`tr-week-lab ${isToday ? 'today' : ''}`}>{days[i]}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function TraningPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
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

  // Exercise library 2.0
  const [libraryExercises, setLibraryExercises] = useState([])
  const [muscleGroups, setMuscleGroups] = useState([])
  const [exerciseAliases, setExerciseAliases] = useState({})
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [editingLibraryExercise, setEditingLibraryExercise] = useState(null)
  const [savingLibraryExercise, setSavingLibraryExercise] = useState(false)

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
  const [showAllPrModal, setShowAllPrModal] = useState(false)
  const [showStrengthPrModal, setShowStrengthPrModal] = useState(false)
  const [showRunPrModal, setShowRunPrModal] = useState(false)
  const [allPrFilter, setAllPrFilter] = useState('all') // all | strength | run
  const [allPrSearch, setAllPrSearch] = useState('')
  const [allPrSort, setAllPrSort] = useState('date') // date | name | value
  const [runEfforts, setRunEfforts] = useState([])
  const [selectedSessionDetail, setSelectedSessionDetail] = useState(null)

  useEffect(() => {
    if (user) { fetchSessions(); fetchPRs(); fetchRunPRs(); checkStravaStatus(); loadCustomExercises(); fetchExerciseLibrary() }
  }, [user])

  // Deep link: ?exercise=<name> opens the exercise progression/history view directly.
  useEffect(() => {
    const exercise = searchParams.get('exercise')
    if (!exercise) return
    setView('overview')
    setSelectedExercise(exercise)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('exercise')
      return next
    }, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const sessionId = searchParams.get('session')
    const stravaActivity = searchParams.get('stravaActivity')
    if (!sessions.length || (!sessionId && !stravaActivity)) return

    const match = sessions.find(session => {
      if (sessionId && String(session.id) === String(sessionId)) return true
      if (stravaActivity && String(session.strava_id || '') === String(stravaActivity)) return true
      return false
    })

    if (match) {
      setView('overview')
      setExpandedSession(null)
      setSelectedSessionDetail(match)
      setSearchParams({}, { replace: true })
    }
  }, [sessions, searchParams, setSearchParams])

  async function loadCustomExercises() {
    const [settingsRes, historyRes] = await Promise.all([
      supabase.from('user_settings').select('goals').eq('user_id', user.id).maybeSingle(),
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

  function normalizeSlug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  function uniqueBySlugPreferOwn(rows) {
    const sorted = [...(rows || [])].sort((a, b) => {
      if (a.user_id && !b.user_id) return -1
      if (!a.user_id && b.user_id) return 1
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
    const seen = new Set()
    return sorted.filter(row => {
      const key = row.slug || normalizeSlug(row.name)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  async function fetchExerciseLibrary() {
    if (!user) return
    setLibraryLoading(true)
    const [exerciseRes, muscleRes, aliasRes] = await Promise.all([
      supabase.from('exercise_library_with_muscles').select('*').order('category').order('name'),
      supabase.from('muscle_groups').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('exercise_aliases').select('id, exercise_id, alias, slug').order('alias'),
    ])

    const visibleExercises = uniqueBySlugPreferOwn(exerciseRes.data || [])
    const aliasMap = {}
    for (const alias of aliasRes.data || []) {
      if (!aliasMap[alias.exercise_id]) aliasMap[alias.exercise_id] = []
      aliasMap[alias.exercise_id].push(alias)
    }

    setLibraryExercises(visibleExercises)
    setMuscleGroups(muscleRes.data || [])
    setExerciseAliases(aliasMap)
    setLibraryLoading(false)
  }

  function openLibraryExercise(exercise) {
    const aliases = exerciseAliases[exercise.id] || []
    setEditingLibraryExercise({
      ...exercise,
      original_id: exercise.id,
      original_user_id: exercise.user_id,
      name: exercise.name || '',
      slug: exercise.slug || normalizeSlug(exercise.name),
      category: exercise.category || '',
      equipment: exercise.equipment || '',
      measurement_type: exercise.measurement_type || 'weight_reps',
      is_bodyweight: !!exercise.is_bodyweight,
      is_active: exercise.is_active !== false,
      notes: exercise.notes || '',
      primaryMuscleIds: (exercise.muscles || []).filter(m => m.role === 'primary').map(m => m.muscle_id),
      secondaryMuscleIds: (exercise.muscles || []).filter(m => m.role === 'secondary').map(m => m.muscle_id),
      aliasText: aliases.map(a => a.alias).join(', '),
    })
  }

  function updateEditingLibraryExercise(field, value) {
    setEditingLibraryExercise(prev => {
      if (!prev) return prev
      const next = { ...prev, [field]: value }
      if (field === 'name') next.slug = normalizeSlug(value)
      return next
    })
  }

  function toggleMuscleInEditor(role, muscleId) {
    setEditingLibraryExercise(prev => {
      if (!prev) return prev
      const primary = new Set(prev.primaryMuscleIds || [])
      const secondary = new Set(prev.secondaryMuscleIds || [])
      if (role === 'primary') {
        primary.has(muscleId) ? primary.delete(muscleId) : primary.add(muscleId)
        secondary.delete(muscleId)
      } else {
        secondary.has(muscleId) ? secondary.delete(muscleId) : secondary.add(muscleId)
        primary.delete(muscleId)
      }
      return { ...prev, primaryMuscleIds: [...primary], secondaryMuscleIds: [...secondary] }
    })
  }

  async function ensureOwnExerciseFromEditor(editor) {
    if (editor.original_user_id) return editor.original_id

    // Global/default exercises are read-only. Create a user-owned override and migrate this user's old sets/PRs to it.
    const payload = {
      user_id: user.id,
      name: editor.name,
      slug: editor.slug || normalizeSlug(editor.name),
      category: editor.category || null,
      equipment: editor.equipment || null,
      measurement_type: editor.measurement_type || 'weight_reps',
      is_bodyweight: !!editor.is_bodyweight,
      is_active: editor.is_active !== false,
      notes: editor.notes || null,
    }

    const { data: own, error } = await supabase
      .from('exercise_library')
      .upsert(payload, { onConflict: 'user_id,slug' })
      .select()
      .single()

    if (error) throw error

    await supabase
      .from('training_exercises')
      .update({ exercise_id: own.id, exercise_name: own.name })
      .eq('exercise_id', editor.original_id)

    await supabase
      .from('personal_records')
      .update({ exercise_id: own.id, exercise_name: own.name })
      .eq('user_id', user.id)
      .eq('exercise_id', editor.original_id)

    return own.id
  }

  async function saveLibraryExercise() {
    if (!editingLibraryExercise || !editingLibraryExercise.name.trim()) return
    setSavingLibraryExercise(true)
    try {
      const editor = {
        ...editingLibraryExercise,
        slug: editingLibraryExercise.slug || normalizeSlug(editingLibraryExercise.name),
      }
      const exerciseId = await ensureOwnExerciseFromEditor(editor)

      if (editor.original_user_id) {
        await supabase.from('exercise_library').update({
          name: editor.name,
          slug: editor.slug,
          category: editor.category || null,
          equipment: editor.equipment || null,
          measurement_type: editor.measurement_type || 'weight_reps',
          is_bodyweight: !!editor.is_bodyweight,
          is_active: editor.is_active !== false,
          notes: editor.notes || null,
        }).eq('id', exerciseId)

        await supabase.from('training_exercises').update({ exercise_name: editor.name }).eq('exercise_id', exerciseId)
        await supabase.from('personal_records').update({ exercise_name: editor.name }).eq('user_id', user.id).eq('exercise_id', exerciseId)
      }

      await supabase.from('exercise_muscles').delete().eq('exercise_id', exerciseId)
      const muscleRows = [
        ...(editor.primaryMuscleIds || []).map(id => ({ exercise_id: exerciseId, muscle_group_id: id, role: 'primary', load_factor: 1.0 })),
        ...(editor.secondaryMuscleIds || []).map(id => ({ exercise_id: exerciseId, muscle_group_id: id, role: 'secondary', load_factor: 0.5 })),
      ]
      if (muscleRows.length) await supabase.from('exercise_muscles').insert(muscleRows)

      await supabase.from('exercise_aliases').delete().eq('exercise_id', exerciseId)
      const aliasRows = [...new Set(String(editor.aliasText || '').split(',').map(a => a.trim()).filter(Boolean))]
        .filter(alias => alias.toLowerCase() !== editor.name.toLowerCase())
        .map(alias => ({ exercise_id: exerciseId, alias, slug: normalizeSlug(alias) }))
      if (aliasRows.length) await supabase.from('exercise_aliases').insert(aliasRows)

      setEditingLibraryExercise(null)
      await Promise.all([fetchExerciseLibrary(), fetchSessions(), fetchPRs()])
    } catch (error) {
      console.error(error)
      toast({ message: 'Kunde inte spara övningen — kontrollera dubletter', type: 'error' })
    }
    setSavingLibraryExercise(false)
  }

  async function saveCustomExercise(name) {
    const { data } = await supabase.from('user_settings').select('goals').eq('user_id', user.id).maybeSingle()
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

  function findLibraryExerciseByName(name) {
    const normalized = normalizeSlug(name)
    return libraryExercises.find(e => e.slug === normalized || normalizeSlug(e.name) === normalized)
  }

  async function saveEditSession() {
    if (!editingSession) return
    const { id, date, sessionType, feeling, notes, exercises } = editingSession
    await supabase.from('training_sessions').update({ date, session_type: sessionType, feeling: feeling ? parseInt(feeling) : null, notes: notes || null }).eq('id', id)
    await supabase.from('training_exercises').delete().eq('session_id', id)
    const rows = exercises.flatMap((ex, _) => ex.sets.map((s, si) => ({ session_id: id, exercise_id: findLibraryExerciseByName(ex.name)?.id || null, exercise_name: ex.name, set_number: si + 1, reps: s.reps ? parseInt(s.reps) : null, weight_kg: s.weight !== '' ? parseFloat(s.weight) : null, is_dropset: s.is_dropset || false }))).filter(r => r.exercise_name)
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
    // Optimistic removal
    setSessions(prev => prev.filter(s => s.id !== id))
    let undone = false
    const tid = toast({
      message: 'Pass borttaget',
      duration: 5000,
      action: {
        label: 'Ångra',
        onClick: () => { undone = true; fetchSessions() },
      },
    })
    setTimeout(() => {
      if (!undone) supabase.from('training_sessions').delete().eq('id', id)
    }, 5000)
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

    // Strength PBs only. Running best efforts live in run_personal_records.
    const runRecordNames = new Set([
      '400m pr', '800m pr', '1 mile pr', '2 mile pr', 'mara pr',
      '1km pr', '1 km pr', '1k pr',
      '5km pr', '5 km pr', '5k pr',
      '10km pr', '10 km pr', '10k pr',
      'halvmara pr', 'half marathon pr', 'halvmaraton pr', '1/2 marathon pr',
    ])

    setPrs((data || []).filter(pr => {
      const name = String(pr.exercise_name || '').trim().toLowerCase()
      return !runRecordNames.has(name) &&
        pr.distance_km == null &&
        pr.pace_per_km == null &&
        !(pr.time_seconds != null && pr.weight_kg == null)
    }))
  }

  async function fetchRunPRs() {
    const { data } = await supabase
      .from('run_personal_records')
      .select('distance_key,label,distance_km,time_seconds,pace_per_km,date,strava_activity_id,strava_effort_name,source')
      .eq('user_id', user.id)
      .order('date', { ascending: false })

    setRunEfforts(data || [])

    const keyByLabel = {
      '1 km': '1k',
      '5 km': '5k',
      '10 km': '10k',
      'Halvmaraton': 'half_marathon',
    }

    const bests = RUN_PR_DISTANCES.map(({ label }) => {
      const key = keyByLabel[label]
      const efforts = (data || []).filter(r => r.distance_key === key && r.time_seconds)
      if (!efforts.length) return { label, time: null, date: null }

      const best = efforts.reduce((a, b) =>
        Number(a.time_seconds) < Number(b.time_seconds) ? a : b
      )

      return {
        label,
        time: Number(best.time_seconds),
        date: best.date,
        activityId: best.strava_activity_id,
        effortName: best.strava_effort_name,
      }
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
          exercise_id: findLibraryExerciseByName(ex.name)?.id || null,
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
        if (!ex.name?.trim()) continue
        const isBWex = BW_EXERCISES.has(ex.name.toLowerCase().trim())
        const maxReps = Math.max(...ex.sets.map(s => parseInt(s.reps) || 0))
        const maxWeight = Math.max(...ex.sets.map(s => parseFloat(s.weight) || 0))

        // Always fetch current PR from DB to avoid stale local state
        const { data: existingRows } = await supabase
          .from('personal_records')
          .select('*')
          .eq('user_id', user.id)
          .eq('exercise_name', ex.name)
          .limit(1)
        const existingPR = existingRows?.[0] || null

        if (isBWex && maxReps > 0) {
          let bestSet = null
          for (const s of ex.sets) {
            const w = parseFloat(s.weight) || 0
            const r = parseInt(s.reps) || 0
            if (!r) continue
            if (!bestSet || (r * (1 + w / 30)) > (bestSet.r * (1 + bestSet.w / 30))) {
              bestSet = { r, w }
            }
          }
          if (!bestSet) continue
          const existingReps = existingPR?.reps || 0
          const existingWeight = existingPR?.weight_kg || 0
          const isNewPR = !existingPR || (bestSet.r * (1 + bestSet.w / 30)) > (existingReps * (1 + existingWeight / 30))
          if (isNewPR) {
            const payload = {
              user_id: user.id,
              exercise_id: findLibraryExerciseByName(ex.name)?.id || null,
              exercise_name: ex.name,
              weight_kg: bestSet.w,
              reps: bestSet.r,
              date: sessionDate,
            }
            const { error: prError } = existingPR
              ? await supabase.from('personal_records').update(payload).eq('user_id', user.id).eq('exercise_name', ex.name)
              : await supabase.from('personal_records').insert(payload)
            if (prError) console.error('PR save error (BW):', ex.name, prError)
          }
        } else if (!isBWex && maxWeight > 0) {
          const bestSet = ex.sets.reduce((best, s) => {
            const w = parseFloat(s.weight) || 0
            const r = parseInt(s.reps) || 1
            return (w * (1 + r / 30)) > ((parseFloat(best.weight) || 0) * (1 + (parseInt(best.reps) || 1) / 30)) ? s : best
          }, ex.sets[0])
          const bestWeight = parseFloat(bestSet?.weight) || 0
          const bestReps = parseInt(bestSet?.reps) || 1
          const isNewPR = !existingPR || bestWeight > (existingPR.weight_kg || 0)
          if (isNewPR) {
            const payload = {
              user_id: user.id,
              exercise_id: findLibraryExerciseByName(ex.name)?.id || null,
              exercise_name: ex.name,
              weight_kg: bestWeight,
              reps: bestReps,
              date: sessionDate,
            }
            const { error: prError } = existingPR
              ? await supabase.from('personal_records').update(payload).eq('user_id', user.id).eq('exercise_name', ex.name)
              : await supabase.from('personal_records').insert(payload)
            if (prError) console.error('PR save error (strength):', ex.name, prError)
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
      .from('daily_scores').select('*').eq('user_id', user.id).eq('date', dateStr).maybeSingle()

    if (existing) {
      await supabase.from('daily_scores').update({ score_training: score }).eq('id', existing.id)
    } else {
      await supabase.from('daily_scores').insert({ user_id: user.id, date: dateStr, score_training: score })
    }
  }


  function getSessionTitle(session) {
    if (!session) return 'Pass'
    if (session.session_type === 'gym') return 'Styrkepass'
    if (session.session_type === 'run') return `Löpning${session.distance_km ? ` ${Number(session.distance_km).toFixed(1)} km` : ''}`
    return session.notes?.split(' — ')[0] || 'Aktivitet'
  }

  function getSessionRunEfforts(session) {
    if (!session || session.session_type !== 'run') return []
    const byActivity = runEfforts.filter(e =>
      session.strava_id && String(e.strava_activity_id) === String(session.strava_id)
    )
    const source = byActivity.length
      ? byActivity
      : runEfforts.filter(e => e.date === session.date)

    const order = { '1k': 1, '5k': 2, '10k': 3, 'half_marathon': 4 }
    return source
      .filter(e => ['1k', '5k', '10k', 'half_marathon'].includes(e.distance_key))
      .sort((a, b) => (order[a.distance_key] || 99) - (order[b.distance_key] || 99))
  }

  function groupSessionExercises(session) {
    const rows = session?.training_exercises || []
    return Object.entries(rows.reduce((acc, ex) => {
      const key = ex.exercise_name || 'Okänd övning'
      if (!acc[key]) acc[key] = []
      acc[key].push(ex)
      return acc
    }, {})).map(([name, sets]) => ({
      name,
      sets: sets.sort((a, b) => (a.set_number || 0) - (b.set_number || 0)),
      exerciseId: sets.find(s => s.exercise_id)?.exercise_id || null,
    }))
  }

  function getSessionMuscles(session) {
    const groups = groupSessionExercises(session)
    const byExerciseId = new Map(libraryExercises.map(e => [e.id, e]))
    const byName = new Map(libraryExercises.map(e => [String(e.name || '').toLowerCase(), e]))
    const muscles = new Map()

    groups.forEach(group => {
      const lib = (group.exerciseId && byExerciseId.get(group.exerciseId)) || byName.get(group.name.toLowerCase())
      ;(lib?.muscles || []).forEach(m => {
        const key = m.muscle_slug || m.muscle_name
        if (!key) return
        const prev = muscles.get(key)
        if (!prev || prev.role !== 'primary') {
          muscles.set(key, { name: m.muscle_name, role: m.role })
        }
      })
    })

    return Array.from(muscles.values()).sort((a, b) => {
      if (a.role === b.role) return a.name.localeCompare(b.name)
      return a.role === 'primary' ? -1 : 1
    })
  }


  function estimateOneRm(weight, reps) {
    const w = Number(weight)
    const r = Number(reps)
    if (!w || !r || w <= 0 || r <= 0) return null
    // Epley with a cap: high-rep sets should not fake huge strength jumps.
    // 1-12 reps are useful for strength trend; >12 still counts as 12.
    const cappedReps = Math.min(r, 12)
    return w * (1 + cappedReps / 30)
  }

  function getProgressiveOverloadData() {
    const today = new Date()
    const recentStart = format(subDays(today, 30), 'yyyy-MM-dd')
    const previousStart = format(subDays(today, 60), 'yyyy-MM-dd')
    const byExerciseId = new Map(libraryExercises.map(e => [e.id, e]))
    const byName = new Map(libraryExercises.map(e => [String(e.name || '').toLowerCase(), e]))

    const emptyPeriod = () => ({ bestE1rm: null, volume: 0, sets: 0, reps: 0, sessions: new Set(), date: null })
    const exerciseMap = new Map()
    const muscleMap = new Map()

    const getExerciseEntry = (key, name) => {
      if (!exerciseMap.has(key)) exerciseMap.set(key, { key, name, recent: emptyPeriod(), previous: emptyPeriod() })
      return exerciseMap.get(key)
    }

    const addToPeriod = (period, session, set) => {
      const e1rm = estimateOneRm(set.weight_kg, set.reps)
      const volume = (Number(set.weight_kg) || 0) * (Number(set.reps) || 0)
      period.volume += volume
      period.reps += Number(set.reps) || 0
      period.sets += set.reps ? 1 : 0
      period.sessions.add(session.id)
      if (e1rm && (!period.bestE1rm || e1rm > period.bestE1rm)) {
        period.bestE1rm = e1rm
        period.date = session.date
      }
    }

    sessions
      .filter(s => s.session_type === 'gym' && s.date >= previousStart)
      .forEach(session => {
        const periodKey = session.date >= recentStart ? 'recent' : 'previous'
        ;(session.training_exercises || []).forEach(set => {
          const lib = (set.exercise_id && byExerciseId.get(set.exercise_id)) || byName.get(String(set.exercise_name || '').toLowerCase())
          const key = set.exercise_id || String(set.exercise_name || '').toLowerCase()
          if (!key) return
          const entry = getExerciseEntry(key, lib?.name || set.exercise_name || 'Okänd övning')
          addToPeriod(entry[periodKey], session, set)

          const volume = (Number(set.weight_kg) || 0) * (Number(set.reps) || 0)
          ;(lib?.muscles || []).forEach(m => {
            const muscleKey = m.muscle_slug || m.muscle_name
            if (!muscleKey) return
            const prev = muscleMap.get(muscleKey) || { name: m.muscle_name, effectiveSets: 0, directSets: 0, primarySets: 0 }
            const factor = Number(m.load_factor) || (m.role === 'primary' ? 1 : 0.5)
            if (set.reps) {
              prev.effectiveSets += factor
              prev.directSets += 1
              if (m.role === 'primary') prev.primarySets += 1
            }
            muscleMap.set(muscleKey, prev)
          })
        })
      })

    const exerciseTrends = Array.from(exerciseMap.values())
      .map(entry => {
        const recentBest = entry.recent.bestE1rm
        const previousBest = entry.previous.bestE1rm
        const pct = recentBest && previousBest ? ((recentBest - previousBest) / previousBest) * 100 : null
        const recentVolume = entry.recent.volume
        const previousVolume = entry.previous.volume
        const volumePct = previousVolume > 0 ? ((recentVolume - previousVolume) / previousVolume) * 100 : null
        return { ...entry, recentBest, previousBest, pct, recentVolume, previousVolume, volumePct }
      })
      .filter(e => e.recent.sets > 0 || e.previous.sets > 0)

    const improving = exerciseTrends
      .filter(e => e.pct !== null)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4)
    const newOrRecent = exerciseTrends
      .filter(e => e.pct === null && e.recentBest)
      .sort((a, b) => (b.recentBest || 0) - (a.recentBest || 0))
      .slice(0, Math.max(0, 4 - improving.length))
    const displayExercises = [...improving, ...newOrRecent]

    const recentTotalVolume = exerciseTrends.reduce((sum, e) => sum + e.recentVolume, 0)
    const previousTotalVolume = exerciseTrends.reduce((sum, e) => sum + e.previousVolume, 0)
    const totalVolumePct = previousTotalVolume > 0 ? ((recentTotalVolume - previousTotalVolume) / previousTotalVolume) * 100 : null
    const avgStrengthPct = exerciseTrends.filter(e => e.pct !== null).length
      ? exerciseTrends.filter(e => e.pct !== null).reduce((sum, e) => sum + e.pct, 0) / exerciseTrends.filter(e => e.pct !== null).length
      : null

    return {
      displayExercises,
      muscleVolume: Array.from(muscleMap.values()).sort((a, b) => b.effectiveSets - a.effectiveSets).slice(0, 6),
      recentTotalVolume,
      previousTotalVolume,
      totalVolumePct,
      avgStrengthPct,
      recentStart,
      previousStart,
    }
  }

  function trendColor(value) {
    if (value == null) return 'var(--muted)'
    if (value > 2) return '#10b981'
    if (value < -2) return '#ef4444'
    return '#f59e0b'
  }

  function formatTrendPct(value) {
    if (value == null) return 'ny data'
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  function openSessionDetail(session) {
    setExpandedSession(null)
    setSelectedSessionDetail(session)
  }

  function openRunEffortSource(effort) {
    const match = sessions.find(session =>
      session.session_type === 'run' && (
        (effort.strava_activity_id && String(session.strava_id || '') === String(effort.strava_activity_id)) ||
        (!effort.strava_activity_id && session.date === effort.date)
      )
    )

    if (match) {
      setShowAllPrModal(false)
      setShowRunPrModal(false)
      openSessionDetail(match)
      return
    }

    setShowAllPrModal(false)
    setShowRunPrModal(false)
    setShowRunModal(true)
  }

  const recentSessions = useMemo(() => sessions.slice(0, 10), [sessions])

  const thisWeekSessions = useMemo(() => {
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    return sessions.filter(s => s.date >= weekStart)
  }, [sessions])

  const progressive = useMemo(() => getProgressiveOverloadData(), [sessions, libraryExercises]) // eslint-disable-line react-hooks/exhaustive-deps

  const runKeyLabels = {
    '1k': '1 km',
    '5k': '5 km',
    '10k': '10 km',
    'half_marathon': 'Halvmaraton',
  }

  const prSearch = allPrSearch.trim().toLowerCase()

  const filteredStrengthPrs = useMemo(() => [...prs]
    .filter(pr => !prSearch || String(pr.exercise_name || '').toLowerCase().includes(prSearch))
    .sort((a, b) => {
      if (allPrSort === 'name') return String(a.exercise_name || '').localeCompare(String(b.exercise_name || ''))
      if (allPrSort === 'value') return Number(b.weight_kg || 0) - Number(a.weight_kg || 0)
      return String(b.date || '').localeCompare(String(a.date || ''))
    }), [prs, prSearch, allPrSort])

  const featuredStrengthPrs = useMemo(() => FEATURED_STRENGTH_PBS.map(feature => ({
    ...feature,
    pr: prs.find(pr => {
      const name = String(pr.exercise_name || '').trim().toLowerCase()
      return feature.aliases.some(alias => name === alias || name.includes(alias))
    }) || null,
  })), [prs])

  const filteredRunEfforts = useMemo(() => [...runEfforts]
    .filter(effort => {
      const label = runKeyLabels[effort.distance_key] || effort.label || effort.distance_key
      return !prSearch || String(label || '').toLowerCase().includes(prSearch) || String(effort.date || '').includes(prSearch)
    })
    .sort((a, b) => {
      if (allPrSort === 'name') return String(runKeyLabels[a.distance_key] || a.label || '').localeCompare(String(runKeyLabels[b.distance_key] || b.label || ''))
      if (allPrSort === 'value') return Number(a.time_seconds || 999999999) - Number(b.time_seconds || 999999999)
      return String(b.date || '').localeCompare(String(a.date || ''))
    }), [runEfforts, prSearch, allPrSort])

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
              {fetchingPrs ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Synkar PBn...</> : '🏅 Synka PBn'}
            </button>
            </>
          ) : (
            <button onClick={connectStrava} className="btn btn-ghost" style={{ color: '#fc4c02', borderColor: 'rgba(252,76,2,0.20)', background: 'rgba(252,76,2,0.06)' }}>
              <Link size={13} /> Koppla Strava
            </button>
          )}
          <button onClick={() => csvRef.current?.click()} disabled={csvImporting} className="btn btn-ghost">
            {csvImporting ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Importerar...</> : <><Upload size={13} /> Importera</>}
          </button>
          <button onClick={() => setView(view === 'library' ? 'overview' : 'library')} className="btn btn-ghost">
            <Library size={14} /> {view === 'library' ? 'Översikt' : 'Övningar'}
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
      <div className="mx-content-edge" style={{ padding: '16px 16px 0', width: '100%', maxWidth: 'none', margin: '0' }}>

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
          {/* Week overview — cohesive stat strip */}
          <div className="hl-strip" style={{ marginBottom: '16px' }}>
            <div className="hl-shero" style={{ minWidth: '300px', flex: '1 1 320px' }}>
              <div className="hl-shero-main" style={{ minWidth: '64px' }}>
                <span className="hl-shero-cap">Denna vecka</span>
                <span className="hl-shero-num" style={{ color: '#fff' }}>{thisWeekSessions.length}<span className="u">pass</span></span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}><WeekBar sessions={sessions} /></div>
            </div>
            <div className="hl-sstats">
              <div className="hl-sstat" style={{ '--hl-c': '#3b82f6' }}>
                <span className="hl-sstat-cap"><i className="dot" /> Total tid</span>
                <span className="hl-sstat-num">
                  {thisWeekSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0)}<span className="u">min</span>
                </span>
              </div>
              <div className="hl-sstat" style={{ '--hl-c': '#10b981' }}>
                <span className="hl-sstat-cap"><i className="dot" /> Km löpt</span>
                <span className="hl-sstat-num">
                  {thisWeekSessions.filter(s => s.session_type === 'run').reduce((sum, s) => sum + (s.distance_km || 0), 0).toFixed(1)}<span className="u">km</span>
                </span>
              </div>
            </div>
          </div>

          {/* Main training analysis layout */}
          <div className="training-v2-grid mob-1col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: '16px', alignItems: 'start', marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
              {/* Progressive overload */}
              <div className="card" style={{ minHeight: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <TrendingUp size={13} color="var(--accent)" /> PROGRESSIVE OVERLOAD · 60 DAGAR
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted2)', marginTop: '4px', maxWidth: '680px' }}>
                      Styrketrend = bästa e1RM senaste 30d jämfört med 30d före. Muskelvolym mäts som effektiva set, där primära muskler väger tyngre än sekundära.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <div className="glass-pill" style={{ color: trendColor(progressive.avgStrengthPct), borderColor: progressive.avgStrengthPct && progressive.avgStrengthPct > 2 ? 'rgba(16,185,129,0.25)' : 'var(--border)' }}>
                      e1RM {formatTrendPct(progressive.avgStrengthPct)}
                    </div>
                    <div className="glass-pill" style={{ color: trendColor(progressive.totalVolumePct), borderColor: progressive.totalVolumePct && progressive.totalVolumePct > 2 ? 'rgba(16,185,129,0.25)' : 'var(--border)' }}>
                      Arbetsvolym {formatTrendPct(progressive.totalVolumePct)}
                    </div>
                  </div>
                </div>

                {progressive.displayExercises.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {progressive.displayExercises.map(ex => (
                        <button key={ex.key} onClick={() => setSelectedExercise(ex.name)} className="card-sm" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 750, color: 'var(--text)' }}>{ex.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
                              {ex.previousBest ? `${Math.round(ex.previousBest)} → ${Math.round(ex.recentBest)} kg e1RM` : `Ny/återupptagen · ${Math.round(ex.recentBest || 0)} kg e1RM`}
                            </div>
                          </div>
                          <div className="mono" style={{ color: trendColor(ex.pct), fontSize: '14px', fontWeight: 800 }}>
                            {formatTrendPct(ex.pct)}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="card-sm" style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline', marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.08em' }}>MUSKELVOLYM 60D</div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>effektiva set</div>
                      </div>
                      {progressive.muscleVolume.length ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {progressive.muscleVolume.map(m => {
                            const maxSets = Math.max(...progressive.muscleVolume.map(x => x.effectiveSets), 1)
                            const width = Math.max(6, Math.round((m.effectiveSets / maxSets) * 100))
                            return (
                              <div key={m.name}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px', marginBottom: '4px' }}>
                                  <span style={{ color: 'var(--muted2)' }}>{m.name}</span>
                                  <span className="mono" style={{ color: 'var(--text)', fontWeight: 700 }}>{m.effectiveSets.toFixed(m.effectiveSets % 1 ? 1 : 0)} set</span>
                                </div>
                                <div className="ek-cat-track">
                                  <div className="ek-cat-fill" style={{ width: `${width}%`, '--ek-c': '#10b981', background: 'linear-gradient(90deg, var(--accent), #10b981)' }} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Logga fler styrkeset för muskelvolym.</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="card-sm" style={{ color: 'var(--muted)', fontSize: '13px' }}>
                    Behöver minst ett styrkepass senaste 60 dagarna för att visa overload.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
              {/* Strength PRs */}
              <div className="card">
                <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Trophy size={12} color="#f59e0b" /> STYRKA — PERSONLIGA REKORD
                </div>
                <div className="pr-grid-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                  {featuredStrengthPrs.map(({ label, pr }) => (
                    <div key={label} className="card-sm" onClick={() => pr && setSelectedExercise(pr.exercise_name)}
                      style={{ cursor: pr ? 'pointer' : 'default', opacity: pr ? 1 : 0.62 }}
                      onMouseEnter={e => { if (pr) e.currentTarget.style.borderColor = 'var(--accent-border)' }}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
                      {pr ? (
                        <>
                          {BW_EXERCISES.has(String(pr.exercise_name || '').toLowerCase().trim()) ? (
                            <div className="mono" style={{ fontSize: '18px', fontWeight: '600', color: '#f59e0b' }}>
                              {pr.reps ?? '—'}<span style={{ fontSize: '11px', color: 'var(--muted)' }}> reps</span>
                              {pr.weight_kg > 0 && <span style={{ fontSize: '13px', color: 'var(--muted)' }}> +{pr.weight_kg}kg</span>}
                            </div>
                          ) : (
                            <div className="mono" style={{ fontSize: '18px', fontWeight: '600', color: '#f59e0b' }}>
                              {pr.weight_kg}<span style={{ fontSize: '11px', color: 'var(--muted)' }}>kg</span>
                            </div>
                          )}
                          {pr.date && <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{format(new Date(pr.date), 'd MMM yyyy', { locale: sv })}</div>}
                          <div style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <TrendingUp size={10} /> Se historik
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Saknas</div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowStrengthPrModal(true)}
                  className="btn btn-ghost"
                  style={{ marginTop: '10px', width: '100%', justifyContent: 'center' }}
                >
                  Se alla styrke-PBn →
                </button>
              </div>

              {/* Run PRs */}
              <div className="card">
                <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Trophy size={12} color="#10b981" /> LÖPNING — PERSONLIGA REKORD</span>
                  <button onClick={() => setShowRunPrModal(true)} style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    Se alla löp-PBn →
                  </button>
                </div>
                <div className="pr-grid-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                  {RUN_PR_DISTANCES.map(({ label }) => {
                    const pr = runPRs.find(r => r.label === label)
                    const hasTime = pr?.time
                    const sourceEffort = pr?.activityId ? runEfforts.find(e => String(e.strava_activity_id) === String(pr.activityId) && e.time_seconds === pr.time) : null
                    return (
                      <div key={label} className="card-sm" onClick={() => sourceEffort ? openRunEffortSource(sourceEffort) : setShowRunPrModal(true)}
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
                  const setCount = session.training_exercises?.length || 0
                  const primaryMuscles = getSessionMuscles(session).filter(m => m.role === 'primary').slice(0, 3)
                  return (
                    <button key={session.id} className="tr-sess" style={{ '--tr-c': typeInfo.color }} onClick={() => openSessionDetail(session)}>
                      <div className="tr-sess-ico"><Icon size={16} color={typeInfo.color} /></div>
                      <div className="tr-sess-mid">
                        <div className="tr-sess-title">{getSessionTitle(session)}</div>
                        <div className="tr-sess-meta">
                          {format(new Date(session.date), 'd MMM', { locale: sv })}
                          {session.duration_minutes ? ` · ${session.duration_minutes} min` : ''}
                          {session.pace_per_km ? ` · ${formatPace(session.pace_per_km)}/km` : ''}
                          {setCount ? ` · ${setCount} set` : ''}
                        </div>
                        {primaryMuscles.length > 0 && (
                          <div className="tr-sess-muscles">
                            {primaryMuscles.map(m => (
                              <span key={m.name} className="tr-sess-mtag">{m.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {session.feeling && (
                        <div className="tr-sess-feel" style={{ color: session.feeling >= 7 ? '#10b981' : session.feeling >= 5 ? '#f59e0b' : '#ef4444' }}>
                          {session.feeling}<span>/10</span>
                        </div>
                      )}
                      <ChevronRight size={15} className="tr-sess-chev" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'library' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.06em' }}>ÖVNINGSBIBLIOTEK</div>
                <div style={{ fontSize: '13px', color: 'var(--muted2)', marginTop: '4px' }}>
                  Redigera övningar, muskler och alias. Globala övningar sparas som din egen version när du ändrar dem.
                </div>
              </div>
              <button onClick={fetchExerciseLibrary} className="btn btn-ghost btn-sm" disabled={libraryLoading}>
                {libraryLoading ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />} Uppdatera
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input className="input" placeholder="Sök övning, kategori eller muskel..." value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} style={{ paddingLeft: '34px' }} />
            </div>
          </div>

          {libraryLoading ? (
            <div className="card" style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>Laddar övningsbibliotek...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {libraryExercises
                .filter(ex => {
                  const q = librarySearch.trim().toLowerCase()
                  if (!q) return true
                  const muscleText = (ex.muscles || []).map(m => `${m.muscle_name} ${m.role}`).join(' ').toLowerCase()
                  return `${ex.name} ${ex.category || ''} ${ex.equipment || ''} ${muscleText}`.toLowerCase().includes(q)
                })
                .map(ex => {
                  const primary = (ex.muscles || []).filter(m => m.role === 'primary').map(m => m.muscle_name)
                  const secondary = (ex.muscles || []).filter(m => m.role === 'secondary').map(m => m.muscle_name)
                  return (
                    <div key={ex.id} className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}>
                          <button onClick={() => setSelectedExercise(ex.name)} title="Visa progression" style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: '15px', fontWeight: '700', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '5px' }} className="tr-ex-name">{ex.name}<ChevronRight size={13} className="tr-ex-chev" /></button>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                            {ex.category || 'Okategori'}{ex.equipment ? ` · ${ex.equipment}` : ''}{ex.user_id ? ' · egen' : ' · standard'}
                          </div>
                        </div>
                        <button onClick={() => openLibraryExercise(ex)} className="btn btn-ghost btn-icon" title="Redigera övning">
                          <Edit3 size={13} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.06em', fontWeight: '700', marginBottom: '4px' }}>PRIMÄR</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            {primary.length ? primary.map(m => <span key={m} className="glass-pill" style={{ fontSize: '11px', padding: '2px 8px', color: '#10b981', borderColor: 'rgba(16,185,129,0.25)' }}>{m}</span>) : <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Saknas</span>}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.06em', fontWeight: '700', marginBottom: '4px' }}>SEKUNDÄR</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            {secondary.length ? secondary.map(m => <span key={m} className="glass-pill" style={{ fontSize: '11px', padding: '2px 8px' }}>{m}</span>) : <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Saknas</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {daySess.map(session => {
                          const TypeIcon = session.session_type === 'gym' ? Dumbbell : session.session_type === 'run' ? Timer : Flame
                          const typeColor = session.session_type === 'gym' ? '#3b82f6' : session.session_type === 'run' ? '#10b981' : '#f472b6'
                          const title = getSessionTitle(session)
                          const exerciseCount = session.training_exercises?.length || 0
                          const runEfforts = getSessionRunEfforts(session)

                          return (
                            <div key={session.id} style={{
                              padding: '12px',
                              borderRadius: '12px',
                              background: 'var(--surface2)',
                              border: '1px solid var(--border)',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: session.session_type === 'gym' && exerciseCount ? '10px' : '0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                  <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: `${typeColor}18`, border: `1px solid ${typeColor}35`, color: typeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <TypeIcon size={16} />
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                                      {session.session_type === 'gym' ? `${exerciseCount} set` : session.session_type === 'run' ? `${session.distance_km || '—'} km · ${formatDuration(session.time_seconds)}` : `${session.duration_minutes || 0} min`}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  onClick={() => openSessionDetail(session)}
                                  className="btn btn-primary btn-sm"
                                  style={{ flexShrink: 0 }}
                                >
                                  Öppna pass
                                </button>
                              </div>

                              {session.session_type === 'gym' && exerciseCount > 0 && (
                                <>
                                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '8px' }}>ÖVNINGAR — klicka för historik</div>
                                  {Object.entries(session.training_exercises.reduce((acc, ex) => {
                                    if (!acc[ex.exercise_name]) acc[ex.exercise_name] = []
                                    acc[ex.exercise_name].push(ex)
                                    return acc
                                  }, {})).slice(0, 4).map(([name, sets]) => (
                                    <div key={name} style={{ marginBottom: '8px' }}>
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
                                  {Object.keys(session.training_exercises.reduce((acc, ex) => ({ ...acc, [ex.exercise_name]: true }), {})).length > 4 && (
                                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                                      Fler övningar finns i passdetaljen.
                                    </div>
                                  )}
                                </>
                              )}

                              {session.session_type === 'run' && runEfforts.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                  {runEfforts.map(effort => (
                                    <span key={effort.id} className="glass-pill" style={{ fontSize: '11px', padding: '3px 8px', color: '#34d399', borderColor: 'rgba(52,211,153,0.25)' }}>
                                      {effort.label}: {formatDuration(effort.time_seconds)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
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
          <div className="traning-log-type-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '24px' }}>
            {SESSION_TYPES.map(type => {
              const Icon = type.icon
              return (
                <button
                  key={type.id}
                  onClick={() => setSessionType(type.id)}
                  style={{
                    position: 'relative',
                    padding: '16px 8px',
                    borderRadius: '14px',
                    border: `1px solid ${sessionType === type.id ? type.color : 'var(--border)'}`,
                    background: sessionType === type.id
                      ? `linear-gradient(165deg, ${type.color}22, ${type.color}0a)`
                      : 'var(--surface2)',
                    color: sessionType === type.id ? type.color : 'var(--muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: sessionType === type.id ? '750' : '550',
                    letterSpacing: '-0.01em',
                    boxShadow: sessionType === type.id
                      ? `0 8px 26px -10px ${type.color}aa, inset 0 1px 0 ${type.color}33`
                      : 'none',
                    transform: sessionType === type.id ? 'translateY(-2px)' : 'none',
                    transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                  onMouseEnter={e => { if (sessionType !== type.id) { e.currentTarget.style.borderColor = type.color + '88'; e.currentTarget.style.color = 'var(--text)' } }}
                  onMouseLeave={e => { if (sessionType !== type.id) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' } }}
                >
                  <Icon size={20} />
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
                <Modal onClose={() => setShowExercisePicker(false)} maxWidth={560} title="Välj övning">
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
                </Modal>
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

      {editingLibraryExercise && (
        <Modal onClose={() => setEditingLibraryExercise(null)} maxWidth={760} title="Redigera övning" subtitle={editingLibraryExercise.original_user_id ? 'Egen övning' : 'Standardövning — sparas som egen version vid ändring'}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Namn</label>
                <input className="input" value={editingLibraryExercise.name} onChange={e => updateEditingLibraryExercise('name', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Kategori</label>
                <input className="input" value={editingLibraryExercise.category} onChange={e => updateEditingLibraryExercise('category', e.target.value)} placeholder="Bröst, Rygg, Ben..." />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Utrustning</label>
                <input className="input" value={editingLibraryExercise.equipment} onChange={e => updateEditingLibraryExercise('equipment', e.target.value)} placeholder="Skivstång, hantlar, maskin..." />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Mätning</label>
                <select className="input" value={editingLibraryExercise.measurement_type} onChange={e => updateEditingLibraryExercise('measurement_type', e.target.value)}>
                  <option value="weight_reps">Vikt + reps</option>
                  <option value="bodyweight_reps">Kroppsvikt + reps</option>
                  <option value="time">Tid</option>
                  <option value="distance_time">Distans + tid</option>
                  <option value="reps_only">Endast reps</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <label className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={editingLibraryExercise.is_bodyweight} onChange={e => updateEditingLibraryExercise('is_bodyweight', e.target.checked)} />
                <span style={{ fontSize: '13px' }}>Kroppsviktsövning</span>
              </label>
              <label className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={editingLibraryExercise.is_active} onChange={e => updateEditingLibraryExercise('is_active', e.target.checked)} />
                <span style={{ fontSize: '13px' }}>Aktiv i biblioteket</span>
              </label>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Alias, separerade med kommatecken</label>
              <input className="input" value={editingLibraryExercise.aliasText} onChange={e => updateEditingLibraryExercise('aliasText', e.target.value)} placeholder="bench press, bänk, barbell bench" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              {[
                { role: 'primary', title: 'Primära muskler', ids: editingLibraryExercise.primaryMuscleIds || [], color: '#10b981' },
                { role: 'secondary', title: 'Sekundära muskler', ids: editingLibraryExercise.secondaryMuscleIds || [], color: 'var(--accent)' },
              ].map(section => (
                <div key={section.role} className="card-sm">
                  <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '700', letterSpacing: '0.06em', marginBottom: '10px' }}>{section.title}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {muscleGroups.map(muscle => {
                      const active = section.ids.includes(muscle.id)
                      return (
                        <button key={muscle.id} onClick={() => toggleMuscleInEditor(section.role, muscle.id)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px', border: active ? `1px solid ${section.color}` : '1px solid var(--border)',
                          background: active ? 'var(--accent-soft)' : 'var(--surface2)', color: active ? section.color : 'var(--muted2)',
                          borderRadius: '999px', padding: '5px 9px', fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif'
                        }}>
                          {active && <Check size={11} />} {muscle.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Anteckningar</label>
              <textarea className="input" rows={3} value={editingLibraryExercise.notes} onChange={e => updateEditingLibraryExercise('notes', e.target.value)} placeholder="Teknik, varianter, egna regler..." />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setEditingLibraryExercise(null)} className="btn btn-ghost">Avbryt</button>
              <button onClick={saveLibraryExercise} disabled={savingLibraryExercise} className="btn btn-primary">
                {savingLibraryExercise ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Save size={14} /> Spara övning</>}
              </button>
            </div>
        </Modal>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>


      {(showAllPrModal || showStrengthPrModal || showRunPrModal) && (
        <Modal onClose={() => { setShowAllPrModal(false); setShowStrengthPrModal(false); setShowRunPrModal(false) }} maxWidth={1040} bare>
          <div className="mx-modal-scroll" style={{ padding: 0 }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '24px', fontWeight: 850, letterSpacing: '-0.045em' }}>{showRunPrModal ? 'Alla löp-PBn' : showStrengthPrModal ? 'Alla styrke-PBn' : 'Alla PBn'}</div>
                <div style={{ fontSize: '13px', color: 'var(--muted2)', marginTop: '3px' }}>
                  {showRunPrModal ? 'Bästa per distans och alla importerade Strava best efforts. Klicka för källpass.' : showStrengthPrModal ? 'Alla styrkerekord. Klicka en övning för historik.' : 'Styrke-PB, löpbestar och alla importerade Strava best efforts. Klicka för historik eller källpass.'}
                </div>
              </div>
              <button onClick={() => { setShowAllPrModal(false); setShowStrengthPrModal(false); setShowRunPrModal(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="glass-pill" style={{ color: 'var(--muted2)' }}>
                  {showRunPrModal ? 'Löpning' : showStrengthPrModal ? 'Styrka' : 'Alla'}
                </div>
              </div>

              <div style={{ position: 'relative', minWidth: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input
                  className="input"
                  value={allPrSearch}
                  onChange={e => setAllPrSearch(e.target.value)}
                  placeholder="Sök PB..."
                  style={{ paddingLeft: '32px', height: '36px' }}
                />
              </div>

              <select className="input" value={allPrSort} onChange={e => setAllPrSort(e.target.value)} style={{ height: '36px', width: '145px' }}>
                <option value="date">Senaste</option>
                <option value="name">Namn</option>
                <option value="value">Bäst värde</option>
              </select>
            </div>

            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {(showStrengthPrModal || (!showRunPrModal && (allPrFilter === 'all' || allPrFilter === 'strength'))) && (
                <section>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 800, letterSpacing: '0.08em' }}>STYRKA — PERSONLIGA REKORD</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{filteredStrengthPrs.length} PBn</div>
                  </div>
                  {filteredStrengthPrs.length ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '9px' }}>
                      {filteredStrengthPrs.map(pr => (
                        <button
                          key={pr.id}
                          onClick={() => { setSelectedExercise(pr.exercise_name); setShowAllPrModal(false); setShowStrengthPrModal(false) }}
                          className="card-sm"
                          style={{ cursor: 'pointer', textAlign: 'left', minHeight: '92px' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        >
                          <div style={{ fontSize: '12px', color: 'var(--muted2)', marginBottom: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.exercise_name}</div>
                          <div className="mono" style={{ fontSize: '20px', fontWeight: 850, color: '#f59e0b' }}>{pr.weight_kg}<span style={{ fontSize: '11px', color: 'var(--muted)' }}>kg</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{pr.date ? format(new Date(pr.date), 'd MMM yyyy', { locale: sv }) : 'Datum saknas'}</span>
                            <span style={{ fontSize: '10px', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><TrendingUp size={10} /> Historik</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="card-sm" style={{ color: 'var(--muted)' }}>Inga styrke-PB matchar filtret.</div>
                  )}
                </section>
              )}

              {(showRunPrModal || (!showStrengthPrModal && (allPrFilter === 'all' || allPrFilter === 'run'))) && (
                <section>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 800, letterSpacing: '0.08em' }}>LÖPNING — BÄSTA PER DISTANS</div>
                    <button onClick={() => { setShowRunModal(true); setShowAllPrModal(false); setShowRunPrModal(false) }} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '11px' }}>All löphistorik →</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '9px', marginBottom: '14px' }}>
                    {RUN_PR_DISTANCES.map(({ label }) => {
                      const pr = runPRs.find(r => r.label === label)
                      const sourceEffort = pr?.activityId ? runEfforts.find(e => String(e.strava_activity_id) === String(pr.activityId) && e.time_seconds === pr.time) : null
                      return (
                        <button
                          key={label}
                          onClick={() => sourceEffort ? openRunEffortSource(sourceEffort) : setShowRunModal(true)}
                          className="card-sm"
                          style={{ cursor: 'pointer', textAlign: 'left', minHeight: '92px' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        >
                          <div style={{ fontSize: '12px', color: 'var(--muted2)', marginBottom: '5px' }}>{label}</div>
                          {pr?.time ? (
                            <>
                              <div className="mono" style={{ fontSize: '20px', fontWeight: 850, color: '#10b981' }}>{formatDuration(pr.time)}</div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{format(new Date(pr.date), 'd MMM yyyy', { locale: sv })}</span>
                                <span style={{ fontSize: '10px', color: 'var(--accent)' }}>Källpass ↗</span>
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Ej loggat</div>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: '10px' }}>ALLA STRAVA BEST EFFORTS</div>
                  {filteredRunEfforts.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      {filteredRunEfforts.slice(0, 80).map((effort, idx) => {
                        const label = runKeyLabels[effort.distance_key] || effort.label || effort.distance_key
                        return (
                          <button
                            key={`${effort.strava_activity_id || effort.date}-${effort.distance_key}-${idx}`}
                            onClick={() => openRunEffortSource(effort)}
                            className="card-sm"
                            style={{ cursor: 'pointer', textAlign: 'left', display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '12px', alignItems: 'center', padding: '10px 12px' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 750, color: 'var(--text)' }}>{label}</div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{effort.strava_activity_id ? `Strava #${effort.strava_activity_id}` : 'Strava best effort'}</div>
                            </div>
                            <div className="mono" style={{ fontSize: '14px', fontWeight: 850, color: '#10b981' }}>{formatDuration(Number(effort.time_seconds || 0))}</div>
                            <div style={{ fontSize: '11px', color: 'var(--muted2)' }}>{effort.date ? format(new Date(effort.date), 'd MMM yyyy', { locale: sv }) : '—'}</div>
                            <div style={{ fontSize: '11px', color: 'var(--accent)', whiteSpace: 'nowrap' }}>Öppna pass ↗</div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="card-sm" style={{ color: 'var(--muted)' }}>Inga löp-best-efforts matchar filtret.</div>
                  )}
                </section>
              )}
            </div>
          </div>
        </Modal>
      )}

      {selectedSessionDetail && (
        <Modal onClose={() => setSelectedSessionDetail(null)} maxWidth={760} bare>
            {(() => {
              const session = selectedSessionDetail
              const typeInfo = SESSION_TYPES.find(t => t.id === session.session_type) || SESSION_TYPES[3]
              const Icon = typeInfo.icon
              const exerciseGroups = groupSessionExercises(session)
              const efforts = getSessionRunEfforts(session)
              const muscles = getSessionMuscles(session)
              const totalSets = exerciseGroups.reduce((sum, group) => sum + group.sets.length, 0)
              const totalVolume = exerciseGroups.reduce((sum, group) => (
                sum + group.sets.reduce((setSum, s) => setSum + (Number(s.reps || 0) * Number(s.weight_kg || 0)), 0)
              ), 0)

              return (
                <>
                  <div className="mx-em-head" style={{ '--em-c': typeInfo.color }}>
                    <div className="mx-em-top">
                      <div className="mx-em-ico"><Icon size={22} /></div>
                      <div style={{ minWidth: 0 }}>
                        <div className="mx-em-title">{getSessionTitle(session)}</div>
                        <div className="mx-em-sub">
                          {format(new Date(session.date), 'EEEE d MMMM yyyy', { locale: sv })}
                          {session.source && ` · ${session.source}`}
                          {session.strava_id && ` · Strava #${session.strava_id}`}
                        </div>
                      </div>
                      <button className="mx-em-close" onClick={() => setSelectedSessionDetail(null)} aria-label="Stäng">
                        <X size={18} />
                      </button>
                    </div>
                    <div className="mx-em-stats">
                      <span className="mx-em-pill"><b>{typeInfo.label}</b></span>
                      <span className="mx-em-pill"><b>{session.duration_minutes ? `${session.duration_minutes} min` : session.time_seconds ? formatDuration(session.time_seconds) : '—'}</b> tid</span>
                      {session.feeling ? <span className="mx-em-pill"><b>{session.feeling}/10</b> känsla</span> : null}
                      <span className="mx-em-pill"><b>{session.session_type === 'gym' ? `${Math.round(totalVolume)} kg` : session.distance_km ? `${Number(session.distance_km).toFixed(1)} km` : '—'}</b> {session.session_type === 'gym' ? 'volym' : 'distans'}</span>
                    </div>
                  </div>

                  <div className="mx-modal-scroll" style={{ padding: '20px 22px 22px' }}>
                  {session.notes && (
                    <div className="card-sm" style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Anteckningar</div>
                      <div style={{ fontSize: '14px', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{session.notes}</div>
                    </div>
                  )}

                  {session.session_type === 'run' && (
                    <div className="card-sm" style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.08em' }}>STRAVA BEST EFFORTS</div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Källvärden från detta pass</div>
                        </div>
                      </div>

                      {efforts.length ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                          {efforts.map(effort => (
                            <div key={`${effort.distance_key}-${effort.id || effort.time_seconds}`} style={{ padding: '10px', borderRadius: '12px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{effort.label || effort.strava_effort_name}</div>
                              <div className="mono" style={{ fontSize: '18px', fontWeight: 800, color: '#10b981' }}>{formatDuration(Number(effort.time_seconds))}</div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{formatPace(Number(effort.pace_per_km))}/km</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--muted)', fontSize: '13px' }}>
                          Inga Strava best efforts hittades för detta pass.
                        </div>
                      )}
                    </div>
                  )}

                  {session.session_type === 'gym' && (
                    <>
                      <div className="card-sm" style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '12px' }}>
                          ÖVNINGAR · {exerciseGroups.length} övningar · {totalSets} set
                        </div>

                        {exerciseGroups.length ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {exerciseGroups.map(group => (
                              <div key={group.name} className="mx-logrow" style={{ '--lr-c': typeInfo.color }}>
                                <button onClick={() => setSelectedExercise(group.name)} style={{ background: 'none', border: 'none', padding: 0, marginBottom: '9px', color: 'var(--text)', fontSize: '14px', fontWeight: 800, letterSpacing: '-.02em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                  {group.name}
                                  <TrendingUp size={12} style={{ color: typeInfo.color }} />
                                </button>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {group.sets.map((s, i) => (
                                    <span key={s.id || i} className={`mono mx-set-chip ${s.is_dropset ? 'drop' : 'top'}`} style={!s.is_dropset ? { '--lr-c': typeInfo.color } : undefined}>
                                      {s.reps ?? '—'}×{s.weight_kg ?? '—'}kg{s.is_dropset ? ' ↓' : ''}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inga övningsrader hittades för detta pass.</div>
                        )}
                      </div>

                      {muscles.length > 0 && (
                        <div className="card-sm" style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '10px' }}>MUSKLER BELASTADE</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                            {muscles.map(m => (
                              <span key={`${m.name}-${m.role}`} style={{ fontSize: '12px', padding: '6px 9px', borderRadius: '999px', background: m.role === 'primary' ? 'var(--accent-soft)' : 'var(--surface2)', color: m.role === 'primary' ? 'var(--accent)' : 'var(--muted2)', border: m.role === 'primary' ? '1px solid var(--accent-border)' : '1px solid var(--border)' }}>
                                {m.name} {m.role === 'primary' ? 'primär' : 'sekundär'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    {session.session_type === 'gym' && (
                      <button onClick={() => { openEditSession(session); setSelectedSessionDetail(null) }} className="btn btn-ghost">
                        <Edit3 size={14} /> Redigera
                      </button>
                    )}
                    <button onClick={() => setSelectedSessionDetail(null)} className="btn btn-primary">Stäng</button>
                  </div>
                  </div>
                </>
              )
            })()}
        </Modal>
      )}

      {selectedExercise && (
        <ExerciseModal exerciseName={selectedExercise} onClose={() => setSelectedExercise(null)} />
      )}

      {showRunModal && (
        <RunModal onClose={() => setShowRunModal(false)} />
      )}

      {/* EDIT SESSION MODAL */}
      {editingSession && (
        <Modal onClose={() => setEditingSession(null)} maxWidth={560} title="Redigera pass">
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
        </Modal>
      )}
    </div>
      </div>
    </div>
  )
}
