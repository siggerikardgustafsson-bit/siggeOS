import { ArrowUpRight } from 'lucide-react'

const TIER_COLORS = {
  0:'rgba(255,255,255,0.18)',1:'rgba(255,255,255,0.75)',2:'#4f8ef7',3:'#a78bfa',
  4:'#fbbf24',5:'#34d399',6:'#22d3ee',7:'#f472b6',8:'#fbbf24',
}

const CAT_PATHS = {
  kondition:'M13 10V3L4 14h7v7l9-11h-7z',
  styrka:'M6 4v16M18 4v16M3 8h4m10 0h4M3 16h4m10 0h4',
  somn:'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
  plugg:'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  ekonomi:'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  halsa:'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
}

function CatIcon({ id, color, size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={CAT_PATHS[id] || CAT_PATHS.kondition} /></svg>
}

// Hierarchical view of how Maxx Score is built: root → performance pillars →
// underlying metrics. Pure visualization of the EXISTING tier data — no new
// scoring, and only ranking categories feed the root (Experiences excluded).
export default function KpiTree({ categories = [], maxxProfile, overallTier, onSelect, onMetricClick }) {
  const ORDER = ['kondition', 'styrka', 'plugg', 'ekonomi', 'somn', 'halsa']
  const pillars = ORDER.map(id => categories.find(c => c.id === id)).filter(Boolean)
  const rootTier = maxxProfile?.tier?.tier ?? overallTier ?? 0
  const rootColor = TIER_COLORS[rootTier] || '#4f8ef7'

  return (
    <div className="kpi-tree">
      {/* ROOT — Maxx Score */}
      <button className="kpi-root" onClick={() => maxxProfile && onSelect?.(maxxProfile)} style={{ '--rc': rootColor }}>
        <div className="kpi-root-glow" style={{ background:`radial-gradient(circle, ${rootColor}33, transparent 70%)` }} />
        <div className="kpi-root-kick">Maxx Score</div>
        <div className="kpi-root-tier" style={{ color:rootColor, textShadow:`0 2px 26px ${rootColor}80` }}>T{rootTier || '—'}</div>
        {maxxProfile?.levelUp && <div className="kpi-root-sub">{maxxProfile.levelUp.progressPct}% → T{maxxProfile.levelUp.nextTier}</div>}
        <span className="kpi-root-hint">Klicka för full detalj</span>
      </button>

      <div className="kpi-branches">
        {pillars.map((c, i) => {
          const t = c.tier?.tier || 0
          const color = c.hasData && t ? (TIER_COLORS[t] || '#4f8ef7') : 'var(--muted)'
          const pct = c.levelUp?.progressPct ?? c.pct ?? 0
          const nextC = TIER_COLORS[c.levelUp?.nextTier] || color
          const leaves = (c.metrics || []).slice(0, 3)
          return (
            <div className="kpi-branch" key={c.id} style={{ animationDelay: (i * 0.05) + 's' }}>
              <button className="kpi-node" onClick={() => onSelect?.(c)} style={{ '--nc': color }}>
                <div className="kpi-node-head">
                  <span className="kpi-node-ico"><CatIcon id={c.id} color={color} /></span>
                  <span className="kpi-node-name">{c.name}</span>
                  <span className="kpi-node-tier" style={{ color }}>{t > 0 ? 'T' + t : '—'}</span>
                </div>
                <div className="kpi-node-track"><div className="kpi-node-fill" style={{ width: pct + '%', background:`linear-gradient(90deg, ${color}, ${nextC})` }} /></div>
              </button>
              <div className="kpi-leaves">
                {leaves.length ? leaves.map((m, j) => {
                  const clickable = !!m.evidence
                  return (
                    <button key={j} className={'kpi-leaf' + (clickable ? ' clk' : '')}
                      onClick={clickable ? () => onMetricClick?.({ ...m.evidence, categoryId: c.id, categoryName: c.name, metricLabel: m.label, metricValue: m.value }) : undefined}>
                      <span className="kpi-leaf-label">{m.label}</span>
                      <span className="kpi-leaf-val" style={{ color: m.highlight ? color : 'var(--text)' }}>{m.value}{clickable && <ArrowUpRight size={11} style={{ opacity:.7 }} />}</span>
                    </button>
                  )
                }) : <div className="kpi-leaf kpi-leaf-empty">Ingen data</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
