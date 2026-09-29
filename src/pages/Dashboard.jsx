import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { subDays, format } from 'date-fns'
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { supabase } from '../lib/supabase'
import { useTilt } from '../hooks/useTilt'
import DetailModal from '../components/dashboard/DetailModal'
import TodayWidget from '../components/dashboard/TodayWidget'
import PinnedGoals from '../components/dashboard/PinnedGoals'
import DashboardConstellation from '../components/dashboard/DashboardConstellation'
import KpiTree from '../components/dashboard/KpiTree'
import WeeklyReview from '../components/WeeklyReview'
import AchievementsModal from '../components/AchievementsModal'
import { CalendarDays, BarChart2, Orbit, Sparkles, Trophy, Network } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import {
  getTier, calcOverallTier,
  SLEEP_DURATION_THRESHOLDS,
  TIER_COLORS, TIER_NAMES,
} from '../components/dashboard/tierUtils'
import { weightsForProfile } from '../lib/tierProfiles'
import { computeMaxxScoreV2, detectBottlenecksV2, buildWhyThisScore, tierToPercentile, SCORE_VERSION } from '../lib/maxxScore'
import { buildRankUpLayer } from '../lib/rankUp'
import {
  buildPersonalizationSummary, calculateTierConfidence, isCategoryFallback, DASH_CATEGORY_MAP,
} from '../lib/profileCompleteness'
import { fetchTierInputs, computeTierCategories, tierSnapshotRow } from '../lib/tierCompute'
import ProfileQualityCard from '../components/ProfileQualityCard'
import StatusChip from '../components/ui/StatusChip'
import SectionHeader from '../components/ui/SectionHeader'
import { getJarvisUserContext } from '../lib/jarvis'

const GRAPH_CATS = [
  { id:'valmående', label:'Hälsa',     color:'#f472b6' }, // merged Sömn+Hälsa — column name predates the merge
  { id:'plugg',     label:'Studier',   color:'#34d399' },
  { id:'kondition', label:'Kondition', color:'#4f8ef7' },
  { id:'styrka',    label:'Styrka',    color:'#a78bfa' },
  { id:'ekonomi',   label:'Ekonomi',  color:'#22d3ee' },
]

function GraphTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--surface3)', backdropFilter:'blur(16px)', border:'1px solid var(--border2)', borderRadius:'10px', padding:'10px 14px', fontSize:'12px' }}>
      <div style={{ color:'var(--muted)', marginBottom:'5px' }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'2px' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:p.stroke || p.fill }} />
          <span style={{ color:'var(--muted2)' }}>{p.name}:</span>
          <span style={{ color:p.stroke || p.fill, fontWeight:600 }}>T{p.value}</span>
        </div>
      ))}
    </div>
  )
}



