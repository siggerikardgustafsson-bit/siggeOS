import React, { useState, useEffect, useCallback } from 'react'
import { subDays, format } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { supabase } from '../lib/supabase'
import CategoryCard from '../components/dashboard/CategoryCard'
import DetailModal from '../components/dashboard/DetailModal'
import TodayWidget from '../components/dashboard/TodayWidget'
import {
  getTier, getStudyTier, getSkillTier, getDecayedValue, calcOverallTier,
  estimateVO2max, formatRunTime,
  VO2MAX_THRESHOLDS, RUN_5K_THRESHOLDS, RUN_10K_THRESHOLDS, RUN_HALF_THRESHOLDS, RUN_MARA_THRESHOLDS,
  BENCH_THRESHOLDS, SQUAT_THRESHOLDS, DEADLIFT_THRESHOLDS, OHP_THRESHOLDS, PULLUP_THRESHOLDS,
  SLEEP_DURATION_THRESHOLDS, INCOME_THRESHOLDS, SAVINGS_THRESHOLDS,
  ENERGY_THRESHOLDS, MOOD_THRESHOLDS, STRESS_THRESHOLDS, STEPS_THRESHOLDS,
  TIER_COLORS, TIER_NAMES,
} from '../components/dashboard/tierUtils'

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

function buildMaxxProfile(cats) {
  const rankCats = cats.filter(c => c?.tier?.tier && c.hasData && !['kropp','fardigheter'].includes(c.id))
  if (!rankCats.length) return null
  const tiers = rankCats.map(c => c.tier.tier)
  const currentTier = Math.min(...tiers)
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
    contribution: rankCats.map(c => ({ label: c.name, value: `T${c.tier.tier}`, tierInfo: c.tier })),
  }
}

