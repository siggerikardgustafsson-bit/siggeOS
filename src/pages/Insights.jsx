import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { format, subDays, startOfWeek, parseISO, differenceInDays, getDay } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Loader, TrendingUp, TrendingDown, Minus, Zap, Flame, Award, Activity } from 'lucide-react'
import {
  Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Area, AreaChart, ComposedChart
} from 'recharts'

const COLORS = {
  blue:   '#3b82f6',
  green:  '#10b981',
  amber:  '#f59e0b',
  purple: '#8b5cf6',
  red:    '#ef4444',
  cyan:   '#06b6d4',
}

function StatCard({ label, value, sub, color = COLORS.blue, trend }) {
  return (
    <div className="pg-stat" style={{ '--pg-c': color }}>
      <div className="pg-stat-cap">{label}</div>
      <div className="pg-stat-num mono">{value}</div>
      {sub && (
        <div style={{ position: 'relative', fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
          {trend === 'up' && <TrendingUp size={11} color={COLORS.green} />}
          {trend === 'down' && <TrendingDown size={11} color={COLORS.red} />}
          {trend === 'flat' && <Minus size={11} color="var(--muted)" />}
          {sub}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ title, color }) {
  return (
    <div className="ins-section" style={{ '--ins-c': color }}>
      <div className="ins-section-bar" />
      <div className="ins-section-title">{title}</div>
    </div>
  )
}

const PERIODS = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: '1 år', days: 365 },
]

const WEEKDAY_LABELS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']

// Pearson correlation coefficient over paired numeric arrays
function pearson(pairs) {
  const n = pairs.length
  if (n < 4) return null
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0
  for (const [x, y] of pairs) {
    sx += x; sy += y; sxy += x * y; sx2 += x * x; sy2 += y * y
  }
  const num = n * sxy - sx * sy
  const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy))
  if (den === 0) return null
  return Math.round((num / den) * 100) / 100
}

function corrStrength(r) {
  const a = Math.abs(r)
  if (a >= 0.6) return 'Starkt'
  if (a >= 0.35) return 'Måttligt'
  if (a >= 0.15) return 'Svagt'
  return 'Inget'
}

const CustomTooltip = ({ active, payload, label, unit = '' }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
      <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: '600' }}>{p.name}: {p.value}{unit}</div>
      ))}
    </div>
  )
}

