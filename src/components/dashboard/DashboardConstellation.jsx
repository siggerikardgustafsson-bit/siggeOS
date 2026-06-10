import { useState, useEffect, useRef } from 'react'
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

// Crisp glassy sphere — tight specular, defined rim light, colored under-glow.
function bubbleSkin(color, active, intensity = 1) {
  return {
    background: active
      ? `radial-gradient(125% 125% at 30% 22%, rgba(255,255,255,.95) 0%, rgba(255,255,255,.14) 7%, ${color}26 24%, rgba(13,17,30,.97) 58%, rgba(7,10,18,1) 100%)`
      : `radial-gradient(125% 125% at 30% 22%, rgba(255,255,255,.55) 0%, rgba(255,255,255,.07) 9%, rgba(34,42,64,.92) 38%, rgba(12,16,28,1) 100%)`,
    border: `1px solid ${active ? color : 'rgba(255,255,255,.16)'}`,
    boxShadow: active
      ? `0 0 0 1px ${color}30, 0 20px 50px -14px ${color}55, 0 36px 70px -26px rgba(0,0,0,.8), inset 0 1.5px 1px rgba(255,255,255,.55), inset 0 -26px 46px -20px ${color}40, inset 0 0 ${22*intensity}px ${color}18`
      : `0 20px 50px -18px rgba(0,0,0,.7), inset 0 1.5px 1px rgba(255,255,255,.32), inset 0 -26px 46px -22px rgba(0,0,0,.65)`,
  }
}

// Crisp conic progress ring hugging the bubble rim — scales perfectly, no blur.
// Fills from 0 → pct on mount via the animated --cp custom property.
function RingProgress({ pct, nextColor, thickness = 4, inset = -7, glow = true }) {
  const p = Math.max(0, Math.min(100, pct || 0))
  return (
    <div className="cring" style={{ position:'absolute', inset, borderRadius:'50%', pointerEvents:'none', zIndex:1, '--target': p + '%',
      background:`conic-gradient(from -90deg, ${nextColor} var(--cp,0%), rgba(255,255,255,.06) var(--cp,0%) 100%)`,
      WebkitMask:`radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`,
      mask:`radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`,
      filter: glow ? `drop-shadow(0 0 5px ${nextColor}cc)` : 'none' }} />
  )
}

