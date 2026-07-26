import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      // Mirrors the netlify.toml routing so `/` serves the marketing page and the
      // legacy public routes redirect into the app — in dev exactly as in prod.
      // Registered in configureServer so it runs before Vite's SPA history fallback.
      name: 'healthyflow-landing-at-root',
      configureServer(server) {
        const legacyRoutes = ['/demo', '/privacy', '/terms']
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
        target: 'http://localhost:3001',
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
})