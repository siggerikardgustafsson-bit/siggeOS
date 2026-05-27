import React, { useState } from 'react'

const TIER_COLORS = {
  0:'rgba(255,255,255,0.15)',1:'#6b7280',2:'#4f8ef7',3:'#a78bfa',
  4:'#fbbf24',5:'#34d399',6:'#22d3ee',7:'#f472b6',8:'#fbbf24',
}

const CATEGORY_ICONS = {
  kondition:   'M13 10V3L4 14h7v7l9-11h-7z',
  styrka:      'M6 4v16M18 4v16M3 8h4m10 0h4M3 16h4m10 0h4',
  kropp:       'M12 3a4 4 0 100 8 4 4 0 000-8zM6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2',
  somn:        'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
  plugg:       'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  ekonomi:     'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  valmående:   'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  fardigheter: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
}

function CategoryIcon({ id, color, size = 15 }) {
  const path = CATEGORY_ICONS[id] || CATEGORY_ICONS.kondition
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
}

function RingProgress({ pct, color, tier, size = 64 }) {
  const r = 24
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(pct, 100) / 100) * circ
  const tierLabel = tier > 0 ? 'T' + tier : '—'
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 60 60" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="30" cy="30" r={r} fill="none" stroke="var(--border)" strokeWidth="4.5" />
        <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="4.5"
          strokeDasharray={circ} strokeDashoffset={pct > 0 ? offset : circ}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: pct > 0 ? color : 'var(--muted)', lineHeight: 1 }}>
          {tierLabel}
        </span>
        {pct > 0 && (
          <span style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '1px', lineHeight: 1 }}>
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
  const ringPct = pct != null ? pct : 0
  const trendColor = trend === 'up' ? 'var(--green)' : trend === 'down' ? 'var(--red)' : null

  return (
    <div
      onClick={() => onClick(category)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="card fade-up"
      style={{
        padding: '16px',
        cursor: 'pointer',
        border: '1px solid ' + (hovered ? 'var(--border2)' : 'var(--glass-border)'),
        boxShadow: hovered ? 'var(--glass-shadow-hover)' : 'var(--glass-shadow)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        position: 'relative', overflow: 'hidden',
        minHeight: '140px',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Top shimmer */}
      <div style={{
        position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px',
        background: 'linear-gradient(90deg, transparent, var(--border2), transparent)',
        opacity: 0.6,
      }} />

      {/* Tier color ambient */}
      {hasData && tierNum > 0 && (
        <div style={{
          position: 'absolute', top: -24, right: -24, width: 72, height: 72,
          borderRadius: '50%', background: color + '14',
          filter: 'blur(20px)', pointerEvents: 'none',
        }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div style={{
            width: 26, height: 26, borderRadius: '7px',
            background: hasData && tierNum > 0 ? color + '15' : 'var(--surface2)',
            border: '1px solid ' + (hasData && tierNum > 0 ? color + '30' : 'var(--border)'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CategoryIcon id={id} color={hasData && tierNum > 0 ? color : 'var(--muted)'} size={13} />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {name}
          </span>
        </div>
        {trendColor && hasData && (
          <span style={{ fontSize: '12px', fontWeight: 700, color: trendColor, lineHeight: 1 }}>
            {trend === 'up' ? '↑' : '↓'}
          </span>
        )}
      </div>

      {/* Ring + metrics */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
        <RingProgress pct={ringPct} color={hasData && tierNum > 0 ? color : 'var(--border)'} tier={tierNum} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {metrics.slice(0, 3).map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.label}
                  </span>
                  <span style={{
                    fontSize: i === 0 ? '13px' : '11px',
                    fontWeight: i === 0 ? 600 : 400,
                    color: m.highlight ? color : 'var(--text)',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
              Ingen data ännu
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '10px', paddingTop: '8px',
        borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        {tier && hasData ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', borderRadius: '20px',
            background: color + '12',
            border: '1px solid ' + color + '30',
          }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: '9px', fontWeight: 700, color: color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {tier.label}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: '9px', color: 'var(--muted)' }}>—</span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {decayWarning && <span style={{ fontSize: '9px', color: 'var(--amber)' }}>⚠</span>}
          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>→</span>
        </div>
      </div>
    </div>
  )
}
