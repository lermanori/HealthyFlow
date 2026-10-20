import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// A release build that silently points at localhost ships an app where nothing
// works (#334). Fail the build instead: every build needs VITE_API_URL, and a
// production build may not aim at this machine.
function assertApiUrl(mode: string) {
  const url = loadEnv(mode, process.cwd(), '').VITE_API_URL
  if (!url) throw new Error(`VITE_API_URL is not set for the "${mode}" build.`)
  if (mode === 'production' && /localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`The production build points VITE_API_URL at ${url}.`)
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build') assertApiUrl(mode)
  return {
    plugins: [
      react(),
      {
        // Mirrors the netlify.toml routing so `/` serves the marketing page and the
        // legacy public routes redirect into the app — in dev exactly as in prod.
        // Registered in configureServer so it runs before Vite's SPA history fallback.
        name: 'healthyflow-landing-at-root',
        configureServer(server) {
          // Every path the app owned before it moved under /app. Redirecting these
          // rescues existing bookmarks, PWA shortcuts, and notification deep links.
          // An explicit list rather than a catch-all: a catch-all would hijack Vite's
          // own module URLs in dev and swallow genuine 404s in prod.
          const legacyRoutes = [
            '/demo', '/privacy', '/terms', '/support', '/add', '/week', '/talk', '/settings',
            '/calories', '/achievements', '/workouts', '/token-manager',
            '/meal-ocr-lab', '/assistant',
          ]
          server.middlewares.use((req, res, next) => {
            const [path] = (req.url ?? '').split('?')
            if (path === '/' || path === '/index.html') {
              req.url = '/landing.html'
              return next()
            }
            if (legacyRoutes.includes(path)) {
              res.statusCode = 301
              res.setHeader('Location', `/app${req.url}`)
              return res.end()
            }
            next()
          })
        },
      },
    ],
    server: {
      proxy: {
        '/api': {
          // Overridable so an e2e run can start its own backend on a free port
          // instead of proxying to a dev server from another checkout.
          target: `http://localhost:${process.env.HF_E2E_API_PORT ?? 3001}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            router: ['react-router-dom'],
            ui: ['framer-motion', 'lucide-react'],
            query: ['@tanstack/react-query'],
          }
        }
      }
    },
    // PWA optimizations
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    }
  }
})
