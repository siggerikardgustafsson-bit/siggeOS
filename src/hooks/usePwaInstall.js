import { useEffect, useState } from 'react'

// Shared PWA-install state.
//
// `beforeinstallprompt` can fire before any React component mounts, so we
// capture it at module/startup scope (initPwaInstall, called from main.jsx)
// and stash the event. Components subscribe via usePwaInstall() and can trigger
// the native prompt from anywhere (the banner AND the Settings button share one
// source of truth, so the event is never consumed twice or lost).

let deferredPrompt = null
const subscribers = new Set()
const notify = () => subscribers.forEach((fn) => fn())

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function isIOS() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent || ''
  return /iphone|ipad|ipod/i.test(ua) && !window.MSStream
}

// Idempotent — safe to call from main.jsx and again from the hook as a fallback.
export function initPwaInstall() {
  if (typeof window === 'undefined' || window.__pwaInstallInit) return
  window.__pwaInstallInit = true

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // suppress the mini-infobar; we surface our own UI
    deferredPrompt = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(() => !!deferredPrompt)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    initPwaInstall() // safety net in case main.jsx didn't run it yet

    const sync = () => {
      setCanInstall(!!deferredPrompt)
      setInstalled(isStandalone())
    }
    subscribers.add(sync)
    sync()

    const mq = window.matchMedia?.('(display-mode: standalone)')
    mq?.addEventListener?.('change', sync)

    return () => {
      subscribers.delete(sync)
      mq?.removeEventListener?.('change', sync)
    }
  }, [])

  // Returns true if the native prompt was shown, false if unavailable.
  const promptInstall = async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    try {
      await deferredPrompt.userChoice
    } catch {
      /* user choice unavailable — nothing to do */
    }
    deferredPrompt = null
    notify()
    return true
  }

  return { canInstall, installed, ios: isIOS(), promptInstall }
}
