import { useId } from 'react'

// Tiny dependency-free trend line. Pass an array of numbers (nulls are skipped).
// Renders nothing for <2 points so callers can drop it in unconditionally.
export default function Sparkline({
  data = [], color = 'var(--accent)', width = 120, height = 32,
  strokeWidth = 2, fill = true, style,
}) {
  const rawId = useId()
  const gid = 'spark-' + rawId.replace(/[^a-zA-Z0-9]/g, '')
  const vals = (data || []).map(Number).filter(v => Number.isFinite(v))
  if (vals.length < 2) return null

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const stepX = width / (vals.length - 1)
  // Inset vertically so the stroke isn't clipped at the extremes.
  const pad = strokeWidth + 1
  const pts = vals.map((v, i) => [
    i * stepX,
    pad + (height - pad * 2) * (1 - (v - min) / range),
  ])
  const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const area = fill ? `${line} L${width} ${height} L0 ${height} Z` : null
  const last = pts[pts.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible', ...style }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${gid})`} stroke="none" />}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={strokeWidth + 0.6} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  )
}
