import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import CategoryCard from './CategoryCard'

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
  halsa:       'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  valmående:   'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  fardigheter: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
}

const NAV_TARGET = {
  kondition:'/traning', styrka:'/traning', kropp:'/halsa', somn:'/halsa',
  halsa:'/halsa', valmående:'/halsa', plugg:'/plugg', ekonomi:'/ekonomi', fardigheter:'/jobb',
}

function Icon({ id, color, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={CAT_PATHS[id] || CAT_PATHS.kondition} />
    </svg>
  )
}

function useIsMobile(bp = 880) {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth < bp)
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [bp])
  return m
}

export default function DashboardConstellation({ categories = [], maxxProfile, overallTier, onSelect, onMetricClick }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // Mobile / narrow: fall back to the proven card grid — every function preserved.
  if (isMobile) {
    return (
      <div className="dashboard-category-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:'12px' }}>
        {categories.map((cat, i) => (
          <div key={cat.id} className={'fade-up fade-up-delay-' + Math.min(i + 1, 7)}>
            <CategoryCard category={cat} onClick={onSelect} onMetricClick={onMetricClick} />
          </div>
        ))}
      </div>
    )
  }

  const N = categories.length || 1
  const RX = 38, RY = 40
  const nodes = categories.map((c, i) => {
    const ang = (-90 + i * (360 / N)) * Math.PI / 180
    const x = 50 + RX * Math.cos(ang)
    const y = 50 + RY * Math.sin(ang)
    return { c, x, y, i }
  })

  const coreTier = maxxProfile?.tier?.tier ?? overallTier ?? 0
  const coreColor = TIER_COLORS[coreTier] || '#4f8ef7'
  const nextColor = TIER_COLORS[maxxProfile?.levelUp?.nextTier] || '#a78bfa'

  function bloomSide(x, y) {
    // place the hover bloom on the outward side so it never points back over the core
    const vertical = y < 50 ? 'top' : 'bottom'
    const horizontal = x < 42 ? 'left' : x > 58 ? 'right' : 'center'
    return { vertical, horizontal }
  }

  return (
    <div className="cmap" style={{ position:'relative', width:'100%', minHeight:560, padding:'8px 0' }}>
      <style>{`
        .cmap-edge { stroke-dasharray: 5 7; animation: cmapFlow 1.4s linear infinite; }
        @keyframes cmapFlow { to { stroke-dashoffset: -24; } }
        .cnode { position:absolute; transform:translate(-50%,-50%); z-index:3; }
        .cnode:hover { z-index:40; }
        .cnode-btn {
          appearance:none; cursor:pointer; background:transparent; border:none; padding:0;
          display:flex; flex-direction:column; align-items:center; gap:7px;
          transition: transform .28s cubic-bezier(.22,1,.36,1);
        }
        .cnode:hover .cnode-btn { transform: scale(1.08); }
        .cnode-disc {
          position:relative; width:96px; height:96px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          transition: box-shadow .28s ease, border-color .28s ease;
        }
        .cnode-bloom {
          position:absolute; width:200px; padding:13px 14px; border-radius:16px;
          background:linear-gradient(160deg, rgba(18,26,44,.97), rgba(12,17,30,.97));
          border:1px solid var(--border2); box-shadow:0 24px 60px rgba(0,0,0,.5);
          opacity:0; pointer-events:none; transform:translateY(6px) scale(.96);
          transition:opacity .2s ease, transform .2s ease; z-index:50;
          backdrop-filter:blur(14px);
        }
        .cnode:hover .cnode-bloom { opacity:1; pointer-events:auto; transform:translateY(0) scale(1); }
        .cbloom-act {
          appearance:none; cursor:pointer; width:100%; text-align:left;
          display:flex; align-items:center; justify-content:space-between; gap:8px;
          padding:7px 9px; border-radius:9px; font-size:11px; font-weight:700;
          background:rgba(255,255,255,.04); border:1px solid var(--border);
          color:var(--text); transition:background .14s, border-color .14s, transform .14s;
        }
        .cbloom-act:hover { background:rgba(79,142,247,.14); border-color:var(--accent-border); transform:translateX(2px); }
        .cmetric { display:flex; justify-content:space-between; gap:8px; font-size:11px; padding:2px 0; }
        @media (prefers-reduced-motion: reduce) { .cmap-edge { animation:none; } .cnode:hover .cnode-btn { transform:none; } }
      `}</style>

      {/* Edges */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:1, overflow:'visible' }}>
        <defs>
          <radialGradient id="cmapCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={coreColor} stopOpacity="0.22" />
            <stop offset="70%" stopColor={coreColor} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="34" fill="url(#cmapCoreGlow)" />
        {nodes.map(n => {
          const col = TIER_COLORS[n.c.tier?.tier || 0] || 'var(--border)'
          const active = n.c.hasData && (n.c.tier?.tier || 0) > 0
          return (
            <line key={n.c.id} x1="50" y1="50" x2={n.x} y2={n.y}
              stroke={active ? col : 'var(--border)'} strokeOpacity={active ? 0.55 : 0.25}
              strokeWidth="0.4" vectorEffect="non-scaling-stroke"
              className={active ? 'cmap-edge' : undefined} strokeLinecap="round" />
          )
        })}
      </svg>

      {/* Core node — Maxx Score */}
      <div className="cnode" style={{ left:'50%', top:'50%' }}>
        <button className="cnode-btn" onClick={() => maxxProfile && onSelect?.(maxxProfile)} aria-label="Maxx Score">
          <div className="cnode-disc" style={{
            width:150, height:150,
            background:`radial-gradient(circle at 50% 35%, ${coreColor}38, rgba(10,14,26,.92) 72%)`,
            border:`2px solid ${coreColor}`,
            boxShadow:`0 0 50px ${coreColor}66, 0 0 0 1px rgba(255,255,255,.08), inset 0 1px 0 rgba(255,255,255,.18)`,
          }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
              <span style={{ fontSize:9, letterSpacing:'0.18em', fontWeight:900, color:'rgba(255,255,255,.6)', textTransform:'uppercase' }}>Maxx</span>
              <span style={{ fontSize:50, lineHeight:1, fontWeight:950, letterSpacing:'-0.06em', color:'#fff', textShadow:`0 0 24px ${coreColor}` }}>T{coreTier || '—'}</span>
              {maxxProfile?.levelUp && (
                <span style={{ fontSize:10, fontWeight:800, color:nextColor, marginTop:2 }}>{maxxProfile.levelUp.progressPct}% → T{maxxProfile.levelUp.nextTier}</span>
              )}
            </div>
          </div>
          <span style={{ fontSize:11, fontWeight:800, color:'var(--muted)', letterSpacing:'0.12em', textTransform:'uppercase' }}>Overall</span>
        </button>
        {/* Core bloom */}
        <div className="cnode-bloom" style={{ left:'50%', transform:'translateX(-50%)', top:'calc(100% + 10px)', width:230 }}>
          <div style={{ fontSize:12, fontWeight:900, color:coreColor, marginBottom:6 }}>{maxxProfile?.tier?.label || 'Maxx Score'}</div>
          {maxxProfile?.levelUp?.primaryBottleneck && (
            <div style={{ fontSize:11, color:'var(--muted2)', marginBottom:9, lineHeight:1.4 }}>
              Nästa flaskhals: <span style={{ color:nextColor, fontWeight:700 }}>{maxxProfile.levelUp.primaryBottleneck}</span>
            </div>
          )}
          <button className="cbloom-act" onClick={() => maxxProfile && onSelect?.(maxxProfile)}>
            <span>Visa rank-up plan</span><span style={{ color:'var(--accent)' }}>→</span>
          </button>
        </div>
      </div>

      {/* Category nodes */}
      {nodes.map(n => {
        const cat = n.c
        const tierNum = cat.tier?.tier || 0
        const active = cat.hasData && tierNum > 0
        const col = TIER_COLORS[tierNum] || 'var(--border)'
        const { vertical, horizontal } = bloomSide(n.x, n.y)
        const bloomStyle = {
          top: vertical === 'top' ? 'auto' : 'calc(100% + 10px)',
          bottom: vertical === 'top' ? 'calc(100% + 10px)' : 'auto',
          left: horizontal === 'left' ? '0' : horizontal === 'center' ? '50%' : 'auto',
          right: horizontal === 'right' ? '0' : 'auto',
          transform: horizontal === 'center' ? 'translateX(-50%)' : 'none',
        }
        const navTarget = NAV_TARGET[cat.id]
        return (
          <div key={cat.id} className="cnode" style={{ left: n.x + '%', top: n.y + '%' }}>
            <button className="cnode-btn" onClick={() => onSelect?.(cat)} aria-label={cat.name}>
              <div className="cnode-disc" style={{
                background: active ? `radial-gradient(circle at 50% 35%, ${col}2e, rgba(12,17,30,.9) 72%)` : 'rgba(18,24,40,.7)',
                border: `1.5px solid ${active ? col : 'var(--border)'}`,
                boxShadow: active ? `0 0 26px ${col}44, inset 0 1px 0 rgba(255,255,255,.1)` : 'inset 0 1px 0 rgba(255,255,255,.05)',
              }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                  <Icon id={cat.id} color={active ? col : 'var(--muted)'} size={22} />
                  <span style={{ fontSize:17, fontWeight:950, color:active ? '#fff' : 'var(--muted)', lineHeight:1 }}>{tierNum > 0 ? 'T' + tierNum : '—'}</span>
                </div>
              </div>
              <span style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:'0.08em', textTransform:'uppercase' }}>{cat.name}</span>
            </button>

            {/* Hover bloom — more options on demand */}
            <div className="cnode-bloom" style={bloomStyle}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:12, fontWeight:900, color: active ? col : 'var(--text)' }}>{cat.name}</span>
                {cat.tier?.label && <span style={{ fontSize:9, fontWeight:800, color:col, textTransform:'uppercase', letterSpacing:'0.06em' }}>{cat.tier.label}</span>}
              </div>
              {active && (cat.metrics || []).slice(0, 3).map((m, i) => (
                <div key={i} className="cmetric" onClick={m.evidence ? (e) => { e.stopPropagation(); onMetricClick?.({ ...m.evidence, categoryId: cat.id, categoryName: cat.name, metricLabel: m.label, metricValue: m.value }) } : undefined}
                  style={{ cursor: m.evidence ? 'pointer' : 'default' }}>
                  <span style={{ color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.label}</span>
                  <span style={{ color: m.highlight ? col : 'var(--text)', fontWeight:700, whiteSpace:'nowrap' }}>{m.value}</span>
                </div>
              ))}
              {!active && <div style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic', marginBottom:8 }}>Ingen data ännu</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:9 }}>
                <button className="cbloom-act" onClick={() => onSelect?.(cat)}>
                  <span>Öppna detalj</span><span style={{ color:'var(--accent)' }}>→</span>
                </button>
                {navTarget && (
                  <button className="cbloom-act" onClick={() => navigate(navTarget)}>
                    <span>Till {cat.name}</span><span style={{ color:'var(--accent)' }}>↗</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
