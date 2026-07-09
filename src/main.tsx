import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { analytics } from './lib/analytics'
import PageViewTracker from './lib/analytics/PageViewTracker'
import './index.css'

analytics.init()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PageViewTracker />
        <AuthProvider>
          <App />
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#363636',
                color: '#fff',
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

const isViteDevServer = location.port === '5173'

if ('serviceWorker' in navigator && !isViteDevServer) {
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
