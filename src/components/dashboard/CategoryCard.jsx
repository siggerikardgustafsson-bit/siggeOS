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
  halsa:       'M4.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  maxx:        'M13 2L3 14h7l-1 8 12-14h-7l-1-6z',
  valmående:   'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  fardigheter: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
}

function Icon({ id, color, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={CAT_PATHS[id] || CAT_PATHS.kondition} />
    </svg>
  )
}

function Ring({ pct, color, tier, size = 58, label }) {
  const r = 23
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(Math.max(pct || 0, 0), 100) / 100) * circ
  const hasData = pct > 0
  const filterId = 'glow-' + (color || 'none').replace('#', '').replace(/[^a-zA-Z0-9]/g, '')
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} viewBox="0 0 60 60" style={{ transform:'rotate(-90deg)', overflow:'visible' }}>
        {hasData && <defs><filter id={filterId} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={color} floodOpacity="0.55" /></filter></defs>}
        <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={circ} strokeDashoffset={hasData ? offset : circ} strokeLinecap="round" filter={hasData ? `url(#${filterId})` : undefined} style={{ transition:'stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)' }} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize:'13px', fontWeight:800, color:hasData ? color : 'var(--muted)', lineHeight:1 }}>{tier ? 'T' + tier : label || '—'}</span>
        {hasData && <span style={{ fontSize:'9px', color:'var(--muted)', marginTop:2 }}>{Math.round(pct)}%</span>}
      </div>
    </div>
  )
}

function RequirementPill({ req, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7, minWidth:0, padding:'5px 7px', borderRadius:9, background:req.met ? 'rgba(16,185,129,0.08)' : color + '0f', border:'1px solid ' + (req.met ? 'rgba(16,185,129,0.18)' : color + '24') }}>
      <div style={{ width:15, height:15, borderRadius:5, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:req.met ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.04)', border:'1px solid ' + (req.met ? 'rgba(16,185,129,0.32)' : color + '36') }}>
        {req.met ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : <div style={{ width:5, height:5, borderRadius:2, background:color }} />}
      </div>
      <div style={{ minWidth:0, flex:1 }}>
        <div style={{ fontSize:10, color:req.met ? 'rgba(16,185,129,0.9)' : 'var(--text)', fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{req.label}</div>
        <div style={{ fontSize:9, color:req.met ? 'rgba(16,185,129,0.55)' : 'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{req.currentLabel} → {req.targetLabel}</div>
      </div>
      <span style={{ fontSize:9, color:req.met ? '#10b981' : color, fontWeight:800, whiteSpace:'nowrap' }}>{req.gapLabel}</span>
    </div>
  )
}

export default function CategoryCard({ category, onClick }) {
  const { id, name, tier, metrics, hasData, decayWarning, trend, pct, levelUp } = category
  const tierNum = tier?.tier || 0
  const color = TIER_COLORS[tierNum] || '#6b7280'
  const nextColor = TIER_COLORS[levelUp?.nextTier || tierNum + 1] || color
  const ringPct = levelUp?.progressPct ?? pct ?? 0
  const topReqs = (levelUp?.requirements || []).sort((a,b) => Number(a.met) - Number(b.met) || a.progress - b.progress).slice(0, 2)

  return (
    <div onClick={() => onClick(category)} className="widget cat-card fade-up"
      style={{ padding:16, minHeight:218, display:'flex', flexDirection:'column', overflow:'hidden', cursor:'pointer' }}>

      {hasData && (
        <div style={{ position:'absolute', top:-30, right:-24, width:95, height:95, borderRadius:'50%', background:color + '14', filter:'blur(24px)', pointerEvents:'none' }} />
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
          <div style={{ width:34, height:34, borderRadius:12, background:hasData ? color + '18' : 'var(--surface2)', border:'1px solid ' + (hasData ? color + '34' : 'var(--border)'), display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Icon id={id} color={hasData ? color : 'var(--muted)'} />
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:900, color:'var(--text)', letterSpacing:'0.09em', textTransform:'uppercase', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{levelUp?.title || (tier ? tier.label : hasData ? 'Status' : 'Ingen data')}</div>
          </div>
        </div>
        {trend !== 'neutral' && hasData && <span style={{ fontSize:15, fontWeight:900, color:trend === 'up' ? 'var(--green)' : 'var(--red)' }}>{trend === 'up' ? '↑' : '↓'}</span>}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:13, marginBottom:12 }}>
        <Ring pct={ringPct} color={hasData ? color : 'rgba(255,255,255,0.12)'} tier={tierNum} label={id === 'kropp' ? '' : undefined} size={64} />
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:6 }}>
          {hasData ? metrics.slice(0, 3).map((m, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'baseline' }}>
              <span style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.label}</span>
              <span style={{ fontSize:i === 0 ? 15 : 13, fontWeight:i === 0 ? 800 : 600, color:m.highlight ? 'var(--text)' : 'var(--muted2)', whiteSpace:'nowrap' }}>{m.value}</span>
            </div>
          )) : <span style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>Börja logga data</span>}
        </div>
      </div>

      <div style={{ marginTop:'auto', paddingTop:12, borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:9 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:9, fontWeight:900, letterSpacing:'0.13em', color:'var(--muted)', textTransform:'uppercase' }}>Level-up bottleneck</div>
            <div style={{ fontSize:12, fontWeight:800, color:levelUp?.primaryBottleneck ? nextColor : 'var(--muted2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:2 }}>
              {levelUp?.primaryBottleneck || (hasData ? 'Öppna för detaljer' : 'Ingen data')}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, color:'var(--muted)' }}>
            {decayWarning && <span style={{ fontSize:10, color:'var(--amber)' }}>!</span>}
            <span style={{ fontSize:20, lineHeight:1 }}>→</span>
          </div>
        </div>

        {topReqs.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {topReqs.map((req, i) => <RequirementPill key={i} req={req} color={nextColor} />)}
          </div>
        )}
      </div>
    </div>
  )
}
