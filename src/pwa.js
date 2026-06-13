// Registers the service worker that makes MaxxIt installable and offline-capable.
// Registration is best-effort: if it fails, the app keeps working as a normal SPA.
export function registerSW() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    // Only auto-reload when the page was ALREADY controlled at load time. That way
    // the very first install (clients.claim firing controllerchange) doesn't reload,
    // but a later deploy that activates a new worker refreshes the app once.
    if (navigator.serviceWorker.controller) {
      let reloading = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return
        reloading = true
        window.location.reload()
      })
    }

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      /* no-op: PWA features are progressive enhancement */
    })
  })
}
