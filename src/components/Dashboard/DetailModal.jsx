import React, { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useNavigate } from 'react-router-dom'

export default function DetailModal({ category, onClose }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('30d')
  if (!category) return null

  const periods = ['7d', '30d', '90d', '1år']
  const { name, icon, tier, metrics, details, chartData, chartLines, navTarget, navLabel } = category

  const tierColor = tier?.color || '#6b7280'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid ' + tierColor + '44',
          borderRadius: '18px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '28px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>{icon}</span>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{name}</div>
              {tier && (
                <div style={{ fontSize: '12px', color: tierColor, fontWeight: 600 }}>{tier.label}</div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '6px 12px',
              color: 'var(--muted)', cursor: 'pointer', fontSize: '13px',
            }}
          >✕</button>
        </div>

        {/* All metrics */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            Metrics
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(details || metrics || []).map((m, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(255,255,255,0.03)', borderRadius: '8px',
                padding: '10px 14px',
              }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{m.label}</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: m.tierInfo?.color || 'var(--text)' }}>
                    {m.value}
                  </div>
                  {m.tierInfo && (
                    <div style={{ fontSize: '10px', color: m.tierInfo.color, opacity: 0.8 }}>
                      {m.tierInfo.label}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Next tier */}
        {tier?.nextThreshold != null && (
          <div style={{
            background: tierColor + '11',
            border: '1px solid ' + tierColor + '33',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '24px',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Nästa nivå → {tier.nextLabel}
            </div>
            <div style={{ fontSize: '13px', color: tierColor, fontWeight: 500 }}>
              {category.nextTierText || 'Fortsätt träna för att nå nästa tier'}
            </div>
          </div>
        )}

        {/* Chart */}
        {chartData && chartData.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Historik
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {periods.map(p => (
                  <button key={p} onClick={() => setPeriod(p)} style={{
                    padding: '3px 10px', fontSize: '11px', borderRadius: '6px',
                    background: period === p ? tierColor + '33' : 'transparent',
                    border: '1px solid ' + (period === p ? tierColor : 'var(--border)'),
                    color: period === p ? tierColor : 'var(--muted)',
                    cursor: 'pointer',
                  }}>{p}</button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                {(chartLines || []).map((line, i) => (
                  <Line
                    key={i} type="monotone" dataKey={line.key}
                    stroke={line.color || tierColor} strokeWidth={2}
                    dot={false} name={line.label}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Nav button */}
        {navTarget && (
          <button
            onClick={() => { onClose(); navigate(navTarget) }}
            style={{
              width: '100%', padding: '12px',
              background: tierColor + '22',
              border: '1px solid ' + tierColor + '44',
              borderRadius: '10px',
              color: tierColor, fontWeight: 600, fontSize: '14px',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = tierColor + '33'}
            onMouseLeave={e => e.currentTarget.style.background = tierColor + '22'}
          >
            Gå till {navLabel} →
          </button>
        )}
      </div>
    </div>
  )
}
