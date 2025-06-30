import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/database'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { AIService } from '../services/aiService'

const router = express.Router()

// Get AI recommendations
router.post('/recommend', authenticateToken, (req, res) => {
  const userId = req.user.userId

  // Get user's recent task completion data
  db.all(`
    SELECT category, completed, type, created_at
    FROM tasks 
    WHERE user_id = ? 
    AND created_at >= date('now', '-7 days')
    ORDER BY created_at DESC
  `, [userId], (err, tasks: any[]) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    // Generate AI recommendations using the improved service
    const recommendations = AIService.generateRecommendations(tasks)

    // Store recommendations in database
    recommendations.forEach(rec => {
      db.run(`
        INSERT INTO ai_recommendations (id, user_id, message, type)
        VALUES (?, ?, ?, ?)
      `, [rec.id, userId, rec.message, rec.type])
    })

    res.json(recommendations)
  })
})

// Get personalized tips
router.get('/tips', authenticateToken, (req, res) => {
  const userId = req.user.userId

  // Get user preferences and history
  db.all(`
    SELECT category, AVG(CASE WHEN completed = 1 THEN 1.0 ELSE 0.0 END) as completion_rate
    FROM tasks 
    WHERE user_id = ? 
    AND created_at >= date('now', '-30 days')
    GROUP BY category
  `, [userId], (err, categoryStats: any[]) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    const tips = AIService.generatePersonalizedTips({ categoryStats })
    res.json(tips)
  })
})

// Get motivational message
router.get('/motivation', authenticateToken, (req, res) => {
  const userId = req.user.userId
  const currentHour = new Date().getHours()

  // Get today's progress
  db.all(`
    SELECT COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
    FROM tasks 
    WHERE user_id = ? 
    AND DATE(created_at) = DATE('now')
  `, [userId], (err, progress: any[]) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    const todayProgress = progress[0] || { total: 0, completed: 0 }
    const completionRate = todayProgress.total > 0 ? todayProgress.completed / todayProgress.total : 0

    let message = ''
    let type = 'encouragement'

    if (currentHour < 12) {
      if (completionRate > 0.5) {
        message = "What an amazing morning! You're already crushing your goals. Keep this energy going! ☀️"
      } else {
        message = "Good morning! Today is full of possibilities. Let's make it count! 🌅"
      }
    } else if (currentHour < 18) {
      if (completionRate > 0.7) {
        message = "Incredible afternoon progress! You're on fire today! 🔥"
      } else {
        message = "The day is still young! Every small step forward is progress worth celebrating. 💪"
      }
    } else {
      if (completionRate > 0.6) {
        message = "What a productive day! Take a moment to appreciate how much you've accomplished. 🌟"
      } else {
        message = "Tomorrow is a fresh start! Rest well and prepare for another opportunity to shine. 🌙"
      }
    }

    res.json({
      id: uuidv4(),
      message,
      type,
      createdAt: new Date().toISOString()
    })
  })
})

// OpenAI Integration endpoint (when user provides API key)
router.post('/openai-recommendations', authenticateToken, async (req, res) => {
  const { taskHistory, apiKey } = req.body
  
  if (!apiKey) {
    return res.status(400).json({ error: 'OpenAI API key required' })
  }

  try {
    // This would integrate with OpenAI API
    // For now, return enhanced recommendations
    const recommendations = AIService.generateRecommendations(taskHistory).map(rec => ({
      ...rec,
      message: `[AI Enhanced] ${rec.message}`,
      source: 'openai'
    }))

    res.json(recommendations)
  } catch (error) {
    res.status(500).json({ error: 'Failed to get OpenAI recommendations' })
  }
})

// AI-powered task query endpoint
router.post('/query-tasks', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { question } = req.body

  // Fetch all tasks for the user
  db.all('SELECT * FROM tasks WHERE user_id = ?', [userId], async (err, tasks) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    // Use OpenAI or a placeholder to generate an answer
    // For now, use a mock response
    // In production, call OpenAI API with a prompt like:
    // "Given the following tasks: ... and the question: ... generate a helpful answer."
    let answer = ''
    if (process.env.OPENAI_API_KEY) {
      try {
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'You are a productivity assistant. Answer questions about the user\'s tasks based on the provided data.' },
              { role: 'user', content: `Tasks: ${JSON.stringify(tasks)}\nQuestion: ${question}` }
            ],
            temperature: 0.5,
            max_tokens: 500
          })
        })
        const data = await openaiRes.json()
        answer = data.choices?.[0]?.message?.content?.trim() || 'No answer generated.'
      } catch (e) {
        answer = 'AI service unavailable.'
      }
    } else {
      // Mock answer for development
      answer = `You asked: "${question}". You have ${tasks.length} tasks. (AI answer would go here.)`
    }
    res.json({ answer })
  })
})

export { router as aiRoutes }