export default function InsightsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [weeklyReport, setWeeklyReport] = useState('')
  const [aiObservations, setAiObservations] = useState([])
  const [loadingObs, setLoadingObs] = useState(false)
  const [obsLastUpdated, setObsLastUpdated] = useState(null)
  const [period, setPeriod] = useState(90)
  const [data, setData] = useState({
    weightData: [],
    sleepData: [],
    stepsData: [],
    studyData: [],
    trainingData: [],
    incomeData: [],
    paData: [],
    prData: [],
    examProgress: [],
    sleepEnergyData: [],
    correlations: [],
    weekdayData: [],
    streaks: [],
  })

  useEffect(() => { if (user) fetchAll() }, [user, period])

  async function fetchAll() {
    setLoading(true)
    const since90 = format(subDays(new Date(), period), 'yyyy-MM-dd')
    const since180 = format(subDays(new Date(), Math.max(period, 180)), 'yyyy-MM-dd')

    const [healthRes, journalRes, studyRes, trainingRes, incomeRes, expenseRes, paRes, examRes, courseRes, prRes] = await Promise.all([
      supabase.from('health_logs').select('date,weight_kg,steps,sleep_hours,energy').eq('user_id', user.id).gte('date', since90).order('date'),
      supabase.from('journal_entries').select('date,energy,mood,sleep_hours').eq('user_id', user.id).gte('date', since90).order('date'),
      supabase.from('study_sessions').select('date,hours,course_id').eq('user_id', user.id).gte('date', since90).order('date'),
      supabase.from('training_sessions').select('date,session_type,duration_minutes').eq('user_id', user.id).gte('date', since90).order('date'),
      supabase.from('income_logs').select('date,amount,source').eq('user_id', user.id).gte('date', since180).order('date'),
      supabase.from('expense_logs').select('date,amount,category').eq('user_id', user.id).gte('date', since180).order('date'),
      supabase.from('pa_shifts').select('date,hours_worked,is_night_shift').eq('user_id', user.id).gte('date', since180).order('date'),
      supabase.from('course_exams').select('id,name,grade,course_id').eq('user_id', user.id),
      supabase.from('courses').select('id,name,term,active').eq('user_id', user.id),
      supabase.from('personal_records').select('*').eq('user_id', user.id).order('date', { ascending: false }),
    ])

    // Weight trend (weekly avg) — ignore 0 values
    const weightByWeek = groupByWeek((healthRes.data || []).filter(l => l.weight_kg > 0), 'weight_kg')
    const weightData = Object.entries(weightByWeek).map(([week, vals]) => ({
      week: format(parseISO(week), 'd MMM', { locale: sv }),
      vikt: avg(vals),
    })).slice(-12)

    // Steps trend (weekly avg) — ignore 0 values
    const stepsByWeek = groupByWeek((healthRes.data || []).filter(l => l.steps > 0), 'steps')
    const stepsData = Object.entries(stepsByWeek).map(([week, vals]) => ({
      week: format(parseISO(week), 'd MMM', { locale: sv }),
      steg: Math.round(avg(vals)),
    })).slice(-12)

    // Sleep trend (weekly avg from journal or health)
    const allSleepEntries = [...(journalRes.data || []), ...(healthRes.data || [])]
      .filter(e => e.sleep_hours > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
    const sleepByWeek = groupByWeek(allSleepEntries, 'sleep_hours')
    const sleepData = Object.entries(sleepByWeek).map(([week, vals]) => ({
      week: format(parseISO(week), 'd MMM', { locale: sv }),
      sömn: avg(vals),
    })).slice(-12)

    // Energy vs sleep correlation
    const energyEntries = (journalRes.data || []).filter(e => e.energy && e.sleep_hours)
    const sleepBuckets = { '< 6h': [], '6-7h': [], '7-8h': [], '8-9h': [], '> 9h': [] }
    for (const e of energyEntries) {
      const h = e.sleep_hours
      if (h < 6) sleepBuckets['< 6h'].push(e.energy)
      else if (h < 7) sleepBuckets['6-7h'].push(e.energy)
      else if (h < 8) sleepBuckets['7-8h'].push(e.energy)
      else if (h < 9) sleepBuckets['8-9h'].push(e.energy)
      else sleepBuckets['> 9h'].push(e.energy)
    }
    const sleepEnergyData = Object.entries(sleepBuckets).map(([bucket, vals]) => ({
      bucket,
      energi: vals.length ? avg(vals) : 0,
      antal: vals.length,
    })).filter(d => d.antal > 0)

    // ===== Cross-metric correlations (daily merge) =====
    // Build a per-day record combining sleep, energy, mood, training count, study hours
    const daily = {}
    const touch = (d) => { if (!daily[d]) daily[d] = {}; return daily[d] }
    for (const e of journalRes.data || []) {
      const r = touch(e.date)
      if (e.sleep_hours > 0) r.sleep = e.sleep_hours
      if (e.energy) r.energy = e.energy
      if (e.mood) r.mood = e.mood
    }
    for (const l of healthRes.data || []) {
      const r = touch(l.date)
      if (l.sleep_hours > 0 && r.sleep == null) r.sleep = l.sleep_hours
      if (l.energy && r.energy == null) r.energy = l.energy
    }
    for (const s of studyRes.data || []) {
      const r = touch(s.date)
      r.study = (r.study || 0) + (s.hours || 0)
    }
    for (const t of trainingRes.data || []) {
      const r = touch(t.date)
      r.train = (r.train || 0) + 1
    }
    const days = Object.values(daily)
    const buildPairs = (a, b) => days.filter(d => d[a] != null && d[b] != null).map(d => [d[a], d[b]])
    const corrDefs = [
      { key: ['sleep', 'energy'], label: 'Sömn → Energi' },
      { key: ['sleep', 'mood'],   label: 'Sömn → Humör' },
      { key: ['energy', 'mood'],  label: 'Energi → Humör' },
      { key: ['train', 'energy'], label: 'Träning → Energi' },
      { key: ['train', 'sleep'],  label: 'Träning → Sömn' },
      { key: ['study', 'energy'], label: 'Plugg → Energi' },
    ]
    const correlations = corrDefs.map(c => {
      const pairs = buildPairs(c.key[0], c.key[1])
      const r = pearson(pairs)
      return r == null ? null : { label: c.label, r, n: pairs.length, strength: corrStrength(r) }
    }).filter(Boolean).sort((a, b) => Math.abs(b.r) - Math.abs(a.r))

    // ===== Weekday patterns (avg per weekday, Mon-first) =====
    const wd = WEEKDAY_LABELS.map(d => ({ day: d, _energy: [], _train: 0, _occ: new Set() }))
    const idxMonFirst = (date) => { const g = getDay(parseISO(date)); return g === 0 ? 6 : g - 1 }
    for (const e of journalRes.data || []) {
      if (e.energy) wd[idxMonFirst(e.date)]._energy.push(e.energy)
    }
    for (const t of trainingRes.data || []) {
      const i = idxMonFirst(t.date)
      wd[i]._train += 1
      wd[i]._occ.add(t.date)
    }
    const weekdayData = wd.map(d => ({
      day: d.day,
      energi: d._energy.length ? avg(d._energy) : 0,
      pass: d._train,
    }))

    // Study hours per week
    const studyByWeek = {}
    for (const s of studyRes.data || []) {
      const week = format(startOfWeek(parseISO(s.date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      studyByWeek[week] = (studyByWeek[week] || 0) + (s.hours || 0)
    }
    const studyData = Object.entries(studyByWeek).sort(([a], [b]) => a.localeCompare(b)).map(([week, hours]) => ({
      week: format(parseISO(week), 'd MMM', { locale: sv }),
      timmar: Math.round(hours * 10) / 10,
    })).slice(-12)

    // Training frequency per week
    const trainByWeek = {}
    for (const t of trainingRes.data || []) {
      const week = format(startOfWeek(parseISO(t.date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      trainByWeek[week] = (trainByWeek[week] || 0) + 1
    }
    const trainingData = Object.entries(trainByWeek).sort(([a], [b]) => a.localeCompare(b)).map(([week, count]) => ({
      week: format(parseISO(week), 'd MMM', { locale: sv }),
      pass: count,
    })).slice(-12)

    // Income vs expense per month
    const months = {}
    for (const i of incomeRes.data || []) {
      const m = i.date.slice(0, 7)
      if (!months[m]) months[m] = { inkomst: 0, utgift: 0 }
      months[m].inkomst += i.amount
    }
    for (const e of expenseRes.data || []) {
      const m = e.date.slice(0, 7)
      if (!months[m]) months[m] = { inkomst: 0, utgift: 0 }
      months[m].utgift += e.amount
    }
    const incomeData = Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([month, vals]) => ({
      month: format(parseISO(month + '-01'), 'MMM yy', { locale: sv }),
      inkomst: Math.round(vals.inkomst),
      utgift: Math.round(vals.utgift),
      netto: Math.round(vals.inkomst - vals.utgift),
    })).slice(-6)

    // PA hours per month
    const paMonths = {}
    for (const s of paRes.data || []) {
      const m = s.date.slice(0, 7)
      if (!paMonths[m]) paMonths[m] = { timmar: 0, natt: 0, dag: 0 }
      paMonths[m].timmar += s.hours_worked || 0
      if (s.is_night_shift) paMonths[m].natt += s.hours_worked || 0
      else paMonths[m].dag += s.hours_worked || 0
    }
    const paData = Object.entries(paMonths).sort(([a], [b]) => a.localeCompare(b)).map(([month, vals]) => ({
      month: format(parseISO(month + '-01'), 'MMM yy', { locale: sv }),
      timmar: Math.round(vals.timmar * 10) / 10,
      natt: Math.round(vals.natt * 10) / 10,
      dag: Math.round(vals.dag * 10) / 10,
    })).slice(-6)

    // Exam progress
    const courses = courseRes.data || []
    const exams = examRes.data || []
    const examProgress = courses.filter(c => c.active).map(c => {
      const courseExams = exams.filter(e => e.course_id === c.id)
      const done = courseExams.filter(e => e.grade === 'G').length
      return { name: c.name.slice(0, 20), total: courseExams.length, done, pct: courseExams.length ? Math.round(done / courseExams.length * 100) : 0 }
    }).filter(c => c.total > 0)

    // PRs
    const prData = (prRes.data || []).slice(0, 6)

    // ===== Streaks & records =====
    const streaks = []
    const loggedDates = new Set((healthRes.data || []).map(l => l.date))
    let logStreak = 0
    for (let i = 0; i < 365; i++) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd')
      if (loggedDates.has(d)) logStreak++
      else if (i > 0) break
    }
    streaks.push({ icon: 'flame', label: 'Loggnings-streak', value: `${logStreak} dgr`, color: COLORS.amber })
    streaks.push({ icon: 'award', label: 'Bästa träningsvecka', value: `${Math.max(0, ...trainingData.map(d => d.pass))} pass`, color: COLORS.cyan })
    streaks.push({ icon: 'activity', label: 'Nätter ≥7h sömn', value: `${allSleepEntries.filter(e => e.sleep_hours >= 7).length}`, color: COLORS.purple })
    streaks.push({ icon: 'award', label: 'Bästa pluggvecka', value: `${Math.max(0, ...studyData.map(d => d.timmar))}h`, color: COLORS.amber })

    setData({ weightData, sleepData, stepsData, studyData, trainingData, incomeData, paData, examProgress, prData, sleepEnergyData, correlations, weekdayData, streaks })
    setLoading(false)
    generateObservations({ weightData, sleepData, studyData, trainingData })
  }

  async function generateObservations(freshData, force = false) {
    const OBS_TTL = 30 * 60 * 1000
    try {
      const cached = sessionStorage.getItem('insights_obs')
      const cachedTime = parseInt(sessionStorage.getItem('insights_obs_time') || '0')
      if (!force && cached && (Date.now() - cachedTime) < OBS_TTL) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAiObservations(parsed)
          setObsLastUpdated(new Date(cachedTime))
          return
        }
      }
    } catch (_) {}

    setLoadingObs(true)
    try {
      const lines = []
      if (freshData.weightData?.length) lines.push('Vikt senaste veckor: ' + freshData.weightData.slice(-6).map(d => `${d.week}:${d.vikt}kg`).join(', '))
      if (freshData.sleepData?.length) lines.push('Sömn timmar/vecka: ' + freshData.sleepData.slice(-6).map(d => `${d.week}:${d.sömn}h`).join(', '))
      if (freshData.trainingData?.length) lines.push('Träning pass/vecka: ' + freshData.trainingData.slice(-6).map(d => `${d.week}:${d.pass}pass`).join(', '))
      if (freshData.studyData?.length) lines.push('Plugg timmar/vecka: ' + freshData.studyData.slice(-6).map(d => `${d.week}:${d.timmar}h`).join(', '))

      const prompt = 'Analysera denna data och returnera EXAKT en JSON-array, inga backticks, inget annat.\n\nData:\n' + (lines.join('\n') || 'Ingen data.') + '\n\nFormat: [{"icon":"emoji","category":"kategori","text":"Kort observation max 20 ord."}]\nKategorier: halsa, traning, plugg, ekonomi, monster, somn. 4-6 observationer.'

      const { data: rd, error } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: prompt }],
          context: '',
          systemPrompt: 'Du returnerar ENBART en giltig JSON-array. Ingen annan text, inga backticks.',
        },
      })
      if (error) throw new Error(error.message)
      const raw = rd?.content?.trim()
      if (!raw) throw new Error('Tomt svar')
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('Ingen array i svar')
      const arr = JSON.parse(match[0])
      if (Array.isArray(arr) && arr.length > 0) {
        setAiObservations(arr)
        const now = Date.now()
        try {
          sessionStorage.setItem('insights_obs', JSON.stringify(arr))
          sessionStorage.setItem('insights_obs_time', String(now))
        } catch (_) {}
        setObsLastUpdated(new Date(now))
      }
    } catch(e) {
      console.error('Obs failed:', e.message)
      setAiObservations([{ icon: '⚠️', category: 'info', text: 'Tryck "Uppdatera" för att ladda AI-observationer.' }])
    }
    setLoadingObs(false)
  }

  function groupByWeek(items, field) {
    const map = {}
    for (const item of items) {
      if (!item[field] || !item.date) continue
      const week = format(startOfWeek(parseISO(item.date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      if (!map[week]) map[week] = []
      map[week].push(parseFloat(item[field]))
    }
    return map
  }

  function avg(arr) {
    if (!arr.length) return 0
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
  }

  async function generateWeeklyReport() {
    setGeneratingReport(true)
    setWeeklyReport('')
    try {
      const { data: rd } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: `Analysera Sigges senaste vecka och ge en veckorapport. Fokusera på: träning, plugg, hälsa, ekonomi och mönster du ser. Var konkret och direkt. Max 300 ord.` }],
          context: JSON.stringify(data),
          systemPrompt: 'Du är Jarvis, Sigges personliga AI. Ge en ärlig, direkt veckoanalys på svenska. Inga floskler.',
        },
      })
      setWeeklyReport(rd?.content || '')
    } catch (err) { console.error(err); toast({ message: 'Kunde inte generera veckorapporten', type: 'error' }) }
    setGeneratingReport(false)
  }

  // Summary stats
  const last7Days = (arr, field) => arr.filter(d => differenceInDays(new Date(), parseISO(d.date || d.week || new Date().toISOString())) <= 7)
  const totalStudyThisWeek = data.studyData.slice(-1)[0]?.timmar || 0
  const avgSleep = data.sleepData.length ? avg(data.sleepData.map(d => d.sömn)) : 0
  const latestWeight = data.weightData.slice(-1)[0]?.vikt || null
  const firstWeight = data.weightData[0]?.vikt || null
  const weightDelta = latestWeight && firstWeight ? Math.round((latestWeight - firstWeight) * 10) / 10 : null
  const totalPaThisMonth = data.paData.slice(-1)[0]?.timmar || 0
  const trainingSessions = data.trainingData.slice(-4).reduce((sum, w) => sum + w.pass, 0)

  if (loading) return (
    <div style={{ padding: '40px', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--muted)' }}>
      <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Laddar insights...
    </div>
  )

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <div className="page-header-title">Insights</div>
          <div className="page-header-sub">Mönster, risker och signaler senaste {period === 365 ? '12 månaderna' : `${period} dagarna`}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {PERIODS.map(({ label, days }) => (
            <button key={days} onClick={() => setPeriod(days)} className={`exp-period${period === days ? ' is-active' : ''}`}>{label}</button>
          ))}
        </div>
        <button onClick={generateWeeklyReport} disabled={generatingReport} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 13px',
          borderRadius: '8px', border: '1px solid rgba(139,92,246,0.3)',
          background: 'rgba(139,92,246,0.08)',
          color: '#a78bfa', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif', fontWeight: '600',
        }}>
          {generatingReport ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />}
          Analysera vecka
        </button>
        </div>
      </div>

      <div className="page-content-scroll">
        <div style={{ padding: '16px 16px 0', maxWidth: '900px', margin: '0 auto' }}>

      {/* Jarvis weekly report */}
      {weeklyReport && (
        <div className="card" style={{ marginBottom: '24px', borderColor: 'rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.04)' }}>
          <div style={{ fontSize: '12px', color: '#a78bfa', fontWeight: '600', marginBottom: '10px' }}>JARVIS · VECKORAPPORT</div>
          <div style={{ fontSize: '14px', lineHeight: '1.7', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{weeklyReport}</div>
        </div>
      )}

      {/* AI OBSERVATIONS */}
      {(loadingObs || aiObservations.length > 0) && (
        <div style={{ marginBottom: '24px', background: 'var(--surface2)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '16px', backdropFilter: 'var(--glass-blur)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div style={{ width: 20, height: 20, borderRadius: '6px', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
              </div>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>Jarvis observerar</span>
              {obsLastUpdated && (
                <span style={{ fontSize: '10px', color: 'var(--muted)', marginLeft: 4 }}>
                  · uppdaterad {format(obsLastUpdated, 'HH:mm', { locale: sv })}
                </span>
              )}
            </div>
            <button onClick={() => generateObservations(data, true)} disabled={loadingObs} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {loadingObs ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={11} />}
              {loadingObs ? 'Analyserar 90 dagar…' : 'Uppdatera'}
            </button>
          </div>
          {loadingObs && aiObservations.length === 0 ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Jarvis analyserar din data...
            </div>
          ) : (
            <div className="insights-obs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {aiObservations.map((obs, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '16px', flexShrink: 0, lineHeight: 1.3 }}>{obs.icon}</span>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{obs.category}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.5' }}>{obs.text}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="insights-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '28px' }}>
        <StatCard label="Vikt nu" value={latestWeight ? `${latestWeight}kg` : '—'} sub={weightDelta ? `${weightDelta > 0 ? '+' : ''}${weightDelta}kg senaste 90d` : null} color={COLORS.blue} trend={weightDelta < 0 ? 'down' : weightDelta > 0 ? 'up' : 'flat'} />
        <StatCard label="Sömn (snitt)" value={avgSleep ? `${avgSleep}h` : '—'} sub="senaste 90 dagarna" color={COLORS.purple} />
        <StatCard label="Plugg denna vecka" value={`${totalStudyThisWeek}h`} color={COLORS.amber} />
        <StatCard label="PA denna månad" value={`${totalPaThisMonth}h`} color={COLORS.green} />
        <StatCard label="Träning (4 veckor)" value={`${trainingSessions} pass`} color={COLORS.cyan} />
      </div>

      {/* ===== STREAKS / REKORD ===== */}
      {data.streaks.length > 0 && (
        <div className="insights-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '28px' }}>
          {data.streaks.map((s, i) => {
            const Ic = s.icon === 'flame' ? Flame : s.icon === 'award' ? Award : Activity
            return (
              <div key={i} className="pg-stat" style={{ '--pg-c': s.color }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Ic size={13} color={s.color} />
                  <div className="pg-stat-cap" style={{ margin: 0 }}>{s.label}</div>
                </div>
                <div className="pg-stat-num mono" style={{ color: s.color }}>{s.value}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* ===== SAMBAND & MÖNSTER ===== */}
      <SectionHeader title="Samband & mönster" color={COLORS.red} />
      <div className="insights-chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        {/* Sleep → Energy */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>SÖMN → ENERGI (snitt-energi per sömnintervall)</div>
          {data.sleepEnergyData.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.sleepEnergyData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="seGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.cyan} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={COLORS.purple} stopOpacity={0.75} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} domain={[0, 10]} />
                <Tooltip content={<CustomTooltip unit=" energi" />} />
                <Bar dataKey="energi" fill="url(#seGrad)" radius={[4, 4, 0, 0]} name="Energi" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>För få journaldagar med både sömn & energi</div>}
        </div>

        {/* Correlation matrix */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>KORRELATIONER (vad hänger ihop?)</div>
          {data.correlations.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {data.correlations.map((c, i) => {
                const pos = c.r >= 0
                const col = c.strength === 'Inget' ? 'var(--muted)' : pos ? COLORS.green : COLORS.red
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text)' }}>{c.label}</span>
                      <span className="mono" style={{ color: col, fontWeight: 600, fontSize: '11px' }}>
                        {c.strength} · {pos ? '+' : ''}{c.r}
                      </span>
                    </div>
                    <div style={{ position: 'relative', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }}>
                      <div style={{ position: 'absolute', left: '50%', top: '-1px', width: '1px', height: '8px', background: 'rgba(255,255,255,0.15)' }} />
                      <div style={{ position: 'absolute', top: 0, height: '100%', borderRadius: '3px', background: col,
                        width: `${Math.abs(c.r) * 50}%`, left: pos ? '50%' : `${50 - Math.abs(c.r) * 50}%` }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>+1 = följs åt · −1 = motverkar · baserat på dagliga värden</div>
            </div>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Inte tillräckligt med data för korrelationer</div>}
        </div>
      </div>

      {/* Weekday patterns */}
      <div className="insights-chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>ENERGI PER VECKODAG (snitt)</div>
          {data.weekdayData.some(d => d.energi > 0) ? (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={data.weekdayData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} domain={[0, 10]} />
                <Tooltip content={<CustomTooltip unit=" energi" />} />
                <Bar dataKey="energi" fill={COLORS.amber} radius={[3, 3, 0, 0]} name="Energi" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Ingen energidata per veckodag</div>}
        </div>
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>TRÄNINGSPASS PER VECKODAG</div>
          {data.weekdayData.some(d => d.pass > 0) ? (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={data.weekdayData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip unit=" pass" />} />
                <Bar dataKey="pass" fill={COLORS.cyan} radius={[3, 3, 0, 0]} name="Pass" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Inga träningspass att visa</div>}
        </div>
      </div>

      {/* ===== HÄLSA ===== */}
      <SectionHeader title="Hälsa & kropp" color={COLORS.blue} />
      <div className="insights-chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
        {/* Weight */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>VIKTUTVECKLING (kg)</div>
          {data.weightData.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data.weightData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} domain={['auto', 'auto']} />
                <Tooltip content={<CustomTooltip unit="kg" />} />
                <Area type="monotone" dataKey="vikt" stroke={COLORS.blue} fill="url(#weightGrad)" strokeWidth={2} dot={false} name="Vikt" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Inte tillräckligt med data</div>}
        </div>

        {/* Sleep */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>SÖMN PER VECKA (timmar)</div>
          {data.sleepData.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.sleepData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} domain={[0, 12]} />
                <Tooltip content={<CustomTooltip unit="h" />} />
                <Bar dataKey="sömn" fill={COLORS.purple} radius={[3, 3, 0, 0]} name="Sömn" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Inte tillräckligt med data</div>}
        </div>

        {/* Steps */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>STEG PER VECKA (snitt)</div>
          {data.stepsData && data.stepsData.length > 1 ? (
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={data.stepsData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="stepsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.amber} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.amber} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={v => `${Math.round(v/1000)}k`} />
                <Tooltip content={<CustomTooltip unit=" steg" />} />
                <Area type="monotone" dataKey="steg" stroke={COLORS.amber} fill="url(#stepsGrad)" strokeWidth={2} dot={false} name="Steg" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>Ingen stegdata — importera från Apple Health</div>}
        </div>
      </div>

      {/* ===== TRÄNING ===== */}
      <SectionHeader title="Träning" color={COLORS.cyan} />
      <div className="insights-chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
        {/* Training frequency */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>TRÄNINGSPASS PER VECKA</div>
          {data.trainingData.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.trainingData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip unit=" pass" />} />
                <Bar dataKey="pass" fill={COLORS.cyan} radius={[3, 3, 0, 0]} name="Pass" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Inte tillräckligt med data</div>}
        </div>

        {/* PRs */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>SENASTE PRs</div>
          {data.prData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.prData.slice(0, 5).map((pr, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--surface2)', borderRadius: '6px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '500' }}>{pr.exercise_name || pr.exercise}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{pr.date ? format(parseISO(pr.date), 'd MMM yyyy', { locale: sv }) : ''}</div>
                  </div>
                  <div className="mono" style={{ fontSize: '14px', fontWeight: '600', color: COLORS.cyan }}>
                    {pr.weight_kg ? `${pr.weight_kg}kg` : pr.time_seconds ? `${Math.floor(pr.time_seconds/60)}:${String(pr.time_seconds%60).padStart(2,'0')}` : pr.distance_km ? `${pr.distance_km}km` : '—'}
                  </div>
                </div>
              ))}
            </div>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Inga PRs registrerade</div>}
        </div>
      </div>

      {/* ===== PLUGG ===== */}
      <SectionHeader title="Plugg" color={COLORS.amber} />
      <div className="insights-chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
        {/* Study hours */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>STUDIETIMMAR PER VECKA</div>
          {data.studyData.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data.studyData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="studyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.amber} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.amber} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <Tooltip content={<CustomTooltip unit="h" />} />
                <Area type="monotone" dataKey="timmar" stroke={COLORS.amber} fill="url(#studyGrad)" strokeWidth={2} dot={false} name="Timmar" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Inte tillräckligt med data</div>}
        </div>

        {/* Exam progress */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>TENTAPROGRESS (AKTIVA KURSER)</div>
          {data.examProgress.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.examProgress.map((course, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text)' }}>{course.name}</span>
                    <span style={{ color: 'var(--muted)' }}>{course.done}/{course.total}</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${course.pct}%`, background: course.pct === 100 ? COLORS.green : COLORS.amber, borderRadius: '3px', transition: 'width 0.6s' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Inga aktiva kurser med examinationer</div>}
        </div>
      </div>

      {/* ===== EKONOMI ===== */}
      <SectionHeader title="Ekonomi" color={COLORS.green} />
      <div className="insights-chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
        {/* Income vs expense */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>INKOMST VS UTGIFT (kr)</div>
          {data.incomeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={data.incomeData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <Tooltip content={<CustomTooltip unit="kr" />} />
                <Bar dataKey="inkomst" fill={COLORS.green} radius={[3, 3, 0, 0]} name="Inkomst" opacity={0.8} />
                <Bar dataKey="utgift" fill={COLORS.red} radius={[3, 3, 0, 0]} name="Utgift" opacity={0.8} />
                <Line type="monotone" dataKey="netto" stroke={COLORS.amber} strokeWidth={2} dot={false} name="Netto" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Inte tillräckligt med data</div>}
        </div>

        {/* PA hours */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>PA-TIMMAR PER MÅNAD</div>
          {data.paData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.paData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <Tooltip content={<CustomTooltip unit="h" />} />
                <Bar dataKey="dag" stackId="a" fill={COLORS.green} radius={[0, 0, 0, 0]} name="Dagpass" />
                <Bar dataKey="natt" stackId="a" fill={COLORS.purple} radius={[3, 3, 0, 0]} name="Nattpass" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Inga PA-pass registrerade</div>}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  )
}
