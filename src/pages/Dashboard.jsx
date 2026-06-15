import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { subDays, format } from 'date-fns'
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { supabase } from '../lib/supabase'
import { useTilt } from '../hooks/useTilt'
import DetailModal from '../components/dashboard/DetailModal'
import TodayWidget from '../components/dashboard/TodayWidget'
import DashboardConstellation from '../components/dashboard/DashboardConstellation'
import FocusView from '../components/dashboard/FocusView'
import KpiTree from '../components/dashboard/KpiTree'
import WeeklyReview from '../components/WeeklyReview'
import AchievementsModal from '../components/AchievementsModal'
import { CalendarDays, BarChart2, Orbit, LayoutGrid, Sparkles, Trophy, Network } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import {
  getTier, getStudyTier, getSkillTier, getDecayedValue, calcOverallTier,
  estimateVO2max, formatRunTime,
  VO2MAX_THRESHOLDS, RUN_5K_THRESHOLDS, RUN_10K_THRESHOLDS, RUN_HALF_THRESHOLDS, RUN_MARA_THRESHOLDS,
  BENCH_THRESHOLDS, SQUAT_THRESHOLDS, DEADLIFT_THRESHOLDS, OHP_THRESHOLDS, PULLUP_THRESHOLDS,
  SLEEP_DURATION_THRESHOLDS, INCOME_THRESHOLDS, SAVINGS_THRESHOLDS,
  ENERGY_THRESHOLDS, MOOD_THRESHOLDS, STRESS_THRESHOLDS, STEPS_THRESHOLDS,
  TIER_COLORS, TIER_NAMES,
} from '../components/dashboard/tierUtils'
import { getUserContext } from '../lib/personalization'
import {
  calculateStrengthTier, calculateConditioningTier, calculateEconomyTier,
  calculateHealthTier, calculateStudyTier,
} from '../lib/tierEngine'
import { suggestTierProfile, weightsForProfile } from '../lib/tierProfiles'
import { computeMaxxScoreV2, detectBottlenecksV2, buildWhyThisScore, tierToPercentile, SCORE_VERSION } from '../lib/maxxScore'

const DEFAULT_SUPPLEMENTS = ['Kreatin', 'D-vitamin', 'Omega-3', 'Multivitamin', 'Magnesium']

const GRAPH_CATS = [
  { id:'somn',      label:'Sömn',      color:'#8b5cf6' },
  { id:'valmående', label:'Hälsa', color:'#f472b6' },
  { id:'plugg',     label:'Plugg',     color:'#34d399' },
  { id:'kondition', label:'Kondition', color:'#4f8ef7' },
  { id:'styrka',    label:'Styrka',    color:'#a78bfa' },
  { id:'ekonomi',   label:'Ekonomi',  color:'#22d3ee' },
]

function GraphTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--surface3)', backdropFilter:'blur(16px)', border:'1px solid var(--border2)', borderRadius:'10px', padding:'10px 14px', fontSize:'12px' }}>
      <div style={{ color:'var(--muted)', marginBottom:'5px' }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'2px' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:p.stroke || p.fill }} />
          <span style={{ color:'var(--muted2)' }}>{p.name}:</span>
          <span style={{ color:p.stroke || p.fill, fontWeight:600 }}>T{p.value}</span>
        </div>
      ))}
    </div>
  )
}


