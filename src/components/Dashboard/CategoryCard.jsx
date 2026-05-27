import React from 'react'

const TIER_GLOW = {
  8: '0 0 12px #f59e0b88, 0 0 24px #f59e0b44',
}

export default function CategoryCard({ category, onClick }) {
  const { name, icon, tier, metrics, trend, hasData, decayWarning } = category

  const tierColor = tier?.color || '#6b7280'
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'
  const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#9ca3af'

  return (
    <div
      onClick={() => onClick(category)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '18px 20px',
        cursor: 'pointer',
        transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.borderColor = tierColor + '66'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Subtle color accent top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
        background: hasData ? tierColor : '#374151',
        borderRadius: '14px 14px 0 0',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>{icon}</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            {name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {hasData && (
            <span style={{ fontSize: '13px', fontWeight: 700, color: trendColor }}>
              {trendIcon}
            </span>
          )}
          {tier && hasData && (
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '20px',
              background: tierColor + '22',
              color: tierColor,
              border: '1px solid ' + tierColor + '44',
              boxShadow: TIER_GLOW[tier.tier] || 'none',
              whiteSpace: 'nowrap',
              letterSpacing: '0.04em',
            }}>
              {tier.label}
            </span>
          )}
        </div>
      </div>

      {/* Metrics */}
      {hasData ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {metrics.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{m.label}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: m.highlight ? tierColor : 'var(--text)' }}>
                {m.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic', marginTop: '4px' }}>
          Ingen data — logga för att se din tier
        </div>
      )}

      {/* Stale warning */}
      {decayWarning && (
        <div style={{
          marginTop: '10px',
          fontSize: '10px',
          color: '#f59e0b',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span>⚠</span>
          <span>Data börjar bli gammal</span>
        </div>
      )}
    </div>
  )
}
