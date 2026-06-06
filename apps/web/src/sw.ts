/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA navigation fallback — serve index.html for all navigation requests
// except API/auth/static-file endpoints and security-critical app routes.
// Excluding /admin, /talent, /hm, /hr ensures those routes always hit the
// network after a deploy instead of getting a stale cached shell.
const navigationHandler = createHandlerBoundToURL('/index.html')
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [
      /^\/api\//,
      /^\/auth\/callback/,
      /\.(?:xml|txt|json|map)$/,
      /^\/(admin|talent|hm|hr)(\/|$)/,
    ],
  })
)

// Supabase REST/RPC — never cache; auth decisions must hit the network.
registerRoute(
  ({ url }) => url.origin === 'https://sfnrpbsdscikpmbhrzub.supabase.co',
  new NetworkOnly()
)

// Same-origin images (og-image, favicon, etc.) — cache-first, 30-day TTL.
registerRoute(
  ({ request, url }) =>
    request.destination === 'image' && url.origin === self.location.origin,
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
)

// SEO silo pages — stale-while-revalidate so repeat visitors get instant nav
// while the SW silently updates in the background.
registerRoute(
  ({ url }) =>
    /^\/(careers(?:\/[^/?]+)?|jobs\/[^/?]+|jobs-in-[^/?]+|hire-[^/?]+)\/?(?:\?.*)?$/.test(
      url.pathname
    ),
  new StaleWhileRevalidate({
    cacheName: 'seo-pages',
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 }),
    ],
  })
)

// ─── Web Push handlers ─────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  const data = (event.data?.json() ?? {}) as {
    title?: string
    body?: string
    url?: string
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'DNJ', {
      body: data.body ?? 'You have a new match waiting.',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.url ?? '/home' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rawUrl = (event.notification.data as { url?: unknown }).url
  // Validate same-origin before opening — a malicious push payload must not
  // be able to navigate the user to an arbitrary external URL.
  let safeUrl = '/home'
  try {
    const parsed = new URL(String(rawUrl ?? '/home'), self.location.origin)
    if (parsed.origin === self.location.origin) {
      safeUrl = parsed.pathname + parsed.search + parsed.hash
    }
  } catch { /* keep /home fallback */ }
  event.waitUntil(self.clients.openWindow(safeUrl))
})
