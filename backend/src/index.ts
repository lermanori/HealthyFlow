import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { authRoutes } from './routes/auth'
import { taskRoutes } from './routes/tasks'
import { summaryRoutes } from './routes/summary'
import { aiRoutes } from './routes/ai'
import { analyticsRoutes } from './routes/analytics'
import { adminRoutes } from './routes/admin'
import { projectRoutes } from './routes/projects'
import { calendarRoutes } from './routes/calendar'
import { creditsRoutes } from './routes/credits'
import { settingsRoutes } from './routes/settings'
import { caloriesRoutes } from './routes/calories'
import { weightRoutes } from './routes/weight'
import { achievementRoutes } from './routes/achievements'
import { workoutRoutes } from './routes/workouts'
import { onboardingRoutes } from './routes/onboarding'
import { contactMessageRoutes } from './routes/contact-messages'
import { initDatabase } from './db/database'
import { db } from './supabase-client'

// Load .env from parent directory
dotenv.config({ path: path.join(__dirname, '../.env') })

const app = express()
const PORT = process.env.PORT || 3001

// Trust the first proxy hop (Railway) so req.ip is the real client for rate limiting
app.set('trust proxy', 1)

// Middleware
app.use(cors())
app.use(express.json({ limit: '6mb' }))

// Initialize database (disabled - using Supabase instead)
// initDatabase()

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api', summaryRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/calendar', calendarRoutes)
app.use('/api/credits', creditsRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/calories', caloriesRoutes)
app.use('/api/weight', weightRoutes)
app.use('/api/achievements', achievementRoutes)
app.use('/api/workouts', workoutRoutes)
app.use('/api/onboarding', onboardingRoutes)
app.use('/api/contact-messages', contactMessageRoutes)

// Test-mode reset route — 404 in production, mounted only when HF_TEST_MODE=1
if (process.env.HF_TEST_MODE === '1') {
  const TEST_USER_EMAIL = 'e2e@test.healthyflow.local'
  app.post('/test/reset', async (req, res) => {
    try {
      const user = await db.getUserByEmail(TEST_USER_EMAIL)
      if (user) await db.resetTestUser(user.id)
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
    console.log(`🚀 HealthyFlow Server running on port ${PORT}`)
    console.log(`📊 Features: Task Management, AI Recommendations, Smart Reminders`)
    console.log(`🔗 API Health: http://localhost:${PORT}/api/health`)
  })
}
