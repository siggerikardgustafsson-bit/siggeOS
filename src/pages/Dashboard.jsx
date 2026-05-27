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
export default function Dashboard() {
  return (
    <div style={{ padding:'0 0 80px', maxWidth:'1100px', margin:'0 auto' }}>

      {/* HEADER — minimal */}
      <div style={{ padding:'11px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:'10px' }}>
          <span style={{ fontSize:'14px', fontWeight:600, color:'var(--text)', letterSpacing:'-0.01em' }}>Sigge Gustafsson</span>
          <span style={{ fontSize:'12px', color:'var(--muted)' }}>{todayDisplay}</span>
        </div>
        <span style={{ fontSize:'11px', color:'var(--muted)' }}>
          {bodyWeight} kg{overallTier ? ' · T'+overallTier+'/8' : ''}
        </span>
      </div>

      <div style={{ padding:'16px 24px', display:'flex', flexDirection:'column', gap:'14px' }}>

        {/* CATEGORY CARDS — full width 4 cols */}
        {loading ? (
          <div style={{ color:'var(--muted)', fontSize:'14px', padding:'60px 0', textAlign:'center' }}>Laddar...</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'10px' }}>
            {categories.map((cat,i) => (
              <div key={cat.id} className={'fade-up fade-up-delay-'+Math.min(i+1,7)}>
                <CategoryCard category={cat} onClick={setSelectedCategory} />
              </div>
            ))}
          </div>
        )}

        {/* BOTTOM ROW — graph left, today right */}
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 230px', gap:'14px', alignItems:'start' }}>

          {/* GRAPH */}
          <div className="widget" style={{ padding:'18px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <div style={{ fontSize:'11px', fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>
                Tier-utveckling
              </div>
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