export default function Dashboard() {

  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categories, setCategories] = useState([])
  const [overallTier, setOverallTier] = useState(null)
  const [maxxProfile, setMaxxProfile] = useState(null)
  const [bodyWeight, setBodyWeight] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [userId, setUserId] = useState(null)
  const [graphPeriod, setGraphPeriod] = useState('30d')
  const [activeGraphCats, setActiveGraphCats] = useState(['somn','valmående','plugg'])
  const [tierHistory, setTierHistory] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

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

      const [
        { data: runData }, { data: prData }, { data: healthData },
        { data: studyData }, { data: paData }, { data: skillData }, { data: userSettings },
        { data: exData }, { data: snapshots },
      ] = await Promise.all([
        supabase.from('training_sessions').select('id,date,distance_km,time_seconds,pace_per_km').eq('user_id',userId).gte('date',since90).not('distance_km','is',null).order('date',{ascending:false}),
        supabase.from('personal_records').select('exercise_name,weight_kg,reps,date,updated_at').eq('user_id',userId).order('weight_kg',{ascending:false}),
        supabase.from('health_logs').select('date,weight_kg,sleep_hours,energy,energy_level,stress_level,mood,steps,alcohol_units').eq('user_id',userId).gte('date',since90).order('date',{ascending:false}),
        supabase.from('learning_goals').select('id,mastery,course_id,courses(name,active)').eq('user_id',userId),
        supabase.from('pa_shifts').select('date,estimated_pay').eq('user_id',userId).gte('date',since30),
        supabase.from('skill_logs').select('date,skill,minutes').eq('user_id',userId).gte('date',since30),
        supabase.from('user_settings').select('goals,display_name').eq('user_id',userId).single(),
        supabase.from('training_exercises')
          .select('exercise_name,reps,weight_kg,training_sessions!inner(date,user_id)')
          .eq('training_sessions.user_id', userId)
          .gte('training_sessions.date', format(subDays(todayDate, 60), 'yyyy-MM-dd'))
          .not('weight_kg','is',null).not('reps','is',null),
        supabase.from('tier_snapshots')
          .select('date,kondition,styrka,plugg,ekonomi,somn,valmående')
          .eq('user_id', userId)
          .gte('date', format(subDays(todayDate, 180), 'yyyy-MM-dd'))
          .order('date', { ascending: true })
          .then(r => r) // soft — table may not exist yet
          .catch(() => ({ data: [] })),
      ])

      const latestW = (healthData||[]).find(h=>h.weight_kg)
      const goalWeightRaw = goalValue(userSettings?.goals, ['target_weight','body_weight_goal','weight_goal_kg','målvikt'], null)
      const goalWeight = parseNumber(goalWeightRaw)
      const bw = latestW?.weight_kg || null
      setBodyWeight(bw)
      if (userSettings?.display_name) setDisplayName(userSettings.display_name)

      // Best actual pace-based time for a target distance
      // A longer run gives your actual pace at that distance — not an estimate
      function bestActual(targetKm) {
        // Direct runs within ±10%
        const tol = Math.max(0.5, targetKm * 0.1)
        const direct = (runData||[]).filter(r =>
          r.distance_km >= targetKm - tol &&
          r.distance_km <= targetKm + tol &&
          (r.time_seconds || r.pace_per_km)
        )
        // Longer runs — if you ran 21km you actually ran 1km, 5km, 10km en route
        const longer = (runData||[]).filter(r =>
          r.distance_km > targetKm + tol &&
          (r.time_seconds || r.pace_per_km)
        )
        const all = [...direct, ...longer]
        if (!all.length) return null

        return all.reduce((b, r) => {
          // Use actual pace × targetKm — this IS your actual performance at that distance
          const pace = r.pace_per_km || (r.time_seconds / r.distance_km)
          const t = Math.round(pace * targetKm)
          const bt = b._t
          return t < bt ? { ...r, _t: t } : b
        }, { ...all[0], _t: (() => {
          const r = all[0]
          const pace = r.pace_per_km || (r.time_seconds / r.distance_km)
          return Math.round(pace * targetKm)
        })() })
      }

      function toDecayed(run, targetKm) {
        if (!run) return null
        const pace = run.pace_per_km || (run.time_seconds / run.distance_km)
        const t = run._t || Math.round(pace * targetKm)
        return getDecayedValue(t, run.date, 90)
      }

      const r1D  = toDecayed(bestActual(1), 1)
      const r5D  = toDecayed(bestActual(5), 5)
      const r10D = toDecayed(bestActual(10), 10)
      const rHD  = toDecayed(bestActual(21.1), 21.1)
      const rMD  = toDecayed(bestActual(42.2), 42.2)

      const r1T  = r1D  ? getTier(r1D.value,  RUN_5K_THRESHOLDS.map(t=>t*0.195), false) : null
      const r5T  = r5D  ? getTier(r5D.value,  RUN_5K_THRESHOLDS, false) : null
      const r10T = r10D ? getTier(r10D.value, RUN_10K_THRESHOLDS, false) : null
      const rHT  = rHD  ? getTier(rHD.value,  RUN_HALF_THRESHOLDS, false) : null
      const rMT  = rMD  ? getTier(rMD.value,  RUN_MARA_THRESHOLDS, false) : null

      const hasRunData = !!(runData?.length)

      // Coverage check: a run of distance D covers all shorter required distances
      // (e.g. a halvmara proves you can run 1km, 5km, 10km)
      const longestRun = hasRunData
        ? Math.max(...(runData||[]).map(r => r.distance_km || 0))
        : 0
      const covered1  = !!(r1D  || longestRun >= 1)
      const covered5  = !!(r5D  || longestRun >= 5)
      const covered10 = !!(r10D || longestRun >= 10)
      const coveredH  = !!(rHD  || longestRun >= 21)

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

      const bE1RM = getE1RM(['bänkpress','bench'])
      const sE1RM = getE1RM(['knäböj','squat'])
      const dlE1RM = getE1RM(['marklyft','deadlift'])
      const oE1RM = getE1RM(['militärpress','ohp','overhead'])
      const puE1RM = getE1RM(['pull-up','pullup','chins','weighted pull'], true)
      const dipE1RM = getE1RM(['dips','dip'], true)

      const bT = bE1RM != null ? getTier(bE1RM/bw, BENCH_THRESHOLDS, true) : null
      const sT = sE1RM != null ? getTier(sE1RM/bw, SQUAT_THRESHOLDS, true) : null
      const dlT = dlE1RM != null ? getTier(dlE1RM/bw, DEADLIFT_THRESHOLDS, true) : null
      const oT = oE1RM != null ? getTier(oE1RM/bw, OHP_THRESHOLDS, true) : null
      const puT = puE1RM != null ? getTier(puE1RM, PULLUP_THRESHOLDS, true) : null
      const dipT = dipE1RM != null ? getTier(dipE1RM, PULLUP_THRESHOLDS, true) : null

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
      const slT=avgSl?getTier(avgSl,SLEEP_DURATION_THRESHOLDS,true):null

      const aG=(studyData||[]).filter(g=>g.courses?.active)
      const avgM=aG.length?Math.round(aG.reduce((s,g)=>s+(g.mastery||0),0)/aG.length):null
      const pT=avgM!=null?getStudyTier(avgM):null
      const byCourse={}
      aG.forEach(g=>{const cn=g.courses?.name||'Okänd';if(!byCourse[cn])byCourse[cn]=[];byCourse[cn].push(g.mastery||0)})

      const totPA=(paData||[]).reduce((s,sh)=>s+(sh.estimated_pay||0),0)
      const sav=userSettings?.goals?.savings||null
      const incT=totPA?getTier(totPA,INCOME_THRESHOLDS,true):null
      const savT=sav!=null?getTier(sav,SAVINGS_THRESHOLDS,true):null
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
      const supplementRaw = goalValue(userSettings?.goals, ['supplement_compliance','supplement_compliance_7d','supplementCompliance','kosttillskott_compliance'], null)
      const supplementCompliance = parseNumber(supplementRaw)
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

      const cats = [
        {id:'kondition',name:'Kondition',icon:'kondition',tier:kTop,hasData:hasRunData,pct:kTop?Math.round((kTop.tier/8)*100):0,decayWarning:[r5D,r10D,rHD,rMD].some(d=>d?.stale),trend:r5D?.daysSince<14?'up':'neutral',
          metrics:[{label:'1km PR',value:r1D?formatRunTime(Math.round(r1D.value)):'—',highlight:true},{label:'5km PR',value:r5D?formatRunTime(Math.round(r5D.value)):'—'},{label:'10km PR',value:r10D?formatRunTime(Math.round(r10D.value)):'—'}],
          details:[{label:'1km PR',value:r1D?formatRunTime(Math.round(r1D.value)):'—',tierInfo:r1T},{label:'5km PR',value:r5D?formatRunTime(Math.round(r5D.value)):'—',tierInfo:r5T},{label:'10km PR',value:r10D?formatRunTime(Math.round(r10D.value)):'—',tierInfo:r10T},{label:'Halvmara',value:rHD?formatRunTime(Math.round(rHD.value)):'—',tierInfo:rHT},{label:'Mara',value:rMD?formatRunTime(Math.round(rMD.value)):'—',tierInfo:rMT}],
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
          metrics:[{label:'Bänk e1RM',value:bE1RM?Math.round(bE1RM)+' kg':'—',highlight:true},{label:'Marklyft e1RM',value:dlE1RM?Math.round(dlE1RM)+' kg':'—'},{label:'Knäböj e1RM',value:sE1RM?Math.round(sE1RM)+' kg':'—'}],
          details:[{label:'Bänkpress e1RM',value:bE1RM?Math.round(bE1RM)+' kg ('+Math.round(bE1RM/bw*100)/100+'x BW)':'—',tierInfo:bT},{label:'Knäböj e1RM',value:sE1RM?Math.round(sE1RM)+' kg ('+Math.round(sE1RM/bw*100)/100+'x BW)':'—',tierInfo:sT},{label:'Marklyft e1RM',value:dlE1RM?Math.round(dlE1RM)+' kg ('+Math.round(dlE1RM/bw*100)/100+'x BW)':'—',tierInfo:dlT},{label:'Militärpress e1RM',value:oE1RM?Math.round(oE1RM)+' kg':'—',tierInfo:oT},{label:'Weighted pull-up e1RM',value:puE1RM?'+'+Math.round(puE1RM)+' kg':'—',tierInfo:puT}],
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
          metrics:[{label:'Inkomst/månad',value:totPA?Math.round(totPA).toLocaleString('sv-SE')+' kr':'—',highlight:true},{label:'Sparkapital',value:sav!=null?sav.toLocaleString('sv-SE')+' kr':'—'}],
          details:[{label:'Månadsnettoink.',value:totPA?Math.round(totPA).toLocaleString('sv-SE')+' kr':'—',tierInfo:incT},{label:'Sparkapital',value:sav!=null?sav.toLocaleString('sv-SE')+' kr':'—',tierInfo:savT}],
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
          chartData:(healthData||[]).filter(h=>(h.energy_level ?? h.energy)||h.mood||h.weight_kg||h.alcohol_units!=null).slice(0,14).reverse().map(h=>({date:h.date.slice(5),Energi:h.energy_level ?? h.energy,Humör:h.mood,Vikt:h.weight_kg,Alkohol:h.alcohol_units})),
          chartLines:[{key:'Energi',label:'Energi',color:'#fbbf24'},{key:'Humör',label:'Humör',color:'#34d399'},{key:'Vikt',label:'Vikt',color:'#a78bfa'},{key:'Alkohol',label:'Alkohol',color:'#f87171'}],
          levelUp:wellLevelUp,
          navTarget:'/halsa',navLabel:'Hälsa'},
      ]
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
      }
      supabase.from('tier_snapshots').upsert(todaySnap, { onConflict: 'user_id,date' })
        .then(() => {}).catch(() => {}) // fire-and-forget, table may not exist yet

      // ── Build graph history ────────────────────────────────────────────
      // For sömn + välmående: compute retroactively from health_logs (accurate)
      // For kondition/styrka/plugg/ekonomi: use snapshots table
      const snapshotMap = {}
      for (const s of (snapshots || [])) {
        snapshotMap[s.date] = s
      }

      const days = graphPeriod==='7d'?7:graphPeriod==='30d'?30:graphPeriod==='90d'?90:180

      // Build day-by-day array for the graph period
      const hist = []
      for (let i = days - 1; i >= 0; i--) {
        const d = format(subDays(todayDate, i), 'yyyy-MM-dd')
        const pt = { date: d.slice(5) } // MM-DD

        // Sömn + välmående from health_logs (retroactive)
        const hl = (healthData||[]).find(h => h.date === d)
        if (hl?.sleep_hours) {
          const t = getTier(hl.sleep_hours, SLEEP_DURATION_THRESHOLDS, true)
          if (t) pt['somn'] = t.tier
        }
        if (hl?.energy_level ?? hl?.energy) {
          const t = getTier(hl.energy_level ?? hl.energy, ENERGY_THRESHOLDS, true)
          if (t) pt['valmående'] = t.tier
        }

        // kondition/styrka/plugg/ekonomi from snapshots
        const snap = snapshotMap[d]
        if (snap) {
          if (snap.kondition) pt['kondition'] = snap.kondition
          if (snap.styrka)    pt['styrka']    = snap.styrka
          if (snap.plugg)     pt['plugg']     = snap.plugg
          if (snap.ekonomi)   pt['ekonomi']   = snap.ekonomi
        }

        // Only include days that have at least one value
        if (Object.keys(pt).length > 1) hist.push(pt)
      }
      setTierHistory(hist)
      const maxx = buildMaxxProfile(cats)
      setMaxxProfile(maxx)
      setOverallTier(maxx?.tier?.tier || calcOverallTier(cats.filter(c=>c.tier&&c.hasData).map(c=>({tier:c.tier.tier}))))
    } catch(e){ console.error('Dashboard error:',e) }
    finally { setLoading(false) }
  }, [userId, refreshKey, graphPeriod])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  const oColor = overallTier ? (TIER_COLORS[overallTier]||'#6b7280') : '#6b7280'
  const oLabel = overallTier ? TIER_NAMES[overallTier] : '—'

  return (
    <div className="page-wrap">

      {/* HEADER — same structure as Träning, Hälsa etc */}
      <div className="page-header">
        <div>
          <div className="page-header-title">{displayName || 'Dashboard'}</div>
          <div className="page-header-sub">{todayDisplay}{bodyWeight ? ` · ${bodyWeight} kg` : ''}</div>
        </div>
        {overallTier && (
          <div className="page-header-actions">
            <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'4px 11px', borderRadius:'20px', background: oColor + '12', border:'1px solid ' + oColor + '30' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:oColor, boxShadow:'0 0 6px ' + oColor }} />
              <span style={{ fontSize:'12px', fontWeight:700, color:oColor }}>T{overallTier}/8</span>
              <span style={{ fontSize:'11px', color: oColor + 'aa' }}>{oLabel}</span>
            </div>
          </div>
        )}
      </div>

      <div className="page-content-scroll">
        <div style={{ padding:'12px', display:'flex', flexDirection:'column', gap:'14px', maxWidth:'1240px', margin:'0 auto', width:'100%' }}>

          {/* MAXX SCORE + BOTTLENECK — premium split layout */}
          {!loading && maxxProfile && (
            <div style={{ display:'grid', gridTemplateColumns:'minmax(0, 1.7fr) minmax(280px, .85fr)', gap:'12px', alignItems:'stretch' }} className="dashboard-maxx-row">
              <button onClick={() => setSelectedCategory(maxxProfile)} className="widget" style={{ textAlign:'left', cursor:'pointer', padding:'18px 20px', border:'1px solid ' + ((TIER_COLORS[maxxProfile.tier?.tier] || '#4f8ef7') + '3f'), background:'linear-gradient(135deg, rgba(79,142,247,0.14), rgba(167,139,250,0.08) 45%, var(--surface) 100%)', overflow:'hidden' }}>
                <div style={{ position:'absolute', inset:'-40% auto auto 62%', width:260, height:260, borderRadius:'999px', background:(TIER_COLORS[maxxProfile.levelUp?.nextTier] || '#a78bfa') + '18', filter:'blur(38px)', pointerEvents:'none' }} />
                <div style={{ position:'relative', display:'grid', gridTemplateColumns:'auto minmax(0, 1fr)', gap:'18px', alignItems:'center' }}>
                  <div style={{ width:86, height:86, borderRadius:26, background:'rgba(255,255,255,0.055)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.08)' }}>
                    <span style={{ fontSize:42, lineHeight:1, fontWeight:950, letterSpacing:'-0.08em', color:TIER_COLORS[maxxProfile.tier?.tier] || 'var(--text)' }}>T{maxxProfile.tier?.tier}</span>
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:8 }}>
                      <div>
                        <div style={{ fontSize:10, fontWeight:950, color:'var(--muted)', letterSpacing:'0.16em', textTransform:'uppercase' }}>Maxx Score</div>
                        <div style={{ fontSize:13, color:'var(--muted2)', marginTop:2 }}>Overall rank · {maxxProfile.tier?.label}</div>
                      </div>
                      <div style={{ color:'var(--muted)', fontSize:23, lineHeight:1 }}>→</div>
                    </div>
                    <div style={{ height:9, borderRadius:999, background:'rgba(255,255,255,0.075)', overflow:'hidden', border:'1px solid rgba(255,255,255,0.045)' }}>
                      <div style={{ height:'100%', width:maxxProfile.levelUp.progressPct + '%', borderRadius:999, background:'linear-gradient(90deg, ' + (TIER_COLORS[maxxProfile.tier?.tier] || '#4f8ef7') + ', ' + (TIER_COLORS[maxxProfile.levelUp?.nextTier] || '#a78bfa') + ')', boxShadow:'0 0 18px ' + ((TIER_COLORS[maxxProfile.levelUp?.nextTier] || '#a78bfa') + '66') }} />
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:8, marginTop:11 }}>
                      <div style={{ padding:'8px 10px', borderRadius:12, background:'rgba(0,0,0,0.12)', border:'1px solid var(--border)' }}>
                        <div style={{ fontSize:9, color:'var(--muted)', fontWeight:850, letterSpacing:'0.10em', textTransform:'uppercase' }}>Rank up</div>
                        <div style={{ fontSize:12, color:'var(--text)', fontWeight:800 }}>{maxxProfile.levelUp.title}</div>
                      </div>
                      <div style={{ padding:'8px 10px', borderRadius:12, background:'rgba(0,0,0,0.12)', border:'1px solid var(--border)' }}>
                        <div style={{ fontSize:9, color:'var(--muted)', fontWeight:850, letterSpacing:'0.10em', textTransform:'uppercase' }}>Progress</div>
                        <div style={{ fontSize:12, color:'var(--text)', fontWeight:800 }}>{maxxProfile.levelUp.progressPct}% till nästa</div>
                      </div>
                      <div style={{ padding:'8px 10px', borderRadius:12, background:'rgba(0,0,0,0.12)', border:'1px solid var(--border)' }}>
                        <div style={{ fontSize:9, color:'var(--muted)', fontWeight:850, letterSpacing:'0.10em', textTransform:'uppercase' }}>Krav kvar</div>
                        <div style={{ fontSize:12, color:'var(--text)', fontWeight:800 }}>{maxxProfile.levelUp.blockers?.length || 0}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </button>

              <button onClick={() => setSelectedCategory(maxxProfile)} className="widget" style={{ textAlign:'left', cursor:'pointer', padding:'18px', border:'1px solid ' + ((TIER_COLORS[maxxProfile.levelUp?.nextTier] || '#4f8ef7') + '34'), background:'linear-gradient(135deg, rgba(0,0,0,0.16), var(--surface))', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:134 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:10 }}>
                    <div style={{ fontSize:10, color:'var(--muted)', fontWeight:950, letterSpacing:'0.14em', textTransform:'uppercase' }}>Nästa bottleneck</div>
                    <div style={{ width:26, height:26, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', background:(TIER_COLORS[maxxProfile.levelUp?.nextTier] || '#4f8ef7') + '16', color:TIER_COLORS[maxxProfile.levelUp?.nextTier] || 'var(--accent)', border:'1px solid ' + ((TIER_COLORS[maxxProfile.levelUp?.nextTier] || '#4f8ef7') + '32') }}>↗</div>
                  </div>
                  <div style={{ fontSize:17, lineHeight:1.22, fontWeight:950, color:TIER_COLORS[maxxProfile.levelUp?.nextTier] || 'var(--accent)', marginBottom:8 }}>{maxxProfile.levelUp.primaryBottleneck}</div>
                  <div style={{ fontSize:12, color:'var(--muted2)', lineHeight:1.45 }}>{maxxProfile.levelUp.blockers?.length || 0} krav kvar för nästa overall-rank.</div>
                </div>
                <div style={{ marginTop:16, fontSize:11, color:'var(--muted)', fontWeight:700 }}>Visa rank-up plan →</div>
              </button>
            </div>
          )}

          {/* CATEGORY CARDS */}
          {loading ? (
            <div style={{ color:'var(--muted)', fontSize:'14px', padding:'60px 0', textAlign:'center' }}>Laddar...</div>
          ) : (
            <div className="grid-4 dashboard-category-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:'12px' }}>
              {categories.map((cat,i) => (
                <div key={cat.id} className={'fade-up fade-up-delay-'+Math.min(i+1,7)}>
                  <CategoryCard category={cat} onClick={setSelectedCategory} />
                </div>
              ))}
            </div>
          )}

          {/* BOTTOM ROW — graph + today side by side */}
          <div className="dashboard-bottom" style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 270px', gap:'12px', alignItems:'start' }}>

            {/* GRAPH */}
            <div className="widget" style={{ padding:'18px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                <span style={{ fontSize:'11px', fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>
                  Tier-utveckling
                </span>
                <div style={{ display:'flex', gap:'4px' }}>
                  {['7d','30d','90d','1år'].map(p=>(
                    <button key={p} onClick={()=>setGraphPeriod(p)} style={{
                      padding:'3px 8px', fontSize:'10px', borderRadius:'6px',
                      background:graphPeriod===p?'var(--accent-soft)':'transparent',
                      border:'1px solid '+(graphPeriod===p?'var(--accent-border)':'var(--border)'),
                      color:graphPeriod===p?'var(--accent)':'var(--muted)',
                      cursor:'pointer', fontWeight:graphPeriod===p?600:400, transition:'all 0.15s',
                    }}>{p}</button>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', marginBottom:'12px' }}>
                {GRAPH_CATS.map(c=>{
                  const active=activeGraphCats.includes(c.id)
                  return (
                    <button key={c.id} onClick={()=>setActiveGraphCats(p=>p.includes(c.id)?p.filter(x=>x!==c.id):[...p,c.id])} style={{
                      display:'flex', alignItems:'center', gap:'4px',
                      padding:'2px 8px', fontSize:'10px', borderRadius:'20px',
                      background:active?c.color+'15':'transparent',
                      border:'1px solid '+(active?c.color+'40':'var(--border)'),
                      color:active?c.color:'var(--muted)',
                      cursor:'pointer', transition:'all 0.15s', fontWeight:active?600:400,
                    }}>
                      <div style={{ width:5,height:5,borderRadius:'50%',background:active?c.color:'var(--border)' }} />
                      {c.label}
                    </button>
                  )
                })}
              </div>
              {tierHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
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
                <div style={{ color:'var(--muted)', fontSize:'12px', textAlign:'center', padding:'30px 0', fontStyle:'italic' }}>
                  Logga data i Hälsa för att se tier-utveckling
                </div>
              )}
            </div>

            {/* TODAY WIDGET */}
            <TodayWidget userId={userId} />
          </div>

        </div>
      </div>

      {selectedCategory && <DetailModal category={selectedCategory} onClose={()=>setSelectedCategory(null)} />}
    </div>
  )
}
