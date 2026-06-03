import React from 'react'
import { Check } from 'lucide-react'

const TIER_COLORS = {
  0:'rgba(255,255,255,0.15)',1:'rgba(255,255,255,0.75)',2:'#4f8ef7',3:'#a78bfa',
  4:'#fbbf24',5:'#34d399',6:'#22d3ee',7:'#f472b6',8:'#fbbf24',
}

const NEXT_TIER_SHORT = {
  kondition: ['—','5km < 28:00','5km < 24:00','5km < 22:00','5km < 20:00','5km < 18:30','5km < 17:00','Top 1% ✓'],
  styrka:    ['—','Bänk ≥ 0.75x BW','Bänk ≥ 1.0x BW','Bänk ≥ 1.15x BW','Bänk ≥ 1.3x BW','Bänk ≥ 1.5x BW','Bänk ≥ 1.65x BW','Top 1% ✓'],
  kropp:     ['—','Logga vikt regelbundet','BMI/fettprocent','Optimal komposition','Elite','Elite','Elite','Elite'],
  somn:      ['—','Snitt ≥ 6.5h/natt','Snitt ≥ 7.0h/natt','Snitt ≥ 7.5h/natt','Snitt ≥ 8.0h/natt','Snitt ≥ 8.5h + konsistens','≥ 8.5h + variation < 12 min','Top 1% ✓'],
  plugg:     ['—','Mastery ≥ 20%','Mastery ≥ 40%','Mastery ≥ 60%','Mastery ≥ 80%','Expert ✓','',''],
  ekonomi:   ['—','Netto ≥ 12 000 kr/mån','Netto ≥ 18 000 kr/mån','Netto ≥ 22 000 kr/mån','Netto ≥ 28 000 kr/mån','Netto ≥ 35 000 kr/mån','Netto ≥ 45 000 kr/mån','Top 1% ✓'],
  halsa:     ['—','Energi ≥ 5, humör ≥ 5','Energi ≥ 6','Energi ≥ 7, humör ≥ 7','Energi ≥ 8','Energi ≥ 9','Allt toppklass','Top 1% ✓'],
  valmående: ['—','Energi ≥ 5, humör ≥ 5','Energi ≥ 6','Energi ≥ 7, humör ≥ 7','Energi ≥ 8','Energi ≥ 9','Allt toppklass','Top 1% ✓'],
  fardigheter:['—','1–30 min/vecka','30–60 min/vecka','60–120 min/vecka','120–240 min/vecka','240+ min/vecka ✓','',''],
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

function Icon({ id, color, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={CAT_PATHS[id] || CAT_PATHS.kondition} />
    </svg>
  )
}

function Ring({ pct, color, tier, size = 52 }) {
  const r = 22
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(pct || 0, 100) / 100) * circ
  const hasData = pct > 0 && tier > 0
  const filterId = 'glow-' + (color || 'none').replace('#', '').replace(/[^a-zA-Z0-9]/g, '')
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
        {hasData && (
          <defs>
            <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={color} floodOpacity="0.7" />
            </filter>
          </defs>
        )}
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={hasData ? offset : circ}
          strokeLinecap="round" filter={hasData ? `url(#${filterId})` : undefined}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: hasData ? color : 'var(--muted)', lineHeight: 1 }}>
          {tier > 0 ? 'T' + tier : '—'}
        </span>
      </div>
    </div>
  )
}

