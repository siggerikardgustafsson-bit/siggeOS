import { Target, ArrowRight } from 'lucide-react'
import CategoryCard from './CategoryCard'
import TodayWidget from './TodayWidget'
import Sparkline from '../Sparkline'

const TIER_COLORS = {
  0:'rgba(255,255,255,0.18)',1:'rgba(255,255,255,0.75)',2:'#4f8ef7',3:'#a78bfa',
  4:'#fbbf24',5:'#34d399',6:'#22d3ee',7:'#f472b6',8:'#fbbf24',
}

// Calm, stacked "performance cockpit" alternative to the constellation.
// Reuses the same data + CategoryCard so behaviour stays identical.
export default function FocusView({ categories = [], maxxProfile, overallTier, userId, onSelect, onMetricClick, maxxSpark = [] }) {
  const tierNum = maxxProfile?.tier?.tier ?? overallTier ?? 0
  const color = TIER_COLORS[tierNum] || '#4f8ef7'
  const levelUp = maxxProfile?.levelUp
  const nextColor = TIER_COLORS[levelUp?.nextTier] || color
  // Surface the weakest core categories as quick "focus targets".
  const targets = [...categories]
    .filter(c => c.hasData && c.tier?.tier)
    .sort((a, b) => (a.tier.tier - b.tier.tier) || ((a.levelUp?.progressPct ?? 0) - (b.levelUp?.progressPct ?? 0)))
    .slice(0, 3)

  return (
    <div className="focus-view">
      {/* MAXX HERO */}
      {maxxProfile && (
        <div className="focus-hero" style={{ '--fc': color, '--fnc': nextColor }}>
          <div className="focus-hero-aura" style={{ background:`radial-gradient(circle, ${color}30, transparent 70%)` }} />
          <div className="focus-hero-main">
            <div>
              <div className="focus-hero-kick">Maxx Score</div>
              <div className="focus-hero-tier" style={{ color, textShadow:`0 2px 30px ${color}80` }}>T{tierNum || '—'}</div>
              {maxxProfile.tier?.label && <div className="focus-hero-label" style={{ color }}>{maxxProfile.tier.label}</div>}
            </div>
            {maxxSpark.filter(v => v != null).length > 1 && (
              <div className="focus-hero-spark">
                <div className="focus-hero-spark-cap">Overall-trend</div>
                <Sparkline data={maxxSpark} color={color} width={180} height={48} />
              </div>
            )}
          </div>
          {levelUp && (
            <div className="focus-hero-prog">
              <div className="focus-hero-prog-top">
                <span>{levelUp.progressPct}% → T{levelUp.nextTier}</span>
                {levelUp.primaryBottleneck && (
                  <span style={{ color:nextColor, display:'inline-flex', alignItems:'center', gap:5 }}>
                    <Target size={12} /> {levelUp.primaryBottleneck}
                  </span>
                )}
              </div>
              <div className="focus-hero-track">
                <div className="focus-hero-fill" style={{ width:(levelUp.progressPct||0)+'%', background:`linear-gradient(90deg, ${color}, ${nextColor})`, boxShadow:`0 0 14px ${nextColor}` }} />
              </div>
            </div>
          )}
          {targets.length > 0 && (
            <div className="focus-hero-targets">
              <span className="focus-hero-targets-lead">Fokusera på</span>
              {targets.map(t => (
                <button key={t.id} className="focus-target-chip" onClick={() => onSelect?.(t)} style={{ '--tc': TIER_COLORS[t.tier.tier] || color }}>
                  {t.name} <b>T{t.tier.tier}</b> <ArrowRight size={11} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TODAY + CATEGORY GRID */}
      <div className="focus-layout">
        <div className="focus-today"><TodayWidget userId={userId} /></div>
        <div className="focus-cards">
          {categories.map((cat, i) => (
            <div key={cat.id} className={'fade-up fade-up-delay-' + Math.min(i + 1, 7)}>
              <CategoryCard category={cat} onClick={onSelect} onMetricClick={onMetricClick} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
