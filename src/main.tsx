import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { MotionConfig } from 'framer-motion'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { analytics } from './lib/analytics'
import { appRouterBasename, initializeNativeApp, isNativeApp } from './lib/native'
import PageViewTracker from './lib/analytics/PageViewTracker'
import NativeVersionGate from './components/NativeVersionGate'
import './index.css'
import { API_BASE_URL } from './services/api'
import { CLOUD_SYNC_ENABLED } from './featureFlags'

// Which build is this, and where is it pointed? Answering that from the
// console ends a whole class of confusion: a simulator serving a stale
// production bundle looks exactly like a backend that never answered.
console.info('[build]', { api: API_BASE_URL, cloudSync: CLOUD_SYNC_ENABLED })

analytics.init()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
    mutations: {
      /**
       * Writes are local, so being offline is not a reason to hold them.
       *
       * React Query defaults to `networkMode: 'online'`, which *pauses* a
       * mutation while the device is offline — the function is never called at
       * all, whether or not it touches the network. Every write here goes to the
       * Local day first (ADR-0011), so the default turned "works offline" into
       * "does nothing offline": adding, completing, editing, deleting and
       * reordering an Item all sat paused until connectivity returned.
       *
       * A write that genuinely needs the network still fails on its own terms —
       * an AI action returns its typed refusal rather than hanging, which is the
       * honest outcome and the one the app already knows how to explain.
       */
      networkMode: 'always',
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={appRouterBasename}>
        <NativeVersionGate>
          <PageViewTracker />
          <AuthProvider>
            <MotionConfig reducedMotion="user">
              <App />
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 3000,
                  style: {
                    background: 'rgb(var(--surface-overlay))',
                    color: 'rgb(var(--text-primary))',
                    border: '1px solid rgb(var(--border-default))',
                    borderRadius: 'var(--radius-control)',
                    boxShadow: 'var(--shadow-overlay)',
                  },
                }}
              />
            </MotionConfig>
          </AuthProvider>
        </NativeVersionGate>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

const isViteDevServer = import.meta.env.DEV

if ('serviceWorker' in navigator && !isViteDevServer && !isNativeApp) {
  let refreshingForServiceWorker = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshingForServiceWorker) return
    refreshingForServiceWorker = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new Event('healthyflow:update-ready'))
            }
          })
        })
      })
      .catch((error) => {
        console.error('Service worker registration failed:', error)
      })
  })

  // Re-verify the push subscription on every app open (iOS silently expires them).
  window.addEventListener('load', () => {
    import('./lib/push').then(({ ensurePushSubscription }) => ensurePushSubscription())
  })
}

if (isNativeApp) {
  window.addEventListener('load', () => {
    import('./lib/push')
      .then(({ ensurePushSubscription }) => ensurePushSubscription())
      .catch((error) => {
        console.error('Native push registration check failed:', error)
      })
  })
}

void initializeNativeApp().catch((error) => {
  console.error('Native app initialization failed:', error)
})