function goalValue(goals, keys, fallback = null) {
  for (const key of keys) {
    const value = goals?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return fallback
}

function parseNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function buildMaxxProfile(cats, profileId = 'balanced') {
  const rankCats = cats.filter(c => c?.tier?.tier && c.hasData && !['kropp','fardigheter'].includes(c.id))
  if (!rankCats.length) return null
  const weights = weightsForProfile(profileId)
  // Maxx Score v2 — profile-weighted percentile blended with the weakest link.
  // Falls back to the v1 weakest-link tier (Math.min) if v2 can't compute.
  const scoreV2 = computeMaxxScoreV2(rankCats, weights)
  const tiers = rankCats.map(c => c.tier.tier)
  const currentTier = scoreV2?.tier ?? Math.min(...tiers)
  const nextTier = Math.min(currentTier + 1, 8)
  const avgTier = tiers.reduce((sum, t) => sum + t, 0) / tiers.length
  const spread = Math.max(...tiers) - Math.min(...tiers)
  const bottlenecks = rankCats
    .filter(c => c.tier.tier < nextTier)
    .sort((a, b) => {
      const ap = a.levelUp?.progressPct ?? (a.tier.tier / nextTier) * 100
      const bp = b.levelUp?.progressPct ?? (b.tier.tier / nextTier) * 100
      return a.tier.tier - b.tier.tier || ap - bp
    })

  const requirements = rankCats.map(cat => {
    const tier = cat.tier.tier
    const met = tier >= nextTier
    const progress = met ? 100 : Math.max(0, Math.min(100, cat.levelUp?.progressPct ?? Math.round((tier / nextTier) * 100)))
    return {
      label: cat.name,
      currentLabel: 'T' + tier,
      targetLabel: 'T' + nextTier,
      gapLabel: met ? 'Klar' : `T${tier} → T${nextTier}`,
      met,
      missing: false,
      progress,
    }
  })

  const progressPct = Math.round(requirements.reduce((sum, r) => sum + r.progress, 0) / requirements.length)
  const primary = bottlenecks[0]
  const color = TIER_COLORS[currentTier] || '#6b7280'

  return {
    id: 'maxx',
    name: 'Maxx Score',
    icon: 'maxx',
    tier: { tier: currentTier, label: TIER_NAMES[currentTier], color },
    hasData: true,
    pct: progressPct,
    trend: 'neutral',
    decayWarning: false,
    metrics: [
      { label: 'Overall rank', value: `T${currentTier}`, highlight: true },
      { label: 'Till T' + nextTier, value: progressPct + '%' },
      { label: 'Balansgap', value: spread <= 1 ? 'stabil' : spread + ' tiers' },
    ],
    details: [
      { label: 'Rankande kategorier', value: String(rankCats.length) },
      { label: 'Snitt-tier', value: avgTier.toFixed(1) },
      { label: 'Viktad percentil', value: scoreV2?.weightedPercentile != null ? scoreV2.weightedPercentile + '%' : '—' },
      { label: 'Lägsta kategori', value: primary ? `${primary.name} T${primary.tier.tier}` : '—' },
      { label: 'Balansgap', value: spread <= 1 ? 'stabilt' : spread + ' tiers' },
    ],
    levelUp: {
      currentTier,
      nextTier,
      maxTier: 8,
      title: currentTier >= 8 ? 'Maxxad nivå' : `T${currentTier} → T${nextTier}`,
      progressPct,
      primaryBottleneck: primary ? `${primary.name}: ${primary.levelUp?.primaryBottleneck || 'ranka upp till T' + nextTier}` : 'Alla kärnkategorier klara',
      requirements,
      blockers: requirements.filter(r => !r.met),
    },
    tierGuide: [2,3,4,5,6,7,8].map(t => ({
      tier: t,
      label: TIER_NAMES[t],
      reqs: rankCats.map(c => `${c.name} minst T${t}`),
    })),
    chartData: [],
    chartLines: [],
    contribution: rankCats.map(c => ({ label: c.name, value: `T${c.tier.tier}`, percentile: tierToPercentile(c.tier.tier), tierInfo: c.tier })),
    // ── Maxx Score v2 metadata (data layer; existing UI consumes what it needs) ──
    scoreVersion: SCORE_VERSION,
    tierProfile: profileId,
    weightedPercentile: scoreV2?.weightedPercentile ?? null,
    weightedTier: scoreV2?.weightedTier ?? null,
    minTier: scoreV2?.minTier ?? Math.min(...tiers),
    bottlenecksV2: scoreV2 ? detectBottlenecksV2(rankCats, currentTier, weights) : [],
    whyThisScore: buildWhyThisScore(scoreV2, rankCats),
  }
}


function EvidenceModal({ evidence, onClose, onNavigate }) {
  if (!evidence) return null
  const rows = evidence.rows || []
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:120, background:'rgba(0,0,0,0.58)', backdropFilter:'blur(10px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e=>e.stopPropagation()} className="widget" style={{ width:'min(560px, 100%)', maxHeight:'82vh', overflowY:'auto', padding:0, borderRadius:22 }}>
        <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:11, color:'var(--muted)', fontWeight:900, letterSpacing:'0.13em', textTransform:'uppercase' }}>Datakälla</div>
            <div style={{ fontSize:22, fontWeight:900, color:'var(--text)', marginTop:4 }}>{evidence.title || evidence.metricLabel}</div>
            <div style={{ fontSize:13, color:'var(--muted2)', marginTop:3 }}>{evidence.subtitle || evidence.categoryName}</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon" style={{ flexShrink:0 }}>×</button>
        </div>

        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:10 }}>
            <div className="card-sm" style={{ padding:12 }}>
              <div style={{ fontSize:10, color:'var(--muted)', fontWeight:850, letterSpacing:'0.08em', textTransform:'uppercase' }}>Värde</div>
              <div style={{ fontSize:20, color:'var(--accent)', fontWeight:900, marginTop:4 }}>{evidence.metricValue || evidence.value || '—'}</div>
            </div>
            <div className="card-sm" style={{ padding:12 }}>
              <div style={{ fontSize:10, color:'var(--muted)', fontWeight:850, letterSpacing:'0.08em', textTransform:'uppercase' }}>Datum</div>
              <div style={{ fontSize:15, color:'var(--text)', fontWeight:800, marginTop:7 }}>{evidence.date || '—'}</div>
            </div>
          </div>

          <div className="card-sm" style={{ padding:14 }}>
            {rows.map((r,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:14, padding:i===0?'0 0 8px 0':'8px 0', borderTop:i===0?'none':'1px solid var(--border)' }}>
                <span style={{ color:'var(--muted2)', fontSize:12 }}>{r.label}</span>
                <span style={{ color:'var(--text)', fontSize:12, fontWeight:700, textAlign:'right', overflowWrap:'anywhere' }}>{r.value || '—'}</span>
              </div>
            ))}
          </div>

          {evidence.navTarget && (
            <button onClick={() => { onNavigate ? onNavigate(evidence.navTarget) : (window.location.href = evidence.navTarget); onClose?.() }} className="btn btn-primary" style={{ width:'100%' }}>
              Öppna i {evidence.navLabel || 'källa'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {

  const navigate = useNavigate()
  const heroTilt = useTilt({ max: 5 })
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedEvidence, setSelectedEvidence] = useState(null)
  const [categories, setCategories] = useState([])
  const [overallTier, setOverallTier] = useState(null)
  const [maxxProfile, setMaxxProfile] = useState(null)
  const [bodyWeight, setBodyWeight] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [userId, setUserId] = useState(null)
  const [graphPeriod, setGraphPeriod] = useState('30d')
  const [activeGraphCats, setActiveGraphCats] = useState(['somn','valmående','plugg'])
  const [rawGraphData, setRawGraphData] = useState({ healthData: [], snapshots: [] })
  const [refreshKey, setRefreshKey] = useState(0)
  const [viewMode, setViewMode] = useState(() => { try { return localStorage.getItem('maxx_dash_mode') || 'map' } catch { return 'map' } })
  const setMode = (m) => { setViewMode(m); try { localStorage.setItem('maxx_dash_mode', m) } catch { /* ignore */ } }
  const [showWeekly, setShowWeekly] = useState(false)
  const [showAchievements, setShowAchievements] = useState(false)

  const todayDate = new Date()
  const todayStr = format(todayDate, 'EEEE d MMMM yyyy')
  const todayDisplay = todayStr.charAt(0).toUpperCase() + todayStr.slice(1)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data?.user) setUserId(data.user.id) })
  }, [])

  const fetchAllData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const since90 = format(subDays(todayDate, 90), 'yyyy-MM-dd')
      const since30 = format(subDays(todayDate, 30), 'yyyy-MM-dd')

      // Fetch salary_day first to build correct period
      const { data: settingsQuick } = await supabase.from('user_settings').select('goals,display_name').eq('user_id',userId).maybeSingle()
      const salaryDay = settingsQuick?.goals?.salary_day || 25
      const todayNum = todayDate.getDate()
      const startMonth = todayNum < salaryDay ? todayDate.getMonth() - 1 : todayDate.getMonth()
      const periodStart = format(new Date(todayDate.getFullYear(), startMonth, salaryDay), 'yyyy-MM-dd')
      const periodEnd = format(new Date(todayDate.getFullYear(), startMonth + 1, salaryDay - 1), 'yyyy-MM-dd')

      const [
        { data: runData }, { data: runPrData }, { data: prData }, { data: healthData },
        { data: studyData }, { data: paData }, { data: skillData }, { data: userSettings },
        { data: exData }, { data: supplementLogs }, { data: snapshots }, { data: incomeData },
      ] = await Promise.all([
        supabase.from('training_sessions').select('id,date,distance_km,time_seconds,pace_per_km').eq('user_id',userId).gte('date',since90).not('distance_km','is',null).order('date',{ascending:false}),
        supabase.from('run_personal_records').select('id,distance_key,label,distance_km,time_seconds,pace_per_km,date,strava_activity_id,strava_effort_name,source').eq('user_id',userId).gte('date',since90).order('date',{ascending:false}).then(r => r).catch(() => ({ data: [] })),
        supabase.from('personal_records').select('id,exercise_name,weight_kg,reps,date,exercise_id').eq('user_id',userId).order('weight_kg',{ascending:false}),
        supabase.from('health_logs').select('date,weight_kg,sleep_hours,energy,energy_level,stress_level,mood,steps,alcohol_units').eq('user_id',userId).gte('date',since90).order('date',{ascending:false}),
        supabase.from('learning_goals').select('id,mastery,course_id,courses(name,active)').eq('user_id',userId),
        supabase.from('pa_shifts').select('date,estimated_pay').eq('user_id',userId).gte('date',periodStart).lte('date',periodEnd),
        supabase.from('skill_logs').select('date,skill,minutes').eq('user_id',userId).gte('date',since30),
        Promise.resolve({ data: settingsQuick }),
        supabase.from('training_exercises')
          .select('id,session_id,set_number,exercise_name,reps,weight_kg,training_sessions!inner(id,date,user_id)')
          .eq('training_sessions.user_id', userId)
          .gte('training_sessions.date', format(subDays(todayDate, 60), 'yyyy-MM-dd'))
          .not('weight_kg','is',null).not('reps','is',null),
        supabase.from('supplement_logs')
          .select('date,supplement_name,taken')
          .eq('user_id', userId)
          .gte('date', since90)
          .then(r => r)
          .catch(() => ({ data: [] })),
        supabase.from('tier_snapshots')
          .select('date,kondition,styrka,plugg,ekonomi,somn,valmående')
          .eq('user_id', userId)
          .gte('date', format(subDays(todayDate, 180), 'yyyy-MM-dd'))
          .order('date', { ascending: true })
          .then(r => r)
          .catch(() => ({ data: [] })),
        supabase.from('income_logs')
          .select('date,amount,source')
          .eq('user_id', userId)
          .gte('date', periodStart)
          .lte('date', periodEnd)
          .then(r => r)
          .catch(() => ({ data: [] })),
      ])

      const latestW = (healthData||[]).find(h=>h.weight_kg)
      const goalWeightRaw = goalValue(userSettings?.goals, ['target_weight','body_weight_goal','weight_goal_kg','målvikt'], null)
      const goalWeight = parseNumber(goalWeightRaw)
      const bw = latestW?.weight_kg || null
      setBodyWeight(bw)
      if (userSettings?.display_name) setDisplayName(userSettings.display_name)

      // Phase 7 — profile-aware tier context. Null-safe: if the profile/columns
      // aren't there (or no profile yet), ctx is null and every Tier Engine call
      // falls back to the exact current thresholds (no behaviour change).
      const ctx = await getUserContext(userId)
      const tierProfileId = suggestTierProfile(ctx)

      // Strava best efforts per activity.
      // Important: do NOT estimate 1 km / 5 km / 10 km from whole-run average pace.
      // Dashboard should represent current fitness from actual Strava "Bästa insatser"
      // saved in run_personal_records for the last 90 days.
      function bestActual(distanceKey) {
        const efforts = (runPrData || []).filter(r =>
          r.distance_key === distanceKey &&
          r.time_seconds &&
          r.date >= since90
        )
        if (!efforts.length) return null

        return efforts.reduce((best, r) => {
          const t = Number(r.time_seconds)
          const bt = Number(best.time_seconds)
          return t < bt ? r : best
        }, efforts[0])
      }

      function toDecayed(run) {
        if (!run) return null
        return getDecayedValue(Number(run.time_seconds), run.date, 90)
      }

      const r1Actual = bestActual('1k')
      const r5Actual = bestActual('5k')
      const r10Actual = bestActual('10k')
      const rHActual = bestActual('half_marathon')

      function runEvidence(row, label) {
        if (!row) return null
        return {
          type: 'run_best_effort',
          title: label,
          subtitle: 'Strava best effort från enskilt löppass',
          value: formatRunTime(Number(row.time_seconds)),
          date: row.date,
          navTarget: row.strava_activity_id ? `/traning?stravaActivity=${row.strava_activity_id}` : '/traning',
          navLabel: 'Träning',
          rows: [
            { label: 'Källa', value: 'run_personal_records' },
            { label: 'Best effort', value: row.strava_effort_name || row.label || label },
            { label: 'Tid', value: formatRunTime(Number(row.time_seconds)) },
            { label: 'Pace', value: row.pace_per_km ? formatRunTime(Number(row.pace_per_km)) + '/km' : '—' },
            { label: 'Distans', value: row.distance_km ? Number(row.distance_km).toFixed(row.distance_km >= 10 ? 1 : 2).replace('.00','') + ' km' : '—' },
            { label: 'Strava activity', value: row.strava_activity_id || '—' },
            { label: 'Rad-ID', value: row.id || '—' },
          ],
        }
      }

      const r1D  = toDecayed(r1Actual)
      const r5D  = toDecayed(r5Actual)
      const r10D = toDecayed(r10Actual)
      const rHD  = toDecayed(rHActual)
      const rMD  = null

      const r1T  = r1D  ? calculateConditioningTier('1k', r1D.value, ctx) : null
      const r5T  = r5D  ? calculateConditioningTier('5k', r5D.value, ctx) : null
      const r10T = r10D ? calculateConditioningTier('10k', r10D.value, ctx) : null
      const rHT  = rHD  ? calculateConditioningTier('half_marathon', rHD.value, ctx) : null
      const rMT  = rMD  ? calculateConditioningTier('marathon', rMD.value, ctx) : null

      const hasRunData = !!(runPrData?.length || runData?.length)

      // Coverage check uses actual imported Strava best efforts.
      const covered1  = !!r1D
      const covered5  = !!r5D
      const covered10 = !!r10D
      const coveredH  = !!rHD

      const allFourCovered = covered1 && covered5 && covered10 && coveredH

      // Tier = weak link of distances with ACTUAL data
      const kTs = [r1T, r5T, r10T, rHT].filter(Boolean)
      const kTop = allFourCovered && kTs.length > 0
        ? kTs.reduce((min, t) => t.tier < min.tier ? t : min, kTs[0])
        : hasRunData ? { tier: 1, label: 'Botten 50%', color: '#6b7280' } : null

      // Epley formula: e1RM = weight * (1 + reps/30)
      // Brzyckis formula for low reps (≤10): e1RM = weight / (1.0278 - 0.0278*reps)
      function epley(weight, reps) {
        if (!weight || !reps || reps < 1) return null
        if (reps === 1) return weight
        if (reps <= 10) return Math.round(weight / (1.0278 - 0.0278 * reps))
        return Math.round(weight * (1 + reps / 30))
      }

      // For bodyweight exercises (pull-ups, dips, push-ups):
      // weight_kg in DB may be 0 or null → use BW + added weight
      // PULLUP_THRESHOLDS are in "added kg above BW" (0 = can do pull-ups, 20 = +20kg etc)
      function epleyBW(addedWeight, reps, bodyweight) {
        const totalWeight = bodyweight + (addedWeight || 0)
        const e1RM_total = epley(totalWeight, reps)
        return e1RM_total != null ? e1RM_total - bodyweight : null // return added kg equivalent
      }

      function getE1RM(keywords, isBW = false) {
        const since60 = format(subDays(todayDate, 60), 'yyyy-MM-dd')
        let best = 0

        // From personal_records
        const pr = (prData || []).find(p => keywords.some(k => p.exercise_name?.toLowerCase().includes(k)))
        if (pr) {
          const d = pr.updated_at?.slice(0, 10) || pr.date || format(subDays(todayDate, 1), 'yyyy-MM-dd')
          const decayed = getDecayedValue(pr.weight_kg, d, 60)
          if (decayed) {
            const e = isBW
              ? epleyBW(decayed.value, pr.reps || 1, bw)
              : epley(decayed.value, pr.reps || 1)
            if (e != null && e > best) best = e
          }
        }

        // From recent training_exercises (last 60 days)
        const sets = (exData || []).filter(e =>
          keywords.some(k => e.exercise_name?.toLowerCase().includes(k)) &&
          e.training_sessions?.date >= since60
        )
        for (const s of sets) {
          const e = isBW
            ? epleyBW(s.weight_kg || 0, s.reps, bw)  // weight_kg=0 means unweighted
            : epley(s.weight_kg, s.reps)
          if (e != null && e > best) best = e
        }

        return best > 0 ? best : null
      }

      function strengthEvidence(label, keywords, isBW = false) {
        let best = null
        const consider = (candidate) => {
          if (!candidate || candidate.e1rm == null) return
          if (!best || candidate.e1rm > best.e1rm) best = candidate
        }

        for (const p of (prData || [])) {
          if (!keywords.some(k => p.exercise_name?.toLowerCase().includes(k))) continue
          const e = isBW ? epleyBW(p.weight_kg || 0, p.reps || 1, bw) : epley(p.weight_kg, p.reps || 1)
          consider({
            e1rm: e,
            date: p.date,
            source: 'personal_records',
            exerciseName: p.exercise_name,
            rows: [
              { label: 'Källa', value: 'personal_records' },
              { label: 'Övning', value: p.exercise_name },
              { label: 'Set/PR', value: `${p.weight_kg ?? '—'} kg × ${p.reps || 1}` },
              { label: 'Formel', value: (p.reps || 1) <= 10 ? 'Brzycki' : 'Epley' },
              { label: 'Rad-ID', value: p.id || '—' },
            ],
          })
        }

        for (const s of (exData || [])) {
          if (!keywords.some(k => s.exercise_name?.toLowerCase().includes(k))) continue
          const e = isBW ? epleyBW(s.weight_kg || 0, s.reps, bw) : epley(s.weight_kg, s.reps)
          consider({
            e1rm: e,
            date: s.training_sessions?.date,
            source: 'training_exercises',
            sessionId: s.session_id || s.training_sessions?.id,
            exerciseName: s.exercise_name,
            rows: [
              { label: 'Källa', value: 'training_exercises' },
              { label: 'Passdatum', value: s.training_sessions?.date || '—' },
              { label: 'Övning', value: s.exercise_name },
              { label: 'Set', value: `${s.weight_kg ?? '—'} kg × ${s.reps ?? '—'}` },
              { label: 'Setnummer', value: s.set_number != null ? String(s.set_number) : '—' },
              { label: 'Formel', value: Number(s.reps || 0) <= 10 ? 'Brzycki' : 'Epley' },
              { label: 'Pass-ID', value: s.session_id || s.training_sessions?.id || '—' },
              { label: 'Set-ID', value: s.id || '—' },
            ],
          })
        }

        if (!best) return null
        return {
          type: 'strength_e1rm',
          title: label,
          subtitle: 'Bästa e1RM-källa senaste 60 dagar eller PR-rad',
          value: Math.round(best.e1rm) + ' kg',
          date: best.date,
          navTarget: best.exerciseName
            ? `/traning?exercise=${encodeURIComponent(best.exerciseName)}`
            : (best.sessionId ? `/traning?session=${best.sessionId}` : '/traning'),
          navLabel: 'Träning',
          rows: [
            { label: 'e1RM', value: Math.round(best.e1rm) + ' kg' },
            ...best.rows,
          ],
        }
      }

      function sourceValue(value, evidence) {
        if (!evidence?.navTarget || !value || value === '—') return value
        return (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              navigate(evidence.navTarget)
            }}
            title="Öppna källpass"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '6px 8px',
              margin: '-6px -8px',
              borderRadius: 9,
              border: '1px solid transparent',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              font: 'inherit',
              fontWeight: 850,
              textAlign: 'left',
              transition: 'background .14s ease, border-color .14s ease, transform .14s ease, box-shadow .14s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(79,142,247,.08)'
              e.currentTarget.style.borderColor = 'rgba(79,142,247,.24)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,142,247,.06)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'transparent'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'none'
            }}
          >
            <span>{value}</span>
            <span style={{ fontSize: 11, color: 'var(--accent)', opacity: .9 }}>↗</span>
          </button>
        )
      }

      const bE1RM = getE1RM(['bänkpress','bench'])
      const sE1RM = getE1RM(['knäböj','squat'])
      const dlE1RM = getE1RM(['marklyft','deadlift'])
      const oE1RM = getE1RM(['militärpress','ohp','overhead'])
      const puE1RM = getE1RM(['pull-up','pullup','chins','weighted pull'], true)
      const dipE1RM = getE1RM(['dips','dip'], true)

      const bT = bE1RM != null ? calculateStrengthTier('bench', { multiple: bE1RM/bw }, ctx) : null
      const sT = sE1RM != null ? calculateStrengthTier('squat', { multiple: sE1RM/bw }, ctx) : null
      const dlT = dlE1RM != null ? calculateStrengthTier('deadlift', { multiple: dlE1RM/bw }, ctx) : null
      const oT = oE1RM != null ? calculateStrengthTier('ohp', { multiple: oE1RM/bw }, ctx) : null
      const puT = puE1RM != null ? calculateStrengthTier('pullup', { value: puE1RM }, ctx) : null
      const dipT = dipE1RM != null ? calculateStrengthTier('dip', { value: dipE1RM }, ctx) : null

      // Tier = weak link across ALL required exercises
      // Missing an exercise entirely = T1 (can't be above T1 if core lifts aren't logged)
      // Required for T2+: Bench + Squat + Deadlift. OHP/Pullup/Dips optional (only lower if logged)
      const REQUIRED_LIFTS = [bT, sT, dlT] // bench, squat, deadlift — all required
      const OPTIONAL_LIFTS = [oT, puT, dipT].filter(Boolean) // only count if logged
      const hasStrengthData = [bT, sT, dlT, ...OPTIONAL_LIFTS].some(Boolean)
      const missingRequired = [bT, sT, dlT].some(t => t === null)

      let stTop
      if (!hasStrengthData) {
        stTop = null
      } else if (missingRequired) {
        // Missing one core lift means max T1. Important: label/color must also match T1.
        stTop = { tier: 1, label: TIER_NAMES[1], color: TIER_COLORS[1] }
      } else {
        // All three required lifts logged — weak link wins, optionals can only lower if logged.
        const allLogged = [...REQUIRED_LIFTS, ...OPTIONAL_LIFTS].filter(Boolean)
        stTop = allLogged.reduce((min, t) => t.tier < min.tier ? t : min, allLogged[0])
      }

      const wLogs=(healthData||[]).filter(h=>h.weight_kg).slice(0,14)
      const wGoal = goalWeight || 75
      const wNew=wLogs[0]?.weight_kg||bw,wOld=wLogs[wLogs.length-1]?.weight_kg||bw
      const wD=Math.round((wNew-wOld)*10)/10,wK=Math.max(0,Math.round((bw-wGoal)*10)/10)
      const wP=wK<=0?100:Math.max(0,Math.round((1-wK/Math.max(0.1,bw-wGoal+wK))*100))

      const s7=format(subDays(todayDate,7),'yyyy-MM-dd')
      const sl7=(healthData||[]).filter(h=>h.sleep_hours&&h.date>=s7)
      const avgSl=sl7.length?Math.round(sl7.reduce((s,h)=>s+h.sleep_hours,0)/sl7.length*10)/10:null
      const slT=avgSl?calculateHealthTier('sleep',avgSl,ctx):null

      const aG=(studyData||[]).filter(g=>g.courses?.active)
      const avgM=aG.length?Math.round(aG.reduce((s,g)=>s+(g.mastery||0),0)/aG.length):null
      const pT=avgM!=null?calculateStudyTier(avgM,ctx):null
      const byCourse={}
      aG.forEach(g=>{const cn=g.courses?.name||'Okänd';if(!byCourse[cn])byCourse[cn]=[];byCourse[cn].push(g.mastery||0)})

      const INCOME_SOURCES = ['PA-jobb', 'Erik Norling']
      const totIncomeLogged = (incomeData||[])
        .filter(i => INCOME_SOURCES.includes(i.source))
        .reduce((s,i) => {
          const amt = Number(i.amount) || 0
          return s + (i.source === 'PA-jobb' ? amt * 0.7 : amt)
        }, 0)
      const totPAEst = (paData||[]).reduce((s,sh) => s + (sh.estimated_pay||0), 0) * 0.7
      const totPA = totIncomeLogged > 0 ? totIncomeLogged : totPAEst

      // Savings: fetch total net worth from assets table
      const { data: assetsData } = await supabase.from('assets').select('type,quantity,manual_price_sek').eq('user_id', userId)
      // Use latest net_worth_history snapshot if available, otherwise sum cash assets
      const { data: nwhData } = await supabase.from('net_worth_history').select('total_sek').eq('user_id', userId).order('date', { ascending: false }).limit(1)
      const sav = nwhData?.[0]?.total_sek || (assetsData||[]).reduce((s,a) => s + (a.type === 'cash' ? (a.manual_price_sek||0) : 0), 0) || null
      const incT=totPA?calculateEconomyTier('income',totPA,ctx):null
      const savT=sav!=null?calculateEconomyTier('savings',sav,ctx):null
      // Ekonomi: min of logged metrics — weak link (high income doesn't offset zero savings)
      const eTs=[incT,savT].filter(Boolean)
      const eTop=eTs.length?eTs.reduce((min,t)=>t.tier<min.tier?t:min,eTs[0]):null

      function a7(field, fallbackField){
        const v=(healthData||[]).filter(h=>h.date>=s7).map(h=>h[field] ?? (fallbackField ? h[fallbackField] : null)).filter(x=>x!=null)
        return v.length?Math.round(v.reduce((s,x)=>s+Number(x),0)/v.length*10)/10:null
      }
      const aE=a7('energy_level','energy'), aMo=a7('mood'), aSteps=a7('steps')
      const alcohol7=(healthData||[]).filter(h=>h.date>=s7&&h.alcohol_units!=null).reduce((sum,h)=>sum+Number(h.alcohol_units||0),0)
      const alcoholLogged=(healthData||[]).some(h=>h.date>=s7&&h.alcohol_units!=null)
      const activeSupplements = Array.isArray(userSettings?.goals?.active_supplements) && userSettings.goals.active_supplements.length
        ? userSettings.goals.active_supplements.filter(Boolean)
        : DEFAULT_SUPPLEMENTS
      const supp7 = (supplementLogs || []).filter(l => l.date >= s7)
      const supplementTaken7 = supp7.filter(l => l.taken).length
      const supplementExpected7 = activeSupplements.length * 7
      const supplementCompliance = supp7.length && supplementExpected7 ? Math.round((supplementTaken7 / supplementExpected7) * 100) : null
      const eT=aE!=null?getTier(aE,ENERGY_THRESHOLDS,true):null
      const moT=aMo!=null?getTier(aMo,MOOD_THRESHOLDS,true):null
      const alcoholT=alcoholLogged?getTier(alcohol7,[14,10,7,5,3,1,0.1],false):null
      const supplementT=supplementCompliance!=null?getTier(supplementCompliance,[50,60,70,80,90,95,99],true):null
      const wTs=[eT,moT,alcoholT,supplementT].filter(Boolean)
      const wTop=wTs.length?wTs.reduce((min,t)=>t.tier<min.tier?t:min,wTs[0]):null

      function am(sn){const l=(skillData||[]).filter(s=>s.skill===sn);return l.length?Math.round(l.reduce((s,x)=>s+x.minutes,0)/4):0}
      const spM=am('spanish'),srM=am('serbian'),gtM=am('guitar')
      const spT=getSkillTier(spM),srT=getSkillTier(srM),gtT=getSkillTier(gtM)
      const skTop=[spT,srT,gtT].reduce((b,t)=>t.tier>b.tier?t:b,spT)
      const skH=!!(skillData?.length)

      // ── Dynamic level-up / bottleneck system ─────────────────────────────
      const tierMeta = (n) => n ? ({ tier:n, label:TIER_NAMES[n] || `T${n}`, color:TIER_COLORS[n] || '#6b7280' }) : null
      const clampPct = (n) => Math.max(0, Math.min(100, Math.round(n || 0)))
      const fmtNum = (n, decimals = 0) => n == null ? '—' : Number(n).toLocaleString('sv-SE', { maximumFractionDigits: decimals })
      const fmtKg = (n) => n == null ? '—' : `${Math.round(n)} kg`
      const fmtMult = (n) => n == null ? '—' : `${Math.round(n * 100) / 100}x BW`
      const fmtSecGap = (sec) => sec == null ? '—' : formatRunTime(Math.max(0, Math.round(sec)))

      function makeReq({ label, current, target, higherIsBetter = true, unit = '', currentLabel, targetLabel }) {
        const missing = current == null || Number.isNaN(current)
        const met = !missing && (higherIsBetter ? current >= target : current <= target)
        const progress = missing ? 0 : met ? 100 : higherIsBetter ? (current / target) * 100 : (target / current) * 100
        let gapLabel = 'Saknas'
        if (!missing) {
          if (met) gapLabel = 'Klar'
          else if (!higherIsBetter && unit === 'sec') gapLabel = `${fmtSecGap(current - target)} snabbare`
          else if (higherIsBetter && unit === 'kg') gapLabel = `+${Math.ceil(target - current)} kg`
          else if (higherIsBetter && unit === '%') gapLabel = `+${Math.ceil(target - current)}%`
          else if (higherIsBetter && unit === 'h') gapLabel = `+${Math.round((target - current) * 10) / 10}h`
          else if (higherIsBetter && unit === 'kr') gapLabel = `+${Math.ceil(target - current).toLocaleString('sv-SE')} kr`
          else if (higherIsBetter) gapLabel = `+${Math.ceil(target - current).toLocaleString('sv-SE')} ${unit}`.trim()
          else gapLabel = `${Math.round((current - target) * 10) / 10} ${unit} lägre`.trim()
        }
        return {
          label,
          current,
          target,
          met,
          missing,
          progress: clampPct(progress),
          gapLabel,
          currentLabel: currentLabel || (missing ? '—' : unit === 'sec' ? formatRunTime(Math.round(current)) : `${fmtNum(current, unit === 'h' ? 1 : 0)}${unit && unit !== 'sec' ? ' ' + unit : ''}`),
          targetLabel: targetLabel || (unit === 'sec' ? formatRunTime(Math.round(target)) : `${fmtNum(target, unit === 'h' ? 1 : 0)}${unit && unit !== 'sec' ? ' ' + unit : ''}`),
        }
      }

      function makeLevelUp(currentTier, maxTier, reqs, labelPrefix = 'Tier') {
        if (!reqs?.length) return null
        const safeTier = currentTier || 1
        const nextTier = safeTier >= maxTier ? safeTier : safeTier + 1
        const blockers = reqs.filter(r => !r.met)
        const primary = blockers.find(r => r.missing) || blockers.sort((a,b) => a.progress - b.progress)[0] || null
        const progressPct = clampPct(reqs.reduce((min, r) => Math.min(min, r.progress), 100))
        return {
          currentTier: safeTier,
          nextTier,
          maxTier,
          title: safeTier >= maxTier ? 'Maxxad nivå' : `${labelPrefix} ${safeTier} → ${labelPrefix} ${nextTier}`,
          progressPct: safeTier >= maxTier ? 100 : progressPct,
          primaryBottleneck: primary ? `${primary.label}${primary.gapLabel && primary.gapLabel !== 'Klar' ? ': ' + primary.gapLabel : ''}` : 'Inget blockerar nästa nivå',
          requirements: reqs,
          blockers,
        }
      }

      const currentStrengthTier = stTop?.tier || (hasStrengthData ? 1 : 0)
      const nextStrengthTier = Math.min((currentStrengthTier || 1) + 1, 8)
      const strIdx = Math.max(0, nextStrengthTier - 2)
      const strengthLevelUp = hasStrengthData && bw ? makeLevelUp(currentStrengthTier, 8, [
        makeReq({ label:'Bänkpress', current:bE1RM, target:BENCH_THRESHOLDS[strIdx] * bw, unit:'kg', currentLabel:bE1RM ? `${fmtKg(bE1RM)} (${fmtMult(bE1RM / bw)})` : '—', targetLabel:`${fmtKg(BENCH_THRESHOLDS[strIdx] * bw)} (${BENCH_THRESHOLDS[strIdx]}x BW)` }),
        makeReq({ label:'Knäböj', current:sE1RM, target:SQUAT_THRESHOLDS[strIdx] * bw, unit:'kg', currentLabel:sE1RM ? `${fmtKg(sE1RM)} (${fmtMult(sE1RM / bw)})` : '—', targetLabel:`${fmtKg(SQUAT_THRESHOLDS[strIdx] * bw)} (${SQUAT_THRESHOLDS[strIdx]}x BW)` }),
        makeReq({ label:'Marklyft', current:dlE1RM, target:DEADLIFT_THRESHOLDS[strIdx] * bw, unit:'kg', currentLabel:dlE1RM ? `${fmtKg(dlE1RM)} (${fmtMult(dlE1RM / bw)})` : '—', targetLabel:`${fmtKg(DEADLIFT_THRESHOLDS[strIdx] * bw)} (${DEADLIFT_THRESHOLDS[strIdx]}x BW)` }),
      ], 'T') : null

      const currentKondTier = kTop?.tier || (hasRunData ? 1 : 0)
      const nextKondTier = Math.min((currentKondTier || 1) + 1, 8)
      const runIdx = Math.max(0, nextKondTier - 2)
      const kondLevelUp = hasRunData ? makeLevelUp(currentKondTier, 8, [
        makeReq({ label:'1 km', current:r1D?.value, target:RUN_5K_THRESHOLDS[runIdx] * 0.195, higherIsBetter:false, unit:'sec' }),
        makeReq({ label:'5 km', current:r5D?.value, target:RUN_5K_THRESHOLDS[runIdx], higherIsBetter:false, unit:'sec' }),
        makeReq({ label:'10 km', current:r10D?.value, target:RUN_10K_THRESHOLDS[runIdx], higherIsBetter:false, unit:'sec' }),
        makeReq({ label:'Halvmara', current:rHD?.value, target:RUN_HALF_THRESHOLDS[runIdx], higherIsBetter:false, unit:'sec' }),
      ], 'T') : null

      const currentSleepTier = slT?.tier || (avgSl ? 1 : 0)
      const nextSleepTier = Math.min((currentSleepTier || 1) + 1, 8)
      const sleepIdx = Math.max(0, nextSleepTier - 2)
      const sleepLevelUp = avgSl ? makeLevelUp(currentSleepTier, 8, [
        makeReq({ label:'Sömnsnitt 7d', current:avgSl, target:SLEEP_DURATION_THRESHOLDS[sleepIdx], unit:'h' }),
        makeReq({ label:'Loggfrekvens', current:sl7.length, target: nextSleepTier >= 3 ? 5 : 3, unit:'av 7', currentLabel:`${sl7.length}/7`, targetLabel:`${nextSleepTier >= 3 ? 5 : 3}/7` }),
      ], 'T') : null

      const studyTargetByNextTier = { 2:20, 3:40, 4:60, 5:80 }
      const currentStudyTier = pT?.tier || (avgM != null ? 1 : 0)
      const nextStudyTier = Math.min((currentStudyTier || 1) + 1, 5)
      const studyLevelUp = avgM != null ? makeLevelUp(currentStudyTier, 5, [
        makeReq({ label:'Mastery snitt', current:avgM, target:studyTargetByNextTier[nextStudyTier] || 80, unit:'%' }),
      ], 'T') : null

      const currentEconTier = eTop?.tier || ((totPA || sav != null) ? 1 : 0)
      const nextEconTier = Math.min((currentEconTier || 1) + 1, 8)
      const econIdx = Math.max(0, nextEconTier - 2)
      const econLevelUp = (totPA || sav != null) ? makeLevelUp(currentEconTier, 8, [
        makeReq({ label:'Månadsnetto', current:totPA || null, target:INCOME_THRESHOLDS[econIdx], unit:'kr' }),
        makeReq({ label:'Sparkapital', current:sav, target:SAVINGS_THRESHOLDS[econIdx], unit:'kr' }),
      ], 'T') : null

      const currentWellTier = wTop?.tier || (wTs.length ? 1 : 0)
      const nextWellTier = Math.min((currentWellTier || 1) + 1, 8)
      const wellIdx = Math.max(0, nextWellTier - 2)
      const healthReqs = [
        makeReq({ label:'Energi', current:aE, target:ENERGY_THRESHOLDS[wellIdx], unit:'/10', currentLabel:aE != null ? `${aE}/10` : '—', targetLabel:`${ENERGY_THRESHOLDS[wellIdx]}/10` }),
        makeReq({ label:'Humör', current:aMo, target:MOOD_THRESHOLDS[wellIdx], unit:'/10', currentLabel:aMo != null ? `${aMo}/10` : '—', targetLabel:`${MOOD_THRESHOLDS[wellIdx]}/10` }),
        ...(alcoholLogged ? [makeReq({ label:'Alkohol 7d', current:alcohol7, target:[14,10,7,5,3,1,0.1][wellIdx], higherIsBetter:false, unit:'enheter', currentLabel:`${Math.round(alcohol7*10)/10} enheter`, targetLabel:`≤ ${[14,10,7,5,3,1,0.1][wellIdx]} enheter` })] : []),
        ...(supplementCompliance != null ? [makeReq({ label:'Kosttillskott', current:supplementCompliance, target:[50,60,70,80,90,95,99][wellIdx], unit:'%', currentLabel:`${supplementCompliance}%`, targetLabel:`${[50,60,70,80,90,95,99][wellIdx]}%` })] : []),
      ]
      const wellLevelUp = wTs.length ? makeLevelUp(currentWellTier, 8, healthReqs, 'T') : null

      const skillTargets = { 2:30, 3:60, 4:120, 5:240, 6:240 }
      const currentSkillTier = skH ? skTop.tier : 0
      const nextSkillTier = Math.min((currentSkillTier || 1) + 1, 6)
      const skillLevelUp = skH ? makeLevelUp(currentSkillTier, 6, [
        makeReq({ label:'Spanska', current:spM, target:skillTargets[nextSkillTier], unit:'min/v' }),
        makeReq({ label:'Serbiska', current:srM, target:skillTargets[nextSkillTier], unit:'min/v' }),
        makeReq({ label:'Gitarr', current:gtM, target:skillTargets[nextSkillTier], unit:'min/v' }),
      ], 'T') : null

      const bodyLevelUp = latestW?.weight_kg ? {
        currentTier: null,
        nextTier: null,
        maxTier: null,
        title: 'Kroppsstatus',
        progressPct: wP,
        primaryBottleneck: wK <= 0 ? 'På mål' : `${wK} kg kvar till mål`,
        requirements: [
          { label:'Aktuell vikt', currentLabel:`${bw} kg`, targetLabel:`${wGoal} kg`, gapLabel:wK <= 0 ? 'Klar' : `${wK} kg kvar`, met:wK <= 0, missing:false, progress:wP },
          { label:'Trend 14d', currentLabel:(wD>0?'+':'')+wD+' kg', targetLabel:'Nedåt/stabil', gapLabel:wD <= 0 ? 'Bra trend' : 'Fel riktning', met:wD <= 0, missing:false, progress:wD <= 0 ? 100 : 35 },
        ],
        blockers: [],
      } : null

      const strengthTierGuide = bw ? [2,3,4,5,6,7,8].map(t => {
        const i = t - 2
        return { tier:t, label:TIER_NAMES[t], reqs:[
          `Bänk ≥ ${BENCH_THRESHOLDS[i]}x BW (${fmtKg(BENCH_THRESHOLDS[i] * bw)})`,
          `Knäböj ≥ ${SQUAT_THRESHOLDS[i]}x BW (${fmtKg(SQUAT_THRESHOLDS[i] * bw)})`,
          `Marklyft ≥ ${DEADLIFT_THRESHOLDS[i]}x BW (${fmtKg(DEADLIFT_THRESHOLDS[i] * bw)})`,
          ...(t >= 6 ? [`Militärpress ≥ ${OHP_THRESHOLDS[i]}x BW (${fmtKg(OHP_THRESHOLDS[i] * bw)})`] : []),
        ] }
      }) : null

      const r1Evidence = runEvidence(r1Actual, '1 km PR')
      const r5Evidence = runEvidence(r5Actual, '5 km PR')
      const r10Evidence = runEvidence(r10Actual, '10 km PR')
      const rHEvidence = runEvidence(rHActual, 'Halvmara')
      const bEvidence = strengthEvidence('Bänk e1RM', ['bänkpress','bench'])
      const sEvidence = strengthEvidence('Knäböj e1RM', ['knäböj','squat'])
      const dlEvidence = strengthEvidence('Marklyft e1RM', ['marklyft','deadlift'])

      const cats = [
        {id:'kondition',name:'Kondition',icon:'kondition',tier:kTop,hasData:hasRunData,pct:kTop?Math.round((kTop.tier/8)*100):0,decayWarning:[r5D,r10D,rHD,rMD].some(d=>d?.stale),trend:r5D?.daysSince<14?'up':'neutral',
          metrics:[
            {label:'1km PR',value:r1D?formatRunTime(Math.round(r1D.value)):'—',highlight:true,evidence:r1Evidence},
            {label:'5km PR',value:r5D?formatRunTime(Math.round(r5D.value)):'—',evidence:r5Evidence},
            {label:'10km PR',value:r10D?formatRunTime(Math.round(r10D.value)):'—',evidence:r10Evidence}
          ],
          details:[{label:'1km PR',value:sourceValue(r1D?formatRunTime(Math.round(r1D.value)):'—', r1Evidence),tierInfo:r1T},{label:'5km PR',value:sourceValue(r5D?formatRunTime(Math.round(r5D.value)):'—', r5Evidence),tierInfo:r5T},{label:'10km PR',value:sourceValue(r10D?formatRunTime(Math.round(r10D.value)):'—', r10Evidence),tierInfo:r10T},{label:'Halvmara',value:sourceValue(rHD?formatRunTime(Math.round(rHD.value)):'—', rHEvidence),tierInfo:rHT},{label:'Mara',value:rMD?formatRunTime(Math.round(rMD.value)):'—',tierInfo:rMT}],
          chartData:(runData||[]).filter(r=>r.distance_km>=4.5&&r.distance_km<=11).slice(0,20).reverse().map(r=>({date:r.date.slice(5),Pace:r.pace_per_km?Math.round(r.pace_per_km/60*10)/10:null})),
          chartLines:[{key:'Pace',label:'Pace (min/km)',color:'#4f8ef7'}],levelUp:kondLevelUp,navTarget:'/traning',navLabel:'Träning'},
        {id:'styrka',name:'Styrka',icon:'styrka',tier:stTop,hasData:hasStrengthData,pct:strengthLevelUp?.progressPct ?? (stTop?Math.round((stTop.tier/8)*100):0),decayWarning:false,trend:'neutral',
          perExercise: [
            bT && { label:'Bänk',  tier: bT, value: bE1RM, mult: bE1RM ? Math.round(bE1RM/bw*100)/100 : null },
            sT && { label:'Knäböj', tier: sT, value: sE1RM, mult: sE1RM ? Math.round(sE1RM/bw*100)/100 : null },
            dlT && { label:'Mark',  tier: dlT, value: dlE1RM, mult: dlE1RM ? Math.round(dlE1RM/bw*100)/100 : null },
            oT && { label:'OHP',   tier: oT, value: oE1RM, mult: oE1RM ? Math.round(oE1RM/bw*100)/100 : null },
            puT && { label:'Pull-up', tier: puT, value: puE1RM, isBW: true },
            dipT && { label:'Dips', tier: dipT, value: dipE1RM, isBW: true },
          ].filter(Boolean),
          metrics:[
            {label:'Bänk e1RM',value:bE1RM?Math.round(bE1RM)+' kg':'—',highlight:true,evidence:bEvidence},
            {label:'Marklyft e1RM',value:dlE1RM?Math.round(dlE1RM)+' kg':'—',evidence:dlEvidence},
            {label:'Knäböj e1RM',value:sE1RM?Math.round(sE1RM)+' kg':'—',evidence:sEvidence}
          ],
          details:[{label:'Bänkpress e1RM',value:sourceValue(bE1RM?Math.round(bE1RM)+' kg ('+Math.round(bE1RM/bw*100)/100+'x BW)':'—', bEvidence),tierInfo:bT},{label:'Knäböj e1RM',value:sourceValue(sE1RM?Math.round(sE1RM)+' kg ('+Math.round(sE1RM/bw*100)/100+'x BW)':'—', sEvidence),tierInfo:sT},{label:'Marklyft e1RM',value:sourceValue(dlE1RM?Math.round(dlE1RM)+' kg ('+Math.round(dlE1RM/bw*100)/100+'x BW)':'—', dlEvidence),tierInfo:dlT},{label:'Militärpress e1RM',value:oE1RM?Math.round(oE1RM)+' kg':'—',tierInfo:oT},{label:'Weighted pull-up e1RM',value:puE1RM?'+'+Math.round(puE1RM)+' kg':'—',tierInfo:puT}],
          chartData:[],chartLines:[],levelUp:strengthLevelUp,tierGuide:strengthTierGuide,navTarget:'/traning',navLabel:'Träning'},
        {id:'somn',name:'Sömn',icon:'somn',tier:slT,hasData:!!avgSl,pct:slT?Math.round((slT.tier/8)*100):0,decayWarning:false,trend:'neutral',
          metrics:[{label:'Snitt 7 dagar',value:avgSl?avgSl+'h':'—',highlight:true},{label:'Loggar',value:sl7.length+' av 7 dagar'}],
          details:[{label:'Sömnsnitt 7d',value:avgSl?avgSl+' timmar':'—',tierInfo:slT}],
          chartData:(healthData||[]).filter(h=>h.sleep_hours).slice(0,14).reverse().map(h=>({date:h.date.slice(5),Sömn:h.sleep_hours})),
          chartLines:[{key:'Sömn',label:'Timmar',color:'#8b5cf6'}],levelUp:sleepLevelUp,navTarget:'/halsa',navLabel:'Hälsa'},
        {id:'plugg',name:'Plugg',icon:'plugg',tier:pT,hasData:avgM!=null,pct:avgM!=null?avgM:0,decayWarning:false,trend:'neutral',
          metrics:[{label:'Mastery snitt',value:avgM!=null?avgM+'%':'—',highlight:true},{label:'Aktiva mål',value:aG.length}],
          details:[{label:'Mastery snitt',value:avgM!=null?avgM+'%':'—',tierInfo:pT},...Object.entries(byCourse).map(([c,v])=>({label:c,value:Math.round(v.reduce((s,x)=>s+x,0)/v.length)+'%'}))],
          chartData:[],chartLines:[],levelUp:studyLevelUp,navTarget:'/plugg',navLabel:'Plugg'},
        {id:'ekonomi',name:'Ekonomi',icon:'ekonomi',tier:eTop,hasData:!!(totPA||sav!=null),pct:eTop?Math.round((eTop.tier/8)*100):0,decayWarning:false,trend:'neutral',
          metrics:[{label:'Inkomst/period',value:totPA?Math.round(totPA).toLocaleString('sv-SE')+' kr':'—',highlight:true},{label:'Sparkapital',value:sav!=null?sav.toLocaleString('sv-SE')+' kr':'—'}],
          details:[{label:'Netto denna period',value:totPA?Math.round(totPA).toLocaleString('sv-SE')+' kr':'—',tierInfo:incT},{label:'Sparkapital',value:sav!=null?sav.toLocaleString('sv-SE')+' kr':'—',tierInfo:savT}],
          chartData:[],chartLines:[],levelUp:econLevelUp,navTarget:'/ekonomi',navLabel:'Ekonomi'},
        {id:'halsa',name:'Hälsa',icon:'halsa',tier:wTop,hasData:wTs.length>0 || !!latestW?.weight_kg,pct:wTop?Math.round((wTop.tier/8)*100):(latestW?.weight_kg?wP:0),decayWarning:false,trend:aE?(aE>=7?'up':aE<=4?'down':'neutral'):'neutral',
          metrics:[
            {label:'Energi',value:aE!=null?aE+'/10':'—',highlight:true},
            {label:'Humör',value:aMo!=null?aMo+'/10':'—'},
            {label:'Vikttrend',value:wLogs.length?(wD>0?'+':'')+wD+' kg':'—'},
            {label:'Kosttillskott',value:supplementCompliance!=null?supplementCompliance+'%':'—'},
            {label:'Alkohol 7d',value:alcoholLogged?Math.round(alcohol7*10)/10+' enh':'—'},
          ],
          details:[
            {label:'Energi (7d)',value:aE!=null?aE+'/10':'—',tierInfo:eT},
            {label:'Humör (7d)',value:aMo!=null?aMo+'/10':'—',tierInfo:moT},
            {label:'Vikt',value:bw?bw+' kg':'—'},
            {label:'Målvikt',value:wGoal? wGoal+' kg':'—'},
            {label:'Kvar till målvikt',value:bw&&wGoal? wK+' kg':'—'},
            {label:'Vikttrend 14d',value:wLogs.length?(wD>0?'+':'')+wD+' kg':'—'},
            {label:'Kosttillskott',value:supplementCompliance!=null?supplementCompliance+'%':'Ej loggat',tierInfo:supplementT},
            {label:'Alkohol 7d',value:alcoholLogged?Math.round(alcohol7*10)/10+' enheter':'Ej loggat',tierInfo:alcoholT},
          ],
          chartData:(healthData||[]).filter(h=>(h.energy_level ?? h.energy)||h.mood||h.alcohol_units!=null).slice(0,14).reverse().map(h=>({date:h.date.slice(5),Energi:h.energy_level ?? h.energy,Humör:h.mood,Alkohol:h.alcohol_units})),
          chartLines:[{key:'Energi',label:'Energi',color:'#fbbf24'},{key:'Humör',label:'Humör',color:'#34d399'},{key:'Alkohol',label:'Alkohol',color:'#f87171'}],
          levelUp:wellLevelUp,
          navTarget:'/halsa',navLabel:'Hälsa'},
      ]
      // Attach profile-aware percentile to each category (data for cards/DetailModal).
      for (const c of cats) { if (c.tier?.tier) c.percentile = tierToPercentile(c.tier.tier) }
      setCategories(cats)

      // ── Save today's tiers as a snapshot ──────────────────────────────
      const todayStr2 = format(todayDate, 'yyyy-MM-dd')
      const todaySnap = {
        user_id: userId,
        date: todayStr2,
        kondition: cats.find(c=>c.id==='kondition')?.tier?.tier ?? null,
        styrka:    cats.find(c=>c.id==='styrka')?.tier?.tier ?? null,
        plugg:     cats.find(c=>c.id==='plugg')?.tier?.tier ?? null,
        ekonomi:   cats.find(c=>c.id==='ekonomi')?.tier?.tier ?? null,
        valmående: cats.find(c=>c.id==='halsa')?.tier?.tier ?? null,
        score_version: SCORE_VERSION,
      }
      supabase.from('tier_snapshots').upsert(todaySnap, { onConflict: 'user_id,date' })
        .then(() => {}).catch(() => {}) // fire-and-forget, table may not exist yet

      // Store raw data for graph — computed reactively via useMemo when graphPeriod changes
      setRawGraphData({ healthData: healthData || [], snapshots: snapshots || [] })
      const maxx = buildMaxxProfile(cats, tierProfileId)
      setMaxxProfile(maxx)
      setOverallTier(maxx?.tier?.tier || calcOverallTier(cats.filter(c=>c.tier&&c.hasData).map(c=>({tier:c.tier.tier}))))
    } catch(e){ console.error('Dashboard error:',e); toast({ message: 'Kunde inte ladda all dashboarddata', type: 'error' }) }
    finally { setLoading(false) }
  }, [userId, refreshKey, toast, navigate])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  // Graph history computed from cached raw data — no refetch needed on period change
  const tierHistory = useMemo(() => {
    const { healthData, snapshots } = rawGraphData
    const snapshotMap = {}
    for (const s of snapshots) snapshotMap[s.date] = s
    const days = graphPeriod==='7d'?7:graphPeriod==='30d'?30:graphPeriod==='90d'?90:180
    const hist = []
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd')
      const pt = { date: d.slice(5) }
      const hl = healthData.find(h => h.date === d)
      if (hl?.sleep_hours) { const t = getTier(hl.sleep_hours, SLEEP_DURATION_THRESHOLDS, true); if (t) pt['somn'] = t.tier }
      if (hl?.energy_level ?? hl?.energy) { const t = getTier(hl.energy_level ?? hl.energy, ENERGY_THRESHOLDS, true); if (t) pt['valmående'] = t.tier }
      const snap = snapshotMap[d]
      if (snap) {
        if (snap.kondition) pt['kondition'] = snap.kondition
        if (snap.styrka)    pt['styrka']    = snap.styrka
        if (snap.plugg)     pt['plugg']     = snap.plugg
        if (snap.ekonomi)   pt['ekonomi']   = snap.ekonomi
      }
      if (Object.keys(pt).length > 1) hist.push(pt)
    }
    return hist
  }, [rawGraphData, graphPeriod])

  // Overall Maxx trend for the Focus-view sparkline — average tier per logged day.
  const maxxSpark = useMemo(() => tierHistory.map(pt => {
    const vals = ['kondition','styrka','plugg','ekonomi','somn','valmående'].map(k => pt[k]).filter(v => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }), [tierHistory])

  const oColor = overallTier ? (TIER_COLORS[overallTier]||'#6b7280') : '#6b7280'
  const oLabel = overallTier ? TIER_NAMES[overallTier] : '—'

  // Tier-statistik panel — rendered inside the bottom-right corner bubble on hover.
  const graphPanel = (
    <div style={{ padding:'16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
        <span style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'11px', fontWeight:700, color:'var(--muted2)', textTransform:'uppercase', letterSpacing:'0.12em' }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 8px var(--accent-glow)' }} />
          Tier-utveckling
        </span>
        <div style={{ display:'flex', gap:'2px', padding:'2px', borderRadius:'10px', background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)' }}>
          {['7d','30d','90d','1år'].map(p=>(
            <button key={p} onClick={()=>setGraphPeriod(p)} style={{
              padding:'4px 10px', fontSize:'10px', borderRadius:'8px',
              background:graphPeriod===p?'linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 78%, #060914))':'transparent',
              border:'1px solid '+(graphPeriod===p?'var(--accent-border)':'transparent'),
              color:graphPeriod===p?'#fff':'var(--muted)',
              boxShadow:graphPeriod===p?'0 4px 12px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.25)':'none',
              cursor:'pointer', fontWeight:graphPeriod===p?700:500, transition:'all 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}>{p}</button>
          ))}
        </div>
      </div>
      <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', marginBottom:'12px' }}>
        {GRAPH_CATS.map(c=>{
          const active=activeGraphCats.includes(c.id)
          return (
            <button key={c.id} onClick={()=>setActiveGraphCats(p=>p.includes(c.id)?p.filter(x=>x!==c.id):[...p,c.id])} style={{
              display:'flex', alignItems:'center', gap:'5px',
              padding:'3px 10px', fontSize:'10px', borderRadius:'20px',
              background:active?c.color+'1f':'transparent',
              border:'1px solid '+(active?c.color+'55':'var(--border)'),
              color:active?c.color:'var(--muted)',
              boxShadow:active?`0 2px 10px -2px ${c.color}55`:'none',
              cursor:'pointer', transition:'all 0.2s cubic-bezier(0.22,1,0.36,1)', fontWeight:active?700:500,
            }}>
              <div style={{ width:5,height:5,borderRadius:'50%',background:active?c.color:'var(--border)', boxShadow:active?`0 0 6px ${c.color}`:'none' }} />
              {c.label}
            </button>
          )
        })}
      </div>
      {tierHistory.length > 0 ? (
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart data={tierHistory} margin={{top:4,right:4,left:-24,bottom:0}}>
            <defs>
              {GRAPH_CATS.map(c=>(
                <linearGradient key={c.id} id={'grad-'+c.id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={c.color} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={c.color} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <XAxis dataKey="date" tick={{fontSize:10,fill:'var(--muted)'}} tickLine={false} axisLine={false} />
            <YAxis domain={[0,8]} ticks={[1,2,3,4,5,6,7,8]} tick={{fontSize:10,fill:'var(--muted)'}} tickLine={false} axisLine={false} tickFormatter={v=>'T'+v} />
            <Tooltip content={<GraphTooltip />} />
            {GRAPH_CATS.filter(c=>activeGraphCats.includes(c.id)).map((c,i)=>(
              <Area key={c.id} type="monotone" dataKey={c.id} name={c.label}
                stroke={c.color} strokeWidth={2} fill={'url(#grad-'+c.id+')'}
                dot={false} connectNulls strokeDasharray={i>=3?'4 3':undefined} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'10px', padding:'34px 0', textAlign:'center' }}>
          <div style={{ width:'44px', height:'44px', borderRadius:'14px', display:'grid', placeItems:'center', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', boxShadow:'0 0 20px -6px var(--accent-glow)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18M7 14l4-4 3 3 5-6"/></svg>
          </div>
          <div style={{ fontSize:'12.5px', fontWeight:600, color:'var(--muted2)' }}>Ingen tier-historik ännu</div>
          <div style={{ fontSize:'11px', color:'var(--muted)', maxWidth:'220px', lineHeight:1.45 }}>Logga data i Hälsa så börjar din utvecklingskurva byggas upp här.</div>
        </div>
      )}
    </div>
  )

  const dashCorners = [
    {
      id: 'today', anchor: { right: 6, bottom: 6 }, center: { x: 92, y: 90 },
      r: 96, mag: 320, color: '#34d399', label: 'Idag',
      icon: <CalendarDays size={22} />, width: 300, height: 380,
      render: () => <TodayWidget userId={userId} />,
    },
    {
      id: 'stats', anchor: { left: 6, bottom: 6 }, center: { x: 8, y: 90 },
      r: 104, mag: 360, color: '#4f8ef7', label: 'Grafer', sub: overallTier ? 'T' + overallTier : '—',
      icon: <BarChart2 size={22} />, width: 560, height: 360,
      render: () => graphPanel,
    },
  ]

  return (
    <div className="page-wrap">

      {/* HEADER — same structure as Träning, Hälsa etc */}
      <div className="page-header">
        <div>
          <div className="page-header-title">{displayName || 'Dashboard'}</div>
          <div className="page-header-sub">{todayDisplay}{bodyWeight ? ` · ${bodyWeight} kg` : ''}</div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost" onClick={() => setShowWeekly(true)} title="Veckorevy" style={{ gap: 6 }}>
            <Sparkles size={14} /> Veckorevy
          </button>
          <button className="btn btn-ghost" onClick={() => setShowAchievements(true)} title="Utmärkelser" style={{ gap: 6 }}>
            <Trophy size={14} /> Utmärkelser
          </button>
          <div className="dash-mode-toggle" role="tablist" aria-label="Dashboardvy">
            <button role="tab" aria-selected={viewMode === 'map'} className={viewMode === 'map' ? 'active' : ''} onClick={() => setMode('map')} title="Kartvy — constellation"><Orbit size={14} /> Karta</button>
            <button role="tab" aria-selected={viewMode === 'focus'} className={viewMode === 'focus' ? 'active' : ''} onClick={() => setMode('focus')} title="Fokusvy — idag först"><LayoutGrid size={14} /> Fokus</button>
            <button role="tab" aria-selected={viewMode === 'tree'} className={viewMode === 'tree' ? 'active' : ''} onClick={() => setMode('tree')} title="KPI-träd — så byggs Maxx Score"><Network size={14} /> Träd</button>
          </div>
          {overallTier && (
            <div style={{
              display:'flex', alignItems:'center', gap:'8px', padding:'6px 14px 6px 11px', borderRadius:'20px',
              background:`linear-gradient(135deg, ${oColor}26 0%, ${oColor}0f 100%)`,
              border:'1px solid ' + oColor + '4d',
              boxShadow:`0 4px 18px -8px ${oColor}, inset 0 1px 0 rgba(255,255,255,0.12)`,
            }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:oColor, boxShadow:`0 0 8px 1px ${oColor}, 0 0 0 3px ${oColor}22` }} />
              <span style={{ fontSize:'12.5px', fontWeight:800, color:oColor, letterSpacing:'0.02em' }}>T{overallTier}/8</span>
              <span style={{ width:1, height:11, background: oColor + '40' }} />
              <span style={{ fontSize:'11px', fontWeight:600, color: oColor + 'cc', textTransform:'uppercase', letterSpacing:'0.06em' }}>{oLabel}</span>
            </div>
          )}
        </div>
      </div>

      <div className="page-content-scroll">
        <div className="mx-content-edge" style={{ padding:'12px', display:'flex', flexDirection:'column', gap:'14px', maxWidth:'none', margin:'0', width:'100%' }}>

          {/* CONSTELLATION — mind-map of Maxx core + category nodes */}
          {loading ? (
            <div className="grid-4 dashboard-category-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:'12px' }}>
              {[...Array(6)].map((_,i) => (
                <div key={i} className="widget mx-skel" style={{ padding:'18px', minHeight:'120px' }}>
                  <div className="mx-skel-bar" style={{ height:10, width:'40%', marginBottom:10 }} />
                  <div className="mx-skel-bar" style={{ height:28, width:'55%', marginBottom:12 }} />
                  <div className="mx-skel-bar" style={{ height:8, width:'80%' }} />
                </div>
              ))}
            </div>
          ) : viewMode === 'focus' ? (
            <FocusView
              categories={categories}
              maxxProfile={maxxProfile}
              overallTier={overallTier}
              userId={userId}
              maxxSpark={maxxSpark}
              onSelect={setSelectedCategory}
              onMetricClick={(evidence) => { if (evidence?.navTarget) navigate(evidence.navTarget); else setSelectedEvidence(evidence) }}
            />
          ) : viewMode === 'tree' ? (
            <KpiTree
              categories={categories}
              maxxProfile={maxxProfile}
              overallTier={overallTier}
              onSelect={setSelectedCategory}
              onMetricClick={(evidence) => { if (evidence?.navTarget) navigate(evidence.navTarget); else setSelectedEvidence(evidence) }}
            />
          ) : (
            <DashboardConstellation
              categories={categories}
              maxxProfile={maxxProfile}
              overallTier={overallTier}
              onSelect={setSelectedCategory}
              onMetricClick={(evidence) => { if (evidence?.navTarget) navigate(evidence.navTarget); else setSelectedEvidence(evidence) }}
              corners={dashCorners}
            />
          )}

        </div>
      </div>

      {selectedCategory && <DetailModal category={selectedCategory} onClose={()=>setSelectedCategory(null)} />}
      {selectedEvidence && <EvidenceModal evidence={selectedEvidence} onClose={()=>setSelectedEvidence(null)} onNavigate={navigate} />}
      {showWeekly && <WeeklyReview userId={userId} onClose={()=>setShowWeekly(false)} />}
      {showAchievements && <AchievementsModal userId={userId} categories={categories} onClose={()=>setShowAchievements(false)} />}
    </div>
  )
}
