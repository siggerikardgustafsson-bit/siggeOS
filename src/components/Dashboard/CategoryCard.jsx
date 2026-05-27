import React, { useState } from 'react'

const TIER_GLOW = {
  7: '0 0 16px #ec489966, 0 0 32px #ec489933',
  8: '0 0 16px #f59e0b88, 0 0 32px #f59e0b44',
}

const TIER_BG = {
  1: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
  2: 'linear-gradient(135deg, #1e3a5f 0%, #111827 100%)',
  3: 'linear-gradient(135deg, #2d1f5e 0%, #111827 100%)',
  4: 'linear-gradient(135deg, #3d2a0a 0%, #111827 100%)',
  5: 'linear-gradient(135deg, #0d2e22 0%, #111827 100%)',
  6: 'linear-gradient(135deg, #0a2e38 0%, #111827 100%)',
  7: 'linear-gradient(135deg, #3b0a2a 0%, #111827 100%)',
  8: 'linear-gradient(135deg, #3d2a00 0%, #1a1100 100%)',
}

export default function CategoryCard({ category, onClick }) {
  const [hovered, setHovered] = useState(false)
  const { name, icon, tier, metrics, hasData, decayWarning, trend } = category

  const tierNum = tier?.tier || 0
  const tierColor = tier?.color || '#4b5563'
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : null
  const trendColor = trend === 'up' ? '#10b981' : '#ef4444'

  const cardBg = hasData && tierNum ? TIER_BG[tierNum] : 'linear-gradient(135deg, #1a1f2e 0%, #111827 100%)'

  return (
    <div
      onClick={() => onClick(category)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: cardBg,
        border: '1px solid ' + (hovered ? tierColor + '88' : tierColor + '33'),
        borderRadius: '16px',
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hovered
          ? TIER_GLOW[tierNum] || ('0 8px 32px ' + tierColor + '22')
          : '0 2px 8px rgba(0,0,0,0.3)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '140px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* Top glow strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
        background: hasData
          ? 'linear-gradient(90deg, transparent, ' + tierColor + ', transparent)'
          : '#374151',
        opacity: hovered ? 1 : 0.6,
        transition: 'opacity 0.2s',
      }} />

      {/* Subtle bg orb */}
      {hasData && (
        <div style={{
          position: 'absolute', bottom: -20, right: -20,
          width: 80, height: 80,
          borderRadius: '50%',
          background: tierColor + '11',
          filter: 'blur(20px)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px', lineHeight: 1 }}>{icon}</span>
          <span style={{
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#9ca3af',
          }}>
            {name}
          </span>
        </div>
        {trendIcon && hasData && (
          <span style={{ fontSize: '14px', fontWeight: 700, color: trendColor, lineHeight: 1 }}>
            {trendIcon}
          </span>
        )}
      </div>

      {/* Content */}
      {hasData ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {metrics.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>{m.label}</span>
              <span style={{
                fontSize: i === 0 ? '15px' : '13px',
                fontWeight: i === 0 ? 700 : 500,
                color: m.highlight ? tierColor : '#e5e7eb',
                letterSpacing: i === 0 ? '-0.02em' : 'normal',
              }}>
                {m.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#4b5563', fontStyle: 'italic' }}>
            Logga data för att se din tier
          </span>
        </div>
      )}

      {/* Tier badge — bottom */}
      <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {tier && hasData ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px',
            borderRadius: '20px',
            background: tierColor + '18',
            border: '1px solid ' + tierColor + '44',
            boxShadow: TIER_GLOW[tierNum] || 'none',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: tierColor,
              boxShadow: '0 0 6px ' + tierColor,
            }} />
            <span style={{
              fontSize: '10px', fontWeight: 700, color: tierColor,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              {tier.label}
            </span>
          </div>
        ) : (
          <div />
        )}
        {decayWarning && (
          <span style={{ fontSize: '10px', color: '#f59e0b' }}>⚠ gammal data</span>
        )}
        <span style={{ fontSize: '11px', color: '#374151', marginLeft: 'auto' }}>→</span>
      </div>
    </div>
  )
}
