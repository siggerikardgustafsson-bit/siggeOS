import { ArrowUpRight } from 'lucide-react'
import { TIER_COLORS, CAT_PATHS } from './tierUtils'

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
        {maxxProfile?.tier?.label && <div className="kpi-root-label" style={{ color: rootColor }}>{maxxProfile.tier.label}</div>}
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
            <div className="kpi-branch" key={c.id} style={{ animationDelay: (i * 0.05) + 's', '--bc': c.hasData && t ? color : undefined }}>
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
