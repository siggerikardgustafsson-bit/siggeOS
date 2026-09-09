import { useEffect, useRef, useState } from 'react'

/**
 * Animated count-up that triggers when scrolled into view.
 * Renders a tabular-nums span. Use for hero metrics.
 *
 * Props:
 *  - value: target number (may be negative, and may change after mount as data loads)
 *  - decimals: fixed decimals (default 0)
 *  - duration: ms (default 900)
 *  - prefix / suffix: strings wrapped around the number
 *  - separator: thousands separator (default ' ')
 */
export default function CountUp({
  value = 0,
  decimals = 0,
  duration = 900,
  prefix = '',
  suffix = '',
  separator = ' ',
  className = '',
  style,
}) {
  const [display, setDisplay] = useState(() => Number(value) || 0)
  const ref = useRef(null)
  const displayRef = useRef(Number(value) || 0)
  const visibleRef = useRef(false)

  useEffect(() => { displayRef.current = display }, [display])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = Number(value) || 0

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setDisplay(target); return }

    let raf = 0
    const animate = () => {
      cancelAnimationFrame(raf)
      const start = performance.now()
      const from = displayRef.current
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration)
        const eased = 1 - Math.pow(1 - t, 3)
        setDisplay(from + (target - from) * eased)
        if (t < 1) raf = requestAnimationFrame(tick)
        else setDisplay(target)
      }
      raf = requestAnimationFrame(tick)
    }

    // Already scrolled past / into view — animate straight away, and re-animate
    // whenever `value` changes (e.g. an async load resolves after mount).
    if (visibleRef.current) { animate(); return () => cancelAnimationFrame(raf) }

    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        visibleRef.current = true
        animate()
        io.disconnect()
      }
    }, { threshold: 0.3 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [value, duration])

  const fmt = (n) => {
    const num = Number(n)
    const sign = num < 0 ? '-' : ''
    const fixed = Math.abs(num).toFixed(decimals)
    const [int, dec] = fixed.split('.')
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
    return `${sign}${dec ? `${grouped}.${dec}` : grouped}`
  }

  return (
    <span ref={ref} className={`count-up ${className}`} style={style}>
      {prefix}{fmt(display)}{suffix}
    </span>
  )
}
