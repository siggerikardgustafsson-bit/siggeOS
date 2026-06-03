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
  halsa:       'M4.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  maxx:        'M13 2L3 14h7l-1 8 12-14h-7l-1-6z',
  valmående:   'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  fardigheter: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
}

function CatIcon({ id, color, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={CAT_PATHS[id] || CAT_PATHS.kondition} /></svg>
}

const TIER_REQUIREMENTS = {
  kondition: [
    { tier:2, label:'Top 50%',  reqs:['1km/5km/10km/halvmara behöver vara loggade eller täckta av längre pass','5km under 28:00'] },
    { tier:3, label:'Top 30%',  reqs:['5km under 24:00','10km under 50:00','Halvmara täckt/loggad'] },
    { tier:4, label:'Top 20%',  reqs:['5km under 22:00','10km under 46:00','Halvmara under 1:47'] },
    { tier:5, label:'Top 10%',  reqs:['5km under 20:00','10km under 42:00','Halvmara under 1:38'] },
    { tier:6, label:'Top 5%',   reqs:['5km under 18:30','10km under 39:00','Halvmara under 1:31'] },
    { tier:7, label:'Top 2.5%', reqs:['5km under 17:00','10km under 36:00','Halvmara under 1:25'] },
    { tier:8, label:'Top 1%',   reqs:['5km under 15:30','10km under 33:00','Halvmara under 1:18','Mara under 2:45'] },
  ],
  styrka: [
    { tier:2, label:'Top 50%',  reqs:['Bänk ≥ 0.75x BW','Knäböj ≥ 1.0x BW','Marklyft ≥ 1.25x BW'] },
    { tier:3, label:'Top 30%',  reqs:['Bänk ≥ 1.0x BW','Knäböj ≥ 1.25x BW','Marklyft ≥ 1.5x BW'] },
    { tier:4, label:'Top 20%',  reqs:['Bänk ≥ 1.15x BW','Knäböj ≥ 1.4x BW','Marklyft ≥ 1.7x BW'] },
    { tier:5, label:'Top 10%',  reqs:['Bänk ≥ 1.3x BW','Knäböj ≥ 1.6x BW','Marklyft ≥ 1.9x BW'] },
    { tier:6, label:'Top 5%',   reqs:['Bänk ≥ 1.5x BW','Knäböj ≥ 1.75x BW','Marklyft ≥ 2.1x BW','Militärpress ≥ 1.0x BW'] },
    { tier:7, label:'Top 2.5%', reqs:['Bänk ≥ 1.65x BW','Knäböj ≥ 1.9x BW','Marklyft ≥ 2.3x BW'] },
    { tier:8, label:'Top 1%',   reqs:['Bänk ≥ 1.8x BW','Knäböj ≥ 2.1x BW','Marklyft ≥ 2.5x BW'] },
  ],
  somn: [
    { tier:2, label:'Top 50%',  reqs:['Sömnsnitt ≥ 6.5h'] },
    { tier:3, label:'Top 30%',  reqs:['Sömnsnitt ≥ 7.0h','Logga sömn ≥ 5 av 7 dagar'] },
    { tier:4, label:'Top 20%',  reqs:['Sömnsnitt ≥ 7.5h'] },
    { tier:5, label:'Top 10%',  reqs:['Sömnsnitt ≥ 8.0h','Stabil läggtid'] },
    { tier:6, label:'Top 5%',   reqs:['Sömnsnitt ≥ 8.5h','Bra regelbundenhet'] },
    { tier:7, label:'Top 2.5%', reqs:['≥ 8.5h + hög konsekvens'] },
    { tier:8, label:'Top 1%',   reqs:['Sömnsnitt ≥ 9h','Optimal sömnkonsistens'] },
  ],
  plugg: [
    { tier:1, label:'Nybörjare',     reqs:['Mastery 0–20%'] },
    { tier:2, label:'Grundläggande', reqs:['Mastery ≥ 20%'] },
    { tier:3, label:'Medel',         reqs:['Mastery ≥ 40%'] },
    { tier:4, label:'Avancerad',     reqs:['Mastery ≥ 60%'] },
    { tier:5, label:'Expert',        reqs:['Mastery ≥ 80%'] },
  ],
  ekonomi: [
    { tier:2, label:'Top 50%',  reqs:['Nettoinkomst ≥ 12 000 kr/mån','Sparkapital ≥ 5 000 kr'] },
    { tier:3, label:'Top 30%',  reqs:['Nettoinkomst ≥ 18 000 kr/mån','Sparkapital ≥ 20 000 kr'] },
    { tier:4, label:'Top 20%',  reqs:['Nettoinkomst ≥ 22 000 kr/mån','Sparkapital ≥ 50 000 kr'] },
    { tier:5, label:'Top 10%',  reqs:['Nettoinkomst ≥ 28 000 kr/mån','Sparkapital ≥ 100 000 kr'] },
    { tier:6, label:'Top 5%',   reqs:['Nettoinkomst ≥ 35 000 kr/mån','Sparkapital ≥ 200 000 kr'] },
    { tier:7, label:'Top 2.5%', reqs:['Nettoinkomst ≥ 45 000 kr/mån','Sparkapital ≥ 350 000 kr'] },
    { tier:8, label:'Top 1%',   reqs:['Nettoinkomst ≥ 60 000 kr/mån','Sparkapital ≥ 500 000 kr'] },
  ],
  halsa: [
    { tier:2, label:'Top 50%',  reqs:['Energi ≥ 5/10','Humör ≥ 5/10','Alkohol ≤ 14 enheter/vecka'] },
    { tier:3, label:'Top 30%',  reqs:['Energi ≥ 6/10','Humör ≥ 6/10','Alkohol ≤ 10 enheter/vecka'] },
    { tier:4, label:'Top 20%',  reqs:['Energi ≥ 7/10','Humör ≥ 7/10','Alkohol ≤ 7 enheter/vecka','Vikttrend åt rätt håll'] },
    { tier:5, label:'Top 10%',  reqs:['Energi ≥ 8/10','Humör ≥ 8/10','Alkohol ≤ 5 enheter/vecka','Kosttillskott ≥ 80% om loggat'] },
    { tier:6, label:'Top 5%',   reqs:['Energi ≥ 9/10','Humör ≥ 9/10','Alkohol ≤ 3 enheter/vecka','Kosttillskott ≥ 90% om loggat'] },
    { tier:7, label:'Top 2.5%', reqs:['Alla hälsometrics toppklass konsekvent'] },
    { tier:8, label:'Top 1%',   reqs:['Energi/humör ≥ 9.5/10','Alkohol nära noll','Kosttillskott ≥ 99% om loggat'] },
  ],
  valmående: [],
  fardigheter: [
    { tier:2, label:'Nybörjare',   reqs:['1–30 min/vecka'] },
    { tier:3, label:'Regelbunden', reqs:['30–60 min/vecka'] },
    { tier:4, label:'Dedikerad',   reqs:['60–120 min/vecka'] },
    { tier:5, label:'Seriös',      reqs:['120–240 min/vecka'] },
    { tier:6, label:'Mästare',     reqs:['240+ min/vecka'] },
  ],
  kropp: [],
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'rgba(10,12,20,0.92)', backdropFilter:'blur(16px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 14px', fontSize:12 }}>
      <div style={{ color:'rgba(255,255,255,0.4)', marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color:p.stroke, fontWeight:700 }}>{p.name}: {p.value}</div>)}
    </div>
  )
}

