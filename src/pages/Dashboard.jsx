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
  { id:'valmående', label:'Välmående', color:'#f472b6' },
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

export default function Dashboard() {

  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categories, setCategories] = useState([])
  const [overallTier, setOverallTier] = useState(null)
  const [bodyWeight, setBodyWeight] = useState(77)
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
        { data: exData },
      ] = await Promise.all([
        supabase.from('training_sessions').select('id,date,distance_km,time_seconds,pace_per_km').eq('user_id',userId).gte('date',since90).not('distance_km','is',null).order('date',{ascending:false}),
        supabase.from('personal_records').select('exercise_name,weight_kg,reps,date,updated_at').eq('user_id',userId).order('weight_kg',{ascending:false}),
        supabase.from('health_logs').select('date,weight_kg,sleep_hours,energy_level,stress_level,mood,steps').eq('user_id',userId).gte('date',since90).order('date',{ascending:false}),
        supabase.from('learning_goals').select('id,mastery,course_id,courses(name,active)').eq('user_id',userId),
        supabase.from('pa_shifts').select('date,estimated_pay').eq('user_id',userId).gte('date',since30),
        supabase.from('skill_logs').select('date,skill,minutes').eq('user_id',userId).gte('date',since30),
        supabase.from('user_settings').select('goals').eq('user_id',userId).single(),
        supabase.from('training_exercises')
          .select('exercise_name,reps,weight_kg,training_sessions!inner(date,user_id)')
          .eq('training_sessions.user_id', userId)
          .gte('training_sessions.date', format(subDays(todayDate, 60), 'yyyy-MM-dd'))
          .not('weight_kg','is',null).not('reps','is',null),
      ])

      const latestW = (healthData||[]).find(h=>h.weight_kg)
      const bw = latestW?.weight_kg || 77
      setBodyWeight(bw)

      function bestRun(km,tol=0.05){const el=(runData||[]).filter(r=>r.distance_km>=km*(1-tol)&&r.distance_km<=km*(1+tol)&&(r.time_seconds||r.pace_per_km));if(!el.length)return null;return el.reduce((b,r)=>{const tb=b.time_seconds||(b.pace_per_km*km);const tr=r.time_seconds||(r.pace_per_km*km);return tr<tb?r:b},el[0])}
      function estRun(km){const all=(runData||[]).filter(r=>r.pace_per_km&&r.distance_km>=km*0.5);if(!all.length)return null;const best=all.reduce((b,r)=>r.pace_per_km<b.pace_per_km?r:b,all[0]);return{time_seconds:Math.round(best.pace_per_km*km),date:best.date}}

      // rd: compute time_seconds from pace_per_km if missing (e.g. Strava imports)
      function rd(o,km,d){if(!o)return null;const t=o.time_seconds||(o.pace_per_km&&km?Math.round(o.pace_per_km*km):null);if(!t)return null;return getDecayedValue(t,o.date,d)}
      const r5=bestRun(5)||estRun(5),r10=bestRun(10)||estRun(10)
      const rH=bestRun(21.1,0.03),rM=bestRun(42.2,0.02),r1=bestRun(1)||estRun(1)
      const r1D=rd(r1,1,365),r5D=rd(r5,5,180),r10D=rd(r10,10,180),rHD=rd(rH,21.1,180),rMD=rd(rM,42.2,180)
      const vo2=r5D?estimateVO2max(r5D.value):r1D?estimateVO2max(Math.round(r1D.value*5.5)):null
      const vo2T=vo2?getTier(vo2,VO2MAX_THRESHOLDS,true):null
      const r1T=r1D?getTier(r1D.value,RUN_5K_THRESHOLDS.map(t=>t*0.195),false):null
      const r5T=r5D?getTier(r5D.value,RUN_5K_THRESHOLDS,false):null
      const r10T=r10D?getTier(r10D.value,RUN_10K_THRESHOLDS,false):null
      const rHT=rHD?getTier(rHD.value,RUN_HALF_THRESHOLDS,false):null
      const rMT=rMD?getTier(rMD.value,RUN_MARA_THRESHOLDS,false):null
      const kTs=[vo2T,r5T,r10T,rHT,rMT].filter(Boolean)
      const hasRunData=!!(runData?.length)
      const kTop=kTs.length?kTs.reduce((b,t)=>t.tier>b.tier?t:b,kTs[0]):hasRunData?{tier:1,label:'Botten 50%',color:'#6b7280'}:null

      // Epley formula: e1RM = weight * (1 + reps/30)
      // Brzyckis formula for low reps (≤10): e1RM = weight / (1.0278 - 0.0278*reps)
      function epley(weight, reps) {
        if (!weight || !reps || reps < 1) return null
        if (reps === 1) return weight
        if (reps <= 10) return Math.round(weight / (1.0278 - 0.0278 * reps)) // Brzycki
        return Math.round(weight * (1 + reps / 30)) // Epley
      }

      // Get best estimated 1RM for an exercise from both PRs and recent sets (60 days)
      function getE1RM(keywords) {
        const since60 = format(subDays(todayDate, 60), 'yyyy-MM-dd')
        let best = 0

        // From personal_records (with decay)
        const pr = (prData || []).find(p => keywords.some(k => p.exercise_name?.toLowerCase().includes(k)))
        if (pr) {
          const d = pr.updated_at?.slice(0, 10) || pr.date || format(subDays(todayDate, 1), 'yyyy-MM-dd')
          const decayed = getDecayedValue(pr.weight_kg, d, 60)
          if (decayed) {
            const e = epley(decayed.value, pr.reps || 1)
            if (e > best) best = e
          }
        }

        // From recent training_exercises (last 60 days, no extra decay needed)
        const sets = (exData || []).filter(e =>
          keywords.some(k => e.exercise_name?.toLowerCase().includes(k)) &&
          e.training_sessions?.date >= since60
        )
        for (const s of sets) {
          const e = epley(s.weight_kg, s.reps)
          if (e && e > best) best = e
        }

        return best > 0 ? best : null
      }

      const bE1RM = getE1RM(['bänkpress','bench'])
      const sE1RM = getE1RM(['knäböj','squat'])
      const dlE1RM = getE1RM(['marklyft','deadlift'])
      const oE1RM = getE1RM(['militärpress','ohp','overhead'])
      const puE1RM = getE1RM(['pull-up','pullup','chins','weighted pull'])

      const bT = bE1RM ? getTier(bE1RM/bw, BENCH_THRESHOLDS, true) : null
      const sT = sE1RM ? getTier(sE1RM/bw, SQUAT_THRESHOLDS, true) : null
      const dlT = dlE1RM ? getTier(dlE1RM/bw, DEADLIFT_THRESHOLDS, true) : null
      const oT = oE1RM ? getTier(oE1RM/bw, OHP_THRESHOLDS, true) : null
      const puT = puE1RM ? getTier(puE1RM, PULLUP_THRESHOLDS, true) : null
      const sTs=[bT,sT,dlT,oT,puT].filter(Boolean)
      const stTop=sTs.length?sTs.reduce((b,t)=>t.tier>b.tier?t:b,sTs[0]):null

      const wLogs=(healthData||[]).filter(h=>h.weight_kg).slice(0,14)
      const wGoalRaw = userSettings?.goals?.target_weight || userSettings?.goals?.body_weight_goal || 75
      const wGoal = parseFloat(wGoalRaw) || 75
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
      const incT=totPA?getTier(totPA,INCOME_THRESHOLDS,true):null,savT=sav!=null?getTier(sav,SAVINGS_THRESHOLDS,true):null
      const eTop=[incT,savT].filter(Boolean).reduce((b,t)=>t&&t.tier>(b?.tier||0)?t:b,null)

      function a7(field){const v=(healthData||[]).filter(h=>h.date>=s7&&h[field]!=null).map(h=>h[field]);return v.length?Math.round(v.reduce((s,x)=>s+x,0)/v.length*10)/10:null}
      const aE=a7('energy_level'),aSt=a7('stress_level'),aMo=a7('mood'),aSteps=a7('steps')
      const eT=aE!=null?getTier(aE,ENERGY_THRESHOLDS,true):null,stT=aSt!=null?getTier(aSt,STRESS_THRESHOLDS,false):null
      const moT=aMo!=null?getTier(aMo,MOOD_THRESHOLDS,true):null,stpT=aSteps!=null?getTier(aSteps,STEPS_THRESHOLDS,true):null
      const wTs=[eT,stT,moT,stpT].filter(Boolean)
      const wTop=wTs.length?wTs.reduce((b,t)=>t.tier>b.tier?t:b,wTs[0]):null

      function am(sn){const l=(skillData||[]).filter(s=>s.skill===sn);return l.length?Math.round(l.reduce((s,x)=>s+x.minutes,0)/4):0}
      const spM=am('spanish'),srM=am('serbian'),gtM=am('guitar')
      const spT=getSkillTier(spM),srT=getSkillTier(srM),gtT=getSkillTier(gtM)
      const skTop=[spT,srT,gtT].reduce((b,t)=>t.tier>b.tier?t:b,spT)
      const skH=!!(skillData?.length)

      const cats = [
        {id:'kondition',name:'Kondition',icon:'⚡',tier:kTop,hasData:hasRunData,pct:kTop?Math.round((kTop.tier/8)*100):0,decayWarning:[r5D,r10D,rHD,rMD].some(d=>d?.stale),trend:r5D?.daysSince<14?'up':'neutral',
          metrics:[{label:'1km PR',value:r1D?formatRunTime(Math.round(r1D.value)):'—',highlight:true},{label:'5km PR',value:r5D?formatRunTime(Math.round(r5D.value)):'—'},{label:'VO2max (est)',value:vo2?vo2+' ml/kg/min':'—'}],
          details:[{label:'1km PR',value:r1D?formatRunTime(Math.round(r1D.value)):'—'},{label:'5km PR',value:r5D?formatRunTime(Math.round(r5D.value)):'—',tierInfo:r5T},{label:'10km PR',value:r10D?formatRunTime(Math.round(r10D.value)):'—',tierInfo:r10T},{label:'Halvmara',value:rHD?formatRunTime(Math.round(rHD.value)):'—',tierInfo:rHT},{label:'Mara',value:rMD?formatRunTime(Math.round(rMD.value)):'—',tierInfo:rMT},{label:'VO2max',value:vo2?vo2+' ml/kg/min':'—',tierInfo:vo2T}],
          chartData:(runData||[]).filter(r=>r.distance_km>=4.5&&r.distance_km<=11).slice(0,20).reverse().map(r=>({date:r.date.slice(5),Pace:r.pace_per_km?Math.round(r.pace_per_km/60*10)/10:null})),
          chartLines:[{key:'Pace',label:'Pace (min/km)',color:'#4f8ef7'}],navTarget:'/traning',navLabel:'Träning'},
        {id:'styrka',name:'Styrka',icon:'🏋️',tier:stTop,hasData:sTs.length>0,pct:stTop?Math.round((stTop.tier/8)*100):0,decayWarning:false,trend:'neutral',
          metrics:[{label:'Bänk e1RM',value:bE1RM?Math.round(bE1RM)+' kg':'—',highlight:true},{label:'Marklyft e1RM',value:dlE1RM?Math.round(dlE1RM)+' kg':'—'},{label:'Knäböj e1RM',value:sE1RM?Math.round(sE1RM)+' kg':'—'}],
          details:[{label:'Bänkpress e1RM',value:bE1RM?Math.round(bE1RM)+' kg ('+Math.round(bE1RM/bw*100)/100+'x BW)':'—',tierInfo:bT},{label:'Knäböj e1RM',value:sE1RM?Math.round(sE1RM)+' kg ('+Math.round(sE1RM/bw*100)/100+'x BW)':'—',tierInfo:sT},{label:'Marklyft e1RM',value:dlE1RM?Math.round(dlE1RM)+' kg ('+Math.round(dlE1RM/bw*100)/100+'x BW)':'—',tierInfo:dlT},{label:'Militärpress e1RM',value:oE1RM?Math.round(oE1RM)+' kg':'—',tierInfo:oT},{label:'Weighted pull-up e1RM',value:puE1RM?'+'+Math.round(puE1RM)+' kg':'—',tierInfo:puT}],
          chartData:[],chartLines:[],navTarget:'/traning',navLabel:'Träning'},
        {id:'kropp',name:'Kropp',icon:'⚖️',tier:null,hasData:!!latestW?.weight_kg,pct:wP,decayWarning:false,trend:wD<0?'up':wD>0?'down':'neutral',
          metrics:[{label:'Aktuell vikt',value:bw+' kg',highlight:true},{label:'Kvar ('+wGoal+'kg)',value:wK+' kg'},{label:'Trend 14d',value:(wD>0?'+':'')+wD+' kg'}],
          details:[{label:'Aktuell vikt',value:bw+' kg'},{label:'Målvikt',value:wGoal+' kg'},{label:'Kvar',value:wK+' kg'},{label:'Trend 14d',value:wD<=0?Math.abs(wD)+' kg ned':wD+' kg upp'}],
          chartData:[...wLogs].reverse().map(h=>({date:h.date.slice(5),Vikt:h.weight_kg})),
          chartLines:[{key:'Vikt',label:'Vikt (kg)',color:'#fbbf24'}],navTarget:'/halsa',navLabel:'Hälsa'},
        {id:'somn',name:'Sömn',icon:'🌙',tier:slT,hasData:!!avgSl,pct:slT?Math.round((slT.tier/8)*100):0,decayWarning:false,trend:'neutral',
          metrics:[{label:'Snitt 7 dagar',value:avgSl?avgSl+'h':'—',highlight:true},{label:'Loggar',value:sl7.length+' av 7 dagar'}],
          details:[{label:'Sömnsnitt 7d',value:avgSl?avgSl+' timmar':'—',tierInfo:slT}],
          chartData:(healthData||[]).filter(h=>h.sleep_hours).slice(0,14).reverse().map(h=>({date:h.date.slice(5),Sömn:h.sleep_hours})),
          chartLines:[{key:'Sömn',label:'Timmar',color:'#8b5cf6'}],navTarget:'/halsa',navLabel:'Hälsa'},
        {id:'plugg',name:'Plugg',icon:'📚',tier:pT,hasData:avgM!=null,pct:avgM!=null?avgM:0,decayWarning:false,trend:'neutral',
          metrics:[{label:'Mastery snitt',value:avgM!=null?avgM+'%':'—',highlight:true},{label:'Aktiva mål',value:aG.length}],
          details:[{label:'Mastery snitt',value:avgM!=null?avgM+'%':'—',tierInfo:pT},...Object.entries(byCourse).map(([c,v])=>({label:c,value:Math.round(v.reduce((s,x)=>s+x,0)/v.length)+'%'}))],
          chartData:[],chartLines:[],navTarget:'/plugg',navLabel:'Plugg'},
        {id:'ekonomi',name:'Ekonomi',icon:'💰',tier:eTop,hasData:!!(totPA||sav!=null),pct:eTop?Math.round((eTop.tier/8)*100):0,decayWarning:false,trend:'neutral',
          metrics:[{label:'Inkomst/månad',value:totPA?Math.round(totPA).toLocaleString('sv-SE')+' kr':'—',highlight:true},{label:'Sparkapital',value:sav!=null?sav.toLocaleString('sv-SE')+' kr':'—'}],
          details:[{label:'Månadsnettoink.',value:totPA?Math.round(totPA).toLocaleString('sv-SE')+' kr':'—',tierInfo:incT},{label:'Sparkapital',value:sav!=null?sav.toLocaleString('sv-SE')+' kr':'—',tierInfo:savT}],
          chartData:[],chartLines:[],navTarget:'/ekonomi',navLabel:'Ekonomi'},
        {id:'valmående',name:'Välmående',icon:'🌱',tier:wTop,hasData:wTs.length>0,pct:wTop?Math.round((wTop.tier/8)*100):0,decayWarning:false,trend:aE?(aE>=7?'up':aE<=4?'down':'neutral'):'neutral',
          metrics:[{label:'Energi snitt',value:aE!=null?aE+'/10':'—',highlight:true},{label:'Humör snitt',value:aMo!=null?aMo+'/10':'—'},{label:'Stress snitt',value:aSt!=null?aSt+'/10':'—'}],
          details:[{label:'Energi (7d)',value:aE!=null?aE+'/10':'—',tierInfo:eT},{label:'Stress (7d)',value:aSt!=null?aSt+'/10':'—',tierInfo:stT},{label:'Humör (7d)',value:aMo!=null?aMo+'/10':'—',tierInfo:moT},{label:'Steg/dag',value:aSteps!=null?Math.round(aSteps).toLocaleString('sv-SE'):'—',tierInfo:stpT}],
          chartData:(healthData||[]).filter(h=>h.energy_level||h.mood).slice(0,14).reverse().map(h=>({date:h.date.slice(5),Energi:h.energy_level,Humör:h.mood,Stress:h.stress_level})),
          chartLines:[{key:'Energi',label:'Energi',color:'#fbbf24'},{key:'Humör',label:'Humör',color:'#34d399'},{key:'Stress',label:'Stress',color:'#f87171'}],
          navTarget:'/halsa',navLabel:'Hälsa'},
        {id:'fardigheter',name:'Färdigheter',icon:'🎸',tier:skH?skTop:null,hasData:skH,pct:skH?Math.round((skTop.tier/6)*100):0,decayWarning:false,trend:'neutral',
          metrics:[{label:'🇪🇸 Spanska',value:spM?spM+' min/v':'—',highlight:spT.tier>=4},{label:'🇷🇸 Serbiska',value:srM?srM+' min/v':'—'},{label:'🎸 Gitarr',value:gtM?gtM+' min/v':'—'}],
          details:[{label:'Spanska',value:spM+' min/v',tierInfo:spT},{label:'Serbiska',value:srM+' min/v',tierInfo:srT},{label:'Gitarr',value:gtM+' min/v',tierInfo:gtT}],
          chartData:[],chartLines:[],navTarget:null,navLabel:null},
      ]
      setCategories(cats)

      const days=graphPeriod==='7d'?7:graphPeriod==='30d'?30:graphPeriod==='90d'?90:180
      const hist=(healthData||[]).slice(0,days).reverse().map(h=>{
        const pt={date:h.date.slice(5)}
        if(h.energy_level){const t=getTier(h.energy_level,ENERGY_THRESHOLDS,true);if(t)pt['valmående']=t.tier}
        if(h.sleep_hours){const t=getTier(h.sleep_hours,SLEEP_DURATION_THRESHOLDS,true);if(t)pt['somn']=t.tier}
        const pk=cats.find(c=>c.id==='plugg');if(pk?.tier)pt['plugg']=pk.tier.tier
        const kk=cats.find(c=>c.id==='kondition');if(kk?.tier)pt['kondition']=kk.tier.tier
        const sk=cats.find(c=>c.id==='styrka');if(sk?.tier)pt['styrka']=sk.tier.tier
        const ek=cats.find(c=>c.id==='ekonomi');if(ek?.tier)pt['ekonomi']=ek.tier.tier
        return pt
      })
      setTierHistory(hist)
      setOverallTier(calcOverallTier(cats.filter(c=>c.tier&&c.hasData).map(c=>({tier:c.tier.tier}))))
    } catch(e){ console.error('Dashboard error:',e) }
    finally { setLoading(false) }
  }, [userId, refreshKey, graphPeriod])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  const oColor = overallTier ? (TIER_COLORS[overallTier]||'#6b7280') : '#6b7280'
  const oLabel = overallTier ? TIER_NAMES[overallTier] : '—'

  return (
    <div style={{ padding:'0 0 80px', maxWidth:'1100px', margin:'0 auto' }}>

      {/* HEADER */}
      <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'4px' }} className="dashboard-header-row">
        <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'13px', fontWeight:600, color:'var(--text)' }}>Sigge Gustafsson</span>
          <span style={{ fontSize:'12px', color:'var(--muted)' }}>{todayDisplay}</span>
          <span style={{ fontSize:'11px', color:'var(--muted)' }}>· {bodyWeight} kg</span>
        </div>
        {overallTier && (
          <span style={{ fontSize:'11px', color:'var(--muted)', flexShrink:0 }}>T{overallTier}/8 · {TIER_NAMES[overallTier]}</span>
        )}
      </div>

      <div style={{ padding:'14px 14px', display:'flex', flexDirection:'column', gap:'12px' }}>

        {/* CATEGORY CARDS */}
        {loading ? (
          <div style={{ color:'var(--muted)', fontSize:'14px', padding:'60px 0', textAlign:'center' }}>Laddar...</div>
        ) : (
          <div className="grid-4" style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'10px' }}>
            {categories.map((cat,i) => (
              <div key={cat.id} className={'fade-up fade-up-delay-'+Math.min(i+1,7)}>
                <CategoryCard category={cat} onClick={setSelectedCategory} />
              </div>
            ))}
          </div>
        )}

        {/* BOTTOM ROW — graph + today side by side */}
        <div className="dashboard-bottom" style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 230px', gap:'12px', alignItems:'start' }}>

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

      {selectedCategory && <DetailModal category={selectedCategory} onClose={()=>setSelectedCategory(null)} />}
    </div>
  )
}
