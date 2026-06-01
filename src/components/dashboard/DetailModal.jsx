import React, { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useNavigate } from 'react-router-dom'

const TIER_COLORS = {
  0:'rgba(255,255,255,0.18)',1:'rgba(255,255,255,0.75)',2:'#4f8ef7',3:'#a78bfa',
  4:'#fbbf24',5:'#34d399',6:'#22d3ee',7:'#f472b6',8:'#fbbf24',
}

const CAT_PATHS = {
  kondition:   'M13 10V3L4 14h7v7l9-11h-7z',
  styrka:      'M6 4v16M18 4v16M3 8h4m10 0h4M3 16h4m10 0h4',
  kropp:       'M12 3a4 4 0 100 8 4 4 0 000-8zM6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2',
  somn:        'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
  plugg:       'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  ekonomi:     'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  valmående:   'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  fardigheter: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
}

function CatIcon({ id, color, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={CAT_PATHS[id] || CAT_PATHS.kondition} />
    </svg>
  )
}

const TIER_REQUIREMENTS = {
  kondition: [
    { tier:2, label:'Top 50%',  reqs:['5km under 28:00','VO2max ≥ 44 ml/kg/min'] },
    { tier:3, label:'Top 30%',  reqs:['5km under 24:00','10km under 50:00','VO2max ≥ 49'] },
    { tier:4, label:'Top 20%',  reqs:['5km under 22:00','10km under 46:00','VO2max ≥ 53'] },
    { tier:5, label:'Top 10%',  reqs:['5km under 20:00','10km under 42:00','Halvmara under 1:38','VO2max ≥ 57'] },
    { tier:6, label:'Top 5%',   reqs:['5km under 18:30','10km under 39:00','Halvmara under 1:31','VO2max ≥ 61'] },
    { tier:7, label:'Top 2.5%', reqs:['5km under 17:00','10km under 36:00','Halvmara under 1:25','VO2max ≥ 65'] },
    { tier:8, label:'Top 1%',   reqs:['5km under 15:30','10km under 33:00','Halvmara under 1:18','Mara under 2:45','VO2max ≥ 70'] },
  ],
  styrka: [
    { tier:2, label:'Top 50%',  reqs:['Bänk ≥ 0.75x BW (~58kg)','Knäböj ≥ 1.0x BW (~77kg)','Mark ≥ 1.25x BW (~96kg)'] },
    { tier:3, label:'Top 30%',  reqs:['Bänk ≥ 1.0x BW (~77kg)','Knäböj ≥ 1.25x BW (~96kg)','Mark ≥ 1.5x BW (~116kg)'] },
    { tier:4, label:'Top 20%',  reqs:['Bänk ≥ 1.15x BW (~89kg)','Knäböj ≥ 1.4x BW (~108kg)','Mark ≥ 1.7x BW (~131kg)'] },
    { tier:5, label:'Top 10%',  reqs:['Bänk ≥ 1.3x BW (~100kg)','Knäböj ≥ 1.6x BW (~123kg)','Mark ≥ 1.9x BW (~146kg)'] },
    { tier:6, label:'Top 5%',   reqs:['Bänk ≥ 1.5x BW (~116kg)','Knäböj ≥ 1.75x BW (~135kg)','Mark ≥ 2.1x BW (~162kg)','OHP ≥ 1.0x BW'] },
    { tier:7, label:'Top 2.5%', reqs:['Bänk ≥ 1.65x BW (~127kg)','Knäböj ≥ 1.9x BW (~146kg)','Mark ≥ 2.3x BW (~177kg)'] },
    { tier:8, label:'Top 1%',   reqs:['Bänk ≥ 1.8x BW (~139kg)','Knäböj ≥ 2.1x BW (~162kg)','Mark ≥ 2.5x BW (~193kg)','Pull-ups ≥ 28 reps'] },
  ],
  somn: [
    { tier:2, label:'Top 50%',  reqs:['Sov i snitt ≥ 6.5 timmar/natt'] },
    { tier:3, label:'Top 30%',  reqs:['Sov i snitt ≥ 7.0 timmar/natt','Logga sömn ≥ 5 av 7 dagar'] },
    { tier:4, label:'Top 20%',  reqs:['Sov i snitt ≥ 7.5 timmar/natt'] },
    { tier:5, label:'Top 10%',  reqs:['Sov i snitt ≥ 8.0 timmar/natt','Konsekvent läggtid'] },
    { tier:6, label:'Top 5%',   reqs:['Sov i snitt ≥ 8.5 timmar/natt','Variation i läggtid < 15 min'] },
    { tier:7, label:'Top 2.5%', reqs:['≥ 8.5h + perfekt sömnregelbundenhet'] },
    { tier:8, label:'Top 1%',   reqs:['Sov i snitt ≥ 9h/natt','Optimal sömnkonsistens'] },
  ],
  plugg: [
    { tier:1, label:'Nybörjare',     reqs:['Mastery 0–20%'] },
    { tier:2, label:'Grundläggande', reqs:['Mastery ≥ 20%','Börja repetera aktivt'] },
    { tier:3, label:'Medel',         reqs:['Mastery ≥ 40%','Aktiv drilling på svaga områden'] },
    { tier:4, label:'Avancerad',     reqs:['Mastery ≥ 60%','Lösa kliniska fall självständigt'] },
    { tier:5, label:'Expert',        reqs:['Mastery ≥ 80%','Förklara alla mekanismer utan anteckningar'] },
  ],
  ekonomi: [
    { tier:2, label:'Top 50%',  reqs:['Nettoinkomst ≥ 12 000 kr/mån'] },
    { tier:3, label:'Top 30%',  reqs:['Nettoinkomst ≥ 18 000 kr/mån','Sparat ≥ 20 000 kr'] },
    { tier:4, label:'Top 20%',  reqs:['Nettoinkomst ≥ 22 000 kr/mån','Sparat ≥ 50 000 kr'] },
    { tier:5, label:'Top 10%',  reqs:['Nettoinkomst ≥ 28 000 kr/mån','Sparat ≥ 100 000 kr'] },
    { tier:6, label:'Top 5%',   reqs:['Nettoinkomst ≥ 35 000 kr/mån','Sparat ≥ 200 000 kr'] },
    { tier:7, label:'Top 2.5%', reqs:['Nettoinkomst ≥ 45 000 kr/mån','Sparat ≥ 350 000 kr'] },
    { tier:8, label:'Top 1%',   reqs:['Nettoinkomst ≥ 60 000 kr/mån','Sparat ≥ 500 000 kr'] },
  ],
  valmående: [
    { tier:2, label:'Top 50%',  reqs:['Energi ≥ 5/10','Humör ≥ 5/10','≥ 5 000 steg/dag'] },
    { tier:3, label:'Top 30%',  reqs:['Energi ≥ 6/10','Stress ≤ 5/10','≥ 7 500 steg/dag'] },
    { tier:4, label:'Top 20%',  reqs:['Energi ≥ 7/10','Humör ≥ 7/10','Stress ≤ 4/10','≥ 9 000 steg/dag'] },
    { tier:5, label:'Top 10%',  reqs:['Energi ≥ 8/10','Stress ≤ 3/10','≥ 11 000 steg/dag'] },
    { tier:6, label:'Top 5%',   reqs:['Energi ≥ 9/10','Stress ≤ 2/10','≥ 13 000 steg/dag'] },
    { tier:7, label:'Top 2.5%', reqs:['Alla metrics i toppklass konsekvent'] },
    { tier:8, label:'Top 1%',   reqs:['Energi/humör ≥ 9.5/10','Stress ≤ 1.5/10','≥ 15 000 steg/dag'] },
  ],
  fardigheter: [
    { tier:2, label:'Nybörjare',   reqs:['1–30 min/vecka i snitt'] },
    { tier:3, label:'Regelbunden', reqs:['30–60 min/vecka i snitt'] },
    { tier:4, label:'Dedikerad',   reqs:['60–120 min/vecka i snitt'] },
    { tier:5, label:'Seriös',      reqs:['120–240 min/vecka i snitt'] },
    { tier:6, label:'Mästare',     reqs:['240+ min/vecka (4+ timmar)'] },
  ],
  kropp: [],
}