export default function CategoryCard({ category, onClick, onMetricClick }) {
  const { id, name, tier, metrics = [], hasData, decayWarning, trend, pct, perExercise } = category
  const tierNum = tier?.tier || 0
  const color = TIER_COLORS[tierNum] || 'var(--accent)'
  const ringPct = pct != null ? pct : 0
  const nextReq = hasData && tierNum > 0 && tierNum < 8 ? (NEXT_TIER_SHORT[id]?.[tierNum] || null) : null
  const nextColor = TIER_COLORS[tierNum + 1] || color
  const weakLinks = id === 'styrka' && perExercise?.length
    ? perExercise.filter(e => e.tier.tier <= tierNum)
    : []

  function openCard() { onClick?.(category) }

  function handleMetricClick(e, metric) {
    if (!metric?.evidence) return
    e.preventDefault()
    e.stopPropagation()
    onMetricClick?.({ ...metric.evidence, categoryId: id, categoryName: name, metricLabel: metric.label, metricValue: metric.value })
  }

  return (
    <div onClick={openCard} className="widget cat-card fade-up"
      style={{ padding: '12px', minHeight: '140px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        .metric-source-row {
          appearance: none;
          width: 100%;
          border: 1px solid transparent;
          background: rgba(255,255,255,0.025);
          border-radius: 9px;
          padding: 4px 5px;
          cursor: pointer;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 6px;
          align-items: center;
          text-align: left;
          transition: transform .14s ease, background .14s ease, border-color .14s ease, box-shadow .14s ease;
        }
        .metric-source-row:hover {
          transform: translateY(-1px);
          background: var(--accent-soft);
          border-color: var(--accent-border);
          box-shadow: 0 0 0 3px var(--accent-soft), 0 6px 18px rgba(0,0,0,.18);
        }
        .metric-source-row:active { transform: translateY(0) scale(.99); }
        .metric-source-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          border-radius: 999px;
          background: rgba(79,142,247,.14);
          border: 1px solid rgba(79,142,247,.26);
          color: var(--accent);
          font-size: 8px;
          font-weight: 850;
          letter-spacing: .06em;
          text-transform: uppercase;
          opacity: .72;
          transition: opacity .14s ease, transform .14s ease, background .14s ease;
          white-space: nowrap;
        }
        .metric-source-row:hover .metric-source-pill {
          opacity: 1;
          transform: scale(1.04);
          background: rgba(79,142,247,.22);
        }
        .metric-source-value {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          flex-shrink: 0;
        }
      `}</style>

      {hasData && tierNum > 0 && (
        <div style={{ position: 'absolute', top: -20, right: -20, width: 70, height: 70, borderRadius: '50%', background: color + '12', filter: 'blur(18px)', pointerEvents: 'none' }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: 24, height: 24, borderRadius: '6px', background: hasData && tierNum > 0 ? color + '18' : 'var(--surface2)', border: '1px solid ' + (hasData && tierNum > 0 ? color + '30' : 'var(--border)'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon id={id} color={hasData && tierNum > 0 ? color : 'var(--muted)'} />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{name}</span>
        </div>
        {trend !== 'neutral' && hasData && (
          <span style={{ fontSize: '11px', fontWeight: 700, color: trend === 'up' ? 'var(--green)' : 'var(--red)' }}>{trend === 'up' ? '↑' : '↓'}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
        <Ring pct={ringPct} color={hasData && tierNum > 0 ? color : 'var(--border)'} tier={tierNum} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {metrics.slice(0, 3).map((m, i) => {
                const clickable = !!m.evidence && !!onMetricClick
                const RowTag = clickable ? 'button' : 'div'
                return (
                  <RowTag key={i}
                    onClick={clickable ? (e) => handleMetricClick(e, m) : undefined}
                    title={clickable ? 'Öppna pass/källa' : undefined}
                    className={clickable ? 'metric-source-row' : undefined}
                    style={!clickable ? {
                      width: '100%', display: 'flex', justifyContent: 'space-between', gap: '4px', alignItems: 'baseline', textAlign: 'left', padding: 0,
                    } : undefined}>
                    <span style={{ fontSize: '10px', color: clickable ? 'var(--muted2)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {m.label}
                    </span>
                    <span className={clickable ? 'metric-source-value' : undefined} style={{ fontSize: i === 0 ? '12px' : '11px', fontWeight: i === 0 ? 800 : 650, color: m.highlight ? color : 'var(--text)' }}>
                      {m.value}
                    </span>
                    {clickable && <span className="metric-source-pill">Källa ↗</span>}
                  </RowTag>
                )
              })}
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>Ingen data</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: '8px', paddingTop: '7px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {tier && hasData ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 7px', borderRadius: '20px', background: color + '12', border: '1px solid ' + color + '28' }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: '9px', fontWeight: 700, color: color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{tier.label}</span>
            </div>
          ) : <span style={{ fontSize: '9px', color: 'var(--muted)' }}>—</span>}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {decayWarning && <span style={{ fontSize: '9px', color: 'var(--amber)' }}>!</span>}
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>→</span>
          </div>
        </div>

        {id === 'styrka' && weakLinks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {weakLinks.slice(0, 2).map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 7px', borderRadius: '7px', background: nextColor + '08', border: '1px solid ' + nextColor + '20' }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={nextColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <span style={{ fontSize: '9px', color: nextColor, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.label}: {e.isBW ? `+${Math.round(e.value || 0)}kg` : e.mult ? `${e.mult}x BW` : '—'} (T{e.tier.tier})
                </span>
              </div>
            ))}
          </div>
        ) : nextReq ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 7px', borderRadius: '7px', background: nextColor + '08', border: '1px solid ' + nextColor + '20' }}>
            <Check size={9} color={nextColor} />
            <span style={{ fontSize: '9px', color: nextColor, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextReq}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
