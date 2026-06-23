const CACHE_NAME = 'healthyflow-v2.1.0'
const STATIC_CACHE = 'healthyflow-static-v2.1.0'
const DYNAMIC_CACHE = 'healthyflow-dynamic-v2.1.0'

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Add other critical assets
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('SW: Installing...')
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('SW: Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      }),
      self.skipWaiting()
    ])
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('SW: Activating...')
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('SW: Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      }),
      self.clients.claim()
    ])
  )
})

// Fetch event - API bypasses the SW (always live), cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // NEVER intercept or cache /api/ — task state is mutable and must always be live.
  // Caching API GETs here served stale data after a mutation (e.g. dragging a habit
  // to a time slot persisted on the server but reverted on refresh). React Query
  // already provides in-app caching + invalidation. Let these hit the network directly.
  if (url.pathname.startsWith('/api/')) return

  // Handle static assets with cache-first strategy
  if (request.destination === 'image' || 
      request.destination === 'style' || 
      request.destination === 'script' ||
      request.destination === 'manifest') {
    event.respondWith(cacheFirstStrategy(request))
    return
  }

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request))
    return
  }

  // Default to network first
  event.respondWith(networkFirstStrategy(request))
})

// Network-first strategy (default fallthrough for misc GETs). Does not cache —
// /api/ is bypassed entirely above, and we don't want to serve stale data.
async function networkFirstStrategy(request) {
  try {
    return await fetch(request)
  } catch (error) {
    console.log('SW: Network failed, trying cache:', request.url)
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
  }
}

// Cache-first strategy for static assets
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request)
  
  if (cachedResponse) {
    return cachedResponse
  }
  
  try {
    const networkResponse = await fetch(request)
    
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.log('SW: Failed to fetch asset:', request.url)
    throw error
  }
}

// Navigation strategy for page requests
async function navigationStrategy(request) {
  try {
    const networkResponse = await fetch(request)
    return networkResponse
  } catch (error) {
    console.log('SW: Navigation failed, serving cached app shell')
    const cachedResponse = await caches.match('/')
    return cachedResponse || new Response('Offline', { status: 503 })
  }
}

// Background sync for offline task creation
self.addEventListener('sync', (event) => {
  console.log('SW: Background sync triggered:', event.tag)
  
  if (event.tag === 'background-sync-tasks') {
    event.waitUntil(syncOfflineTasks())
  }
})

// Sync offline tasks when connection is restored
async function syncOfflineTasks() {
  try {
    console.log('SW: Syncing offline tasks...')
    
    // Get offline tasks from IndexedDB (if implemented)
    // This would sync any tasks created while offline
    
    // Notify the main app that sync is complete
    const clients = await self.clients.matchAll()
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        data: { success: true }
      })
    })
  } catch (error) {
    console.error('SW: Failed to sync offline tasks:', error)
  }
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('SW: Push notification received')
  
  const options = {
    body: event.data ? event.data.text() : 'New notification from HealthyFlow',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: '/icons/icon-96x96.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/icon-96x96.png'
      }
    ],
    requireInteraction: true,
    silent: false
  }

  event.waitUntil(
    self.registration.showNotification('HealthyFlow', options)
  )
})

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('SW: Notification clicked:', event.action)
  event.notification.close()

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url === self.registration.scope && 'focus' in client) {
            return client.focus()
          }
        }
        
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow('/')
        }
      })
    )
  }
})

// Handle app shortcuts
self.addEventListener('notificationclick', (event) => {
  if (event.action === 'add-task') {
    event.waitUntil(clients.openWindow('/add'))
  } else if (event.action === 'week-view') {
    event.waitUntil(clients.openWindow('/week'))
  }
})

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-sync') {
    event.waitUntil(performDailySync())
  }
})

async function performDailySync() {
  console.log('SW: Performing daily sync...')
  // Sync user data, update caches, etc.
}