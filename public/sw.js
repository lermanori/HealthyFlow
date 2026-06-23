const CACHE_VERSION = 'healthyflow-v3'
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`
const ASSET_CACHE = `${CACHE_VERSION}-assets`

const APP_SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/maskable-192x192.png',
  '/icons/maskable-512x512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => !cacheName.startsWith(CACHE_VERSION))
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // API data is mutable. React Query handles in-app caching, so network requests
  // should always reach the backend instead of being served stale by the worker.
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(fetch(request))
})

self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification from HealthyFlow',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: {
      url: '/',
    },
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: '/icons/icon-96x96.png',
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/icon-96x96.png',
      },
    ],
  }

  event.waitUntil(self.registration.showNotification('HealthyFlow', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'close') return

  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const matchingClient = clientList.find((client) => client.url === self.registration.scope)
      if (matchingClient && 'focus' in matchingClient) {
        return matchingClient.focus()
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})

async function handleNavigation(request) {
  try {
    return await fetch(request)
  } catch (error) {
    const cachedShell = await caches.match('/')
    return cachedShell || new Response('Offline', { status: 503 })
  }
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request)
  if (cachedResponse) return cachedResponse

  const networkResponse = await fetch(request)
  if (networkResponse.ok) {
    const cache = await caches.open(ASSET_CACHE)
    cache.put(request, networkResponse.clone())
  }

  return networkResponse
}

function isStaticAsset(request) {
  return ['font', 'image', 'manifest', 'script', 'style'].includes(request.destination)
}
