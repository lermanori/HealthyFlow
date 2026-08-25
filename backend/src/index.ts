import './load-env'
import { logger } from './utils/logger'
import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import { authRoutes } from './routes/auth'
import { taskRoutes } from './routes/tasks'
import { summaryRoutes } from './routes/summary'
import { aiRoutes } from './routes/ai'
import { analyticsRoutes } from './routes/analytics'
import { adminRoutes } from './routes/admin'
import { projectRoutes } from './routes/projects'
import { workRoutes } from './routes/work'
import { calendarRoutes } from './routes/calendar'
import { creditsRoutes } from './routes/credits'
import { settingsRoutes } from './routes/settings'
import { syncRoutes } from './routes/sync'
import { caloriesRoutes } from './routes/calories'
import { weightRoutes } from './routes/weight'
import { achievementRoutes } from './routes/achievements'
import { workoutRoutes } from './routes/workouts'
import { onboardingRoutes } from './routes/onboarding'
import { contactMessageRoutes } from './routes/contact-messages'
import { mcpRoutes } from './routes/mcp'
import { oauthRoutes } from './routes/oauth'
import { proactivityRoutes } from './routes/proactivity'
import { accountRoutes } from './routes/account'
import { daySummaryRoutes } from './routes/day-summary'
import { waitlistRoutes } from './routes/waitlist'
import { mobileRoutes } from './routes/mobile'
import { initDatabase } from './db/database'
import { db } from './supabase-client'
import { startProactivityScheduler } from './proactivity'
import { DURABLE_E2E_USER_EMAIL } from './account-data'

const app = express()
const PORT = process.env.PORT || 3001

// Trust the first proxy hop (Railway) so req.ip is the real client for rate limiting
app.set('trust proxy', 1)

// Middleware
// Restrict app APIs to HealthyFlow surfaces. ChatGPT additionally needs browser
// access to MCP/OAuth discovery and authorization while connecting an account.
const CORS_ROOT_DOMAINS = ['healthyflow.app', 'deluxe-souffle-b9b7f7.netlify.app']
const CHATGPT_CORS_ROOT_DOMAINS = ['chatgpt.com']
const originMatchesRoots = (origin: string, roots: string[]): boolean => {
  let hostname: string
  try {
    hostname = new URL(origin).hostname
  } catch {
    return false
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  return roots.some(
    (root) =>
      hostname === root ||
      hostname.endsWith(`.${root}`) ||
      // Netlify deploy/branch previews: `<context>--<site>.netlify.app`
      hostname.endsWith(`--${root}`)
  )
}
const isAllowedOrigin = (origin: string) =>
  originMatchesRoots(origin, CORS_ROOT_DOMAINS)
const isAllowedMcpOAuthOrigin = (origin: string) =>
  isAllowedOrigin(origin) ||
  originMatchesRoots(origin, CHATGPT_CORS_ROOT_DOMAINS)
const corsFor = (isAllowed: (origin: string) => boolean) =>
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (curl, server-to-server, health checks) with no Origin header.
      if (!origin || isAllowed(origin)) return callback(null, true)
      callback(new Error(`Origin not allowed by CORS: ${origin}`))
    },
  })
const appCors = corsFor(isAllowedOrigin)
const mcpOAuthCors = corsFor(isAllowedMcpOAuthOrigin)
const isMcpOAuthCorsPath = (path: string) =>
  path === '/mcp' ||
  path.startsWith('/mcp/') ||
  path.startsWith('/oauth/') ||
  path.startsWith('/.well-known/oauth-')

app.use((req, res, next) =>
  isMcpOAuthCorsPath(req.path)
    ? mcpOAuthCors(req, res, next)
    : appCors(req, res, next)
)

app.use(
  '/mcp',
  express.raw({ type: 'application/octet-stream', limit: '1mb' }),
  (req, res, next) => {
    if (req.method !== 'POST') return next()

    const overrideHeader = (name: string, value: string) => {
      const normalizedName = name.toLowerCase()
      req.headers[normalizedName] = value
      const rawIndex = req.rawHeaders.findIndex(
        (header, index) =>
          index % 2 === 0 && header.toLowerCase() === normalizedName
      )
      if (rawIndex >= 0) req.rawHeaders[rawIndex + 1] = value
      else req.rawHeaders.push(name, value)
    }

    if (Buffer.isBuffer(req.body)) {
      try {
        req.body = JSON.parse(req.body.toString('utf8'))
        overrideHeader('Content-Type', 'application/json')
      } catch {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
          id: null,
        })
      }
    }

    const accept = req.header('accept')
    if (
      !accept?.includes('application/json') ||
      !accept.includes('text/event-stream')
    ) {
      overrideHeader('Accept', 'application/json, text/event-stream')
    }
    next()
  }
)
app.use(express.json({ limit: '6mb' }))

// Initialize database (disabled - using Supabase instead)
// initDatabase()

// Routes
app.use(oauthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api', summaryRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/work', workRoutes)
app.use('/api/calendar', calendarRoutes)
app.use('/api/credits', creditsRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/sync', syncRoutes)
app.use('/api/calories', caloriesRoutes)
app.use('/api/weight', weightRoutes)
app.use('/api/achievements', achievementRoutes)
app.use('/api/workouts', workoutRoutes)
app.use('/api/onboarding', onboardingRoutes)
app.use('/api/contact-messages', contactMessageRoutes)
app.use('/mcp/chatgpt', mcpRoutes)
app.use('/mcp', mcpRoutes)
app.use('/api/proactivity', proactivityRoutes)
app.use('/api/account', accountRoutes)
app.use('/api/day-summary', daySummaryRoutes)
app.use('/api/waitlist', waitlistRoutes)
app.use('/api/mobile', mobileRoutes)

// Test-mode reset route — 404 in production, mounted only when HF_TEST_MODE=1
if (process.env.HF_TEST_MODE === '1') {
  const TestResetSchema = z.object({
    onboardingStatus: z.enum(['active', 'completed', 'skipped']).optional(),
  })
  app.post('/test/reset', async (req, res) => {
    const parsed = TestResetSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid test reset request' })
    }
    try {
      const user = await db.getUserByEmail(DURABLE_E2E_USER_EMAIL)
      if (!user) {
        return res.status(503).json({
          error: `Missing pre-provisioned test user ${DURABLE_E2E_USER_EMAIL}`,
        })
      }
      await db.resetTestUser(user.id, parsed.data)
      res.json({ ok: true })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    features: [
      'Task Management',
      'Habit Tracking', 
      'AI Recommendations',
      'Smart Reminders',
      'Weekly Analytics',
      'Drag & Drop Timeline'
    ]
  })
})

export { app }

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`🚀 HealthyFlow Server running on port ${PORT}`)
    logger.info(`📊 Features: Task Management, AI Recommendations, Smart Reminders`)
    logger.info(`🔗 API Health: http://localhost:${PORT}/api/health`)
    startProactivityScheduler()
  })
}
