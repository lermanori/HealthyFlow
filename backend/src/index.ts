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
import { initDatabase } from './db/database'

// Load .env from parent directory
dotenv.config({ path: path.join(__dirname, '../.env') })

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Initialize database (disabled - using Supabase instead)
// initDatabase()

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api', summaryRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/admin', adminRoutes)

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

app.listen(PORT, () => {
  console.log(`🚀 HealthyFlow Server running on port ${PORT}`)
  console.log(`📊 Features: Task Management, AI Recommendations, Smart Reminders`)
  console.log(`🔗 API Health: http://localhost:${PORT}/api/health`)
})