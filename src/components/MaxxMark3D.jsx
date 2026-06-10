import { useRef, useEffect } from 'react'

/**
 * A genuine real-time 3D logo: a faceted icosahedron crystal rendered on a
 * <canvas> with a tiny hand-rolled 3D pipeline (rotate → perspective project →
 * back-to-front paint → per-face directional lighting). 20 shaded facets so it
 * never reads as flat. Tinted live by the active --accent / --accent2 theme.
 */
export default function MaxxMark3D({ size = 40 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    // --- icosahedron geometry ---
    const t = (1 + Math.sqrt(5)) / 2
    const raw = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ]
    const norm = Math.hypot(1, t)
    const V = raw.map(p => p.map(c => c / norm))
    const F = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ]

    const hexToRgb = (h) => {
      const m = (h || '').trim().replace('#', '')
      if (!m) return null
      const s = m.length === 3 ? m.split('').map(x => x + x).join('') : m
      const n = parseInt(s, 16)
      if (Number.isNaN(n)) return null
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }
    const themeColors = () => {
      const cs = getComputedStyle(document.documentElement)
      const a = hexToRgb(cs.getPropertyValue('--accent')) || [79, 142, 247]
      const b = hexToRgb(cs.getPropertyValue('--accent2')) || [167, 139, 250]
      return [a, b]
    }

    const L = (() => { const v = [0.32, 0.42, 0.85]; const m = Math.hypot(...v); return v.map(c => c / m) })()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const R = size * 0.36
    const cx = size / 2
    const cy = size / 2
    const persp = size * 2.4
    let ax = -0.4
    let ay = 0.6
    let raf = 0

    const rotate = (p, ax, ay) => {
      let [x, y, z] = p
      const cy_ = Math.cos(ay), sy = Math.sin(ay)
      const x1 = x * cy_ + z * sy
      const z1 = -x * sy + z * cy_
      const cx_ = Math.cos(ax), sx = Math.sin(ax)
      const y1 = y * cx_ - z1 * sx
      const z2 = y * sx + z1 * cx_
      return [x1, y1, z2]
    }

    const frame = () => {
      const [accent, accent2] = themeColors()
      ctx.clearRect(0, 0, size, size)

      const pts = V.map(p => rotate(p, ax, ay))
      const proj = pts.map(([x, y, z]) => {
        const sc = persp / (persp - z * R)
        return [cx + x * R * sc, cy + y * R * sc]
      })

      const polys = F.map(f => {
        const [a, b, c] = f.map(i => pts[i])
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
        let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        const nl = Math.hypot(...n) || 1
        n = n.map(c => c / nl)
        // orient outward (convex around origin): flip if pointing inward
        const ctr = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
        if (n[0] * ctr[0] + n[1] * ctr[1] + n[2] * ctr[2] < 0) n = n.map(c => -c)
        const depth = ctr[2]
        const bright = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2])
        return { f, depth, facing: n[2], bright }
      })
      polys.sort((p, q) => p.depth - q.depth) // back to front

      for (const poly of polys) {
        if (poly.facing <= 0.02) continue // cull back faces (solid body)
        const lit = poly.bright
        const k = 0.14 + 0.86 * lit                 // stronger light/shadow contrast
        const mix = lit * 0.45                       // brighter facets lean toward accent2
        const spec = lit > 0.82 ? (lit - 0.82) * 3.6 : 0 // crisp crystal highlight
        const col = accent.map((c, i) => Math.min(255, Math.round(
          c * k + accent2[i] * mix + 255 * spec * 0.5
        )))
        const [a, b, c] = poly.f.map(i => proj[i])
        ctx.beginPath()
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath()
        ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`
        ctx.fill()
        ctx.lineWidth = 0.7
        ctx.strokeStyle = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},0.5)`
        ctx.stroke()
      }

      if (!reduce) {
        ax += 0.010
        ay += 0.016
        raf = requestAnimationFrame(frame)
      }
    }

    frame()
    return () => cancelAnimationFrame(raf)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      className="maxx-rail-mark-canvas"
      style={{ width: size, height: size, display: 'block' }}
    />
  )
}
