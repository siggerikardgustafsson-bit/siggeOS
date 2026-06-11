import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Portal-based modal rendered straight into <body>, so it is always
 * viewport-fixed and centered regardless of any transformed/scrolling
 * ancestor (which previously made modals scroll with the page and sit
 * too high). Locks body scroll and closes on Escape / backdrop click.
 *
 * Two usage modes:
 *  - Structured: pass `title` (+ optional `subtitle`, `headerRight`) and the
 *    body as children — gets a styled header + scroll area.
 *  - Raw: pass `bare` and own the entire inner layout via children.
 */
export default function Modal({
  onClose,
  children,
  title,
  subtitle,
  headerRight,
  maxWidth = 760,
  bare = false,
  className = '',
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div
      className="mx-modal-overlay mx-modal-overlay--portal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className={`mx-modal ${bare ? '' : ''} ${className}`}
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
      >
        {bare ? children : (
          <>
            <div className="mx-modal-head">
              <div className="mx-modal-head-main">
                {title && <div className="mx-modal-title">{title}</div>}
                {subtitle && <div className="mx-modal-sub">{subtitle}</div>}
              </div>
              <div className="mx-modal-head-actions">
                {headerRight}
                <button className="mx-modal-close" onClick={onClose} aria-label="Stäng">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="mx-modal-scroll">{children}</div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
