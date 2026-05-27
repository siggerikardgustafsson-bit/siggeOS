import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { subDays, format } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase } from '../lib/supabase'
import CategoryCard from '../components/dashboard/CategoryCard'
import DetailModal from '../components/dashboard/DetailModal'
import QuickLog from '../components/dashboard/QuickLog'
import {
  getTier, getStudyTier, getSkillTier, getDecayedValue, calcOverallTier,
  estimateVO2max, formatRunTime,
  VO2MAX_THRESHOLDS, RUN_5K_THRESHOLDS, RUN_10K_THRESHOLDS, RUN_HALF_THRESHOLDS, RUN_MARA_THRESHOLDS,
  BENCH_THRESHOLDS, SQUAT_THRESHOLDS, DEADLIFT_THRESHOLDS, OHP_THRESHOLDS, PULLUP_THRESHOLDS,
  SLEEP_DURATION_THRESHOLDS,
  INCOME_THRESHOLDS, SAVINGS_THRESHOLDS,
  ENERGY_THRESHOLDS, MOOD_THRESHOLDS, STRESS_THRESHOLDS, STEPS_THRESHOLDS,
  TIER_COLORS, TIER_NAMES,
} from '../components/dashboard/tierUtils'

const TIER_CHART_COLORS = {
  kondition: '#4f8ef7',
  styrka:    '#a78bfa',
  kropp:     '#fbbf24',
  somn:      '#8b5cf6',
  plugg:     '#34d399',
  ekonomi:   '#22d3ee',
  valmående: '#f472b6',
  fardigheter: '#fb923c',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(10,12,20,0.92)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '10px',
      padding: '10px 14px',
      fontSize: '12px',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.stroke }} />
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>{p.name}:</span>
          <span style={{ color: p.stroke, fontWeight: 600 }}>Tier {p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categories, setCategories] = useState([])
  const [overallTier, setOverallTier] = useState(null)
  const [bodyWeight, setBodyWeight] = useState(77)
  const [refreshKey, setRefreshKey] = useState(0)
  const [userId, setUserId] = useState(null)
  const [graphPeriod, setGraphPeriod] = useState('30d')
  const [activeGraphCats, setActiveGraphCats] = useState(['somn', 'valmående', 'plugg'])
  const [tierHistory, setTierHistory] = useState([])

  const todayDate = new Date()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id)
    })
  }, [])

  const fetchAllData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const since90 = format(subDays(todayDate, 90), 'yyyy-MM-dd')
      const since30 = format(subDays(todayDate, 30), 'yyyy-MM-dd')

      const [
        { data: runData },
        { data: prData },
        { data: healthData },
        { data: studyData },
        { data: paData },
        { data: skillData },
        { data: userSettings },
      ] = await Promise.all([
        supabase.from('training_sessions').select('id,date,distance_km,time_seconds,pace_per_km,duration_minutes').eq('user_id', userId).gte('date', since90).not('distance_km','is',null).order('date', { ascending: false }),
        supabase.from('personal_records').select('exercise_name,weight_kg,reps,date,updated_at').eq('user_id', userId).order('weight_kg', { ascending: false }),
        supabase.from('health_logs').select('date,weight_kg,sleep_hours,energy_level,stress_level,mood,steps').eq('user_id', userId).gte('date', since90).order('date', { ascending: false }),
        supabase.from('learning_goals').select('id,description,mastery,course_id,courses(name,active)').eq('user_id', userId),
        supabase.from('pa_shifts').select('date,estimated_pay,hours_worked').eq('user_id', userId).gte('date', since30),
        supabase.from('skill_logs').select('date,skill,minutes').eq('user_id', userId).gte('date', since30),
        supabase.from('user_settings').select('goals').eq('user_id', userId).single(),
      ])

      // ── KROPP ──
      const latestWeight = (healthData || []).find(h => h.weight_kg)
      const currentBW = latestWeight?.weight_kg || 77
      setBodyWeight(currentBW)

      // ── KONDITION ──
      function bestRun(targetKm, tol = 0.05) {
        const eligible = (runData || []).filter(r =>
          r.distance_km >= targetKm * (1 - tol) && r.distance_km <= targetKm * (1 + tol) && (r.time_seconds || r.pace_per_km)
        )
        if (!eligible.length) return null
        return eligible.reduce((b, r) => {
          const tb = b.time_seconds || (b.pace_per_km * targetKm)
          const tr = r.time_seconds || (r.pace_per_km * targetKm)
          return tr < tb ? r : b
        }, eligible[0])
      }
      function estRun(targetKm) {
        const all = (runData || []).filter(r => r.pace_per_km && r.distance_km >= targetKm * 0.5)
        if (!all.length) return null
        const best = all.reduce((b, r) => r.pace_per_km < b.pace_per_km ? r : b, all[0])
        return { time_seconds: Math.round(best.pace_per_km * targetKm), date: best.date }
      }
      function runDecay(obj, days) {
        if (!obj) return null
        return getDecayedValue(obj.time_seconds, obj.date, days)
      }

      const run5k  = bestRun(5)    || estRun(5)
      const run10k = bestRun(10)   || estRun(10)
      const runHalf = bestRun(21.1, 0.03)
      const runMara = bestRun(42.2, 0.02)
      const run1k  = bestRun(1)    || estRun(1)

      const run5kD  = runDecay(run5k,  90)
      const run10kD = runDecay(run10k, 90)
      const runHalfD = runDecay(runHalf, 90)
      const runMaraD = runDecay(runMara, 90)

      const vo2max = run5kD ? estimateVO2max(run5kD.value) : null
      const vo2Tier   = vo2max  ? getTier(vo2max, VO2MAX_THRESHOLDS, true) : null
      const run5kTier = run5kD  ? getTier(run5kD.value,  RUN_5K_THRESHOLDS,   false) : null
      const run10kTier= run10kD ? getTier(run10kD.value, RUN_10K_THRESHOLDS,  false) : null
      const runHalfTier=runHalfD? getTier(runHalfD.value,RUN_HALF_THRESHOLDS, false) : null
      const runMaraTier=runMaraD? getTier(runMaraD.value,RUN_MARA_THRESHOLDS, false) : null

      const kondTiers = [vo2Tier,run5kTier,run10kTier,runHalfTier,runMaraTier].filter(Boolean)
      const kondTopTier = kondTiers.length ? kondTiers.reduce((b,t) => t.tier>b.tier?t:b, kondTiers[0]) : null
      const kondPct = kondTopTier ? Math.round((kondTopTier.tier/8)*100) : 0

      // ── STYRKA ──
      function getPR(kws) {
        const found = (prData||[]).find(p => kws.some(k => p.exercise_name?.toLowerCase().includes(k.toLowerCase())))
        if (!found) return null
        const d = found.updated_at?.slice(0,10) || found.date || format(subDays(todayDate,1),'yyyy-MM-dd')
        return getDecayedValue(found.weight_kg, d, 60)
      }
      const benchD    = getPR(['bänkpress','bench'])
      const squatD    = getPR(['knäböj','squat'])
      const deadliftD = getPR(['marklyft','deadlift'])
      const ohpD      = getPR(['militärpress','ohp','overhead'])
      const pullupD   = getPR(['pull-up','pullup','chins'])

      const benchTier   = benchD    ? getTier(benchD.value/currentBW,    BENCH_THRESHOLDS,   true) : null
      const squatTier   = squatD    ? getTier(squatD.value/currentBW,    SQUAT_THRESHOLDS,   true) : null
      const deadliftTier= deadliftD ? getTier(deadliftD.value/currentBW, DEADLIFT_THRESHOLDS,true) : null
      const ohpTier     = ohpD      ? getTier(ohpD.value/currentBW,      OHP_THRESHOLDS,     true) : null
      const pullupTier  = pullupD   ? getTier(pullupD.value,             PULLUP_THRESHOLDS,  true) : null

      const styrTiers = [benchTier,squatTier,deadliftTier,ohpTier,pullupTier].filter(Boolean)
      const styrTopTier = styrTiers.length ? styrTiers.reduce((b,t) => t.tier>b.tier?t:b, styrTiers[0]) : null
      const styrPct = styrTopTier ? Math.round((styrTopTier.tier/8)*100) : 0

      // ── KROPP ──
      const weightLogs = (healthData||[]).filter(h=>h.weight_kg).slice(0,14)
      const weightGoal = userSettings?.goals?.target_weight || 75
      const newestW = weightLogs[0]?.weight_kg || currentBW
      const oldestW = weightLogs[weightLogs.length-1]?.weight_kg || currentBW
      const weightDelta = Math.round((newestW - oldestW) * 10) / 10
      const weightKvar = Math.max(0, Math.round((currentBW - weightGoal)*10)/10)
      const weightPct = weightKvar <= 0 ? 100 : Math.max(0, Math.round((1 - weightKvar/Math.max(0.1,(currentBW - weightGoal + weightKvar)))*100))
      const weightChartData = [...weightLogs].reverse().map(h => ({ date:h.date.slice(5), Vikt:h.weight_kg }))

      // ── SÖMN ──
      const since7 = format(subDays(todayDate,7),'yyyy-MM-dd')
      const sleep7 = (healthData||[]).filter(h=>h.sleep_hours && h.date>=since7)
      const avgSleep = sleep7.length ? Math.round(sleep7.reduce((s,h)=>s+h.sleep_hours,0)/sleep7.length*10)/10 : null
      const somnTier = avgSleep ? getTier(avgSleep, SLEEP_DURATION_THRESHOLDS, true) : null
      const somnPct  = somnTier ? Math.round((somnTier.tier/8)*100) : 0
      const sleepChart = (healthData||[]).filter(h=>h.sleep_hours).slice(0,14).reverse().map(h=>({ date:h.date.slice(5), Sömn:h.sleep_hours }))

      // ── PLUGG ──
      const activeGoals = (studyData||[]).filter(g=>g.courses?.active)
      const avgMastery = activeGoals.length ? Math.round(activeGoals.reduce((s,g)=>s+(g.mastery||0),0)/activeGoals.length) : null
      const pluggTier = avgMastery!=null ? getStudyTier(avgMastery) : null
      const pluggPct  = avgMastery!=null ? avgMastery : 0
      const byCourse  = {}
      activeGoals.forEach(g => {
        const cn = g.courses?.name||'Okänd'
        if (!byCourse[cn]) byCourse[cn]=[]
        byCourse[cn].push(g.mastery||0)
      })

      // ── EKONOMI ──
      const totalPA = (paData||[]).reduce((s,sh)=>s+(sh.estimated_pay||0),0)
      const savings = userSettings?.goals?.savings || null
      const incomeTier  = totalPA ? getTier(totalPA, INCOME_THRESHOLDS, true) : null
      const savingsTier = savings!=null ? getTier(savings, SAVINGS_THRESHOLDS, true) : null
      const ekoTopTier = [incomeTier,savingsTier].filter(Boolean).reduce((b,t) => t&&t.tier>(b?.tier||0)?t:b, null)
      const ekoPct = ekoTopTier ? Math.round((ekoTopTier.tier/8)*100) : 0

      // ── VÄLMÅENDE ──
      function avg7(field) {
        const vals = (healthData||[]).filter(h=>h.date>=since7&&h[field]!=null).map(h=>h[field])
        return vals.length ? Math.round(vals.reduce((s,v)=>s+v,0)/vals.length*10)/10 : null
      }
      const avgEnergy = avg7('energy_level')
      const avgStress = avg7('stress_level')
      const avgMood   = avg7('mood')
      const avgSteps  = avg7('steps')
      const energyTier = avgEnergy!=null ? getTier(avgEnergy,ENERGY_THRESHOLDS,true) : null
      const stressTier = avgStress!=null ? getTier(avgStress,STRESS_THRESHOLDS,false) : null
      const moodTier   = avgMood!=null   ? getTier(avgMood,MOOD_THRESHOLDS,true) : null
      const stepsTier  = avgSteps!=null  ? getTier(avgSteps,STEPS_THRESHOLDS,true) : null
      const wellTiers = [energyTier,stressTier,moodTier,stepsTier].filter(Boolean)
      const wellTopTier = wellTiers.length ? wellTiers.reduce((b,t)=>t.tier>b.tier?t:b,wellTiers[0]) : null
      const wellPct = wellTopTier ? Math.round((wellTopTier.tier/8)*100) : 0
      const wellChart = (healthData||[]).filter(h=>h.energy_level||h.mood).slice(0,14).reverse().map(h=>({
        date:h.date.slice(5), Energi:h.energy_level, Humör:h.mood, Stress:h.stress_level
      }))

      // ── FÄRDIGHETER ──
      function avgMin(sn) {
        const logs = (skillData||[]).filter(s=>s.skill===sn)
        return logs.length ? Math.round(logs.reduce((s,l)=>s+l.minutes,0)/4) : 0
      }
      const spMin = avgMin('spanish')
      const srMin = avgMin('serbian')
      const gtMin = avgMin('guitar')
      const spTier = getSkillTier(spMin)
      const srTier = getSkillTier(srMin)
      const gtTier = getSkillTier(gtMin)
      const skillTop = [spTier,srTier,gtTier].reduce((b,t)=>t.tier>b.tier?t:b,spTier)
      const skillPct = skillTop.tier > 0 ? Math.round((skillTop.tier/6)*100) : 0

      // ── ASSEMBLE ──
      const builtCats = [
        {
          id:'kondition', name:'Kondition', icon:'⚡', tier:kondTopTier, hasData:kondTiers.length>0, pct:kondPct,
          decayWarning:[run5kD,run10kD,runHalfD,runMaraD].some(d=>d?.stale),
          trend: run5kD?.daysSince<14 ? 'up' : 'neutral',
          metrics:[
            { label:'5km PR',    value: run5kD  ? formatRunTime(Math.round(run5kD.value))  : '—', highlight:true },
            { label:'10km PR',   value: run10kD ? formatRunTime(Math.round(run10kD.value)) : '—' },
            { label:'Est. VO2max', value: vo2max ? vo2max+' ml/kg/min' : '—' },
          ],
          details:[
            { label:'1km PR', value: run1k ? formatRunTime(Math.round(getDecayedValue(run1k.time_seconds,run1k.date,90)?.value||0)) : '—' },
            { label:'5km PR',     value:run5kD  ? formatRunTime(Math.round(run5kD.value))  :'—', tierInfo:run5kTier },
            { label:'10km PR',    value:run10kD ? formatRunTime(Math.round(run10kD.value)) :'—', tierInfo:run10kTier },
            { label:'Halvmara',   value:runHalfD? formatRunTime(Math.round(runHalfD.value)):'—', tierInfo:runHalfTier },
            { label:'Mara',       value:runMaraD? formatRunTime(Math.round(runMaraD.value)):'—', tierInfo:runMaraTier },
            { label:'Est. VO2max',value:vo2max  ? vo2max+' ml/kg/min':'—', tierInfo:vo2Tier },
          ],
          chartData: (runData||[]).filter(r=>r.distance_km>=4.5&&r.distance_km<=11).slice(0,20).reverse().map(r=>({ date:r.date.slice(5), 'Pace':r.pace_per_km ? Math.round(r.pace_per_km/60*10)/10 : null })),
          chartLines:[{ key:'Pace', label:'Pace (min/km)', color:'#4f8ef7' }],
          navTarget:'/traning', navLabel:'Träning',
        },
        {
          id:'styrka', name:'Styrka', icon:'🏋️', tier:styrTopTier, hasData:styrTiers.length>0, pct:styrPct,
          decayWarning:[benchD,squatD,deadliftD,ohpD,pullupD].some(d=>d?.stale),
          trend:'neutral',
          metrics:[
            { label:'Bänkpress', value:benchD    ? benchD.value+' kg'    :'—', highlight:true },
            { label:'Marklyft',  value:deadliftD ? deadliftD.value+' kg' :'—' },
            { label:'Knäböj',    value:squatD    ? squatD.value+' kg'    :'—' },
          ],
          details:[
            { label:'Bänkpress',    value:benchD    ? benchD.value+' kg ('+Math.round(benchD.value/currentBW*100)/100+'x BW)':'—', tierInfo:benchTier },
            { label:'Knäböj',       value:squatD    ? squatD.value+' kg ('+Math.round(squatD.value/currentBW*100)/100+'x BW)':'—', tierInfo:squatTier },
            { label:'Marklyft',     value:deadliftD ? deadliftD.value+' kg ('+Math.round(deadliftD.value/currentBW*100)/100+'x BW)':'—', tierInfo:deadliftTier },
            { label:'Militärpress', value:ohpD      ? ohpD.value+' kg':'—', tierInfo:ohpTier },
            { label:'Pull-ups max', value:pullupD   ? pullupD.value+' reps':'—', tierInfo:pullupTier },
          ],
          chartData:[], chartLines:[],
          navTarget:'/traning', navLabel:'Träning',
        },
        {
          id:'kropp', name:'Kropp', icon:'⚖️', tier:null, hasData:!!latestWeight?.weight_kg, pct:weightPct,
          decayWarning:false,
          trend: weightDelta<0?'up':weightDelta>0?'down':'neutral',
          metrics:[
            { label:'Aktuell vikt', value:currentBW+' kg', highlight:true },
            { label:'Kvar till mål ('+weightGoal+'kg)', value:weightKvar+' kg' },
            { label:'Trend 14 dagar', value:(weightDelta>0?'+':'')+weightDelta+' kg' },
          ],
          details:[
            { label:'Aktuell vikt', value:currentBW+' kg' },
            { label:'Målvikt', value:weightGoal+' kg' },
            { label:'Kvar', value:weightKvar+' kg' },
            { label:'Trend 14d', value:weightDelta<=0?Math.abs(weightDelta)+' kg ned':weightDelta+' kg upp' },
          ],
          chartData:weightChartData, chartLines:[{ key:'Vikt', label:'Vikt (kg)', color:'#fbbf24' }],
          navTarget:'/halsa', navLabel:'Hälsa',
        },
        {
          id:'somn', name:'Sömn', icon:'🌙', tier:somnTier, hasData:!!avgSleep, pct:somnPct,
          decayWarning:false, trend:'neutral',
          metrics:[
            { label:'Snitt 7 dagar', value:avgSleep ? avgSleep+'h' : '—', highlight:true },
            { label:'Loggar', value:sleep7.length+' av 7 dagar' },
          ],
          details:[ { label:'Sömnsnitt 7d', value:avgSleep ? avgSleep+' timmar':'—', tierInfo:somnTier } ],
          chartData:sleepChart, chartLines:[{ key:'Sömn', label:'Timmar', color:'#8b5cf6' }],
          navTarget:'/halsa', navLabel:'Hälsa',
        },
        {
          id:'plugg', name:'Plugg', icon:'📚', tier:pluggTier, hasData:avgMastery!=null, pct:pluggPct,
          decayWarning:false, trend:'neutral',
          metrics:[
            { label:'Genomsnittlig mastery', value:avgMastery!=null ? avgMastery+'%':'—', highlight:true },
            { label:'Aktiva mål', value:activeGoals.length },
          ],
          details:[
            { label:'Genomsnittlig mastery', value:avgMastery!=null ? avgMastery+'%':'—', tierInfo:pluggTier },
            ...Object.entries(byCourse).map(([c,vals])=>({ label:c, value:Math.round(vals.reduce((s,v)=>s+v,0)/vals.length)+'%' }))
          ],
          chartData:[], chartLines:[],
          navTarget:'/plugg', navLabel:'Plugg',
        },
        {
          id:'ekonomi', name:'Ekonomi', icon:'💰', tier:ekoTopTier, hasData:!!(totalPA||savings!=null), pct:ekoPct,
          decayWarning:false, trend:'neutral',
          metrics:[
            { label:'Inkomst denna månad', value:totalPA ? Math.round(totalPA).toLocaleString('sv-SE')+' kr':'—', highlight:true },
            { label:'Sparkapital', value:savings!=null ? savings.toLocaleString('sv-SE')+' kr':'—' },
          ],
          details:[
            { label:'Månadsnettoink.', value:totalPA ? Math.round(totalPA).toLocaleString('sv-SE')+' kr':'—', tierInfo:incomeTier },
            { label:'Sparkapital', value:savings!=null ? savings.toLocaleString('sv-SE')+' kr':'—', tierInfo:savingsTier },
          ],
          chartData:[], chartLines:[],
          navTarget:'/ekonomi', navLabel:'Ekonomi',
        },
        {
          id:'valmående', name:'Välmående', icon:'🌱', tier:wellTopTier, hasData:wellTiers.length>0, pct:wellPct,
          decayWarning:false,
          trend: avgEnergy ? (avgEnergy>=7?'up':avgEnergy<=4?'down':'neutral') : 'neutral',
          metrics:[
            { label:'Energi snitt', value:avgEnergy!=null ? avgEnergy+'/10':'—', highlight:true },
            { label:'Humör snitt',  value:avgMood!=null   ? avgMood+'/10':'—' },
            { label:'Stress snitt', value:avgStress!=null ? avgStress+'/10':'—' },
          ],
          details:[
            { label:'Energi (7d)',  value:avgEnergy!=null ? avgEnergy+'/10':'—', tierInfo:energyTier },
            { label:'Stress (7d)',  value:avgStress!=null ? avgStress+'/10':'—', tierInfo:stressTier },
            { label:'Humör (7d)',   value:avgMood!=null   ? avgMood+'/10':'—',   tierInfo:moodTier },
            { label:'Steg/dag',     value:avgSteps!=null  ? Math.round(avgSteps).toLocaleString('sv-SE'):'—', tierInfo:stepsTier },
          ],
          chartData:wellChart, chartLines:[
            { key:'Energi', label:'Energi', color:'#fbbf24' },
            { key:'Humör',  label:'Humör',  color:'#34d399' },
            { key:'Stress', label:'Stress', color:'#f87171' },
          ],
          navTarget:'/halsa', navLabel:'Hälsa',
        },
        {
          id:'fardigheter', name:'Färdigheter', icon:'🎸', tier:!!(skillData?.length) ? skillTop:null, hasData:!!(skillData?.length), pct:skillPct,
          decayWarning:false, trend:'neutral',
          metrics:[
            { label:'🇪🇸 Spanska', value:spMin ? spMin+' min/v':'—', highlight:spTier.tier>=4 },
            { label:'🇷🇸 Serbiska', value:srMin ? srMin+' min/v':'—' },
            { label:'🎸 Gitarr',    value:gtMin ? gtMin+' min/v':'—' },
          ],
          details:[
            { label:'Spanska',  value:spMin+' min/v', tierInfo:spTier },
            { label:'Serbiska', value:srMin+' min/v', tierInfo:srTier },
            { label:'Gitarr',   value:gtMin+' min/v', tierInfo:gtTier },
          ],
          chartData:[], chartLines:[], navTarget:null, navLabel:null,
        },
      ]

      const skillsHasData = !!(skillData?.length)
      builtCats[7].tier = skillsHasData ? skillTop : null
      builtCats[7].hasData = skillsHasData

      setCategories(builtCats)

      // Tier history — fake points per datum baserat på healthData
      const historyPoints = buildTierHistory(healthData||[], builtCats)
      setTierHistory(historyPoints)

      const allTiers = builtCats.filter(c=>c.tier&&c.hasData).map(c=>({ tier:c.tier.tier }))
      setOverallTier(calcOverallTier(allTiers))

    } catch (err) {
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, refreshKey])

  function buildTierHistory(healthData, cats) {
    // Skapa datapunkter per dag de senaste 30 dagarna baserat på health_logs
    const points = []
    const days = graphPeriod === '7d' ? 7 : graphPeriod === '30d' ? 30 : graphPeriod === '90d' ? 90 : 365
    for (let i = Math.min(days-1, healthData.length-1); i >= 0; i--) {
      const h = healthData[i]
      if (!h) continue
      const pt = { date: h.date.slice(5) }
      // Välmående tier från denna dag
      if (h.energy_level) {
        const t = getTier(h.energy_level, ENERGY_THRESHOLDS, true)
        pt['valmående'] = t?.tier || null
      }
      if (h.sleep_hours) {
        const t = getTier(h.sleep_hours, SLEEP_DURATION_THRESHOLDS, true)
        pt['somn'] = t?.tier || null
      }
      // Plugg — statisk från senaste
      const pluggCat = cats.find(c=>c.id==='plugg')
      if (pluggCat?.tier) pt['plugg'] = pluggCat.tier.tier
      points.push(pt)
    }
    return points
  }

  useEffect(() => { fetchAllData() }, [fetchAllData])

  const overallColor = overallTier ? (TIER_COLORS[overallTier]||'#6b7280') : '#6b7280'
  const overallLabel = overallTier ? TIER_NAMES[overallTier] : null

  const graphCatOptions = [
    { id:'somn',       label:'Sömn',       color:'#8b5cf6' },
    { id:'valmående',  label:'Välmående',  color:'#f472b6' },
    { id:'plugg',      label:'Plugg',      color:'#34d399' },
    { id:'kondition',  label:'Kondition',  color:'#4f8ef7' },
    { id:'styrka',     label:'Styrka',     color:'#a78bfa' },
    { id:'ekonomi',    label:'Ekonomi',    color:'#22d3ee' },
  ]

  function toggleGraphCat(id) {
    setActiveGraphCats(prev =>
      prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]
    )
  }

  return (
    <div style={{ padding: '0 0 60px 0', maxWidth: '960px', margin: '0 auto' }}>

      {/* ── HEADER ── */}
      <div style={{ padding: '28px 28px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.03em', marginBottom: '4px' }}>
              Sigge Gustafsson
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>
              {format(todayDate, 'EEEE d MMMM yyyy').charAt(0).toUpperCase() + format(todayDate, 'EEEE d MMMM yyyy').slice(1)}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>
              Medicinsk student · Termin 3 · {bodyWeight} kg
            </div>
          </div>
          {overallTier && (
            <div style={{
              textAlign: 'center',
              background: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid ' + overallColor + '33',
              borderRadius: '14px',
              padding: '12px 20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.06) inset',
            }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                Övergripande
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: overallColor, letterSpacing: '-0.02em' }}>
                {overallLabel}
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '3px' }}>
                Tier {overallTier} / 8
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 290px', gap: '24px', padding: '24px 28px', alignItems: 'start' }}>

        {/* Left: Category cards */}
        <div>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '14px', padding: '60px 0', textAlign: 'center' }}>
              Laddar...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {categories.map((cat, i) => (
                <div key={cat.id} className={'fade-up fade-up-delay-' + Math.min(i+1,7)}>
                  <CategoryCard category={cat} onClick={setSelectedCategory} />
                </div>
              ))}
            </div>
          )}

          {/* ── INTERACTIVE GRAPH ── */}
          {!loading && tierHistory.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(22px)',
                WebkitBackdropFilter: 'blur(22px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.05) inset',
              }}>
                {/* Graph header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Tier-utveckling
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['7d','30d','90d','1år'].map(p => (
                      <button key={p} onClick={() => setGraphPeriod(p)} style={{
                        padding: '4px 10px', fontSize: '11px', borderRadius: '7px',
                        background: graphPeriod===p ? 'rgba(255,255,255,0.1)' : 'transparent',
                        border: '1px solid ' + (graphPeriod===p ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'),
                        color: graphPeriod===p ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)',
                        cursor: 'pointer', fontWeight: graphPeriod===p ? 600 : 400,
                        transition: 'all 0.15s',
                      }}>{p}</button>
                    ))}
                  </div>
                </div>

                {/* Category filter pills */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {graphCatOptions.map(c => {
                    const active = activeGraphCats.includes(c.id)
                    return (
                      <button key={c.id} onClick={() => toggleGraphCat(c.id)} style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '4px 10px', fontSize: '11px', borderRadius: '20px',
                        background: active ? c.color + '18' : 'transparent',
                        border: '1px solid ' + (active ? c.color + '44' : 'rgba(255,255,255,0.08)'),
                        color: active ? c.color : 'rgba(255,255,255,0.25)',
                        cursor: 'pointer', transition: 'all 0.15s', fontWeight: active ? 600 : 400,
                      }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: active ? c.color : 'rgba(255,255,255,0.2)', boxShadow: active ? '0 0 5px '+c.color : 'none' }} />
                        {c.label}
                      </button>
                    )
                  })}
                </div>

                {/* Chart */}
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={tierHistory} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.2)' }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0,8]} ticks={[1,2,3,4,5,6,7,8]} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.2)' }} tickLine={false} axisLine={false}
                      tickFormatter={v => 'T'+v} />
                    <Tooltip content={<CustomTooltip />} />
                    {graphCatOptions.filter(c => activeGraphCats.includes(c.id)).map((c, i) => (
                      <Line key={c.id} type="monotone" dataKey={c.id} name={c.label}
                        stroke={c.color} strokeWidth={2} dot={false}
                        connectNulls={true}
                        strokeDasharray={i >= 2 ? '4 3' : undefined}
                        style={{ filter: 'drop-shadow(0 0 3px ' + c.color + '66)' }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Right: QuickLog */}
        <div style={{ position: 'sticky', top: '20px' }}>
          <QuickLog userId={userId} onSaved={() => setRefreshKey(k => k+1)} />
        </div>
      </div>

      {selectedCategory && (
        <DetailModal category={selectedCategory} onClose={() => setSelectedCategory(null)} />
      )}
    </div>
  )
}
