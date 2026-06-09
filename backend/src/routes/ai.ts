import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { AIService } from '../services/aiService'

const router = express.Router()

// Get AI recommendations for the week
router.get('/recommendations', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { weekStart, weekEnd } = req.query

  try {
    const tasks = await db.getWeeklyTasks(userId)
    // Ensure created_at is included
    const recommendations = AIService.generateRecommendations(tasks.map((task: any) => ({
      category: task.category,
      completed: task.completed,
      type: task.type,
      created_at: task.created_at || new Date().toISOString()
    })))
    res.json(recommendations)
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Get personalized tips
router.get('/tips', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  try {
    const stats = await db.getMonthlyCategoryStats(userId)
    const tips = AIService.generatePersonalizedTips(stats)
    res.json(tips)
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Get motivation (fallback to recommendations)
router.get('/motivation', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  try {
    const progress = await db.getTodayProgress(userId)
    // Fallback: use generateRecommendations for motivation
    const recommendations = AIService.generateRecommendations(progress.map((task: any) => ({
      category: task.category || 'general',
      completed: task.completed,
      type: task.type || 'task',
      created_at: task.created_at || new Date().toISOString()
    })))
    // Return the first encouragement or suggestion as motivation
    const motivation = recommendations.find((rec: any) => rec.type === 'encouragement' || rec.type === 'suggestion') || recommendations[0]
    res.json(motivation)
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Query tasks for AI
router.get('/tasks', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  try {
    const tasks = await db.getTasksByUserId(userId)
    res.json(tasks)
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
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
  const { question, apiKey } = req.body

  try {
    // Fetch all tasks for the user
    const tasks = await db.getTasksByUserId(userId)

    // Use OpenAI or a placeholder to generate an answer
    // For now, use a mock response
    // In production, call OpenAI API with a prompt like:
    // "Given the following tasks: ... and the question: ... generate a helpful answer."
    let answer = ''
    const effectiveKey = apiKey || process.env.OPENAI_API_KEY
    if (effectiveKey) {
      try {
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveKey}`
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
        const data = await openaiRes.json() as any
        answer = data.choices?.[0]?.message?.content?.trim() || 'No answer generated.'
      } catch (e) {
        answer = 'AI service unavailable.'
      }
    } else {
      // Mock answer for development
      answer = `You asked: "${question}". You have ${tasks.length} tasks. (AI answer would go here.)`
    }
    res.json({ answer })
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// AI-powered Item parser: free-form text -> validated { items: ParsedItem[] }.
// See CONTEXT.md (Item / Task / Habit / parse-tasks) and
// .scratch/ai-harness-v1/PRD.md for the contract.
const ParsedItem = z.object({
  title: z.string().min(1),
  type: z.enum(['task', 'habit']),
  category: z.enum(['health', 'work', 'personal', 'fitness', 'grocery', 'nutrition']),
  duration: z.number().int().positive(),
  priority: z.enum(['high', 'medium', 'low']),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  repeat: z.enum(['daily', 'weekly', 'none']),
})
const ParsedItems = z.object({ items: z.array(ParsedItem).max(20) })
const PARSED_ITEMS_JSON_SCHEMA = z.toJSONSchema(ParsedItems)

router.post('/parse-tasks', authenticateToken, async (req: AuthRequest, res) => {
  const { text } = req.body

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text input is required' })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Could not parse — try again' })
  }

  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Convert user input into a list of HealthyFlow Items.

Each Item is either a Task (one-shot, repeat: "none") or a Habit (recurring, repeat: "daily" or "weekly").

Field rules:
- category: one of health, work, personal, fitness, grocery, nutrition
- duration: estimated minutes (positive integer)
- startTime: "HH:MM" 24h or null if flexible
- scheduledDate: "YYYY-MM-DD"; for Habits use today's date (${today})
- "tomorrow" -> ${tomorrow}, "tonight"/"evening" -> today, "this weekend" -> next Saturday`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'parsed_items',
            schema: PARSED_ITEMS_JSON_SCHEMA,
            strict: true,
          },
        },
      }),
    })

    if (!openaiRes.ok) {
      console.error('OpenAI upstream error:', openaiRes.status, openaiRes.statusText)
      return res.status(500).json({ error: 'Could not parse — try again' })
    }

    const data = (await openaiRes.json()) as any
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      console.error('OpenAI response missing content:', data)
      return res.status(500).json({ error: 'Could not parse — try again' })
    }

    const parsed = ParsedItems.parse(JSON.parse(content))
    res.json(parsed)
  } catch (error) {
    console.error('parse-tasks failed:', error)
    res.status(500).json({ error: 'Could not parse — try again' })
  }
})

export { router as aiRoutes }