function buildMaxxProfile(cats, profileId = 'balanced', personalization = null) {
  const rankCats = cats.filter(c => c?.tier?.tier && c.hasData && !['kropp'].includes(c.id))
  if (!rankCats.length) return null
  const weights = weightsForProfile(profileId)
  // Maxx Score v2 — profile-weighted percentile blended with the weakest link.
  // Falls back to the v1 weakest-link tier (Math.min) if v2 can't compute.
  const scoreV2 = computeMaxxScoreV2(rankCats, weights)
  const tiers = rankCats.map(c => c.tier.tier)
  const currentTier = scoreV2?.tier ?? Math.min(...tiers)
  const nextTier = Math.min(currentTier + 1, 8)
  const avgTier = tiers.reduce((sum, t) => sum + t, 0) / tiers.length
  const spread = Math.max(...tiers) - Math.min(...tiers)
  const bottlenecks = rankCats
    .filter(c => c.tier.tier < nextTier)
    .sort((a, b) => {
      const ap = a.levelUp?.progressPct ?? (a.tier.tier / nextTier) * 100
      const bp = b.levelUp?.progressPct ?? (b.tier.tier / nextTier) * 100
      return a.tier.tier - b.tier.tier || ap - bp
    })

  const requirements = rankCats.map(cat => {
    const tier = cat.tier.tier
    const met = tier >= nextTier
    const progress = met ? 100 : Math.max(0, Math.min(100, cat.levelUp?.progressPct ?? Math.round((tier / nextTier) * 100)))
    return {
      label: cat.name,
      currentLabel: 'T' + tier,
      targetLabel: 'T' + nextTier,
      gapLabel: met ? 'Klar' : `T${tier} → T${nextTier}`,
      met,
      missing: false,
      progress,
    }
  })

  const progressPct = Math.round(requirements.reduce((sum, r) => sum + r.progress, 0) / requirements.length)
  const primary = bottlenecks[0]
  const color = TIER_COLORS[currentTier] || '#6b7280'

  // ── How the headline number is actually built — plain enough for the
  // DetailModal to render as a sentence, straight from computeMaxxScoreV2's model
  // (0.55·weighted-tier + 0.45·weakest-link). Lets Sigge see WHY it's T3 and not
  // T4, and that empty life-areas are silently excluded. ──────────────────────
  const minTierVal = scoreV2?.minTier ?? Math.min(...tiers)
  const weakestCat = rankCats.reduce((lo, c) => (c.tier.tier < lo.tier.tier ? c : lo), rankCats[0])
  const rankedIds = new Set(rankCats.map(c => c.id))
  const composition = {
    headlineTier: currentTier,
    weightedTier: scoreV2?.weightedTier ?? null,
    weightedPercentile: scoreV2?.weightedPercentile ?? null,
    minTier: minTierVal,
    weakest: weakestCat ? { name: weakestCat.name, tier: weakestCat.tier.tier } : null,
    blendWeighted: 55,
    blendWeakest: 45,
    isBlend: scoreV2 != null,
    rankedCount: rankCats.length,
    totalCategories: cats.length,
    missing: cats.filter(c => !rankedIds.has(c.id)).map(c => c.name),
  }

  // ── Phase 10 — Rank Up action layer (data only; small indicators consume it) ──
  const bottlenecksV2 = scoreV2 ? detectBottlenecksV2(rankCats, currentTier, weights) : []
  const rankUp = buildRankUpLayer(rankCats, { profileId, score: scoreV2, bottlenecksV2 })

  return {
    id: 'maxx',
    name: 'Maxx Score',
    icon: 'maxx',
    tier: { tier: currentTier, label: TIER_NAMES[currentTier], color },
    hasData: true,
    pct: progressPct,
    trend: 'neutral',
    decayWarning: false,
    metrics: [
      { label: 'Overall rank', value: `T${currentTier}`, highlight: true },
      { label: 'Till T' + nextTier, value: progressPct + '%' },
      { label: 'Balansgap', value: spread <= 1 ? 'stabil' : spread + ' tiers' },
    ],
    details: [
      { label: 'Rankande kategorier', value: String(rankCats.length) },
      { label: 'Snitt-tier', value: avgTier.toFixed(1) },
      { label: 'Viktad percentil', value: scoreV2?.weightedPercentile != null ? scoreV2.weightedPercentile + '%' : '—' },
      { label: 'Lägsta kategori', value: primary ? `${primary.name} T${primary.tier.tier}` : '—' },
      { label: 'Balansgap', value: spread <= 1 ? 'stabilt' : spread + ' tiers' },
    ],
    levelUp: {
      currentTier,
      nextTier,
      maxTier: 8,
      title: currentTier >= 8 ? 'Maxxad nivå' : `T${currentTier} → T${nextTier}`,
      progressPct,
      primaryBottleneck: primary ? `${primary.name}: ${primary.levelUp?.primaryBottleneck || 'ranka upp till T' + nextTier}` : 'Alla kärnkategorier klara',
      requirements,
      blockers: requirements.filter(r => !r.met),
    },
    tierGuide: [2,3,4,5,6,7,8].map(t => ({
      tier: t,
      label: TIER_NAMES[t],
      reqs: rankCats.map(c => `${c.name} minst T${t}`),
    })),
    chartData: [],
    chartLines: [],
    contribution: rankCats.map(c => ({ label: c.name, value: `T${c.tier.tier}`, percentile: tierToPercentile(c.tier.tier), tierInfo: c.tier })),
    // ── Maxx Score v2 metadata (data layer; existing UI consumes what it needs) ──
    scoreVersion: SCORE_VERSION,
    tierProfile: profileId,
    weightedPercentile: scoreV2?.weightedPercentile ?? null,
    weightedTier: scoreV2?.weightedTier ?? null,
    minTier: scoreV2?.minTier ?? Math.min(...tiers),
    composition,
    bottlenecksV2,
    whyThisScore: buildWhyThisScore(scoreV2, rankCats, personalization),
    // ── Phase 10 — Rank Up Plans (gaps, opportunities, plans, how-to-improve) ──
    rankUp,
    // ── Phase 8 — personalization activation signals (data layer + indicators) ──
    personalization: personalization || null,
  }
}


