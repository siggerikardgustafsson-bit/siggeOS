import { useEffect, useState } from 'react'
import { Download, X, Share } from 'lucide-react'
import { usePwaInstall } from '../hooks/usePwaInstall'

const DISMISS_KEY = 'pwa-install-dismissed-v1'

// Tasteful, dismissible "add to home screen" prompt.
// - Chromium/Android: uses the captured beforeinstallprompt (via usePwaInstall).
// - iOS Safari (no beforeinstallprompt): shows the manual Share → "Lägg till på hemskärmen" hint.
// - Never shows once installed (standalone) or after the user dismisses it.
// The persistent button under Inställningar → Appen shares the same hook.
export default function InstallPrompt() {
  const { canInstall, installed, ios, promptInstall } = usePwaInstall()

  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!localStorage.getItem(DISMISS_KEY)
    } catch {
      return false
    }
  })
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const onMq = (e) => setMobile(e.matches)
    mq.addEventListener?.('change', onMq)
    return () => mq.removeEventListener?.('change', onMq)
  }, [])

  const show = !installed && !dismissed && (canInstall || ios)
  if (!show) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* ignore persistence failure */
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Installera MaxxIt"
      style={{
        position: 'fixed',
        zIndex: 60,
        bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 84px)' : '24px',
        left: mobile ? '12px' : '84px',
        right: mobile ? '84px' : 'auto',
        maxWidth: mobile ? 'none' : '360px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 14px',
        background: 'var(--surface)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--glass-shadow)',
      }}
    >
      <img
        src="/icon-192.png"
        alt=""
        width="40"
        height="40"
        style={{ borderRadius: '10px', flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Installera MaxxIt</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px', lineHeight: 1.35 }}>
          {ios ? (
            <>
              Tryck på <Share size={11} style={{ verticalAlign: '-1px' }} /> och välj &rdquo;Lägg till på
              hemskärmen&rdquo;.
            </>
          ) : (
            'Lägg till på hemskärmen för snabb åtkomst.'
          )}
        </div>
      </div>

      {!ios && (
        <button
          onClick={promptInstall}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            padding: '8px 12px',
            borderRadius: '10px',
            cursor: 'pointer',
            color: '#fff',
            border: 'none',
            background:
              'linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 78%, #000) 100%)',
            boxShadow: '0 2px 10px var(--accent-glow)',
          }}
        >
          <Download size={13} /> Installera
        </button>
      )}

      <button
        onClick={dismiss}
        aria-label="Stäng"
        style={{
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          width: '26px',
          height: '26px',
          borderRadius: '8px',
          cursor: 'pointer',
          background: 'transparent',
          border: '1px solid var(--glass-border)',
          color: 'var(--muted)',
        }}
      >
        <X size={13} />
      </button>
    </div>
  )
}
