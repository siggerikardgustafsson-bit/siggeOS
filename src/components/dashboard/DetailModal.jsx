import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { X, ArrowUpRight, ChevronDown, Check, Target } from 'lucide-react'

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
  halsa:       'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
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
    <div style={{ background:'var(--surface3)', backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)', border:'1px solid var(--border2)', borderRadius:10, padding:'10px 14px', fontSize:12 }}>
      <div style={{ color:'var(--muted)', marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color:p.stroke, fontWeight:700 }}>{p.name}: {p.value}</div>)}
    </div>
  )
}

function SectionLabel({ children, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:11 }}>
      <span style={{ width:3, height:13, borderRadius:2, background:color, boxShadow:`0 0 8px ${color}` }} />
      <span style={{ fontSize:10.5, fontWeight:800, letterSpacing:'0.12em', color:'var(--muted)', textTransform:'uppercase' }}>{children}</span>
    </div>
  )
}

function RequirementRow({ req, color }) {
  const met = req.met
  return (
    <div style={{ display:'grid', gridTemplateColumns:'22px minmax(0,1fr) auto', gap:11, alignItems:'center', padding:'11px 13px', borderRadius:13, background:met ? 'color-mix(in srgb, var(--green) 9%, transparent)' : 'var(--surface2)', border:'1px solid ' + (met ? 'color-mix(in srgb, var(--green) 26%, transparent)' : 'var(--border)') }}>
      <div style={{ width:22, height:22, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', background:met ? 'color-mix(in srgb, var(--green) 18%, transparent)' : color + '20', border:'1px solid ' + (met ? 'color-mix(in srgb, var(--green) 40%, transparent)' : color + '40') }}>
        {met ? <Check size={12} color="var(--green)" strokeWidth={3} /> : <div style={{ width:6, height:6, borderRadius:2, background:color }} />}
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700, color:met ? 'var(--green)' : 'var(--text)' }}>{req.label}</div>
        <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{req.currentLabel} → {req.targetLabel}</div>
      </div>
      <div style={{ fontSize:12, fontWeight:800, color:met ? 'var(--green)' : color, whiteSpace:'nowrap' }}>{req.gapLabel}</div>
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
  const heroColor = tierNum ? tierColor : nextColor
  const requirements = category.tierGuide || TIER_REQUIREMENTS[id] || []
  const periods = ['7d', '30d', '90d', '1år']
  const dataMetrics = (metrics || details || []).slice(0, 6)

  const openMetricSource = (event, metric) => {
    event.stopPropagation()
    const target = metric?.evidence?.navTarget
    if (!target || metric?.value === '—') return
    onClose?.()
    navigate(target)
  }

  return (
    <div onClick={onClose} className="dm-overlay">
      <style>{`
        .dm-overlay { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center;
          padding:20px; background:rgba(4,6,12,0.62); backdrop-filter:blur(10px) saturate(1.05); -webkit-backdrop-filter:blur(10px) saturate(1.05);
          animation:dmFade .28s ease both; }
        [data-theme="light"] .dm-overlay { background:rgba(225,228,238,0.55); }
        @keyframes dmFade { from { opacity:0 } to { opacity:1 } }
        .dm-panel { position:relative; width:100%; max-width:600px; max-height:88vh; overflow-y:auto; overflow-x:hidden;
          border-radius:26px; background:var(--modal-bg); border:1px solid var(--modal-border);
          backdrop-filter:blur(44px) saturate(1.2); -webkit-backdrop-filter:blur(44px) saturate(1.2);
          box-shadow:0 40px 100px -24px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.1) inset;
          scrollbar-width:none; animation:dmRise .42s cubic-bezier(.22,1,.36,1) both; }
        .dm-panel::-webkit-scrollbar { display:none; }
        @keyframes dmRise { from { opacity:0; transform:translateY(18px) scale(.97) } to { opacity:1; transform:none } }
        /* sticky slim bar */
        .dm-bar { position:sticky; top:0; z-index:12; display:flex; align-items:center; justify-content:space-between; gap:12px;
          padding:13px 16px 13px 18px; background:color-mix(in srgb, var(--modal-bg) 86%, transparent);
          backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border-bottom:1px solid var(--border); }
        .dm-close { width:34px; height:34px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
          border-radius:11px; background:var(--surface2); border:1px solid var(--border); color:var(--muted2); cursor:pointer;
          transition:background .16s, color .16s, transform .16s, border-color .16s; }
        .dm-close:hover { background:var(--surface3); color:var(--text); border-color:var(--border2); transform:rotate(90deg); }
        /* hero */
        .dm-hero { position:relative; padding:26px 24px 22px; text-align:center; overflow:hidden; }
        .dm-hero-aura { position:absolute; left:50%; top:-40%; width:140%; height:150%; transform:translateX(-50%);
          pointer-events:none; filter:blur(34px); opacity:.7; border-radius:50%; }
        .dm-orb { position:relative; width:64px; height:64px; border-radius:22px; margin:0 auto 12px; display:grid; place-items:center; z-index:1; }
        .dm-tier { position:relative; z-index:1; font-weight:950; line-height:.92; letter-spacing:-0.05em;
          font-size:clamp(54px,12vw,82px); }
        .dm-prog-track { height:9px; border-radius:999px; background:var(--surface2); overflow:hidden; box-shadow:inset 0 1px 2px rgba(0,0,0,0.4); }
        .dm-prog-fill { height:100%; border-radius:999px; animation:dmGrow 1s cubic-bezier(.22,1,.36,1) both; }
        @keyframes dmGrow { from { width:0 !important } }
        .dm-section { padding:0 22px 20px; }
        .dm-metric { position:relative; padding:13px; border-radius:14px; background:var(--surface2); border:1px solid var(--border);
          min-width:0; outline:none; transition:transform .16s, border-color .16s, background .16s, box-shadow .16s; }
        .dm-metric.clk { cursor:pointer; }
        .dm-metric.clk:hover { transform:translateY(-2px); background:var(--accent-soft); border-color:var(--accent-border);
          box-shadow:0 10px 26px -10px var(--accent-glow); }
        .dm-metric .dm-hint { position:absolute; right:9px; top:9px; opacity:0; transform:translateY(2px); transition:opacity .16s, transform .16s;
          color:var(--accent); display:flex; }
        .dm-metric.clk:hover .dm-hint { opacity:1; transform:none; }
        .dm-cta { width:100%; display:flex; align-items:center; justify-content:center; gap:7px; padding:14px;
          border-radius:15px; font-size:13.5px; font-weight:800; cursor:pointer; letter-spacing:.01em; color:#fff; border:none;
          transition:transform .16s, box-shadow .16s, filter .16s; }
        .dm-cta:hover { transform:translateY(-2px); filter:brightness(1.06); }
        @media (prefers-reduced-motion: reduce) {
          .dm-overlay,.dm-panel,.dm-prog-fill { animation:none }
          .dm-close:hover { transform:none }
        }
      `}</style>

      <div onClick={e => e.stopPropagation()} className="dm-panel">

        {/* Sticky slim bar — category + close, always reachable */}
        <div className="dm-bar">
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
            <span style={{ width:26, height:26, borderRadius:9, display:'grid', placeItems:'center', flexShrink:0, background:heroColor + '1f', border:'1px solid ' + heroColor + '3a' }}>
              <CatIcon id={id} color={heroColor} size={14} />
            </span>
            <span style={{ fontSize:14, fontWeight:800, color:'var(--text)', letterSpacing:'-0.01em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</span>
            {tierNum > 0 && <span style={{ fontSize:10.5, fontWeight:900, color:tierColor, padding:'2px 7px', borderRadius:20, background:tierColor + '1c', border:'1px solid ' + tierColor + '40', flexShrink:0 }}>T{tierNum}</span>}
          </div>
          <button onClick={onClose} className="dm-close" aria-label="Stäng"><X size={16} /></button>
        </div>

        {/* HERO — celebrate the tier */}
        <div className="dm-hero">
          <div className="dm-hero-aura" style={{ background:`radial-gradient(circle, ${heroColor}33, ${heroColor}10 45%, transparent 70%)` }} />
          <div className="dm-orb" style={{
            background:`radial-gradient(125% 125% at 32% 24%, rgba(255,255,255,.9) 0%, rgba(255,255,255,.12) 8%, ${heroColor}30 30%, var(--surface3) 70%)`,
            border:`1px solid ${heroColor}`,
            boxShadow:`0 0 0 1px ${heroColor}26, 0 16px 40px -12px ${heroColor}77, inset 0 1.5px 1px rgba(255,255,255,.4)`,
          }}>
            <CatIcon id={id} color="#fff" size={26} />
          </div>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--muted)' }}>{name}</div>
          <div className="dm-tier" style={{ color:'var(--text)', textShadow:`0 2px 34px ${heroColor}99` }}>{tierNum > 0 ? 'T' + tierNum : '—'}</div>
          {(tier?.label || levelUp?.title) && (
            <div style={{ fontSize:12.5, fontWeight:800, letterSpacing:'0.04em', textTransform:'uppercase', color:heroColor, marginTop:2 }}>{tier?.label || levelUp?.title}</div>
          )}

          {levelUp && (
            <div style={{ maxWidth:380, margin:'18px auto 0' }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:800, color:'var(--muted2)', marginBottom:7 }}>
                <span>{levelUp.progressPct}% klart</span>
                <span style={{ color:nextColor }}>{levelUp.title}</span>
              </div>
              <div className="dm-prog-track">
                <div className="dm-prog-fill" style={{ width:(levelUp.progressPct || 0) + '%', background:`linear-gradient(90deg, ${tierColor}, ${nextColor})`, boxShadow:`0 0 14px ${nextColor}` }} />
              </div>
              {levelUp.primaryBottleneck && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:13, padding:'6px 12px', borderRadius:999, background:nextColor + '14', border:'1px solid ' + nextColor + '33' }}>
                  <Target size={12} color={nextColor} />
                  <span style={{ fontSize:11.5, color:'var(--muted2)' }}>Flaskhals: <b style={{ color:nextColor, fontWeight:800 }}>{levelUp.primaryBottleneck}</b></span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Level-up requirement rows */}
        {levelUp?.requirements?.length > 0 && (
          <div className="dm-section">
            <SectionLabel color={nextColor}>Lås upp {levelUp.title}</SectionLabel>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {levelUp.requirements.map((req, i) => <RequirementRow key={i} req={req} color={nextColor} />)}
            </div>
          </div>
        )}

        {/* Current data */}
        {dataMetrics.length > 0 && (
          <div className="dm-section">
            <SectionLabel color={heroColor}>Aktuell data</SectionLabel>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:9 }}>
              {dataMetrics.map((m, i) => {
                const clickable = !!m.evidence?.navTarget && m.value !== '—'
                return (
                  <div key={i} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
                    className={`dm-metric${clickable ? ' clk' : ''}`} title={clickable ? 'Öppna källa' : undefined}
                    onClick={clickable ? (e) => openMetricSource(e, m) : undefined}
                    onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') openMetricSource(e, m) } : undefined}>
                    {clickable && <span className="dm-hint"><ArrowUpRight size={13} /></span>}
                    <div style={{ fontSize:11, color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight: clickable ? 16 : 0 }}>{m.label}</div>
                    <div style={{ fontSize:16, fontWeight:900, color:m.tierInfo?.color || 'var(--text)', marginTop:5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', letterSpacing:'-0.02em' }}>{m.value}</div>
                    {m.tierInfo && <div style={{ fontSize:10, color:m.tierInfo.color, opacity:.85, marginTop:3, fontWeight:700 }}>{m.tierInfo.label}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Category contribution (Maxx Score) */}
        {contribution?.length > 0 && (
          <div className="dm-section">
            <SectionLabel color={heroColor}>Kategori-bidrag</SectionLabel>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:9 }}>
              {contribution.map((m, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', padding:'11px 13px', borderRadius:13, background:'var(--surface2)', border:'1px solid var(--border)' }}>
                  <span style={{ fontSize:12, color:'var(--muted2)', fontWeight:600 }}>{m.label}</span>
                  <span style={{ fontSize:13, color:m.tierInfo?.color || 'var(--text)', fontWeight:900 }}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All tiers */}
        {requirements.length > 0 && (
          <div className="dm-section">
            <button onClick={() => setShowAllTiers(v => !v)} style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'13px 15px', borderRadius:14, background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--text)', cursor:'pointer', fontFamily:'inherit' }}>
              <span style={{ fontSize:11, fontWeight:800, letterSpacing:'0.11em', textTransform:'uppercase' }}>Alla tiers och krav</span>
              <ChevronDown size={17} color="var(--muted)" style={{ transform:showAllTiers ? 'rotate(180deg)' : 'none', transition:'transform .25s' }} />
            </button>
            {showAllTiers && (
              <div style={{ display:'flex', flexDirection:'column', gap:7, marginTop:10 }}>
                {requirements.map((t, i) => {
                  const isCurrent = t.tier === tierNum
                  const isPast = t.tier < tierNum
                  const isNext = t.tier === (levelUp?.nextTier || tierNum + 1)
                  const c = TIER_COLORS[t.tier] || '#6b7280'
                  return (
                    <div key={i} style={{ padding:'12px 14px', borderRadius:13, background:isCurrent ? c + '14' : isNext ? c + '0b' : 'var(--surface2)', border:'1px solid ' + (isCurrent ? c + '50' : isNext ? c + '2e' : 'var(--border)') }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                        <span style={{ fontSize:13, fontWeight:900, color:isPast ? 'var(--green)' : c }}>T{t.tier}</span>
                        <span style={{ fontSize:12, fontWeight:700, color:isPast ? 'var(--green)' : isCurrent || isNext ? 'var(--text)' : 'var(--muted)' }}>{t.label}</span>
                        {isCurrent && <span style={{ marginLeft:'auto', fontSize:9.5, fontWeight:800, letterSpacing:'0.08em', textTransform:'uppercase', color:c }}>nu</span>}
                        {isNext && !isCurrent && <span style={{ marginLeft:'auto', fontSize:9.5, fontWeight:800, letterSpacing:'0.08em', textTransform:'uppercase', color:c }}>nästa</span>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:4, paddingLeft:3 }}>
                        {t.reqs.map((r, j) => <div key={j} style={{ display:'flex', gap:7, alignItems:'flex-start', fontSize:12, color:isPast ? 'var(--green)' : isCurrent || isNext ? 'var(--muted2)' : 'var(--muted)' }}><span style={{ color:isPast ? 'var(--green)' : c, opacity:isPast||isCurrent||isNext?1:.6 }}>•</span><span>{r}</span></div>)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* History chart */}
        {chartData && chartData.length > 1 && (
          <div className="dm-section">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:11 }}>
              <SectionLabel color={heroColor}>Historik</SectionLabel>
              <div style={{ display:'flex', gap:4 }}>{periods.map(p => <button key={p} onClick={() => setPeriod(p)} style={{ padding:'3px 9px', fontSize:10, borderRadius:8, background:period === p ? nextColor + '22' : 'transparent', border:'1px solid ' + (period === p ? nextColor + '55' : 'var(--border)'), color:period === p ? nextColor : 'var(--muted)', cursor:'pointer', fontWeight:period === p ? 800 : 500, fontFamily:'inherit' }}>{p}</button>)}</div>
            </div>
            <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:15, padding:12 }}>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize:9, fill:'var(--muted)' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize:9, fill:'var(--muted)' }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip content={<CustomTooltip />} />
                  {(chartLines || []).map((line, i) => <Line key={i} type="monotone" dataKey={line.key} stroke={line.color || nextColor} strokeWidth={2.4} dot={false} name={line.label} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Primary nav CTA */}
        {navTarget && (
          <div className="dm-section">
            <button onClick={() => { onClose(); navigate(navTarget) }} className="dm-cta"
              style={{ background:`linear-gradient(135deg, ${heroColor}, color-mix(in srgb, ${heroColor} 74%, #060914))`, boxShadow:`0 8px 26px -8px ${heroColor}` }}>
              Öppna {navLabel || name} <ArrowUpRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
