import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { X, ArrowUpRight, ChevronDown, Check, Target } from 'lucide-react'
import InsightSections from './InsightSections'
import { TIER_COLORS, CAT_PATHS } from './tierUtils'

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
  // Merged Sömn+Hälsa (user call 2026-09-11) — sömn/vikttrend/steg/
  // kosttillskott/alkohol drive the tier now, not Energi/Humör.
  halsa: [
    { tier:2, label:'Top 50%',  reqs:['Sömn ≥ 6.5h','Steg ≥ 5000/dag','Alkohol ≤ 14 enheter/vecka'] },
    { tier:3, label:'Top 30%',  reqs:['Sömn ≥ 7.0h','Steg ≥ 7500/dag','Alkohol ≤ 10 enheter/vecka'] },
    { tier:4, label:'Top 20%',  reqs:['Sömn ≥ 7.25h','Steg ≥ 9000/dag','Alkohol ≤ 7 enheter/vecka','Vikttrend mot målvikt'] },
    { tier:5, label:'Top 10%',  reqs:['Sömn ≥ 7.5h','Steg ≥ 11000/dag','Alkohol ≤ 5 enheter/vecka','Kosttillskott ≥ 80% om loggat'] },
    { tier:6, label:'Top 5%',   reqs:['Sömn ≥ 8.0h','Steg ≥ 13000/dag','Alkohol ≤ 3 enheter/vecka','Kosttillskott ≥ 90% om loggat'] },
    { tier:7, label:'Top 2.5%', reqs:['Sömn ≥ 8.5h','Steg ≥ 15000/dag','Alla hälsometrics toppklass'] },
    { tier:8, label:'Top 1%',   reqs:['Sömn ≥ 9h','Steg ≥ 18000/dag','Alkohol nära noll','Kosttillskott ≥ 99% om loggat'] },
  ],
  valmående: [],
  // Färdigheter v2 (user call 2026-09-11) — evidence-based, three gates for
  // each language (cumulative cards + cumulative CI hours + consistency, all
  // must clear), one gate for gitarr (consistency only). Each of the 4 skills
  // is its own bottleneck for the category — see languageSkill.js header for
  // the vocabulary-size/CI-hours research basis. Tier 6 = "Flytande" for
  // språk (~8000 cards ≈ the commonly-cited word-family count for near-native
  // comprehension), "Mästare" for gitarr.
  fardigheter: [
    { tier:1, label:'Har börjat',  reqs:['Något loggat, under nästa tröskel (se nedan)'] },
    { tier:2, label:'Nybörjare',   reqs:['Språk: 1000 kort · 15h CI · 2/28 dagar','Gitarr: 2/28 dagar ≥15min'] },
    { tier:3, label:'Regelbunden', reqs:['Språk: 2500 kort · 50h CI · 6/28 dagar','Gitarr: 6/28 dagar ≥15min'] },
    { tier:4, label:'Dedikerad',   reqs:['Språk: 4500 kort · 150h CI · 10/28 dagar','Gitarr: 10/28 dagar ≥15min'] },
    { tier:5, label:'Seriös',      reqs:['Språk: 6500 kort · 400h CI · 16/28 dagar','Gitarr: 16/28 dagar ≥15min'] },
    { tier:6, label:'Flytande / Mästare', reqs:['Språk: 8000 kort · 900h CI · 22/28 dagar','Gitarr: 22/28 dagar ≥15min'] },
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

export default function DetailModal({ category, onClose, insightCtx = null, onAskJarvis = null }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('30d')
  const [showAllTiers, setShowAllTiers] = useState(false)
  useEffect(() => {
    if (!category) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [category, onClose])
  if (!category) return null

  const { name, tier, metrics, details, chartData, chartLines, navTarget, navLabel, id, levelUp, contribution, composition } = category
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

  return createPortal(
    <div onClick={onClose} className="dm-overlay">
      <style>{`
        .dm-overlay { position:fixed; inset:0; z-index:1200; display:flex; align-items:center; justify-content:center;
          padding:clamp(10px,3vw,28px); background:radial-gradient(120% 120% at 50% 0%, rgba(10,14,24,.62), rgba(6,9,16,.8));
          backdrop-filter:blur(12px) saturate(1.1); -webkit-backdrop-filter:blur(12px) saturate(1.1);
          animation:dmFade .28s ease both; }
        [data-theme="light"] .dm-overlay { background:radial-gradient(120% 120% at 50% 0%, rgba(210,216,230,.6), rgba(225,228,238,.78)); }
        @keyframes dmFade { from { opacity:0 } to { opacity:1 } }
        .dm-panel { position:relative; width:100%; max-width:560px; max-height:88vh; overflow-y:auto; overflow-x:hidden;
          -webkit-overflow-scrolling:touch; overscroll-behavior:contain; padding-bottom:6px;
          border-radius:20px; background:var(--mx-panel-bg, var(--surface)); border:1px solid var(--border);
          box-shadow:0 24px 70px -20px rgba(0,0,0,0.55);
          scrollbar-width:none; animation:dmRise .42s cubic-bezier(.22,1,.36,1) both; }
        .dm-panel::-webkit-scrollbar { display:none; }
        @keyframes dmRise { from { opacity:0; transform:translateY(18px) scale(.97) } to { opacity:1; transform:none } }
        /* sticky slim bar */
        .dm-bar { position:sticky; top:0; z-index:12; display:flex; align-items:center; justify-content:space-between; gap:12px;
          padding:13px 16px 13px 18px; background:var(--mx-panel-bg, var(--surface));
          border-bottom:1px solid var(--border); }
        .dm-close { width:34px; height:34px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
          border-radius:11px; background:var(--surface2); border:1px solid var(--border); color:var(--muted2); cursor:pointer;
          transition:background .16s, color .16s, transform .16s, border-color .16s; }
        .dm-close:hover { background:var(--surface3); color:var(--text); border-color:var(--border2); transform:rotate(90deg); }
        /* hero */
        .dm-hero { position:relative; padding:26px 24px 22px; text-align:center; overflow:hidden; }
        .dm-hero-aura { position:absolute; left:50%; top:-40%; width:140%; height:150%; transform:translateX(-50%);
          pointer-events:none; filter:blur(34px); opacity:.7; border-radius:50%; }
        .dm-orb { position:relative; width:64px; height:64px; border-radius:22px; margin:0 auto 12px; display:grid; place-items:center; z-index:1; }
        .dm-tier { position:relative; z-index:1; font-weight:900; line-height:.92; letter-spacing:-0.04em;
          font-size:clamp(44px,10vw,64px); }
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
        /* Mobile — present as a bottom sheet: full-width, safe-area aware, easier scroll/reach */
        @media (max-width: 640px) {
          .dm-overlay { padding:0; align-items:flex-end; }
          .dm-panel { max-width:100%; max-height:94vh; border-radius:24px 24px 0 0;
            padding-bottom:max(10px, env(safe-area-inset-bottom));
            animation:dmSheet .4s cubic-bezier(.22,1,.36,1) both; }
          @keyframes dmSheet { from { opacity:0; transform:translateY(40px) } to { opacity:1; transform:none } }
          .dm-bar { padding:12px 14px; }
          .dm-hero { padding:22px 18px 18px; }
          .dm-section { padding:0 16px 18px; }
        }
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
          <div className="dm-tier" style={{ color:'var(--text)', textShadow:`0 2px 22px ${heroColor}55` }}>{tierNum > 0 ? 'T' + tierNum : '—'}</div>
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

        {/* How the Maxx Score headline is derived — the blend made legible */}
        {id === 'maxx' && composition && (
          <div className="dm-section">
            <SectionLabel color={heroColor}>Så räknas Maxx Score ut</SectionLabel>
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {composition.isBlend && [
                { k:'Vägt snitt av kategorierna', v:`T${composition.weightedTier}`, s: composition.weightedPercentile != null ? `percentil ${composition.weightedPercentile}` : null },
                { k:'Svagaste kategori — väger tyngst', v: composition.weakest ? `${composition.weakest.name} · T${composition.weakest.tier}` : `T${composition.minTier}` },
                { k:`Blandning ${composition.blendWeighted}% snitt / ${composition.blendWeakest}% svagast`, v:`T${composition.headlineTier}`, hi:true },
              ].map((r, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', padding:'11px 13px', borderRadius:13, background: r.hi ? heroColor + '14' : 'var(--surface2)', border:'1px solid ' + (r.hi ? heroColor + '44' : 'var(--border)') }}>
                  <span style={{ fontSize:12, color:'var(--muted2)', fontWeight:600 }}>{r.k}</span>
                  <span style={{ fontSize:13, fontWeight:900, color: r.hi ? heroColor : 'var(--text)', whiteSpace:'nowrap' }}>{r.v}{r.s && <span style={{ fontSize:10.5, color:'var(--muted)', fontWeight:600, marginLeft:6 }}>{r.s}</span>}</span>
                </div>
              ))}
              <div style={{ fontSize:12, color:'var(--muted2)', lineHeight:1.5, padding:'3px 3px 0' }}>
                Baserad på <b style={{ color:'var(--text)' }}>{composition.rankedCount} av {composition.totalCategories}</b> kategorier
                {composition.missing.length > 0 && <> — saknar data för <b style={{ color:'#fbbf24' }}>{composition.missing.join(', ')}</b></>}.
              </div>
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

        {/* Phase 12 — Explainability & Insight Surface (consumes existing engines) */}
        <InsightSections category={category} ctx={insightCtx} onAskJarvis={onAskJarvis} />

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
    </div>,
    document.body
  )
}
