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

// Glassy specular + rim that makes a disc read as a real 3-D bubble.
function bubbleSkin(color, active, intensity = 1) {
  return {
    background: active
      ? `radial-gradient(circle at 36% 26%, rgba(255,255,255,.32), rgba(255,255,255,.06) 20%, ${color}3a 44%, rgba(9,13,24,.94) 80%)`
      : `radial-gradient(circle at 36% 26%, rgba(255,255,255,.18), rgba(255,255,255,.03) 22%, rgba(20,27,44,.88) 74%)`,
    border: `1.5px solid ${active ? color : 'var(--border)'}`,
    boxShadow: active
      ? `0 0 ${34 * intensity}px ${color}5c, 0 18px 48px rgba(0,0,0,.5), inset 0 3px 8px rgba(255,255,255,.26), inset 0 -14px 30px ${color}26`
      : `0 12px 34px rgba(0,0,0,.42), inset 0 3px 8px rgba(255,255,255,.13), inset 0 -10px 24px rgba(0,0,0,.34)`,
  }
}

// Circular progress arc around a bubble — shows how far to the next rank.
function RingProgress({ size, pct, color, nextColor }) {
  const s = size + 14
  const sw = 3.5
  const r = (s - sw) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(100, pct || 0)) / 100)
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}
      style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', pointerEvents:'none', zIndex:1, filter:`drop-shadow(0 0 5px ${nextColor})` }}>
      <circle cx={s/2} cy={s/2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={sw} />
      <circle cx={s/2} cy={s/2} r={r} fill="none" stroke={nextColor} strokeWidth={sw}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${s/2} ${s/2})`}
        style={{ transition:'stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)' }} />
    </svg>
  )
}

export default function DashboardConstellation({ categories = [], maxxProfile, overallTier, onSelect, onMetricClick }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [hoverId, setHoverId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  // Esc closes the expanded bubble.
  useEffect(() => {
    if (!expandedId) return
    const on = (e) => { if (e.key === 'Escape') setExpandedId(null) }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [expandedId])

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
  const RX = 37, RY = 39
  const nodes = categories.map((c, i) => {
    const ang = (-90 + i * (360 / N)) * Math.PI / 180
    const x = 50 + RX * Math.cos(ang)
    const y = 50 + RY * Math.sin(ang)
    return { c, x, y, i, ux: Math.cos(ang), uy: Math.sin(ang) }
  })

  const coreTier = maxxProfile?.tier?.tier ?? overallTier ?? 0
  const coreColor = TIER_COLORS[coreTier] || '#4f8ef7'
  const nextColor = TIER_COLORS[maxxProfile?.levelUp?.nextTier] || '#a78bfa'

  const BASE = 134, CORE = 196, COREHOVER = 248, HOVER = 248

  const isExpanded = expandedId != null

  // Orbiting mini-bubbles that point straight at a single data source / stat.
  function Satellites({ items = [], size, outwardAngle, color, catId, catName, navTarget }) {
    const list = items.slice(0, 4)
    const k = list.length
    if (!k) return null
    const R = size / 2 + 30
    const gap = 44 * Math.PI / 180
    return list.map((m, j) => {
      const ang = outwardAngle == null
        ? (-90 + j * (360 / k)) * Math.PI / 180
        : outwardAngle + (j - (k - 1) / 2) * gap
      const dx = R * Math.cos(ang), dy = R * Math.sin(ang)
      const go = () => m.evidence
        ? onMetricClick?.({ ...m.evidence, categoryId:catId, categoryName:catName, metricLabel:m.label, metricValue:m.value })
        : (navTarget && navigate(navTarget))
      return (
        <button key={j} className="csat"
          style={{ left:`calc(50% + ${dx}px)`, top:`calc(50% + ${dy}px)`, animationDelay:(0.03 + j*0.045)+'s' }}
          onClick={(e) => { e.stopPropagation(); go() }}>
          <span className="csat-disc" style={{ border:`1.5px solid ${color}`, boxShadow:`0 0 16px ${color}66, 0 8px 20px rgba(0,0,0,.5), inset 0 2px 5px rgba(255,255,255,.22)` }}>
            <span style={{ fontSize:12.5, fontWeight:900, color:'#fff', lineHeight:1.05 }}>{m.value}</span>
          </span>
          <span className="csat-l">{m.label}</span>
        </button>
      )
    })
  }

  // Rich content rendered inside an expanded (full-screen) bubble.
  function ExpandedContent({ id }) {
    const isCore = id === 'core'
    const cat = isCore ? null : categories.find(c => c.id === id)
    if (!isCore && !cat) return null
    const tierNum = isCore ? coreTier : (cat.tier?.tier || 0)
    const col = TIER_COLORS[tierNum] || coreColor
    const name = isCore ? 'Maxx Score' : cat.name
    const tierLabel = isCore ? maxxProfile?.tier?.label : cat.tier?.label
    const levelUp = isCore ? maxxProfile?.levelUp : cat.levelUp
    const metrics = isCore ? (maxxProfile?.details || []) : (cat.metrics || [])
    const navTarget = isCore ? null : NAV_TARGET[cat.id]
    const nextC = TIER_COLORS[levelUp?.nextTier] || nextColor
    return (
      <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center',
        padding:'clamp(20px,4vw,46px)', overflowY:'auto', textAlign:'center' }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
          {!isCore && <Icon id={cat.id} color={col} size={30} />}
          <span style={{ fontSize:'clamp(20px,3vw,30px)', fontWeight:950, color:'#fff', letterSpacing:'-0.02em' }}>{name}</span>
        </div>
        {tierLabel && <span style={{ fontSize:12, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', color:col }}>{tierLabel}</span>}
        <div style={{ fontSize:'clamp(64px,11vw,128px)', lineHeight:.95, fontWeight:950, letterSpacing:'-0.06em', color:'#fff', textShadow:`0 0 40px ${col}`, margin:'6px 0' }}>
          {tierNum > 0 ? 'T' + tierNum : '—'}
        </div>
        {levelUp && (
          <div style={{ width:'min(420px,80%)', marginBottom:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:800, color:'var(--muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.08em' }}>
              <span>{levelUp.progressPct}% mot T{levelUp.nextTier}</span>
              {levelUp.title && <span style={{ color:nextC }}>{levelUp.title}</span>}
            </div>
            <div style={{ height:8, borderRadius:99, background:'rgba(255,255,255,.08)', overflow:'hidden' }}>
              <div style={{ width:(levelUp.progressPct||0)+'%', height:'100%', borderRadius:99, background:`linear-gradient(90deg, ${col}, ${nextC})`, boxShadow:`0 0 14px ${nextC}` }} />
            </div>
            {levelUp.primaryBottleneck && (
              <div style={{ fontSize:12, color:'var(--muted2)', marginTop:9 }}>
                Flaskhals: <span style={{ color:nextC, fontWeight:800 }}>{levelUp.primaryBottleneck}</span>
              </div>
            )}
          </div>
        )}
        {metrics.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, width:'min(640px,92%)', marginBottom:18 }}>
            {metrics.map((m, i) => (
              <div key={i}
                onClick={m.evidence ? () => onMetricClick?.({ ...m.evidence, categoryId:id, categoryName:name, metricLabel:m.label, metricValue:m.value }) : undefined}
                style={{ padding:'12px 14px', borderRadius:14, textAlign:'left',
                  background:'rgba(255,255,255,.04)', border:'1px solid var(--border)',
                  cursor:m.evidence?'pointer':'default', transition:'border-color .15s, background .15s' }}
                onMouseEnter={m.evidence ? (e) => { e.currentTarget.style.borderColor = col; e.currentTarget.style.background = 'rgba(255,255,255,.07)' } : undefined}
                onMouseLeave={m.evidence ? (e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'rgba(255,255,255,.04)' } : undefined}>
                <div style={{ fontSize:10.5, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.label}</div>
                <div style={{ fontSize:19, fontWeight:900, color: m.highlight ? col : '#fff' }}>{m.value}</div>
                {m.evidence && <div style={{ fontSize:10, color:'var(--accent)', marginTop:3, fontWeight:700 }}>Visa bevis →</div>}
              </div>
            ))}
          </div>
        )}
        {Array.isArray(levelUp?.blockers) && levelUp.blockers.length > 0 && (
          <div style={{ width:'min(560px,92%)', marginBottom:18, textAlign:'left' }}>
            <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)', marginBottom:8 }}>Att låsa upp nästa tier</div>
            {levelUp.blockers.map((b, i) => (
              <div key={i} style={{ display:'flex', gap:9, alignItems:'flex-start', fontSize:12.5, color:'var(--muted2)', padding:'5px 0', lineHeight:1.4 }}>
                <span style={{ color:nextC, fontWeight:900 }}>›</span>
                <span>{typeof b === 'string' ? b : (b?.label || b?.text || '')}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center', marginTop:'auto' }}>
          <button className="cbig-act" onClick={() => { setExpandedId(null); onSelect?.(isCore ? maxxProfile : cat) }}>Öppna full detalj →</button>
          {navTarget && <button className="cbig-act ghost" onClick={() => navigate(navTarget)}>Till {name} ↗</button>}
          <button className="cbig-act ghost" onClick={() => setExpandedId(null)}>Stäng</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cmap" style={{ position:'relative', width:'100%', minHeight: isExpanded ? '82vh' : 680, padding:'44px 0', transition:'min-height .5s cubic-bezier(.22,1,.36,1)' }}>
      <style>{`
        .cmap-edge { stroke-dasharray: 5 7; animation: cmapFlow 1.4s linear infinite; }
        @keyframes cmapFlow { to { stroke-dashoffset: -24; } }
        @keyframes cmapFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        .cnode { position:absolute; transform:translate(-50%,-50%); }
        .cstack { position:relative; transition: width .42s cubic-bezier(.22,1,.36,1), height .42s cubic-bezier(.22,1,.36,1); }
        .cdisc {
          position:absolute; inset:0; border-radius:50%; display:flex; align-items:center; justify-content:center;
          cursor:pointer; overflow:hidden; z-index:2;
          transition: box-shadow .35s ease;
        }
        .cdisc::after { content:''; position:absolute; top:7%; left:14%; width:42%; height:30%; border-radius:50%;
          background:radial-gradient(circle at 40% 40%, rgba(255,255,255,.55), rgba(255,255,255,0) 70%); pointer-events:none; }
        .cfloat { animation: cmapFloat 6s ease-in-out infinite; }
        .csat { position:absolute; transform:translate(-50%,-50%); z-index:55; display:flex; flex-direction:column;
          align-items:center; gap:5px; appearance:none; background:none; border:none; padding:0; cursor:pointer;
          animation:csatIn .34s cubic-bezier(.22,1,.36,1) both; }
        .csat-disc { width:62px; height:62px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          text-align:center; padding:5px; background:radial-gradient(circle at 38% 30%, rgba(255,255,255,.22), rgba(15,21,36,.96) 70%);
          transition:transform .15s ease; }
        .csat:hover .csat-disc { transform:scale(1.13); }
        .csat-l { font-size:9.5px; font-weight:800; color:var(--muted2); max-width:94px; text-align:center; line-height:1.15;
          text-transform:uppercase; letter-spacing:.03em; }
        @keyframes csatIn { from { opacity:0; transform:translate(-50%,-50%) scale(.4) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }
        .clabel { font-size:11px; font-weight:800; color:var(--muted); letter-spacing:0.08em; text-transform:uppercase; margin-top:9px; text-align:center; transition:opacity .3s; }
        .cmetric-in { display:flex; justify-content:space-between; gap:10px; width:100%; font-size:11.5px; padding:3px 0; }
        .cbig-act {
          appearance:none; cursor:pointer; padding:11px 18px; border-radius:12px; font-size:13px; font-weight:800;
          background:linear-gradient(180deg, var(--accent), #3a6fd0); color:#fff; border:1px solid var(--accent-border);
          box-shadow:0 8px 24px rgba(79,142,247,.4); transition:transform .15s, box-shadow .15s;
        }
        .cbig-act:hover { transform:translateY(-2px); box-shadow:0 12px 30px rgba(79,142,247,.55); }
        .cbig-act.ghost { background:rgba(255,255,255,.05); color:var(--text); border:1px solid var(--border); box-shadow:none; }
        .cbig-act.ghost:hover { background:rgba(255,255,255,.1); }
        .cbackdrop { position:absolute; inset:-40px; z-index:30; background:radial-gradient(circle at 50% 45%, rgba(6,10,20,.55), rgba(4,7,14,.86)); backdrop-filter:blur(7px); animation:cbackIn .4s ease; }
        @keyframes cbackIn { from { opacity:0 } to { opacity:1 } }
        @media (prefers-reduced-motion: reduce) { .cmap-edge,.cfloat { animation:none } }
      `}</style>

      {/* Edges */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:1, overflow:'visible', opacity:isExpanded?0:1, transition:'opacity .4s ease' }}>
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

      {/* Backdrop while a bubble is expanded */}
      {isExpanded && <div className="cbackdrop" onClick={() => setExpandedId(null)} />}

      {/* Core node — Maxx Score */}
      {(() => {
        const id = 'core'
        const exp = expandedId === id
        const hov = hoverId === id && !isExpanded
        const dim = exp ? 'min(78vh, 760px)' : (hov ? COREHOVER : CORE)
        const dimOther = isExpanded && !exp
        const corePct = maxxProfile?.levelUp?.progressPct
        return (
          <div className="cnode" style={{ left:'50%', top:'50%', zIndex: exp ? 60 : (hov?40:4),
            transition:'opacity .45s ease, transform .55s cubic-bezier(.22,1,.36,1)',
            opacity: dimOther ? 0 : 1, pointerEvents: dimOther ? 'none' : 'auto',
            transform: dimOther ? 'translate(-50%,-50%) scale(.4)' : 'translate(-50%,-50%)' }}
            onMouseEnter={() => setHoverId(id)} onMouseLeave={() => setHoverId(null)}>
            <div className={exp ? 'cstack' : 'cstack cfloat'} style={{ width:dim, height:dim }}>
              {!exp && corePct != null && <RingProgress size={hov?COREHOVER:CORE} pct={corePct} color={coreColor} nextColor={nextColor} />}
              <div className="cdisc"
                onClick={() => exp ? null : setExpandedId(id)}
                style={{ ...bubbleSkin(coreColor, true, exp ? 2.2 : (hov ? 1.9 : 1.6)) }}>
                {exp ? <ExpandedContent id={id} /> : (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'0 14px' }}>
                    <span style={{ fontSize:10, letterSpacing:'0.18em', fontWeight:900, color:'rgba(255,255,255,.62)', textTransform:'uppercase' }}>Maxx</span>
                    <span style={{ fontSize:hov?64:56, lineHeight:1, fontWeight:950, letterSpacing:'-0.06em', color:'#fff', textShadow:`0 0 28px ${coreColor}`, transition:'font-size .3s' }}>T{coreTier || '—'}</span>
                    {maxxProfile?.levelUp && (
                      <span style={{ fontSize:11.5, fontWeight:800, color:nextColor, marginTop:4 }}>{maxxProfile.levelUp.progressPct}% → T{maxxProfile.levelUp.nextTier}</span>
                    )}
                    {hov && maxxProfile?.levelUp?.primaryBottleneck && (
                      <span style={{ fontSize:10.5, color:'var(--muted2)', marginTop:5, maxWidth:150, lineHeight:1.3 }}>Flaskhals: <b style={{ color:nextColor }}>{maxxProfile.levelUp.primaryBottleneck}</b></span>
                    )}
                    {hov && <span style={{ fontSize:9.5, fontWeight:800, color:'var(--accent)', marginTop:7, letterSpacing:'0.05em' }}>KLICKA FÖR ALLT</span>}
                  </div>
                )}
              </div>
              {hov && <Satellites items={maxxProfile?.details || []} size={COREHOVER} outwardAngle={null} color={coreColor} catId="core" catName="Maxx Score" navTarget={null} />}
            </div>
            {!exp && <div className="clabel" style={{ opacity:isExpanded?0:1 }}>Overall</div>}
          </div>
        )
      })()}

      {/* Category nodes */}
      {nodes.map(n => {
        const cat = n.c
        const id = cat.id
        const tierNum = cat.tier?.tier || 0
        const active = cat.hasData && tierNum > 0
        const col = TIER_COLORS[tierNum] || 'var(--border)'
        const exp = expandedId === id
        const hov = hoverId === id && !isExpanded
        const dimOther = isExpanded && !exp
        const size = exp ? 'min(78vh, 760px)' : (hov ? HOVER : BASE)
        const left = exp ? '50%' : n.x + '%'
        const top = exp ? '50%' : n.y + '%'
        const progressPct = cat.levelUp?.progressPct
        const nextC = TIER_COLORS[cat.levelUp?.nextTier] || col
        const outwardAngle = Math.atan2(n.uy, n.ux)
        return (
          <div key={id} className="cnode" style={{ left, top, zIndex: exp ? 60 : (hov ? 40 : 3),
            transition:'opacity .45s ease, transform .55s cubic-bezier(.22,1,.36,1)',
            opacity: dimOther ? 0 : 1, pointerEvents: dimOther ? 'none' : 'auto',
            transform: dimOther
              ? `translate(calc(-50% + ${n.ux*70}px), calc(-50% + ${n.uy*70}px)) scale(.4)`
              : 'translate(-50%,-50%)' }}
            onMouseEnter={() => setHoverId(id)} onMouseLeave={() => setHoverId(null)}>
            <div className={exp ? 'cstack' : 'cstack cfloat'} style={{ width:size, height:size, animationDelay:(n.i*0.5)+'s' }}>
              {!exp && active && progressPct != null && <RingProgress size={hov?HOVER:BASE} pct={progressPct} color={col} nextColor={nextC} />}
              <div className="cdisc"
                onClick={() => exp ? null : setExpandedId(id)}
                style={{ ...bubbleSkin(col, active, exp ? 2.2 : (hov ? 1.6 : 1)) }}>
                {exp ? <ExpandedContent id={id} /> : hov ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, padding:'0 18px', width:'100%' }}>
                    <Icon id={id} color={active ? col : 'var(--muted)'} size={26} />
                    <span style={{ fontSize:14, fontWeight:900, color:'#fff' }}>{cat.name}</span>
                    <span style={{ fontSize:38, fontWeight:950, lineHeight:1, color:active?'#fff':'var(--muted)', textShadow:active?`0 0 20px ${col}`:'none' }}>{tierNum>0?'T'+tierNum:'—'}</span>
                    {active && progressPct != null
                      ? <span style={{ fontSize:11, fontWeight:800, color:nextC, marginTop:2 }}>{progressPct}% → T{cat.levelUp?.nextTier}</span>
                      : <span style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic' }}>Ingen data ännu</span>}
                    {active && cat.levelUp?.primaryBottleneck && (
                      <span style={{ fontSize:10, color:'var(--muted2)', marginTop:2, maxWidth:150, lineHeight:1.3 }}>Flaskhals: <b style={{ color:nextC }}>{cat.levelUp.primaryBottleneck}</b></span>
                    )}
                    <span style={{ fontSize:9.5, fontWeight:800, color:'var(--accent)', marginTop:6, letterSpacing:'0.05em' }}>KLICKA FÖR ALLT</span>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                    <Icon id={id} color={active ? col : 'var(--muted)'} size={26} />
                    <span style={{ fontSize:22, fontWeight:950, color:active ? '#fff' : 'var(--muted)', lineHeight:1, textShadow:active?`0 0 14px ${col}`:'none' }}>{tierNum > 0 ? 'T' + tierNum : '—'}</span>
                  </div>
                )}
              </div>
              {hov && active && <Satellites items={cat.metrics || []} size={HOVER} outwardAngle={outwardAngle} color={col} catId={id} catName={cat.name} navTarget={NAV_TARGET[id]} />}
            </div>
            {!exp && !hov && <div className="clabel" style={{ opacity:isExpanded?0:1 }}>{cat.name}</div>}
          </div>
        )
      })}
    </div>
  )
}
