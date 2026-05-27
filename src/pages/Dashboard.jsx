import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { subDays, format } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import CategoryCard from '../components/dashboard/CategoryCard'
import DetailModal from '../components/dashboard/DetailModal'
import TodayWidget from '../components/dashboard/TodayWidget'
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
    <div style={{
      background: 'var(--surface3)', backdropFilter: 'blur(16px)',
      border: '1px solid var(--border2)', borderRadius: '10px',
      padding: '10px 14px', fontSize: '12px',
    }}>
      <div style={{ color: 'var(--muted)', marginBottom: '6px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.stroke }} />
          <span style={{ color: 'var(--muted2)' }}>{p.name}:</span>
          <span style={{ color: p.stroke, fontWeight: 600 }}>T{p.value}</span>
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
        supabase.from('training_sessions').select('id,date,distance_km,time_seconds,pace_per_km,duration_minutes').eq('user_id', userId).gte('date', since90).not('distance_km','is',null).order('date',{ascending:false}),
        supabase.from('personal_records').select('exercise_name,weight_kg,reps,date,updated_at').eq('user_id', userId).order('weight_kg',{ascending:false}),
        supabase.from('health_logs').select('date,weight_kg,sleep_hours,energy_level,stress_level,mood,steps').eq('user_id', userId).gte('date', since90).order('date',{ascending:false}),
        supabase.from('learning_goals').select('id,description,mastery,course_id,courses(name,active)').eq('user_id', userId),
        supabase.from('pa_shifts').select('date,estimated_pay,hours_worked').eq('user_id', userId).gte('date', since30),
        supabase.from('skill_logs').select('date,skill,minutes').eq('user_id', userId).gte('date', since30),
        supabase.from('user_settings').select('goals').eq('user_id', userId).single(),
      ])

      const latestWeight = (healthData||[]).find(h=>h.weight_kg)
      const currentBW = latestWeight?.weight_kg || 77
      setBodyWeight(currentBW)

      function bestRun(km, tol=0.05) {
        const el = (runData||[]).filter(r=>r.distance_km>=km*(1-tol)&&r.distance_km<=km*(1+tol)&&(r.time_seconds||r.pace_per_km))
        if (!el.length) return null
        return el.reduce((b,r)=>{const tb=b.time_seconds||(b.pace_per_km*km);const tr=r.time_seconds||(r.pace_per_km*km);return tr<tb?r:b},el[0])
      }
      function estRun(km) {
        const all=(runData||[]).filter(r=>r.pace_per_km&&r.distance_km>=km*0.5)
        if (!all.length) return null
        const best=all.reduce((b,r)=>r.pace_per_km<b.pace_per_km?r:b,all[0])
        return {time_seconds:Math.round(best.pace_per_km*km),date:best.date}
      }
      function rd(obj,days){if(!obj)return null;return getDecayedValue(obj.time_seconds,obj.date,days)}

      const r5k=bestRun(5)||estRun(5),r10k=bestRun(10)||estRun(10)
      const rHalf=bestRun(21.1,0.03),rMara=bestRun(42.2,0.02),r1k=bestRun(1)||estRun(1)
      const r5kD=rd(r5k,90),r10kD=rd(r10k,90),rHalfD=rd(rHalf,90),rMaraD=rd(rMara,90)

      const vo2max=r5kD?estimateVO2max(r5kD.value):null
      const vo2T=vo2max?getTier(vo2max,VO2MAX_THRESHOLDS,true):null
      const r5T=r5kD?getTier(r5kD.value,RUN_5K_THRESHOLDS,false):null
      const r10T=r10kD?getTier(r10kD.value,RUN_10K_THRESHOLDS,false):null
      const rHT=rHalfD?getTier(rHalfD.value,RUN_HALF_THRESHOLDS,false):null
      const rMT=rMaraD?getTier(rMaraD.value,RUN_MARA_THRESHOLDS,false):null
      const kTiers=[vo2T,r5T,r10T,rHT,rMT].filter(Boolean)
      const kTop=kTiers.length?kTiers.reduce((b,t)=>t.tier>b.tier?t:b,kTiers[0]):null

      function getPR(kws){
        const f=(prData||[]).find(p=>kws.some(k=>p.exercise_name?.toLowerCase().includes(k)))
        if(!f)return null
        const d=f.updated_at?.slice(0,10)||f.date||format(subDays(todayDate,1),'yyyy-MM-dd')
        return getDecayedValue(f.weight_kg,d,60)
      }
      const bD=getPR(['bänkpress','bench']),sD=getPR(['knäböj','squat'])
      const dlD=getPR(['marklyft','deadlift']),oD=getPR(['militärpress','ohp','overhead'])
      const puD=getPR(['pull-up','pullup','chins'])
      const bT=bD?getTier(bD.value/currentBW,BENCH_THRESHOLDS,true):null
      const sT=sD?getTier(sD.value/currentBW,SQUAT_THRESHOLDS,true):null
      const dlT=dlD?getTier(dlD.value/currentBW,DEADLIFT_THRESHOLDS,true):null
      const oT=oD?getTier(oD.value/currentBW,OHP_THRESHOLDS,true):null
      const puT=puD?getTier(puD.value,PULLUP_THRESHOLDS,true):null
      const sTiers=[bT,sT,dlT,oT,puT].filter(Boolean)
      const stTop=sTiers.length?sTiers.reduce((b,t)=>t.tier>b.tier?t:b,sTiers[0]):null

      const wLogs=(healthData||[]).filter(h=>h.weight_kg).slice(0,14)
      const wGoal=userSettings?.goals?.target_weight||75
      const wNew=wLogs[0]?.weight_kg||currentBW,wOld=wLogs[wLogs.length-1]?.weight_kg||currentBW
      const wDelta=Math.round((wNew-wOld)*10)/10
      const wKvar=Math.max(0,Math.round((currentBW-wGoal)*10)/10)
      const wPct=wKvar<=0?100:Math.max(0,Math.round((1-wKvar/Math.max(0.1,currentBW-wGoal+wKvar))*100))

      const since7=format(subDays(todayDate,7),'yyyy-MM-dd')
      const sl7=(healthData||[]).filter(h=>h.sleep_hours&&h.date>=since7)
      const avgSl=sl7.length?Math.round(sl7.reduce((s,h)=>s+h.sleep_hours,0)/sl7.length*10)/10:null
      const slT=avgSl?getTier(avgSl,SLEEP_DURATION_THRESHOLDS,true):null

      const aGoals=(studyData||[]).filter(g=>g.courses?.active)
      const avgM=aGoals.length?Math.round(aGoals.reduce((s,g)=>s+(g.mastery||0),0)/aGoals.length):null
      const pluggT=avgM!=null?getStudyTier(avgM):null
      const byCourse={}
      aGoals.forEach(g=>{const cn=g.courses?.name||'Okänd';if(!byCourse[cn])byCourse[cn]=[];byCourse[cn].push(g.mastery||0)})

      const totalPA=(paData||[]).reduce((s,sh)=>s+(sh.estimated_pay||0),0)
      const savings=userSettings?.goals?.savings||null
      const incT=totalPA?getTier(totalPA,INCOME_THRESHOLDS,true):null
      const savT=savings!=null?getTier(savings,SAVINGS_THRESHOLDS,true):null
      const eTop=[incT,savT].filter(Boolean).reduce((b,t)=>t&&t.tier>(b?.tier||0)?t:b,null)

      function a7(field){const v=(healthData||[]).filter(h=>h.date>=since7&&h[field]!=null).map(h=>h[field]);return v.length?Math.round(v.reduce((s,x)=>s+x,0)/v.length*10)/10:null}
      const aE=a7('energy_level'),aSt=a7('stress_level'),aMo=a7('mood'),aSteps=a7('steps')
      const eT=aE!=null?getTier(aE,ENERGY_THRESHOLDS,true):null
      const stressT=aSt!=null?getTier(aSt,STRESS_THRESHOLDS,false):null
      const moT=aMo!=null?getTier(aMo,MOOD_THRESHOLDS,true):null
      const stepsT=aSteps!=null?getTier(aSteps,STEPS_THRESHOLDS,true):null
      const wTiers=[eT,stressT,moT,stepsT].filter(Boolean)
      const wTop=wTiers.length?wTiers.reduce((b,t)=>t.tier>b.tier?t:b,wTiers[0]):null

      function am(sn){const l=(skillData||[]).filter(s=>s.skill===sn);return l.length?Math.round(l.reduce((s,x)=>s+x.minutes,0)/4):0}
      const spM=am('spanish'),srM=am('serbian'),gtM=am('guitar')
      const spT=getSkillTier(spM),srT=getSkillTier(srM),gtT=getSkillTier(gtM)
      const skTop=[spT,srT,gtT].reduce((b,t)=>t.tier>b.tier?t:b,spT)
      const skHas=!!(skillData?.length)

      const cats = [
        {id:'kondition',name:'Kondition',icon:'⚡',tier:kTop,hasData:kTiers.length>0,pct:kTop?Math.round((kTop.tier/8)*100):0,
          decayWarning:[r5kD,r10kD,rHalfD,rMaraD].some(d=>d?.stale),
          trend:r5kD?.daysSince<14?'up':'neutral',
          metrics:[{label:'5km PR',value:r5kD?formatRunTime(Math.round(r5kD.value)):'—',highlight:true},{label:'10km PR',value:r10kD?formatRunTime(Math.round(r10kD.value)):'—'},{label:'Est. VO2max',value:vo2max?vo2max+' ml/kg/min':'—'}],
          details:[{label:'1km PR',value:r1k?formatRunTime(Math.round(getDecayedValue(r1k.time_seconds,r1k.date,90)?.value||0)):'—'},{label:'5km PR',value:r5kD?formatRunTime(Math.round(r5kD.value)):'—',tierInfo:r5T},{label:'10km PR',value:r10kD?formatRunTime(Math.round(r10kD.value)):'—',tierInfo:r10T},{label:'Halvmara',value:rHalfD?formatRunTime(Math.round(rHalfD.value)):'—',tierInfo:rHT},{label:'Mara',value:rMaraD?formatRunTime(Math.round(rMaraD.value)):'—',tierInfo:rMT},{label:'Est. VO2max',value:vo2max?vo2max+' ml/kg/min':'—',tierInfo:vo2T}],
          chartData:(runData||[]).filter(r=>r.distance_km>=4.5&&r.distance_km<=11).slice(0,20).reverse().map(r=>({date:r.date.slice(5),Pace:r.pace_per_km?Math.round(r.pace_per_km/60*10)/10:null})),
          chartLines:[{key:'Pace',label:'Pace (min/km)',color:'#4f8ef7'}],navTarget:'/traning',navLabel:'Träning'},
        {id:'styrka',name:'Styrka',icon:'🏋️',tier:stTop,hasData:sTiers.length>0,pct:stTop?Math.round((stTop.tier/8)*100):0,
          decayWarning:[bD,sD,dlD,oD,puD].some(d=>d?.stale),trend:'neutral',
          metrics:[{label:'Bänkpress',value:bD?bD.value+' kg':'—',highlight:true},{label:'Marklyft',value:dlD?dlD.value+' kg':'—'},{label:'Knäböj',value:sD?sD.value+' kg':'—'}],
          details:[{label:'Bänkpress',value:bD?bD.value+' kg ('+Math.round(bD.value/currentBW*100)/100+'x)':'—',tierInfo:bT},{label:'Knäböj',value:sD?sD.value+' kg ('+Math.round(sD.value/currentBW*100)/100+'x)':'—',tierInfo:sT},{label:'Marklyft',value:dlD?dlD.value+' kg ('+Math.round(dlD.value/currentBW*100)/100+'x)':'—',tierInfo:dlT},{label:'Militärpress',value:oD?oD.value+' kg':'—',tierInfo:oT},{label:'Pull-ups max',value:puD?puD.value+' reps':'—',tierInfo:puT}],
          chartData:[],chartLines:[],navTarget:'/traning',navLabel:'Träning'},
        {id:'kropp',name:'Kropp',icon:'⚖️',tier:null,hasData:!!latestWeight?.weight_kg,pct:wPct,
          decayWarning:false,trend:wDelta<0?'up':wDelta>0?'down':'neutral',
          metrics:[{label:'Aktuell vikt',value:currentBW+' kg',highlight:true},{label:'Kvar till mål ('+wGoal+'kg)',value:wKvar+' kg'},{label:'Trend 14d',value:(wDelta>0?'+':'')+wDelta+' kg'}],
          details:[{label:'Aktuell vikt',value:currentBW+' kg'},{label:'Målvikt',value:wGoal+' kg'},{label:'Kvar',value:wKvar+' kg'},{label:'Trend 14d',value:wDelta<=0?Math.abs(wDelta)+' kg ned':wDelta+' kg upp'}],
          chartData:[...wLogs].reverse().map(h=>({date:h.date.slice(5),Vikt:h.weight_kg})),
          chartLines:[{key:'Vikt',label:'Vikt (kg)',color:'#fbbf24'}],navTarget:'/halsa',navLabel:'Hälsa'},
        {id:'somn',name:'Sömn',icon:'🌙',tier:slT,hasData:!!avgSl,pct:slT?Math.round((slT.tier/8)*100):0,
          decayWarning:false,trend:'neutral',
          metrics:[{label:'Snitt 7 dagar',value:avgSl?avgSl+'h':'—',highlight:true},{label:'Loggar',value:sl7.length+' av 7 dagar'}],
          details:[{label:'Sömnsnitt 7d',value:avgSl?avgSl+' timmar':'—',tierInfo:slT}],
          chartData:(healthData||[]).filter(h=>h.sleep_hours).slice(0,14).reverse().map(h=>({date:h.date.slice(5),Sömn:h.sleep_hours})),
          chartLines:[{key:'Sömn',label:'Timmar',color:'#8b5cf6'}],navTarget:'/halsa',navLabel:'Hälsa'},
        {id:'plugg',name:'Plugg',icon:'📚',tier:pluggT,hasData:avgM!=null,pct:avgM!=null?avgM:0,
          decayWarning:false,trend:'neutral',
          metrics:[{label:'Genomsnittlig mastery',value:avgM!=null?avgM+'%':'—',highlight:true},{label:'Aktiva mål',value:aGoals.length}],
          details:[{label:'Genomsnittlig mastery',value:avgM!=null?avgM+'%':'—',tierInfo:pluggT},...Object.entries(byCourse).map(([c,v])=>({label:c,value:Math.round(v.reduce((s,x)=>s+x,0)/v.length)+'%'}))],
          chartData:[],chartLines:[],navTarget:'/plugg',navLabel:'Plugg'},
        {id:'ekonomi',name:'Ekonomi',icon:'💰',tier:eTop,hasData:!!(totalPA||savings!=null),pct:eTop?Math.round((eTop.tier/8)*100):0,
          decayWarning:false,trend:'neutral',
          metrics:[{label:'Inkomst denna månad',value:totalPA?Math.round(totalPA).toLocaleString('sv-SE')+' kr':'—',highlight:true},{label:'Sparkapital',value:savings!=null?savings.toLocaleString('sv-SE')+' kr':'—'}],
          details:[{label:'Månadsnettoink.',value:totalPA?Math.round(totalPA).toLocaleString('sv-SE')+' kr':'—',tierInfo:incT},{label:'Sparkapital',value:savings!=null?savings.toLocaleString('sv-SE')+' kr':'—',tierInfo:savT}],
          chartData:[],chartLines:[],navTarget:'/ekonomi',navLabel:'Ekonomi'},
        {id:'valmående',name:'Välmående',icon:'🌱',tier:wTop,hasData:wTiers.length>0,pct:wTop?Math.round((wTop.tier/8)*100):0,
          decayWarning:false,trend:aE?(aE>=7?'up':aE<=4?'down':'neutral'):'neutral',
          metrics:[{label:'Energi snitt',value:aE!=null?aE+'/10':'—',highlight:true},{label:'Humör snitt',value:aMo!=null?aMo+'/10':'—'},{label:'Stress snitt',value:aSt!=null?aSt+'/10':'—'}],
          details:[{label:'Energi (7d)',value:aE!=null?aE+'/10':'—',tierInfo:eT},{label:'Stress (7d)',value:aSt!=null?aSt+'/10':'—',tierInfo:stressT},{label:'Humör (7d)',value:aMo!=null?aMo+'/10':'—',tierInfo:moT},{label:'Steg/dag',value:aSteps!=null?Math.round(aSteps).toLocaleString('sv-SE'):'—',tierInfo:stepsT}],
          chartData:(healthData||[]).filter(h=>h.energy_level||h.mood).slice(0,14).reverse().map(h=>({date:h.date.slice(5),Energi:h.energy_level,Humör:h.mood,Stress:h.stress_level})),
          chartLines:[{key:'Energi',label:'Energi',color:'#fbbf24'},{key:'Humör',label:'Humör',color:'#34d399'},{key:'Stress',label:'Stress',color:'#f87171'}],
          navTarget:'/halsa',navLabel:'Hälsa'},
        {id:'fardigheter',name:'Färdigheter',icon:'🎸',tier:skHas?skTop:null,hasData:skHas,pct:skHas?Math.round((skTop.tier/6)*100):0,
          decayWarning:false,trend:'neutral',
          metrics:[{label:'🇪🇸 Spanska',value:spM?spM+' min/v':'—',highlight:spT.tier>=4},{label:'🇷🇸 Serbiska',value:srM?srM+' min/v':'—'},{label:'🎸 Gitarr',value:gtM?gtM+' min/v':'—'}],
          details:[{label:'Spanska',value:spM+' min/v',tierInfo:spT},{label:'Serbiska',value:srM+' min/v',tierInfo:srT},{label:'Gitarr',value:gtM+' min/v',tierInfo:gtT}],
          chartData:[],chartLines:[],navTarget:null,navLabel:null},
      ]

      setCategories(cats)

      // Build tier history from health_logs
      const days = graphPeriod==='7d'?7:graphPeriod==='30d'?30:graphPeriod==='90d'?90:180
      const hist = (healthData||[]).slice(0, days).reverse().map(h => {
        const pt = { date: h.date.slice(5) }
        if (h.energy_level) { const t=getTier(h.energy_level,ENERGY_THRESHOLDS,true); if(t) pt['valmående']=t.tier }
        if (h.sleep_hours)  { const t=getTier(h.sleep_hours,SLEEP_DURATION_THRESHOLDS,true); if(t) pt['somn']=t.tier }
        const p=cats.find(c=>c.id==='plugg');if(p?.tier) pt['plugg']=p.tier.tier
        const k=cats.find(c=>c.id==='kondition');if(k?.tier) pt['kondition']=k.tier.tier
        const s=cats.find(c=>c.id==='styrka');if(s?.tier) pt['styrka']=s.tier.tier
        const e=cats.find(c=>c.id==='ekonomi');if(e?.tier) pt['ekonomi']=e.tier.tier
        return pt
      })
      setTierHistory(hist)

      const allT=cats.filter(c=>c.tier&&c.hasData).map(c=>({tier:c.tier.tier}))
      setOverallTier(calcOverallTier(allT))
    } catch(err) {
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, refreshKey, graphPeriod])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  const overallColor = overallTier ? (TIER_COLORS[overallTier]||'#6b7280') : '#6b7280'
  const overallLabel = overallTier ? TIER_NAMES[overallTier] : null

  function toggleCat(id) {
    setActiveGraphCats(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id])
  }

  return (
    <div style={{ padding: '0 0 60px 0', maxWidth: '960px', margin: '0 auto' }}>

      {/* HEADER */}
      <div style={{ padding: '28px 28px 22px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: '4px' }}>
              Sigge Gustafsson
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
              {format(todayDate,'EEEE d MMMM yyyy').charAt(0).toUpperCase()+format(todayDate,'EEEE d MMMM yyyy').slice(1)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              Medicinsk student · Termin 3 · {bodyWeight} kg
            </div>
          </div>
          {overallTier && (
            <div className="card-sm" style={{ textAlign:'center', padding:'12px 18px', border:'1px solid '+overallColor+'33' }}>
              <div style={{ fontSize:'10px', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'4px' }}>Övergripande</div>
              <div style={{ fontSize:'17px', fontWeight:700, color:overallColor, letterSpacing:'-0.02em' }}>{overallLabel}</div>
              <div style={{ fontSize:'10px', color:'var(--muted)', marginTop:'2px' }}>Tier {overallTier} / 8</div>
            </div>
          )}
        </div>
      </div>

      {/* MAIN */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 280px', gap:'24px', padding:'24px 28px', alignItems:'start' }}>

        {/* LEFT */}
        <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>

          {/* Category cards */}
          {loading ? (
            <div style={{ color:'var(--muted)', fontSize:'14px', padding:'60px 0', textAlign:'center' }}>Laddar...</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(190px, 1fr))', gap:'10px' }}>
              {categories.map((cat, i) => (
                <div key={cat.id} className={'fade-up fade-up-delay-'+Math.min(i+1,7)}>
                  <CategoryCard category={cat} onClick={setSelectedCategory} />
                </div>
              ))}
            </div>
          )}

          {/* GRAPH — alltid synlig */}
          <div className="card" style={{ padding:'20px' }}>
            {/* Graph header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
              <div style={{ fontSize:'12px', fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                Tier-utveckling
              </div>
              <div style={{ display:'flex', gap:'4px' }}>
                {['7d','30d','90d','1år'].map(p => (
                  <button key={p} onClick={()=>setGraphPeriod(p)} style={{
                    padding:'3px 9px', fontSize:'11px', borderRadius:'6px',
                    background: graphPeriod===p ? 'var(--accent-soft)' : 'transparent',
                    border:'1px solid '+(graphPeriod===p?'var(--accent-border)':'var(--border)'),
                    color: graphPeriod===p?'var(--accent)':'var(--muted)',
                    cursor:'pointer', fontWeight:graphPeriod===p?600:400, transition:'all 0.15s',
                  }}>{p}</button>
                ))}
              </div>
            </div>

            {/* Filter pills */}
            <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', marginBottom:'14px' }}>
              {GRAPH_CATS.map(c => {
                const active = activeGraphCats.includes(c.id)
                return (
                  <button key={c.id} onClick={()=>toggleCat(c.id)} style={{
                    display:'flex', alignItems:'center', gap:'4px',
                    padding:'3px 9px', fontSize:'10px', borderRadius:'20px',
                    background: active?c.color+'15':'transparent',
                    border:'1px solid '+(active?c.color+'40':'var(--border)'),
                    color: active?c.color:'var(--muted)',
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
                <LineChart data={tierHistory} margin={{top:4,right:4,left:-28,bottom:0}}>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:'var(--muted)'}} tickLine={false} axisLine={false} />
                  <YAxis domain={[0,8]} ticks={[1,2,3,4,5,6,7,8]}
                    tick={{fontSize:10,fill:'var(--muted)'}} tickLine={false} axisLine={false}
                    tickFormatter={v=>'T'+v} />
                  <Tooltip content={<GraphTooltip />} />
                  {GRAPH_CATS.filter(c=>activeGraphCats.includes(c.id)).map((c,i)=>(
                    <Line key={c.id} type="monotone" dataKey={c.id} name={c.label}
                      stroke={c.color} strokeWidth={2} dot={false} connectNulls
                      strokeDasharray={i>=3?'4 3':undefined} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ color:'var(--muted)', fontSize:'12px', textAlign:'center', padding:'30px 0', fontStyle:'italic' }}>
                Logga data för att se tier-utveckling
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Today widget */}
        <div style={{ position:'sticky', top:'20px', display:'flex', flexDirection:'column', gap:'12px' }}>
          <TodayWidget userId={userId} />
        </div>
      </div>

      {selectedCategory && (
        <DetailModal category={selectedCategory} onClose={()=>setSelectedCategory(null)} />
      )}
    </div>
  )
}
