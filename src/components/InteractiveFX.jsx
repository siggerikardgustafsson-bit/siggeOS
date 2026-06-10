import { useEffect } from 'react'

/**
 * Global "Jarvis" interaction engine.
 * Tracks the pointer over glass surfaces and exposes its position as
 * --mx / --my CSS custom properties on the hovered element, plus a
 * .fx-live class. CSS uses these to render a cursor-following spotlight,
 * reactive border highlight, and tilt. One rAF-throttled listener, passive.
 */
export default function InteractiveFX() {
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    const SEL = '.widget, .card, .card-sm, .page-header, .maxx-rail-panel'
    let raf = 0
    let current = null

    function clear(el) {
      if (!el) return
      el.classList.remove('fx-live')
      el.style.removeProperty('--mx')
      el.style.removeProperty('--my')
    }

    function onMove(e) {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = e.target?.closest?.(SEL)
        if (el) {
          const r = el.getBoundingClientRect()
          const x = ((e.clientX - r.left) / r.width) * 100
          const y = ((e.clientY - r.top) / r.height) * 100
          el.style.setProperty('--mx', x.toFixed(2) + '%')
          el.style.setProperty('--my', y.toFixed(2) + '%')
          if (current !== el) {
            clear(current)
            el.classList.add('fx-live')
            current = el
          }
        } else if (current) {
          clear(current)
          current = null
        }
      })
    }

    function onLeave() {
      clear(current)
      current = null
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onMove)
      document.removeEventListener('mouseleave', onLeave)
      if (raf) cancelAnimationFrame(raf)
      clear(current)
    }
  }, [])

  return null
}
