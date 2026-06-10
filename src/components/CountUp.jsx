import { useEffect, useRef, useState } from 'react'

/**
 * Animated count-up that triggers when scrolled into view.
 * Renders a tabular-nums span. Use for hero metrics.
 *
 * Props:
 *  - value: target number
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
  separator = ' ',
  className = '',
  style,
}) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = Number(value) || 0

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setDisplay(target); return }

    const run = () => {
      if (started.current) return
      started.current = true
      const start = performance.now()
      const from = 0
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration)
        const eased = 1 - Math.pow(1 - t, 3)
        setDisplay(from + (target - from) * eased)
        if (t < 1) requestAnimationFrame(tick)
        else setDisplay(target)
      }
      requestAnimationFrame(tick)
    }

    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { run(); io.disconnect() }
    }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [value, duration])

  const fmt = (n) => {
    const fixed = Number(n).toFixed(decimals)
    const [int, dec] = fixed.split('.')
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
    return dec ? `${grouped}.${dec}` : grouped
  }

  return (
    <span ref={ref} className={`count-up ${className}`} style={style}>
      {prefix}{fmt(display)}{suffix}
    </span>
  )
}
