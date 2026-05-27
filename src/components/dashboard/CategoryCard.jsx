import React, { useState } from 'react'

const TIER_COLORS = {
  0: 'rgba(255,255,255,0.18)',
  1: '#6b7280',
  2: '#4f8ef7',
  3: '#a78bfa',
  4: '#fbbf24',
  5: '#34d399',
  6: '#22d3ee',
  7: '#f472b6',
  8: '#fbbf24',
}

const CATEGORY_ICONS = {
  kondition:   'M13 10V3L4 14h7v7l9-11h-7z',
  styrka:      'M6.5 6.5h11M6.5 17.5h11M3 12h18M7 3v18M17 3v18',
  kropp:       'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3',
  somn:        'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
  plugg:       'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  ekonomi:     'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  valmående:   'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  fardigheter: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
}

function CategoryIcon({ id, color, size = 18 }) {
  const path = CATEGORY_ICONS[id] || CATEGORY_ICONS.kondition
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
}

function RingProgress({ pct, color, tier, size = 72 }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(pct, 100) / 100) * circ
  const tierLabel = tier > 0 ? 'T' + tier : '—'

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 68 68" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="34" cy="34" r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx="34" cy="34" r={r} fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)',
            filter: pct > 0 ? 'drop-shadow(0 0 4px ' + color + '88)' : 'none',
          }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: pct > 0 ? color : 'rgba(255,255,255,0.2)', lineHeight: 1 }}>
          {tierLabel}
        </span>
        {pct > 0 && (
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', lineHeight: 1 }}>
            {Math.round(pct)}%
          </span>
        )}
      </div>
    </div>
  )
}

export default function CategoryCard({ category, onClick }) {
  const [hovered, setHovered] = useState(false)
  const { id, name, tier, metrics, hasData, decayWarning, trend, pct } = category

  const tierNum = tier?.tier || 0
  const color = TIER_COLORS[tierNum]
  const ringPct = pct != null ? pct : (hasData ? Math.min(100, ((tierNum) / 8) * 100) : 0)

  const trendColor = trend === 'up' ? '#34d399' : trend === 'down' ? '#f87171' : null

  return (
    <div
      onClick={() => onClick(category)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fade-up"
      style={{
        background: hovered
          ? 'rgba(255,255,255,0.075)'
          : 'rgba(255,255,255,0.045)',
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter: 'blur(22px)',
        border: '1px solid ' + (hovered ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)'),
        borderRadius: '16px',
        padding: '16px',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 12px 40px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.09) inset'
          : '0 4px 20px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.06) inset',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top shimmer line */}
      <div style={{
        position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
        borderRadius: '1px',
      }} />

      {/* Subtle tier color tint in corner */}
      {hasData && tierNum > 0 && (
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 80, height: 80, borderRadius: '50%',
          background: color + '18',
          filter: 'blur(25px)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '8px',
            background: hasData && tierNum > 0 ? color + '18' : 'rgba(255,255,255,0.06)',
            border: '1px solid ' + (hasData && tierNum > 0 ? color + '33' : 'rgba(255,255,255,0.08)'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CategoryIcon id={id} color={hasData && tierNum > 0 ? color : 'rgba(255,255,255,0.3)'} size={14} />
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {name}
          </span>
        </div>
        {trendColor && hasData && (
          <span style={{ fontSize: '12px', fontWeight: 700, color: trendColor }}>
            {trend === 'up' ? '↑' : '↓'}
          </span>
        )}
      </div>

      {/* Ring + metrics row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <RingProgress pct={ringPct} color={hasData && tierNum > 0 ? color : 'rgba(255,255,255,0.12)'} tier={tierNum} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {hasData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {metrics.slice(0, 3).map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.label}
                  </span>
                  <span style={{
                    fontSize: i === 0 ? '13px' : '12px',
                    fontWeight: i === 0 ? 600 : 400,
                    color: m.highlight ? color : 'rgba(255,255,255,0.75)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}>
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
              Ingen data ännu
            </span>
          )}
        </div>
      </div>

      {/* Tier badge footer */}
      <div style={{
        marginTop: '12px', paddingTop: '10px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        {tier && hasData ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '3px 9px',
            borderRadius: '20px',
            background: color + '15',
            border: '1px solid ' + color + '33',
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: color,
              boxShadow: '0 0 5px ' + color,
            }} />
            <span style={{ fontSize: '10px', fontWeight: 600, color: color, letterSpacing: '0.05em' }}>
              {tier.label}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)' }}>—</span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {decayWarning && <span style={{ fontSize: '9px', color: '#fbbf24' }}>⚠</span>}
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.18)' }}>→</span>
        </div>
      </div>
    </div>
  )
}