function RequirementRow({ req, color }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'20px minmax(0,1fr) auto', gap:10, alignItems:'center', padding:'10px 12px', borderRadius:12, background:req.met ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.035)', border:'1px solid ' + (req.met ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.07)') }}>
      <div style={{ width:20, height:20, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', background:req.met ? 'rgba(16,185,129,0.14)' : color + '15', border:'1px solid ' + (req.met ? 'rgba(16,185,129,0.34)' : color + '35') }}>
        {req.met ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : <div style={{ width:6, height:6, borderRadius:2, background:color }} />}
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:800, color:req.met ? 'rgba(16,185,129,0.9)' : 'rgba(255,255,255,0.9)' }}>{req.label}</div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.42)', marginTop:2 }}>{req.currentLabel} → {req.targetLabel}</div>
      </div>
      <div style={{ fontSize:12, fontWeight:900, color:req.met ? '#10b981' : color, whiteSpace:'nowrap' }}>{req.gapLabel}</div>
    </div>
  )
}

export default function DetailModal({ category, onClose }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('30d')
  const [showAllTiers, setShowAllTiers] = useState(false)
  if (!category) return null

  const { name, tier, metrics, details, chartData, chartLines, navTarget, navLabel, id, levelUp, contribution } = category
  const tierNum = tier?.tier || 0
  const tierColor = TIER_COLORS[tierNum] || '#6b7280'
  const nextColor = TIER_COLORS[levelUp?.nextTier || tierNum + 1] || tierColor
  const requirements = category.tierGuide || TIER_REQUIREMENTS[id] || []
  const periods = ['7d', '30d', '90d', '1år']

  const openMetricSource = (event, metric) => {
    event.stopPropagation()
    const target = metric?.evidence?.navTarget
    if (!target || metric?.value === '—') return
    onClose?.()
    navigate(target)
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <style>{`
        .detail-metric-source-card {
          position: relative;
          transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
        }
        .detail-metric-source-card.is-clickable { cursor: pointer; }
        .detail-metric-source-card.is-clickable:hover {
          transform: translateY(-1px);
          background: rgba(79,142,247,0.095) !important;
          border-color: rgba(79,142,247,0.38) !important;
          box-shadow: 0 0 0 1px rgba(79,142,247,0.12), 0 10px 26px rgba(79,142,247,0.10);
        }
        .detail-metric-source-hint {
          position: absolute;
          right: 9px;
          top: 8px;
          opacity: 0;
          transform: translateY(2px);
          transition: opacity .16s ease, transform .16s ease;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .06em;
          color: #4f8ef7;
          text-transform: uppercase;
          pointer-events: none;
        }
        .detail-metric-source-card.is-clickable:hover .detail-metric-source-hint {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} style={{ background:'rgba(12,15,26,0.94)', backdropFilter:'blur(42px)', WebkitBackdropFilter:'blur(42px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:22, width:'100%', maxWidth:620, maxHeight:'88vh', overflowY:'auto', boxShadow:'0 32px 80px rgba(0,0,0,0.72), 0 1px 0 rgba(255,255,255,0.08) inset', scrollbarWidth:'none', position:'relative' }}>
        <div style={{ position:'absolute', top:0, left:'22%', right:'22%', height:1, background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.24), transparent)' }} />
        <div style={{ position:'absolute', top:-55, right:-45, width:180, height:180, borderRadius:'50%', background:nextColor + '16', filter:'blur(45px)', pointerEvents:'none' }} />

        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid rgba(255,255,255,0.07)', position:'sticky', top:0, zIndex:10, background:'rgba(12,15,26,0.86)', backdropFilter:'blur(22px)', WebkitBackdropFilter:'blur(22px)', display:'flex', justifyContent:'space-between', alignItems:'center', borderRadius:'22px 22px 0 0' }}>
          <div style={{ display:'flex', alignItems:'center', gap:13 }}>
            <div style={{ width:42, height:42, borderRadius:14, background:(tierNum ? tierColor : nextColor) + '18', border:'1px solid ' + ((tierNum ? tierColor : nextColor) + '34'), display:'flex', alignItems:'center', justifyContent:'center' }}>
              <CatIcon id={id} color={tierNum ? tierColor : nextColor} size={20} />
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:18, fontWeight:800, color:'rgba(255,255,255,0.92)', letterSpacing:'-0.02em' }}>{name}</span>
                {tierNum > 0 && <span style={{ fontSize:11, fontWeight:900, color:tierColor, padding:'2px 7px', borderRadius:20, background:tierColor + '16', border:'1px solid ' + tierColor + '35' }}>T{tierNum}</span>}
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.38)', marginTop:3 }}>{levelUp?.title || tier?.label || 'Status och nivåkrav'}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, color:'rgba(255,255,255,0.45)', cursor:'pointer', fontSize:16 }}>×</button>
        </div>

        <div style={{ padding:'22px 26px' }}>
          {levelUp && (
            <div style={{ marginBottom:18, background:'linear-gradient(135deg, ' + nextColor + '14, rgba(255,255,255,0.035))', border:'1px solid ' + nextColor + '2c', borderRadius:18, padding:18 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:900, letterSpacing:'0.12em', color:'rgba(255,255,255,0.35)', textTransform:'uppercase' }}>Level-up plan</div>
                  <div style={{ fontSize:22, fontWeight:900, color:'rgba(255,255,255,0.95)', marginTop:5 }}>{levelUp.title}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:22, fontWeight:900, color:nextColor }}>{levelUp.progressPct}%</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.38)' }}>till nästa</div>
                </div>
              </div>
              <div style={{ height:8, borderRadius:999, background:'rgba(255,255,255,0.08)', overflow:'hidden', marginBottom:14 }}>
                <div style={{ width:levelUp.progressPct + '%', height:'100%', borderRadius:999, background:'linear-gradient(90deg, ' + tierColor + ', ' + nextColor + ')', boxShadow:'0 0 16px ' + nextColor + '60' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                <div style={{ padding:12, borderRadius:14, background:'rgba(0,0,0,0.16)', border:'1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize:10, fontWeight:900, color:'rgba(255,255,255,0.34)', letterSpacing:'0.1em', textTransform:'uppercase' }}>Bottleneck</div>
                  <div style={{ fontSize:15, fontWeight:900, color:nextColor, marginTop:5 }}>{levelUp.primaryBottleneck}</div>
                </div>
                <div style={{ padding:12, borderRadius:14, background:'rgba(0,0,0,0.16)', border:'1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize:10, fontWeight:900, color:'rgba(255,255,255,0.34)', letterSpacing:'0.1em', textTransform:'uppercase' }}>Kvar</div>
                  <div style={{ fontSize:15, fontWeight:900, color:'rgba(255,255,255,0.88)', marginTop:5 }}>{levelUp.blockers?.length ? `${levelUp.blockers.length} krav` : 'Klar'}</div>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(levelUp.requirements || []).map((req, i) => <RequirementRow key={i} req={req} color={nextColor} />)}
              </div>
            </div>
          )}

          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:10, fontWeight:900, letterSpacing:'0.11em', color:'rgba(255,255,255,0.28)', textTransform:'uppercase', marginBottom:10 }}>Aktuell data</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:8 }}>
              {(metrics || details || []).slice(0, 6).map((m, i) => {
                const clickable = !!m.evidence?.navTarget && m.value !== '—'
                return (
                  <div
                    key={i}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    className={`detail-metric-source-card${clickable ? ' is-clickable' : ''}`}
                    title={clickable ? 'Öppna källpass' : undefined}
                    onClick={clickable ? (event) => openMetricSource(event, m) : undefined}
                    onKeyDown={clickable ? (event) => { if (event.key === 'Enter' || event.key === ' ') openMetricSource(event, m) } : undefined}
                    style={{ padding:12, borderRadius:13, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', minWidth:0, outline:'none' }}
                  >
                    {clickable && <div className="detail-metric-source-hint">Öppna källa ↗</div>}
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.38)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight: clickable ? 76 : 0 }}>{m.label}</div>
                    <div style={{ fontSize:15, fontWeight:900, color:m.tierInfo?.color || 'rgba(255,255,255,0.88)', marginTop:5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.value}</div>
                    {m.tierInfo && <div style={{ fontSize:10, color:m.tierInfo.color, opacity:.8, marginTop:3 }}>{m.tierInfo.label}</div>}
                  </div>
                )
              })}
            </div>
          </div>


          {contribution?.length > 0 && (
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:10, fontWeight:900, letterSpacing:'0.11em', color:'rgba(255,255,255,0.28)', textTransform:'uppercase', marginBottom:10 }}>Kategori-bidrag</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:8 }}>
                {contribution.map((m, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', padding:'10px 12px', borderRadius:12, background:'rgba(255,255,255,0.035)', border:'1px solid rgba(255,255,255,0.065)' }}>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.62)', fontWeight:700 }}>{m.label}</span>
                    <span style={{ fontSize:13, color:m.tierInfo?.color || 'rgba(255,255,255,0.86)', fontWeight:900 }}>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {requirements.length > 0 && (
            <div style={{ marginBottom:18 }}>
              <button onClick={() => setShowAllTiers(v => !v)} style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'13px 15px', borderRadius:14, background:'rgba(255,255,255,0.045)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.82)', cursor:'pointer' }}>
                <span style={{ fontSize:12, fontWeight:900, letterSpacing:'0.11em', textTransform:'uppercase' }}>Alla tiers och krav</span>
                <span style={{ fontSize:18, color:'rgba(255,255,255,0.45)' }}>{showAllTiers ? '−' : '+'}</span>
              </button>
              {showAllTiers && (
                <div style={{ display:'flex', flexDirection:'column', gap:7, marginTop:10 }}>
                  {requirements.map((t, i) => {
                    const isCurrent = t.tier === tierNum
                    const isPast = t.tier < tierNum
                    const isNext = t.tier === (levelUp?.nextTier || tierNum + 1)
                    const c = TIER_COLORS[t.tier] || '#6b7280'
                    return (
                      <div key={i} style={{ padding:'12px 14px', borderRadius:13, background:isCurrent ? c + '14' : isNext ? c + '0b' : isPast ? 'rgba(16,185,129,0.045)' : 'rgba(255,255,255,0.025)', border:'1px solid ' + (isCurrent ? c + '50' : isNext ? c + '2e' : isPast ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.055)') }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                          <span style={{ fontSize:13, fontWeight:900, color:isPast ? '#10b981' : c }}>T{t.tier}</span>
                          <span style={{ fontSize:12, fontWeight:800, color:isPast ? 'rgba(16,185,129,0.75)' : isCurrent || isNext ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.35)' }}>{t.label}</span>
                          {isCurrent && <span style={{ marginLeft:'auto', fontSize:10, color:c }}>nu</span>}
                          {isNext && <span style={{ marginLeft:'auto', fontSize:10, color:c }}>nästa</span>}
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:4, paddingLeft:3 }}>
                          {t.reqs.map((r, j) => <div key={j} style={{ display:'flex', gap:7, alignItems:'flex-start', fontSize:12, color:isPast ? 'rgba(16,185,129,0.56)' : isCurrent || isNext ? 'rgba(255,255,255,0.64)' : 'rgba(255,255,255,0.28)' }}><span style={{ color:isPast ? '#10b981' : c }}>•</span><span>{r}</span></div>)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {chartData && chartData.length > 1 && (
            <div style={{ marginBottom:18 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:900, letterSpacing:'0.11em', color:'rgba(255,255,255,0.28)', textTransform:'uppercase' }}>Historik</div>
                <div style={{ display:'flex', gap:4 }}>{periods.map(p => <button key={p} onClick={() => setPeriod(p)} style={{ padding:'3px 9px', fontSize:10, borderRadius:7, background:period === p ? nextColor + '20' : 'transparent', border:'1px solid ' + (period === p ? nextColor + '55' : 'rgba(255,255,255,0.08)'), color:period === p ? nextColor : 'rgba(255,255,255,0.35)', cursor:'pointer', fontWeight:period === p ? 800 : 500 }}>{p}</button>)}</div>
              </div>
              <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:12 }}>
                <ResponsiveContainer width="100%" height={145}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize:9, fill:'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize:9, fill:'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip content={<CustomTooltip />} />
                    {(chartLines || []).map((line, i) => <Line key={i} type="monotone" dataKey={line.key} stroke={line.color || nextColor} strokeWidth={2} dot={false} name={line.label} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {navTarget && <button onClick={() => { onClose(); navigate(navTarget) }} style={{ width:'100%', padding:13, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:14, color:'rgba(255,255,255,0.78)', fontWeight:800, fontSize:13, cursor:'pointer', letterSpacing:'0.02em' }}>Gå till {navLabel} →</button>}
        </div>
      </div>
    </div>
  )
}
