import { useRef, useEffect } from 'react'

/**
 * Subtle 3D tilt + specular response for premium cards.
 * Attach the returned ref to an element that has the `.tilt-card` class.
 * Respects prefers-reduced-motion and pointer-coarse (touch) devices.
 */
export function useTilt({ max = 6, scale = 1.012 } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (reduce || coarse) return

    let raf = 0

    const onMove = (e) => {
      const rect = el.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      const rx = (0.5 - py) * max * 2
      const ry = (px - 0.5) * max * 2
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.transform =
          `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`
        el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
        el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
      })
    }

    const reset = () => {
      cancelAnimationFrame(raf)
      el.style.transform = ''
    }

    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', reset)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', reset)
    }
  }, [max, scale])

  return ref
}