function EvidenceModal({ evidence, onClose, onNavigate }) {
  useEffect(() => {
    if (!evidence) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [evidence, onClose])
  if (!evidence) return null
  const rows = evidence.rows || []
  return createPortal(
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1200, background:'radial-gradient(120% 120% at 50% 0%, rgba(10,14,24,.62), rgba(6,9,16,.8))', backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'clamp(10px,3vw,28px)' }}>
      <div onClick={e=>e.stopPropagation()} className="widget" style={{ width:'min(560px, 100%)', maxHeight:'82vh', overflowY:'auto', padding:0, borderRadius:22 }}>
        <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:11, color:'var(--muted)', fontWeight:900, letterSpacing:'0.13em', textTransform:'uppercase' }}>Datakälla</div>
            <div style={{ fontSize:22, fontWeight:900, color:'var(--text)', marginTop:4 }}>{evidence.title || evidence.metricLabel}</div>
            <div style={{ fontSize:13, color:'var(--muted2)', marginTop:3 }}>{evidence.subtitle || evidence.categoryName}</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon" style={{ flexShrink:0 }}>×</button>
        </div>

        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:10 }}>
            <div className="card-sm" style={{ padding:12 }}>
              <div style={{ fontSize:10, color:'var(--muted)', fontWeight:850, letterSpacing:'0.08em', textTransform:'uppercase' }}>Värde</div>
              <div style={{ fontSize:20, color:'var(--accent)', fontWeight:900, marginTop:4 }}>{evidence.metricValue || evidence.value || '—'}</div>
            </div>
            <div className="card-sm" style={{ padding:12 }}>
              <div style={{ fontSize:10, color:'var(--muted)', fontWeight:850, letterSpacing:'0.08em', textTransform:'uppercase' }}>Datum</div>
              <div style={{ fontSize:15, color:'var(--text)', fontWeight:800, marginTop:7 }}>{evidence.date || '—'}</div>
            </div>
          </div>

          <div className="card-sm" style={{ padding:14 }}>
            {rows.map((r,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:14, padding:i===0?'0 0 8px 0':'8px 0', borderTop:i===0?'none':'1px solid var(--border)' }}>
                <span style={{ color:'var(--muted2)', fontSize:12 }}>{r.label}</span>
                <span style={{ color:'var(--text)', fontSize:12, fontWeight:700, textAlign:'right', overflowWrap:'anywhere' }}>{r.value || '—'}</span>
              </div>
            ))}
          </div>

          {evidence.navTarget && (
            <button onClick={() => { onNavigate ? onNavigate(evidence.navTarget) : (window.location.href = evidence.navTarget); onClose?.() }} className="btn btn-primary" style={{ width:'100%' }}>
              Öppna i {evidence.navLabel || 'källa'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function Dashboard() {

  const navigate = useNavigate()
  const heroTilt = useTilt({ max: 5 })
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedEvidence, setSelectedEvidence] = useState(null)
  const [categories, setCategories] = useState([])
  const [overallTier, setOverallTier] = useState(null)
  const [maxxProfile, setMaxxProfile] = useState(null)
  const [profileRow, setProfileRow] = useState(null)
  const [personalization, setPersonalization] = useState(null)
  const [bodyWeight, setBodyWeight] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [userId, setUserId] = useState(null)
  const [graphPeriod, setGraphPeriod] = useState('30d')
  const [activeGraphCats, setActiveGraphCats] = useState(['valmående','plugg','kondition'])
  const [rawGraphData, setRawGraphData] = useState({ healthData: [], snapshots: [] })
  const [refreshKey, setRefreshKey] = useState(0)
  const [viewMode, setViewMode] = useState(() => {
    try {
      const m = localStorage.getItem('maxx_dash_mode')
      // 'focus' view was removed — migrate any stored preference to the map view.
      return (!m || m === 'focus') ? 'map' : m
    } catch { return 'map' }
  })
  const setMode = (m) => { setViewMode(m); try { localStorage.setItem('maxx_dash_mode', m) } catch { /* ignore */ } }
  const [showWeekly, setShowWeekly] = useState(false)
  const [showAchievements, setShowAchievements] = useState(false)

  const todayDate = new Date()
  const todayStr = format(todayDate, 'EEEE d MMMM yyyy')
  const todayDisplay = todayStr.charAt(0).toUpperCase() + todayStr.slice(1)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data?.user) setUserId(data.user.id) })
  }, [])

  // Clickable "open source row" value for category details (see tierCompute sourceEvidence).
  function sourceValue(value, evidence) {
    if (!evidence?.navTarget || !value || value === '—') return value
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          navigate(evidence.navTarget)
        }}
        title="Öppna källpass"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 8px',
          margin: '-6px -8px',
          borderRadius: 9,
          border: '1px solid transparent',
          background: 'transparent',
          color: 'var(--text)',
          cursor: 'pointer',
          font: 'inherit',
          fontWeight: 850,
          textAlign: 'left',
          transition: 'background .14s ease, border-color .14s ease, transform .14s ease, box-shadow .14s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(79,142,247,.08)'
          e.currentTarget.style.borderColor = 'rgba(79,142,247,.24)'
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,142,247,.06)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.borderColor = 'transparent'
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'none'
        }}
      >
        <span>{value}</span>
        <span style={{ fontSize: 11, color: 'var(--accent)', opacity: .9 }}>↗</span>
      </button>
    )
  }

  const fetchAllData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const inputs = await fetchTierInputs(supabase, userId, todayDate)
      const { cats, bodyWeight: bw, profile, tierProfileId } = computeTierCategories(inputs, todayDate)
      const { healthData, snapshots } = inputs
      setBodyWeight(bw)
      setProfileRow(profile)
      // display_name is canonical on `profiles` (Phase 16) — read it from there,
      // not from user_settings where it isn't guaranteed to exist.
      if (profile?.display_name) setDisplayName(profile.display_name)
      // Details that point at a source row become clickable links (JSX lives
      // here, not in the runtime-agnostic tierCompute module).
      for (const c of cats) {
        c.details = c.details.map(({ sourceEvidence, ...d }) =>
          sourceEvidence ? { ...d, value: sourceValue(d.value, sourceEvidence) } : d)
      }
      setCategories(cats)

      // ── Save today's tiers as a snapshot ──────────────────────────────
      const todayStr2 = format(todayDate, 'yyyy-MM-dd')
      const todaySnap = tierSnapshotRow(cats, userId, todayStr2)
      // Fire-and-forget, but surface failures: if this write silently fails,
      // Jarvis's whole intelligence layer goes blind (AUDIT.md P0-4 / P0-8).
      supabase.from('tier_snapshots').upsert(todaySnap, { onConflict: 'user_id,date' })
        .then(({ error }) => { if (error) console.warn('tier_snapshots upsert failed:', error.message) })

      // Store raw data for graph — computed reactively via useMemo when graphPeriod changes
      setRawGraphData({ healthData: healthData || [], snapshots: snapshots || [] })
      // Phase 8 — tier confidence per category + personalization summary.
      // Attach confidence/fallback flags to each profile-driven category so the
      // Why-This-Score layer and any future UI can read them. Tiers untouched.
      const hasDataMap = {}
      for (const c of cats) {
        const catKey = DASH_CATEGORY_MAP[c.id]
        if (!catKey) continue
        hasDataMap[catKey] = hasDataMap[catKey] || !!c.hasData
        c.confidence = calculateTierConfidence(catKey, profile, !!c.hasData)
        c.usingFallback = isCategoryFallback(catKey, profile)
      }
      const personalizationSummary = buildPersonalizationSummary(profile, hasDataMap)
      setPersonalization(personalizationSummary)

      const maxx = buildMaxxProfile(cats, tierProfileId, personalizationSummary)
      setMaxxProfile(maxx)
      setOverallTier(maxx?.tier?.tier || calcOverallTier(cats.filter(c=>c.tier&&c.hasData).map(c=>({tier:c.tier.tier}))))
    } catch(e){ console.error('Dashboard error:',e); toast({ message: 'Kunde inte ladda all dashboarddata', type: 'error' }) }
    finally { setLoading(false) }
  }, [userId, refreshKey, toast, navigate])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  // Graph history computed from cached raw data — no refetch needed on period change
  const tierHistory = useMemo(() => {
    const { healthData, snapshots } = rawGraphData
    const snapshotMap = {}
    for (const s of snapshots) snapshotMap[s.date] = s
    const days = graphPeriod==='7d'?7:graphPeriod==='30d'?30:graphPeriod==='90d'?90:180
    const hist = []
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd')
      const pt = { date: d.slice(5) }
      const hl = healthData.find(h => h.date === d)
      // Merged Sömn+Hälsa (user call 2026-09-11): sleep alone as the historical
      // day-proxy — matches wTop dropping Energi/Humör as tier-driving signals.
      if (hl?.sleep_hours) { const t = getTier(hl.sleep_hours, SLEEP_DURATION_THRESHOLDS, true); if (t) pt['valmående'] = t.tier }
      const snap = snapshotMap[d]
      if (snap) {
        if (snap.kondition) pt['kondition'] = snap.kondition
        if (snap.styrka)    pt['styrka']    = snap.styrka
        if (snap.plugg)     pt['plugg']     = snap.plugg
        if (snap.ekonomi)   pt['ekonomi']   = snap.ekonomi
      }
      if (Object.keys(pt).length > 1) hist.push(pt)
    }
    return hist
  }, [rawGraphData, graphPeriod])

  // Phase 12 — Explainability surface. Build the Jarvis projection ONCE (pure;
  // consumes the authoritative maxxProfile + categories). DetailModal reads it to
  // explain tiers/bottlenecks/rank-up/confidence/benchmark. No new scoring.
  const insightCtx = useMemo(
    () => (maxxProfile ? getJarvisUserContext({ profile: profileRow, categories, maxxProfile }) : null),
    [maxxProfile, categories, profileRow],
  )

  // Jarvis deep link — pass a QUESTION only; Jarvis already holds the grounded
  // MAXX INTELLIGENS context (Phase 11) and answers from the objective systems.
  const askJarvis = useCallback((prompt) => {
    setSelectedCategory(null)
    navigate('/jarvis', { state: { prompt } })
  }, [navigate])

  const oColor = overallTier ? (TIER_COLORS[overallTier]||'#6b7280') : '#6b7280'
  const oLabel = overallTier ? TIER_NAMES[overallTier] : '—'

  // Tier-statistik panel — rendered inside the bottom-right corner bubble on hover.
  const graphPanel = (
    <div style={{ padding:'var(--sp-4)' }}>
      <SectionHeader
        kicker
        label="Tier-utveckling"
        actions={
          <div className="mx-seg">
            {['7d','30d','90d','1år'].map(p=>(
              <button key={p} className={graphPeriod===p?'active':''} onClick={()=>setGraphPeriod(p)}>{p}</button>
            ))}
          </div>
        }
      />
      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'var(--sp-3)' }}>
        {GRAPH_CATS.map(c=>(
          <StatusChip
            key={c.id}
            color={c.color}
            label={c.label}
            off={!activeGraphCats.includes(c.id)}
            onClick={()=>setActiveGraphCats(p=>p.includes(c.id)?p.filter(x=>x!==c.id):[...p,c.id])}
            style={{ padding:'3px 10px', fontSize:'11px' }}
          />
        ))}
      </div>
      {tierHistory.length > 0 ? (
        <ResponsiveContainer width="100%" height={170}>
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
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'10px', padding:'34px 0', textAlign:'center' }}>
          <div style={{ width:'44px', height:'44px', borderRadius:'14px', display:'grid', placeItems:'center', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', boxShadow:'0 0 20px -6px var(--accent-glow)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18M7 14l4-4 3 3 5-6"/></svg>
          </div>
          <div style={{ fontSize:'12.5px', fontWeight:600, color:'var(--muted2)' }}>Ingen tier-historik ännu</div>
          <div style={{ fontSize:'11px', color:'var(--muted)', maxWidth:'220px', lineHeight:1.45 }}>Logga data i Hälsa så börjar din utvecklingskurva byggas upp här.</div>
        </div>
      )}
    </div>
  )

  const dashCorners = [
    {
      id: 'today', anchor: { right: 6, bottom: 6 }, center: { x: 92, y: 90 },
      r: 96, mag: 320, color: '#34d399', label: 'Idag',
      icon: <CalendarDays size={22} />, width: 300, height: 380,
      render: () => <TodayWidget userId={userId} />,
    },
    {
      id: 'stats', anchor: { left: 6, bottom: 6 }, center: { x: 8, y: 90 },
      r: 104, mag: 360, color: '#4f8ef7', label: 'Grafer', sub: overallTier ? 'T' + overallTier : '—',
      icon: <BarChart2 size={22} />, width: 560, height: 360,
      render: () => graphPanel,
    },
  ]

  return (
    <div className="page-wrap">

      {/* HEADER — same structure as Träning, Hälsa etc */}
      <div className="page-header">
        <div>
          <div className="page-header-title">{displayName || 'Dashboard'}</div>
          <div className="page-header-sub">{todayDisplay}{bodyWeight ? ` · ${bodyWeight} kg` : ''}</div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost btn-icon" onClick={() => setShowWeekly(true)} title="Veckorevy" aria-label="Veckorevy">
            <Sparkles size={15} />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => setShowAchievements(true)} title="Utmärkelser" aria-label="Utmärkelser">
            <Trophy size={15} />
          </button>
          <div className="dash-mode-toggle" role="tablist" aria-label="Dashboardvy">
            <button role="tab" aria-selected={viewMode === 'map'} className={viewMode === 'map' ? 'active' : ''} onClick={() => setMode('map')} title="Kartvy — constellation"><Orbit size={14} /> Karta</button>
            <button role="tab" aria-selected={viewMode === 'tree'} className={viewMode === 'tree' ? 'active' : ''} onClick={() => setMode('tree')} title="KPI-träd — så byggs Maxx Score"><Network size={14} /> Träd</button>
          </div>
          {overallTier && (
            <StatusChip color={oColor} label={`T${overallTier}/8`} sub={oLabel} />
          )}
          {personalization && personalization.completeness < 100 && (
            <StatusChip
              color={personalization.status?.color}
              icon={<Sparkles size={12} />}
              dot={false}
              label={`${personalization.completeness}%`}
              sub="profil"
              onClick={() => navigate('/profil')}
              title={`Profilkvalitet ${personalization.completeness}% · ${personalization.status?.label}. Klicka för att förbättra.`}
            />
          )}
        </div>
      </div>

      <div className="page-content-scroll">
        <div className="mx-content-edge" style={{ padding:'12px', display:'flex', flexDirection:'column', gap:'14px', maxWidth:'none', margin:'0', width:'100%' }}>

          {/* Phase 8 — subtle profile-completion nudge (auto-hides at ≥85%) */}
          {!loading && profileRow !== undefined && (
            <ProfileQualityCard profile={profileRow} confidences={personalization?.confidences} variant="compact" />
          )}

          {/* CONSTELLATION — mind-map of Maxx core + category nodes */}
          {loading ? (
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              {/* Maxx score hero */}
              <div className="widget mx-skel" style={{ padding:'22px', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', minHeight:'150px' }}>
                <div className="mx-skel-bar" style={{ height:9, width:'90px' }} />
                <div className="mx-skel-bar" style={{ height:44, width:'110px', borderRadius:'14px' }} />
                <div className="mx-skel-bar" style={{ height:8, width:'160px' }} />
              </div>
              <div className="grid-4 dashboard-category-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:'12px' }}>
                {[...Array(6)].map((_,i) => (
                  <div key={i} className="widget mx-skel" style={{ padding:'18px', minHeight:'118px' }}>
                    <div className="mx-skel-bar" style={{ height:10, width:'42%', marginBottom:12 }} />
                    <div className="mx-skel-bar" style={{ height:26, width:'50%', marginBottom:14 }} />
                    <div className="mx-skel-bar" style={{ height:8, width:'78%' }} />
                  </div>
                ))}
              </div>
            </div>
          ) : viewMode === 'tree' ? (
            <KpiTree
              categories={categories}
              maxxProfile={maxxProfile}
              overallTier={overallTier}
              onSelect={setSelectedCategory}
              onMetricClick={(evidence) => { if (evidence?.navTarget) navigate(evidence.navTarget); else setSelectedEvidence(evidence) }}
            />
          ) : (
            <DashboardConstellation
              categories={categories}
              maxxProfile={maxxProfile}
              overallTier={overallTier}
              onSelect={setSelectedCategory}
              onMetricClick={(evidence) => { if (evidence?.navTarget) navigate(evidence.navTarget); else setSelectedEvidence(evidence) }}
              corners={dashCorners}
            />
          )}

          {/* Karta is sized to fill the screen — pinned goals live in the Träd
              view (and on /mal) so the map view stays scroll-free. */}
          {!loading && viewMode === 'tree' && <PinnedGoals userId={userId} />}

        </div>
      </div>

      {selectedCategory && <DetailModal category={selectedCategory} onClose={()=>setSelectedCategory(null)} insightCtx={insightCtx} onAskJarvis={askJarvis} />}
      {selectedEvidence && <EvidenceModal evidence={selectedEvidence} onClose={()=>setSelectedEvidence(null)} onNavigate={navigate} />}
      {showWeekly && <WeeklyReview userId={userId} onClose={()=>setShowWeekly(false)} />}
      {showAchievements && <AchievementsModal userId={userId} categories={categories} onClose={()=>setShowAchievements(false)} />}
    </div>
  )
}