// Corner bubble — collapsed glassy disc that expands on hover into a full info
// panel (Dagens uppgifter / Grafer). Defined at MODULE scope so its component
// identity is stable across parent re-renders — otherwise every hover would
// remount the node and the size/border-radius CSS transition could never run.
function CornerBubble({ cfg, open, isExpanded, onEnter, onLeave }) {
  const originX = cfg.anchor.right != null ? 'right' : 'left'
  const originY = cfg.anchor.bottom != null ? 'bottom' : 'top'
  return (
    <div className="ccorner"
      style={{ position: 'absolute', ...cfg.anchor, zIndex: open ? 70 : 6,
        opacity: isExpanded ? 0 : 1, pointerEvents: isExpanded ? 'none' : 'auto',
        transition: 'opacity .4s ease' }}
      onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className={`ccorner-shell cbub ${open ? 'open' : 'closed'}`}
        style={{ width: open ? cfg.width : 112, height: open ? cfg.height : 112,
          borderRadius: open ? 24 : '50%',
          transformOrigin: `${originX} ${originY}`,
          cursor: open ? 'default' : 'pointer',
          ['--cbc']: cfg.color }}>
        {/* Both layers stay mounted and cross-fade, so the morph is smooth
            opening AND closing — content never pops in or vanishes. */}
        <div className="ccorner-cap" style={{ opacity: open ? 0 : 1 }}>
          <span className="ccorner-ico" style={{ color: cfg.color, filter: `drop-shadow(0 0 8px ${cfg.color}88)` }}>{cfg.icon}</span>
          <span className="ccorner-lab">{cfg.label}</span>
          {cfg.sub != null && <span className="ccorner-sub" style={{ color: cfg.color }}>{cfg.sub}</span>}
          <span className="ccorner-hint">Hovra</span>
        </div>
        <div className="ccorner-body" style={{ width: cfg.width, height: cfg.height,
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}>
          {cfg.render()}
        </div>
      </div>
    </div>
  )
}

export default function DashboardConstellation({ categories = [], maxxProfile, overallTier, onSelect, onMetricClick, corners = [] }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [hoverId, setHoverId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  // Live pixel size of the constellation container, so repulsion offsets can be
  // clamped — bubbles must never slide off the sides or up into the header.
  const wrapRef = useRef(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

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
  // Curated layout: 2 top · 1 left · 1 right · 2 bottom — keeps vertical lanes
  // clear so bubbles never collide with the header/footer rows.
  const PRESET = {
    6: [ {x:31,y:19}, {x:69,y:19}, {x:89,y:50}, {x:69,y:81}, {x:31,y:81}, {x:11,y:50} ],
    5: [ {x:31,y:22}, {x:69,y:22}, {x:88,y:55}, {x:50,y:84}, {x:12,y:55} ],
    4: [ {x:30,y:24}, {x:70,y:24}, {x:70,y:76}, {x:30,y:76} ],
  }
  const nodes = categories.map((c, i) => {
    let x, y
    const preset = PRESET[N]
    if (preset) { x = preset[i].x; y = preset[i].y }
    else {
      const ang = (-90 + i * (360 / N)) * Math.PI / 180
      x = 50 + 38 * Math.cos(ang); y = 50 + 40 * Math.sin(ang)
    }
    const dx = x - 50, dy = y - 50
    const len = Math.hypot(dx, dy) || 1
    return { c, x, y, i, ux: dx / len, uy: dy / len }
  })

  const coreTier = maxxProfile?.tier?.tier ?? overallTier ?? 0
  const coreColor = TIER_COLORS[coreTier] || '#4f8ef7'
  const nextColor = TIER_COLORS[maxxProfile?.levelUp?.nextTier] || '#a78bfa'

  const BASE = 158, CORE = 268, COREHOVER = 320, HOVER = 274

  const isExpanded = expandedId != null

  // Soft repulsion — neighbours of the hovered bubble drift a little out of the
  // way, like real bubbles nudging each other in a fluid. Returns a px offset.
  // Corner widgets (today / stats) repel with a wider, stronger field so the
  // expanding panel never collides with the category bubbles.
  const cornerMap = {}
  corners.forEach(c => { cornerMap[c.id] = { x: c.center.x, y: c.center.y, r: c.r || 64, mag: c.mag || 90 } })
  const hoverCenter = hoverId === 'core'
    ? { x: 50, y: 50, r: 64, mag: 100 }
    : cornerMap[hoverId]
      ? cornerMap[hoverId]
      : (hoverId ? ((n) => n ? { x: n.x, y: n.y, r: 66, mag: 112 } : null)(nodes.find(n => n.c.id === hoverId)) : null)
  function pushFor(x, y) {
    if (!hoverCenter || isExpanded) return { px: 0, py: 0 }
    const R = hoverCenter.r || 62, M = hoverCenter.mag || 82
    const dx = x - hoverCenter.x, dy = y - hoverCenter.y
    const d = Math.hypot(dx, dy)
    if (d < 0.6 || d > R) return { px: 0, py: 0 }
    const f = 1 - d / R            // closer ⇒ stronger
    const mag = M * Math.pow(f, 1.05)  // px, gentle falloff — neighbours clear out decisively
    return { px: (dx / d) * mag, py: (dy / d) * mag }
  }
  // Keep a bubble fully inside the container after the push is applied: clamp
  // its centre so centre ± radius never crosses the edge (incl. the top, which
  // borders the page header). Falls back to the raw push until the box is known.
  function clampPush(xPct, yPct, px, py, sizePx) {
    const { w, h } = box
    if (!w || !h) return { px, py }
    // M leaves headroom for the gentle float animation (~7px) layered on top.
    const r = sizePx / 2, M = 22
    const baseX = (xPct / 100) * w, baseY = (yPct / 100) * h
    let cx = baseX + px, cy = baseY + py
    cx = Math.max(r + M, Math.min(w - r - M, cx))
    cy = Math.max(r + M, Math.min(h - r - M, cy))
    return { px: cx - baseX, py: cy - baseY }
  }

  // Orbiting mini-bubbles that point straight at a single data source / stat.
  function Satellites({ items = [], size, outwardAngle, color, catId, catName, navTarget }) {
    const list = items.slice(0, 4)
    const k = list.length
    if (!k) return null
    const R = size / 2 + 26
    const gap = 42 * Math.PI / 180
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
          style={{ left:`calc(50% + ${dx}px)`, top:`calc(50% + ${dy}px)`, animationDelay:(0.04 + j*0.06)+'s' }}
          onClick={(e) => { e.stopPropagation(); go() }}>
          <span className="csat-disc" style={{
            background:`radial-gradient(118% 118% at 32% 24%, rgba(255,255,255,.92) 0%, rgba(255,255,255,.1) 11%, ${color}22 34%, rgba(13,18,32,.98) 74%, rgba(8,11,20,1) 100%)`,
            border:`1px solid ${color}`,
            boxShadow:`0 0 0 1px ${color}22, 0 10px 26px -8px rgba(0,0,0,.75), 0 0 20px ${color}3a, inset 0 1.5px 1px rgba(255,255,255,.5), inset 0 -10px 18px -8px ${color}40` }}>
            <span style={{ fontSize:13, fontWeight:900, color:'#fff', lineHeight:1.05, textShadow:`0 1px 6px rgba(0,0,0,.55)` }}>{m.value}</span>
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
    // Content lives inside the square inscribed in the circle so nothing
    // ever touches the curved rim.
    return (
      <div className="cexp" onClick={(e) => e.stopPropagation()}
        style={{ width:'min(70.7%, 560px)', maxHeight:'70.7%', overflowY:'auto', display:'flex',
          flexDirection:'column', alignItems:'center', textAlign:'center', padding:'4px 6px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:11, marginBottom:2 }}>
          {!isCore && (
            <span style={{ width:34, height:34, borderRadius:'50%', display:'grid', placeItems:'center',
              background:`radial-gradient(circle at 38% 32%, ${col}40, rgba(255,255,255,.04))`, border:`1px solid ${col}66` }}>
              <Icon id={cat.id} color={col} size={19} />
            </span>
          )}
          <span style={{ fontSize:'clamp(19px,2.6vw,27px)', fontWeight:950, color:'#fff', letterSpacing:'-0.02em' }}>{name}</span>
        </div>
        {tierLabel && <span style={{ fontSize:11, fontWeight:800, letterSpacing:'0.2em', textTransform:'uppercase', color:col }}>{tierLabel}</span>}
        <div style={{ position:'relative', fontSize:'clamp(58px,9.5vw,116px)', lineHeight:.95, fontWeight:950, letterSpacing:'-0.06em', color:'#fff', textShadow:`0 2px 30px ${col}aa`, margin:'2px 0 4px' }}>
          {tierNum > 0 ? 'T' + tierNum : '—'}
        </div>
        {levelUp && (
          <div style={{ width:'92%', maxWidth:380, marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10.5, fontWeight:800, color:'var(--muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.1em' }}>
              <span>{levelUp.progressPct}% → T{levelUp.nextTier}</span>
              {levelUp.title && <span style={{ color:nextC }}>{levelUp.title}</span>}
            </div>
            <div style={{ height:7, borderRadius:99, background:'rgba(255,255,255,.07)', overflow:'hidden', boxShadow:'inset 0 1px 2px rgba(0,0,0,.5)' }}>
              <div style={{ width:(levelUp.progressPct||0)+'%', height:'100%', borderRadius:99, background:`linear-gradient(90deg, ${col}, ${nextC})`, boxShadow:`0 0 12px ${nextC}` }} />
            </div>
            {levelUp.primaryBottleneck && (
              <div style={{ fontSize:11.5, color:'var(--muted2)', marginTop:9 }}>
                Flaskhals: <span style={{ color:nextC, fontWeight:800 }}>{levelUp.primaryBottleneck}</span>
              </div>
            )}
          </div>
        )}
        {metrics.length > 0 && (
          <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:7, width:'100%', marginBottom:14 }}>
            {metrics.map((m, i) => (
              <button key={i} className="cexp-pill"
                onClick={m.evidence ? () => onMetricClick?.({ ...m.evidence, categoryId:id, categoryName:name, metricLabel:m.label, metricValue:m.value }) : undefined}
                style={{ '--pc': col, cursor:m.evidence?'pointer':'default' }}>
                <span style={{ color:'var(--muted)', fontSize:10.5, fontWeight:700 }}>{m.label}</span>
                <span style={{ color: m.highlight ? col : '#fff', fontWeight:900, fontSize:13 }}>{m.value}</span>
                {m.evidence && <span style={{ color:'var(--accent)', fontSize:11, marginLeft:1 }}>→</span>}
              </button>
            ))}
          </div>
        )}
        {Array.isArray(levelUp?.blockers) && levelUp.blockers.length > 0 && (
          <div style={{ width:'94%', marginBottom:14, textAlign:'left' }}>
            <div style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--muted)', marginBottom:7, textAlign:'center' }}>Lås upp nästa tier</div>
            {levelUp.blockers.map((b, i) => (
              <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', fontSize:12, color:'var(--muted2)', padding:'4px 0', lineHeight:1.4 }}>
                <span style={{ color:nextC, fontWeight:900 }}>›</span>
                <span>{typeof b === 'string' ? b : (b?.label || b?.text || '')}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
          <button className="cbig-act" onClick={() => { setExpandedId(null); onSelect?.(isCore ? maxxProfile : cat) }}>Full detalj →</button>
          {navTarget && <button className="cbig-act ghost" onClick={() => navigate(navTarget)}>Till {name} ↗</button>}
          <button className="cbig-act ghost" onClick={() => setExpandedId(null)}>Stäng</button>
        </div>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="cmap" style={{ position:'relative', width:'100%', minHeight: isExpanded ? '82vh' : 680, padding:'44px 0', transition:'min-height .5s cubic-bezier(.22,1,.36,1)' }}>
      <style>{`
        .cmap-edge { stroke-dasharray: 5 7; animation: cmapFlow 1.4s linear infinite; }
        @keyframes cmapFlow { to { stroke-dashoffset: -24; } }
        @keyframes cmapFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        .cnode { position:absolute; transform:translate(-50%,-50%); }
        .cstack { position:relative; transition: width .6s cubic-bezier(.22,1,.36,1), height .6s cubic-bezier(.22,1,.36,1); }
        @property --cp { syntax:'<percentage>'; initial-value:0%; inherits:false; }
        .cring { animation: cringFill 1.2s cubic-bezier(.22,1,.36,1) .2s both; }
        @keyframes cringFill { from { --cp:0% } to { --cp:var(--target) } }
        .cdisc {
          position:absolute; inset:0; border-radius:50%; display:flex; align-items:center; justify-content:center;
          cursor:pointer; overflow:hidden; z-index:2; transform:translateZ(0); backface-visibility:hidden;
          transition: box-shadow .4s ease, background .4s ease;
          animation: cdiscIn .7s cubic-bezier(.34,1.3,.5,1) both, cbubbleMorph 11s ease-in-out infinite;
        }
        @keyframes cdiscIn { from { opacity:0; transform:translateZ(0) scale(.55) } to { opacity:1; transform:translateZ(0) scale(1) } }
        /* Living surface — the rim breathes between perfect circle and gentle ovoid, like a bubble under surface tension */
        @keyframes cbubbleMorph {
          0%,100% { border-radius:50% 50% 50% 50% / 50% 50% 50% 50% }
          30%     { border-radius:53% 47% 49% 51% / 52% 48% 52% 48% }
          60%     { border-radius:47% 53% 52% 48% / 48% 53% 47% 52% }
        }
        /* Iridescent soap-film that slowly rotates around the rim */
        .cdisc::before { content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:1;
          mix-blend-mode:screen; opacity:.55;
          -webkit-mask:radial-gradient(farthest-side, transparent 58%, #000 82%, transparent 100%);
          mask:radial-gradient(farthest-side, transparent 58%, #000 82%, transparent 100%);
          background:conic-gradient(from 200deg, rgba(120,180,255,.5), rgba(190,130,255,.42), rgba(120,255,225,.4), rgba(255,210,130,.42), rgba(255,140,190,.4), rgba(120,180,255,.5));
          animation:cirid 16s linear infinite; }
        @keyframes cirid { to { transform:rotate(360deg) } }
        /* Specular glint that drifts as the surface wobbles */
        .cdisc::after { content:''; position:absolute; top:7%; left:15%; width:26%; height:17%; border-radius:50%; z-index:3;
          transform:rotate(-18deg); opacity:.85;
          background:radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,255,255,.2) 46%, rgba(255,255,255,0) 74%);
          pointer-events:none; animation:cglint 9s ease-in-out infinite; }
        @keyframes cglint {
          0%,100% { transform:rotate(-18deg) translate(0,0); opacity:.85 }
          50%     { transform:rotate(-11deg) translate(10%,7%); opacity:1 }
        }
        .cfloat { animation: cmapFloat 6.5s ease-in-out infinite; will-change:transform; }
        .cexp { scrollbar-width:none; animation:cexpIn .5s cubic-bezier(.22,1,.36,1) both; }
        .cexp::-webkit-scrollbar { display:none; }
        @keyframes cexpIn { from { opacity:0; transform:scale(.94) } to { opacity:1; transform:scale(1) } }
        .cexp-pill { appearance:none; display:inline-flex; align-items:center; gap:7px; padding:7px 13px; border-radius:999px;
          background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.1); transition:border-color .15s, background .15s, transform .15s; }
        .cexp-pill:hover { border-color:var(--pc); background:rgba(255,255,255,.09); transform:translateY(-1px); }
        .csat { position:absolute; transform:translate(-50%,-50%); z-index:55; display:flex; flex-direction:column;
          align-items:center; gap:6px; appearance:none; background:none; border:none; padding:0; cursor:pointer;
          animation:csatIn .42s cubic-bezier(.34,1.4,.5,1) both; }
        .csat-disc { position:relative; width:74px; height:74px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          text-align:center; padding:5px; overflow:hidden; transform:translateZ(0); backface-visibility:hidden;
          transition:transform .22s cubic-bezier(.34,1.4,.5,1), box-shadow .22s ease;
          animation:cbubbleMorph 9s ease-in-out infinite; }
        .csat-disc::before { content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:1;
          mix-blend-mode:screen; opacity:.6;
          -webkit-mask:radial-gradient(farthest-side, transparent 54%, #000 80%, transparent 100%);
          mask:radial-gradient(farthest-side, transparent 54%, #000 80%, transparent 100%);
          background:conic-gradient(from 200deg, rgba(120,180,255,.5), rgba(190,130,255,.42), rgba(120,255,225,.4), rgba(255,210,130,.42), rgba(255,140,190,.4), rgba(120,180,255,.5));
          animation:cirid 13s linear infinite; }
        .csat-disc::after { content:''; position:absolute; top:9%; left:18%; width:30%; height:20%; border-radius:50%; z-index:3;
          transform:rotate(-20deg); background:radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,255,255,.15) 48%, rgba(255,255,255,0) 76%);
          pointer-events:none; animation:cglint 8s ease-in-out infinite; }
        .csat:hover .csat-disc { transform:translateZ(0) scale(1.15); animation-play-state:paused; }
        .csat-l { font-size:9.5px; font-weight:800; color:var(--muted2); max-width:96px; text-align:center; line-height:1.15;
          text-transform:uppercase; letter-spacing:.04em; transform:translateZ(0); }
        @keyframes csatIn { from { opacity:0; transform:translate(-50%,-50%) scale(.3) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }
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
        .cbackdrop { position:absolute; inset:-60px; z-index:30; background:radial-gradient(circle at 50% 48%, rgba(6,9,18,.28) 0%, rgba(5,8,15,.42) 55%, rgba(4,6,13,.52) 100%); backdrop-filter:blur(4px) saturate(1.04); -webkit-backdrop-filter:blur(4px) saturate(1.04); animation:cbackIn .5s cubic-bezier(.22,1,.36,1); }
        @keyframes cbackIn { from { opacity:0 } to { opacity:1 } }
        .ccore-glow { position:absolute; inset:-20%; border-radius:50%; pointer-events:none; z-index:0;
          filter:blur(16px); animation:cbreath 4.6s ease-in-out infinite; }
        @keyframes cbreath { 0%,100% { transform:scale(.9); opacity:.45 } 50% { transform:scale(1.06); opacity:.8 } }
        /* Ambient command-center depth */
        .catmos { position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden;
          transition:opacity .5s ease; }
        .catmos-glow { position:absolute; left:50%; top:50%; width:74%; height:124%;
          transform:translate(-50%,-50%); filter:blur(26px); border-radius:50%;
          animation:catmosBreath 7.5s ease-in-out infinite; }
        @keyframes catmosBreath { 0%,100% { opacity:.55; transform:translate(-50%,-50%) scale(.94) } 50% { opacity:.9; transform:translate(-50%,-50%) scale(1.04) } }
        .catmos-rings { position:absolute; left:50%; top:50%; width:680px; height:680px;
          transform:translate(-50%,-50%); will-change:transform; animation:cmapSpin 90s linear infinite; }
        .catmos-rings-2 { animation:cmapSpin 130s linear infinite reverse; opacity:.6; }
        @keyframes cmapSpin { to { transform:translate(-50%,-50%) rotate(360deg) } }
        .catmos-rings circle { fill:none; stroke:rgba(255,255,255,.055); stroke-width:1; vector-effect:non-scaling-stroke; }
        .catmos-rings .dash { stroke:rgba(255,255,255,.07); stroke-dasharray:2 6; }
        .catmos-tick { fill:rgba(255,255,255,.18); }
        /* Corner info bubbles — collapse to a glassy disc, expand to a panel */
        /* One shared background for both states so growing the bubble into a
           panel is a single continuous transform — nothing snaps or cross-cuts.
           Only size, border-radius, box-shadow and a colour tint change. */
        .ccorner-shell { position:relative; overflow:hidden; backface-visibility:hidden;
          background:
            radial-gradient(125% 120% at 30% 22%, color-mix(in srgb, var(--cbc, #4f8ef7) 46%, transparent), color-mix(in srgb, var(--cbc, #4f8ef7) 10%, transparent) 46%, transparent 72%),
            linear-gradient(170deg, rgba(22,28,46,.93), rgba(10,14,24,.96));
          border:1px solid rgba(255,255,255,.12);
          box-shadow:0 14px 34px -12px color-mix(in srgb, var(--cbc, #4f8ef7) 55%, transparent),
            inset 0 1px 0 rgba(255,255,255,.1);
          backdrop-filter:blur(14px) saturate(1.05); -webkit-backdrop-filter:blur(14px) saturate(1.05);
          transition: width .6s cubic-bezier(.22,1,.36,1), height .6s cubic-bezier(.22,1,.36,1),
            border-radius .6s cubic-bezier(.22,1,.36,1), box-shadow .5s ease, transform .55s ease; }
        /* Collapsed bubble gently breathes / floats like the main bubbles */
        .ccorner-shell.closed { animation: cmapFloat 6.5s ease-in-out infinite; }
        /* Open panel: deeper shadow + colour rim; no spinning sheen */
        .ccorner-shell.open {
          box-shadow:0 34px 80px -24px rgba(0,0,0,.88), inset 0 1px 0 rgba(255,255,255,.08),
            0 0 0 1px color-mix(in srgb, var(--cbc, #4f8ef7) 26%, transparent); }
        /* Soap-film iridescence + drifting glint — only on the COLLAPSED bubble */
        .ccorner-shell.closed.cbub::before { content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:1;
          mix-blend-mode:screen; opacity:.5;
          -webkit-mask:radial-gradient(farthest-side, transparent 58%, #000 82%, transparent 100%);
          mask:radial-gradient(farthest-side, transparent 58%, #000 82%, transparent 100%);
          background:conic-gradient(from 200deg, rgba(120,180,255,.5), rgba(190,130,255,.42), rgba(120,255,225,.4), rgba(255,210,130,.42), rgba(255,140,190,.4), rgba(120,180,255,.5));
          animation:cirid 16s linear infinite; }
        .ccorner-shell.closed.cbub::after { content:''; position:absolute; top:7%; left:14%; width:26%; height:17%; border-radius:50%; z-index:3;
          transform:rotate(-18deg); opacity:.85;
          background:radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,255,255,.2) 46%, rgba(255,255,255,0) 74%);
          pointer-events:none; animation:cglint 9s ease-in-out infinite; }
        .ccorner-cap { position:absolute; inset:0; z-index:5; display:flex; flex-direction:column;
          align-items:center; justify-content:center; gap:3px; text-align:center; pointer-events:none;
          transition:opacity .22s ease; }
        .ccorner-ico { display:flex; }
        .ccorner-lab { font-size:12px; font-weight:900; color:#fff; letter-spacing:-.01em; }
        .ccorner-sub { font-size:17px; font-weight:950; line-height:1; letter-spacing:-.03em; text-shadow:0 0 14px currentColor; }
        .ccorner-hint { font-size:8px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); opacity:.7; margin-top:2px; }
        /* Body is anchored top-left and sized to the OPEN panel; while the shell
           is small it's simply clipped, then fades in as the panel finishes
           growing — and fades back out smoothly on close. */
        .ccorner-body { position:absolute; left:0; top:0; z-index:4; overflow-y:auto;
          padding:2px; scrollbar-width:none; transition:opacity .34s ease .2s; }
        .ccorner-body::-webkit-scrollbar { display:none; }
        @media (prefers-reduced-motion: reduce) { .cmap-edge,.cfloat,.catmos-rings,.catmos-glow { animation:none } }
      `}</style>

      {/* Ambient command-center depth — orbit rings + breathing core halo */}
      <div className="catmos" style={{ opacity:isExpanded?0:1 }}>
        <div className="catmos-glow" style={{ background:`radial-gradient(circle, ${coreColor}26 0%, ${coreColor}10 34%, transparent 64%)` }} />
        <svg className="catmos-rings" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <circle cx="50" cy="50" r="46" className="dash" />
          <circle cx="50" cy="50" r="33" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * 30) * Math.PI / 180
            return <circle key={i} className="catmos-tick" cx={50 + 46 * Math.cos(a)} cy={50 + 46 * Math.sin(a)} r="0.55" />
          })}
        </svg>
        <svg className="catmos-rings catmos-rings-2" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <circle cx="50" cy="50" r="40" className="dash" />
        </svg>
      </div>

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
              style={active ? { filter:`drop-shadow(0 0 2px ${col})` } : undefined}
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
        const push = pushFor(50, 50)
        return (
          <div className="cnode" style={{ left:'50%', top:'50%', zIndex: exp ? 60 : (hov?40:4),
            transition:'opacity .55s cubic-bezier(.22,1,.36,1), filter .55s ease, transform .66s cubic-bezier(.34,1.32,.5,1)',
            opacity: dimOther ? 0 : 1, pointerEvents: dimOther ? 'none' : 'auto',
            filter: dimOther ? 'blur(3px)' : 'none',
            transform: dimOther ? 'translate(-50%,-50%) scale(.3)' : `translate(calc(-50% + ${push.px}px), calc(-50% + ${push.py}px))` }}
            onMouseEnter={() => setHoverId(id)} onMouseLeave={() => setHoverId(null)}>
            <div className={exp ? 'cstack' : 'cstack cfloat'} style={{ width:dim, height:dim }}>
              {!exp && <div className="ccore-glow" style={{ background:`radial-gradient(circle, ${coreColor}55 0%, ${coreColor}22 42%, transparent 70%)` }} />}
              {!exp && corePct != null && <RingProgress pct={corePct} nextColor={nextColor} />}
              <div className="cdisc"
                onClick={() => exp ? null : setExpandedId(id)}
                style={{ ...bubbleSkin(coreColor, true, exp ? 2.2 : (hov ? 1.9 : 1.6)) }}>
                {exp && corePct != null && <RingProgress pct={corePct} nextColor={nextColor} thickness={7} inset={14} />}
                {exp ? <ExpandedContent id={id} /> : (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'0 14px' }}>
                    <span style={{ fontSize:10, letterSpacing:'0.18em', fontWeight:900, color:'rgba(255,255,255,.62)', textTransform:'uppercase' }}>Maxx</span>
                    <span style={{ fontSize:hov?76:66, lineHeight:1, fontWeight:950, letterSpacing:'-0.06em', color:'#fff', textShadow:`0 0 28px ${coreColor}`, transition:'font-size .3s' }}>T{coreTier || '—'}</span>
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
        const sizePx = hov ? HOVER : BASE
        const raw = pushFor(n.x, n.y)
        const push = exp ? { px:0, py:0 } : clampPush(n.x, n.y, raw.px, raw.py, sizePx)
        return (
          <div key={id} className="cnode" style={{ left, top, zIndex: exp ? 60 : (hov ? 40 : 3),
            transition:`opacity .55s cubic-bezier(.22,1,.36,1) ${dimOther?n.i*0.04:0}s, filter .55s ease, transform .68s cubic-bezier(.34,1.32,.5,1) ${dimOther?n.i*0.04:0}s, left .66s cubic-bezier(.22,1,.36,1), top .66s cubic-bezier(.22,1,.36,1)`,
            opacity: dimOther ? 0 : 1, pointerEvents: dimOther ? 'none' : 'auto',
            filter: dimOther ? 'blur(3px)' : 'none',
            transform: dimOther
              ? `translate(calc(-50% + ${n.ux*168}px), calc(-50% + ${n.uy*168}px)) scale(.32)`
              : `translate(calc(-50% + ${push.px}px), calc(-50% + ${push.py}px))` }}
            onMouseEnter={() => setHoverId(id)} onMouseLeave={() => setHoverId(null)}>
            <div className={exp ? 'cstack' : 'cstack cfloat'} style={{ width:size, height:size, animationDelay:(n.i*0.5)+'s' }}>
              {!exp && active && progressPct != null && <RingProgress pct={progressPct} nextColor={nextC} />}
              <div className="cdisc"
                onClick={() => exp ? null : setExpandedId(id)}
                style={{ ...bubbleSkin(col, active, exp ? 2.2 : (hov ? 1.6 : 1)), animationDelay:(0.12 + n.i*0.07)+'s' }}>
                {exp && active && progressPct != null && <RingProgress pct={progressPct} nextColor={nextC} thickness={7} inset={14} />}
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

      {/* Corner info bubbles — Dagens uppgifter + Tier-statistik */}
      {corners.map(cfg => <CornerBubble key={cfg.id} cfg={cfg}
        open={hoverId === cfg.id && !isExpanded} isExpanded={isExpanded}
        onEnter={() => setHoverId(cfg.id)} onLeave={() => setHoverId(null)} />)}
    </div>
  )
}
