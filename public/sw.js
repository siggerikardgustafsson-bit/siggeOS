/* MaxxIt – service worker
 *
 * Goals:
 *  - Make the app installable and launchable offline (cached app shell).
 *  - Never cache Supabase/auth/API traffic or anything non-GET (data stays fresh).
 *  - Stay out of the way of the Vite dev server (HMR / module requests are never cached),
 *    so the same worker is safe in the dev preview and in production.
 *
 * Bump CACHE_VERSION to force clients onto a fresh set of caches.
 */
const CACHE_VERSION = 'v2'
const SHELL_CACHE = `maxxit-shell-${CACHE_VERSION}`
const ASSET_CACHE = `maxxit-assets-${CACHE_VERSION}`
const FONT_CACHE = `maxxit-fonts-${CACHE_VERSION}`
const CURRENT_CACHES = new Set([SHELL_CACHE, ASSET_CACHE, FONT_CACHE])

// App shell + static icons. allSettled so a single 404 never breaks install.
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/favicon.svg',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !CURRENT_CACHES.has(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

// Allow the page to trigger an immediate activation of a waiting worker.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function isFontHost(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
}

// Same-origin things that are safe to cache aggressively:
//  - Vite's hashed production bundles under /assets/ (filename changes on every build)
//  - root-level static images / fonts / manifest shipped from public/
// Deliberately excludes /src/*, /@vite/*, /@react-refresh and dep .js so dev HMR is untouched.
function isCacheableAsset(url) {
  if (url.pathname.startsWith('/assets/')) return true
  return /\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico|webmanifest)$/.test(url.pathname)
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only ever touch GET. POST/PUT/etc (Supabase writes, auth) go straight to the network.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Top-level navigations: network-first so the freshest shell wins, with the
  // cached index.html as the offline fallback. Keeps the dev shell fresh too.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => {})
          return response
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/'))),
    )
    return
  }

  // Cross-origin: only Google Fonts are cached (stale-while-revalidate).
  // Everything else cross-origin — most importantly Supabase — is left untouched.
  if (url.origin !== self.location.origin) {
    if (isFontHost(url)) {
      event.respondWith(staleWhileRevalidate(request, FONT_CACHE))
    }
    return
  }

  // Same-origin hashed assets + static icons: cache-first.
  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  // Anything else same-origin (dev modules, HMR, etc.): plain network, no caching.
})

function cacheFirst(request, cacheName) {
  return caches.match(request).then((cached) => {
    if (cached) return cached
    return fetch(request).then((response) => {
      if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
        const copy = response.clone()
        caches.open(cacheName).then((cache) => cache.put(request, copy)).catch(() => {})
      }
      return response
    })
  })
}

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            cache.put(request, response.clone()).catch(() => {})
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    }),
  )
}