const CustomTooltip = ({ active, payload, label, tierColor }) => {
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
      <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.stroke, fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

export default function DetailModal({ category, onClose }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('30d')
  if (!category) return null

  const { name, tier, metrics = [], details = [], chartData, chartLines, navTarget, navLabel, id, perExercise } = category
  const isBody = id === 'kropp'
  const tierNum = tier?.tier || 0
  const tierColor = isBody ? '#34d399' : (TIER_COLORS[tierNum] || '#6b7280')
  const nextTier = tierNum > 0 && tierNum < 8 ? tierNum + 1 : null
  const requirements = TIER_REQUIREMENTS[id] || []
  const nextTierReqs = nextTier ? requirements.find(r => r.tier === nextTier) : null
  const periods = ['7d', '30d', '90d', '1år']

  const scoredDetails = details.filter(d => d?.tierInfo?.tier)
  const bottleneck = id === 'styrka' && perExercise?.length
    ? perExercise.slice().sort((a,b)=>(a.tier?.tier || 0) - (b.tier?.tier || 0))[0]
    : scoredDetails.slice().sort((a,b)=>(a.tierInfo?.tier || 0) - (b.tierInfo?.tier || 0))[0]

  const completedCount = nextTier
    ? scoredDetails.filter(d => (d.tierInfo?.tier || 0) >= nextTier).length
    : scoredDetails.length
  const progressDenom = Math.max(scoredDetails.length, nextTierReqs?.reqs?.length || 0, 1)
  const progressPct = isBody
    ? Math.max(0, Math.min(100, category.pct || 0))
    : tierNum > 0
      ? Math.round(Math.min(100, Math.max(12, ((tierNum - 1) / 7) * 100 + (completedCount / progressDenom) * 12)))
      : 0

  const primaryMetric = metrics[0]
  const bottleneckLabel = bottleneck
    ? bottleneck.label || bottleneck.exercise_name || 'Svagaste krav'
    : isBody ? 'Målvikt / trend' : 'Logga mer data'
  const bottleneckValue = bottleneck
    ? bottleneck.valueText || bottleneck.value || bottleneck.mult || bottleneck.tier?.label || bottleneck.tierInfo?.label || ''
    : ''

  const objectiveRows = nextTierReqs?.reqs?.length
    ? nextTierReqs.reqs.map((req, i) => {
        const source = scoredDetails[i]
        const done = source?.tierInfo?.tier >= nextTier
        return { label: req, done, source }
      })
    : scoredDetails.map(d => ({ label: d.label + (d.value ? ` · ${d.value}` : ''), done: true, source: d }))

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 680, maxHeight: '88vh', overflowY: 'auto', position: 'relative',
        background: 'linear-gradient(180deg, rgba(18,22,35,0.94), rgba(10,12,20,0.92))',
        backdropFilter: 'blur(42px)', WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid rgba(255,255,255,0.11)', borderRadius: 24,
        boxShadow: '0 34px 90px rgba(0,0,0,0.68), 0 1px 0 rgba(255,255,255,0.08) inset',
        scrollbarWidth: 'none',
      }}>
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:`radial-gradient(circle at 82% 4%, ${tierColor}22, transparent 34%), radial-gradient(circle at 8% 18%, rgba(79,142,247,0.10), transparent 30%)` }} />
        <div style={{ position:'absolute', top:0, left:'18%', right:'18%', height:1, background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.24), transparent)' }} />

        <div style={{ position:'sticky', top:0, zIndex:5, padding:'18px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, borderBottom:'1px solid rgba(255,255,255,0.075)', borderRadius:'24px 24px 0 0', background:'rgba(12,15,26,0.72)', backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:13, minWidth:0 }}>
            <div style={{ width:44, height:44, borderRadius:15, display:'flex', alignItems:'center', justifyContent:'center', background:tierColor+'18', border:'1px solid '+tierColor+'36', boxShadow:'0 1px 0 rgba(255,255,255,0.06) inset' }}>
              <CatIcon id={id} color={tierColor} size={21} />
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <div style={{ fontSize:18, fontWeight:720, color:'rgba(255,255,255,0.94)', letterSpacing:'-0.035em' }}>{name}</div>
                {!isBody && tierNum > 0 && <div style={{ padding:'3px 8px', borderRadius:999, background:tierColor+'16', border:'1px solid '+tierColor+'35', color:tierColor, fontSize:10, fontWeight:850, letterSpacing:'0.06em' }}>T{tierNum}</div>}
              </div>
              <div style={{ marginTop:3, color:'rgba(255,255,255,0.42)', fontSize:12 }}>{isBody ? 'Kroppslig status och trend' : nextTier ? `Maxx plan mot Tier ${nextTier}` : tierNum >= 8 ? 'Maxad kategori' : 'Börja logga data'}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:10, border:'1px solid rgba(255,255,255,0.11)', background:'rgba(255,255,255,0.055)', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:16 }}>×</button>
        </div>

        <div style={{ position:'relative', padding:'22px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1.05fr 0.95fr', gap:12, marginBottom:12 }} className="grid-2">
            <div style={{ border:'1px solid rgba(255,255,255,0.08)', borderRadius:18, padding:16, background:'rgba(255,255,255,0.045)', overflow:'hidden', position:'relative' }}>
              <div style={{ position:'absolute', right:-30, top:-30, width:110, height:110, borderRadius:'50%', background:tierColor+'14', filter:'blur(28px)' }} />
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.36)', textTransform:'uppercase', letterSpacing:'0.12em', fontWeight:750, marginBottom:7 }}>Current level</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                <span style={{ fontSize:40, lineHeight:1, fontWeight:850, color:tierColor, letterSpacing:'-0.07em' }}>{isBody ? (primaryMetric?.value || '—') : tierNum ? `T${tierNum}` : '—'}</span>
                {!isBody && tier?.label && <span style={{ color:'rgba(255,255,255,0.58)', fontSize:14, fontWeight:600 }}>{tier.label}</span>}
              </div>
              <div style={{ marginTop:14, height:7, borderRadius:999, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
                <div style={{ width:`${progressPct}%`, height:'100%', borderRadius:999, background:`linear-gradient(90deg, ${tierColor}, rgba(255,255,255,0.76))`, boxShadow:'0 0 18px '+tierColor+'55' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', color:'rgba(255,255,255,0.38)', fontSize:11, marginTop:7 }}>
                <span>{isBody ? 'Mot mål' : nextTier ? `Progress mot T${nextTier}` : 'Progress'}</span>
                <span>{progressPct}%</span>
              </div>
            </div>

            <div style={{ border:'1px solid '+tierColor+'24', borderRadius:18, padding:16, background:tierColor+'0d' }}>
              <div style={{ fontSize:10, color:tierColor, textTransform:'uppercase', letterSpacing:'0.12em', fontWeight:800, marginBottom:8 }}>Bottleneck</div>
              <div style={{ fontSize:20, color:'rgba(255,255,255,0.92)', fontWeight:760, letterSpacing:'-0.04em', marginBottom:5 }}>{bottleneckLabel}</div>
              <div style={{ color:'rgba(255,255,255,0.50)', fontSize:12, lineHeight:1.45 }}>{bottleneckValue ? String(bottleneckValue) : isBody ? 'Håll koll på vikttrend och loggningsfrekvens.' : 'Det här är den svagaste länken för nästa level-up.'}</div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:14 }} className="grid-3">
            {metrics.slice(0, 6).map((m, i) => (
              <div key={i} style={{ padding:'11px 12px', borderRadius:14, background:'rgba(255,255,255,0.038)', border:'1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.34)', marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.label}</div>
                <div style={{ fontSize:14, fontWeight:720, color:m.highlight ? tierColor : 'rgba(255,255,255,0.86)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.value}</div>
              </div>
            ))}
          </div>

          {details.length > 0 && (
            <div style={{ marginBottom:14, border:'1px solid rgba(255,255,255,0.075)', borderRadius:18, overflow:'hidden', background:'rgba(255,255,255,0.032)' }}>
              <div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,0.065)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.12em', color:'rgba(255,255,255,0.36)', fontWeight:800 }}>Metrics breakdown</div>
              <div style={{ padding:10, display:'grid', gap:7 }}>
                {details.map((d, i) => {
                  const dColor = d.tierInfo ? (TIER_COLORS[d.tierInfo.tier] || tierColor) : 'rgba(255,255,255,0.38)'
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'8px 10px', borderRadius:12, background:'rgba(255,255,255,0.032)' }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ color:'rgba(255,255,255,0.82)', fontSize:13, fontWeight:620, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d.label}</div>
                        {d.tierInfo?.label && <div style={{ color:dColor, fontSize:10, marginTop:1 }}>{d.tierInfo.label}</div>}
                      </div>
                      <div style={{ color:dColor, fontSize:13, fontWeight:760, whiteSpace:'nowrap' }}>{d.value}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {objectiveRows.length > 0 && !isBody && (
            <div style={{ marginBottom:14, border:'1px solid '+tierColor+'24', borderRadius:18, background:tierColor+'08', overflow:'hidden' }}>
              <div style={{ padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid rgba(255,255,255,0.065)' }}>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.12em', color:tierColor, fontWeight:850 }}>Level-up requirements</div>
                {nextTier && <div style={{ fontSize:10, color:'rgba(255,255,255,0.42)' }}>Target T{nextTier}</div>}
              </div>
              <div style={{ padding:10, display:'grid', gap:7 }}>
                {objectiveRows.map((row, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 10px', borderRadius:12, background:row.done ? 'rgba(52,211,153,0.075)' : 'rgba(255,255,255,0.035)', border:'1px solid '+(row.done ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.05)') }}>
                    <div style={{ width:16, height:16, borderRadius:5, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:row.done ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.04)', border:'1px solid '+(row.done ? 'rgba(52,211,153,0.32)' : 'rgba(255,255,255,0.12)'), color:row.done ? '#34d399' : 'rgba(255,255,255,0.28)', fontSize:11, fontWeight:900 }}>{row.done ? '✓' : ''}</div>
                    <div style={{ color:row.done ? 'rgba(255,255,255,0.74)' : 'rgba(255,255,255,0.88)', fontSize:13, lineHeight:1.35 }}>{row.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {chartData && chartData.length > 1 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.36)', textTransform:'uppercase', letterSpacing:'0.12em', fontWeight:800 }}>History</div>
                <div style={{ display:'flex', gap:4 }}>
                  {periods.map(p => (
                    <button key={p} onClick={() => setPeriod(p)} style={{ padding:'3px 9px', fontSize:10, borderRadius:7, background:period === p ? tierColor+'18' : 'transparent', border:'1px solid '+(period === p ? tierColor+'4a' : 'rgba(255,255,255,0.08)'), color:period === p ? tierColor : 'rgba(255,255,255,0.34)', cursor:'pointer', fontWeight:period === p ? 750 : 500 }}>{p}</button>
                  ))}
                </div>
              </div>
              <div style={{ background:'rgba(255,255,255,0.035)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:12 }}>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize:9, fill:'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize:9, fill:'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip content={<CustomTooltip tierColor={tierColor} />} />
                    {(chartLines || []).map((line, i) => <Line key={i} type="monotone" dataKey={line.key} stroke={line.color || tierColor} strokeWidth={2.2} dot={false} name={line.label} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {navTarget && (
            <button onClick={() => { onClose(); navigate(navTarget) }} style={{ width:'100%', padding:'13px', borderRadius:15, border:'1px solid '+tierColor+'30', background:tierColor+'10', color:tierColor, fontWeight:750, fontSize:13, cursor:'pointer', letterSpacing:'0.01em' }}>
              Öppna {navLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
