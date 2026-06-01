import React from 'react'

const TIER_COLORS = {
  0:'rgba(255,255,255,0.15)',1:'rgba(255,255,255,0.75)',2:'#4f8ef7',3:'#a78bfa',
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

const NEXT_TIER_SHORT = {
  kondition: ['—','5km < 28:00','5km < 24:00','5km < 22:00','5km < 20:00','5km < 18:30','5km < 17:00','Top 1% ✓'],
  styrka:    ['—','Bänk ≥ 0.75x BW','Bänk ≥ 1.0x BW','Bänk ≥ 1.15x BW','Bänk ≥ 1.3x BW','Bänk ≥ 1.5x BW','Bänk ≥ 1.65x BW','Top 1% ✓'],
  somn:      ['—','Snitt ≥ 6.5h','Snitt ≥ 7.0h','Snitt ≥ 7.5h','Snitt ≥ 8.0h','8.5h + konsistens','8.5h + låg variation','Top 1% ✓'],
  plugg:     ['—','Mastery ≥ 20%','Mastery ≥ 40%','Mastery ≥ 60%','Mastery ≥ 80%','Expert ✓','',''],
  ekonomi:   ['—','Netto ≥ 12k/mån','Netto ≥ 18k/mån','Netto ≥ 22k/mån','Netto ≥ 28k/mån','Netto ≥ 35k/mån','Netto ≥ 45k/mån','Top 1% ✓'],
  valmående: ['—','Energi ≥ 5','Energi ≥ 6','Energi ≥ 7','Energi ≥ 8','Energi ≥ 9','Allt toppklass','Top 1% ✓'],
  fardigheter:['—','1–30 min/v','30–60 min/v','60–120 min/v','120–240 min/v','240+ min/v','',''],
}

function Icon({ id, color, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={CAT_PATHS[id] || CAT_PATHS.kondition} />
    </svg>
  )
}

function ProgressRing({ pct, color, tier, isBody }) {
  const r = 22
  const circ = 2 * Math.PI * r
  const safePct = Math.max(0, Math.min(100, pct || 0))
  const offset = circ - (safePct / 100) * circ
  const active = (tier > 0 || isBody) && safePct > 0
  const filterId = 'cat-glow-' + String(color || 'muted').replace('#', '')

  return (
    <div style={{ position:'relative', width:58, height:58, flexShrink:0 }}>
      <svg width="58" height="58" viewBox="0 0 56 56" style={{ transform:'rotate(-90deg)', overflow:'visible' }}>
        {active && (
          <defs>
            <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor={color} floodOpacity="0.5" />
            </filter>
          </defs>
        )}
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={active ? color : 'rgba(255,255,255,0.13)'} strokeWidth="4" strokeDasharray={circ} strokeDashoffset={active ? offset : circ} strokeLinecap="round" filter={active ? `url(#${filterId})` : undefined} style={{ transition:'stroke-dashoffset 0.9s cubic-bezier(.22,1,.36,1)' }} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
        <span style={{ fontSize:isBody?'18px':'13px', fontWeight:800, letterSpacing:'-0.04em', color:active ? color : 'var(--muted)' }}>
          {isBody ? '•' : tier > 0 ? `T${tier}` : '—'}
        </span>
        {!isBody && tier > 0 && <span style={{ fontSize:8, color:'var(--muted)', marginTop:-1 }}>{safePct}%</span>}
      </div>
    </div>
  )
}

function getWeakLink(category, tierNum) {
  if (category.id === 'styrka' && category.perExercise?.length) {
    return category.perExercise
      .slice()
      .sort((a, b) => (a.tier?.tier || 0) - (b.tier?.tier || 0))[0]
  }

  const detail = (category.details || [])
    .filter(d => d.tierInfo?.tier)
    .slice()
    .sort((a, b) => (a.tierInfo?.tier || 0) - (b.tierInfo?.tier || 0))[0]

  if (detail) return { label: detail.label, tier: detail.tierInfo, valueText: detail.value }
  return null
}

function gapText(category, weak, nextReq, tierNum) {
  if (category.id === 'kropp') {
    const trend = category.metrics?.find(m => /Trend/i.test(m.label))?.value
    const kvar = category.metrics?.find(m => /Kvar/i.test(m.label))?.value
    if (kvar && kvar !== '—') return `Mål-gap: ${kvar}`
    if (trend && trend !== '—') return `Trend: ${trend}`
    return 'Status mot målvikt'
  }

  if (category.id === 'styrka' && weak) {
    if (weak.isBW) return `${weak.label}: +${Math.round(weak.value || 0)} kg`
    if (weak.mult) return `${weak.label}: ${weak.mult}x BW`
    return weak.label
  }

  if (weak?.label && weak?.valueText) return `${weak.label}: ${weak.valueText}`
  return nextReq || (tierNum >= 8 ? 'Maxad nivå' : 'Logga mer data')
}

export default function CategoryCard({ category, onClick }) {
  const { id, name, tier, metrics = [], hasData, decayWarning, trend, pct } = category
  const isBody = id === 'kropp'
  const tierNum = tier?.tier || 0
  const color = isBody ? '#34d399' : (TIER_COLORS[tierNum] || TIER_COLORS[0])
  const nextTier = tierNum > 0 && tierNum < 8 ? tierNum + 1 : null
  const nextColor = nextTier ? (TIER_COLORS[nextTier] || color) : color
  const weak = getWeakLink(category, tierNum)
  const nextReq = hasData && tierNum > 0 && tierNum < 8 ? (NEXT_TIER_SHORT[id]?.[tierNum] || null) : null
  const progress = isBody ? Math.max(0, Math.min(100, pct || 0)) : Math.max(0, Math.min(100, pct || Math.round((tierNum / 8) * 100)))
  const remaining = tierNum > 0 && tierNum < 8 ? Math.max(0, 100 - progress) : 0

  return (
    <div onClick={() => onClick(category)} className="widget cat-card fade-up" style={{
      padding:'14px', minHeight:'174px', display:'flex', flexDirection:'column', overflow:'hidden',
      cursor:'pointer', position:'relative', isolation:'isolate',
    }}>
      <div style={{ position:'absolute', inset:0, background:`radial-gradient(circle at 82% 14%, ${color}1f, transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.045), transparent)`, pointerEvents:'none', zIndex:-1 }} />
      <div style={{ position:'absolute', top:-30, right:-30, width:110, height:110, borderRadius:'999px', background:color+'13', filter:'blur(24px)', pointerEvents:'none', zIndex:-1 }} />

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
          <div style={{ width:28, height:28, borderRadius:9, background:color+'16', border:'1px solid '+color+'2f', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 0 rgba(255,255,255,0.06) inset' }}>
            <Icon id={id} color={hasData ? color : 'var(--muted)'} />
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:10, fontWeight:800, color:'var(--muted2)', letterSpacing:'0.11em', textTransform:'uppercase', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
            <div style={{ fontSize:9, color:'var(--muted)', marginTop:1 }}>{isBody ? 'Metric status' : nextTier ? `Mot T${nextTier}` : tierNum >= 8 ? 'Max tier' : 'Starta loggning'}</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          {decayWarning && <span title="Data börjar bli gammal" style={{ color:'var(--amber)', fontSize:11, fontWeight:900 }}>!</span>}
          {trend !== 'neutral' && hasData && <span style={{ color:trend === 'up' ? 'var(--green)' : 'var(--red)', fontSize:15, fontWeight:900 }}>{trend === 'up' ? '↗' : '↘'}</span>}
        </div>
      </div>

      <div style={{ display:'flex', gap:12, alignItems:'center', flex:1, minHeight:0 }}>
        <ProgressRing pct={progress} color={color} tier={tierNum} isBody={isBody} />
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:6 }}>
          {hasData ? metrics.slice(0, 3).map((m, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'baseline' }}>
              <span style={{ fontSize:10, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.label}</span>
              <span style={{ fontSize:i === 0 ? 13 : 11, fontWeight:i === 0 ? 750 : 500, color:m.highlight ? color : 'var(--text)', whiteSpace:'nowrap' }}>{m.value}</span>
            </div>
          )) : <span style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>Ingen data ännu</span>}
        </div>
      </div>

      <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid rgba(255,255,255,0.075)' }}>
        {!isBody && tier && hasData && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
              <div style={{ padding:'2px 7px', borderRadius:999, background:color+'14', border:'1px solid '+color+'2e', color, fontSize:9, fontWeight:850, letterSpacing:'0.06em' }}>T{tierNum}</div>
              <span style={{ color:'var(--muted2)', fontSize:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tier.label}</span>
            </div>
            {tierNum < 8 && <span style={{ color:'var(--muted)', fontSize:10 }}>{remaining}% kvar</span>}
          </div>
        )}

        <div style={{ height:5, borderRadius:999, background:'rgba(255,255,255,0.07)', overflow:'hidden', marginBottom:8 }}>
          <div style={{ width:hasData ? `${progress}%` : '0%', height:'100%', borderRadius:999, background:`linear-gradient(90deg, ${color}, ${nextColor})`, boxShadow:`0 0 14px ${color}55`, transition:'width 0.8s cubic-bezier(.22,1,.36,1)' }} />
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.09em', fontWeight:750 }}>{isBody ? 'Status' : 'Bottleneck'}</div>
            <div style={{ fontSize:10, color:hasData ? nextColor : 'var(--muted)', fontWeight:650, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:1 }}>{hasData ? gapText(category, weak, nextReq, tierNum) : 'Börja logga data'}</div>
          </div>
          <span style={{ flexShrink:0, fontSize:13, color:'var(--muted)' }}>→</span>
        </div>
      </div>
    </div>
  )
}
