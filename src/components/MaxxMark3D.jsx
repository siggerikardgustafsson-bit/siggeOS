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

    // --- chunky extruded "M" geometry ---
    // 2D outline of a thick M (y-up), traced around the boundary.
    const outline = [
      [-0.80,  0.72], // 0  top-left outer
      [-0.45,  0.72], // 1  top-left inner
      [ 0.00,  0.05], // 2  top-center notch
      [ 0.45,  0.72], // 3  top-right inner
      [ 0.80,  0.72], // 4  top-right outer
      [ 0.80, -0.72], // 5  bottom-right outer
      [ 0.45, -0.72], // 6  bottom-right inner
      [ 0.45,  0.18], // 7  right diagonal underside
      [ 0.00, -0.05], // 8  V tip
      [-0.45,  0.18], // 9  left diagonal underside
      [-0.45, -0.72], // 10 bottom-left inner
      [-0.80, -0.72], // 11 bottom-left outer
    ]
    const N = outline.length
    const hd = 0.28 // half extrusion depth
    const V = []
    for (const [x, y] of outline) V.push([x, y, hd])   // front  0..N-1
    for (const [x, y] of outline) V.push([x, y, -hd])  // back   N..2N-1

    // front-face triangulation (3 convex chunks: two bars + the V)
    const front = [
      [11, 0, 1], [11, 1, 10],   // left bar
      [6, 3, 4], [6, 4, 5],      // right bar
      [1, 2, 8], [1, 8, 9],      // left diagonal
      [2, 3, 7], [2, 7, 8],      // right diagonal
    ]
    const F = []
    for (const tri of front) F.push(tri)                       // front
    for (const tri of front) F.push([tri[0] + N, tri[2] + N, tri[1] + N]) // back
    for (let i = 0; i < N; i++) {                              // side walls
      const j = (i + 1) % N
      F.push([i, j, j + N])
      F.push([i, j + N, i + N])
    }

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

    const R = size * 0.42
    const cx = size / 2
    const cy = size / 2
    const persp = size * 2.4
    const ax = -0.22          // gentle fixed tilt so the M stays readable
    let ay = 0.4              // spins around the vertical axis
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
        // stroke each facet in its own fill colour to seal hairline seams,
        // so edges read as the same colour as the walls (no outline).
        ctx.lineWidth = 0.6
        ctx.strokeStyle = ctx.fillStyle
        ctx.stroke()
      }

      if (!reduce) {
        ay += 0.020
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
