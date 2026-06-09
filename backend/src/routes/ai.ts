import express from 'express'
import { v4 as uuidv4 } from 'uuid'
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

// AI-powered task parsing endpoint (convert free-form text to structured tasks)
router.post('/parse-tasks', authenticateToken, async (req: AuthRequest, res) => {
  const { text, apiKey } = req.body

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text input is required' })
  }

  try {
    const effectiveKey = apiKey || process.env.OPENAI_API_KEY
    if (!effectiveKey) {
      return res.status(400).json({ error: 'OpenAI API key required' })
    }

    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Convert user input into actionable tasks with smart date scheduling. Respond ONLY with a valid JSON array.

Required fields for each task:
- title: Clear, specific task name
- category: "health", "work", "personal", or "fitness"
- estimatedDuration: Time in minutes
- priority: "high", "medium", or "low"
- type: "habit" for daily activities, "task" for one-time
- startTime: "HH:MM" format (24-hour) or null for flexible
- scheduledDate: "YYYY-MM-DD" format

SMART DATE SCHEDULING RULES:
- If user mentions "today" or "now" → use today's date
- If user mentions "tomorrow" → use tomorrow's date
- If user mentions "this weekend" → use next Saturday
- If user mentions "next week" → use next Monday
- If user mentions "morning" → schedule for today if before 12pm, tomorrow if after
- If user mentions "evening" or "tonight" → schedule for today
- If user mentions specific days (Monday, Tuesday, etc.) → use the next occurrence
- If no time context → use today's date as default
- For habits → ALWAYS use today's date (habits will automatically recur daily)
- For work tasks → prefer weekdays
- For personal tasks → can be any day

IMPORTANT: Daily habits will automatically appear every day once created, so always use today's date for habits regardless of user input.

Today's date: ${today}
Tomorrow's date: ${tomorrow}
Current time: ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}

Example input: "I want to start meditating daily and go to the gym tomorrow morning"
Example output:
[
  {
    "title": "Daily meditation",
    "category": "health",
    "estimatedDuration": 15,
    "priority": "high",
    "type": "habit",
    "startTime": "07:00",
    "scheduledDate": "${today}"
  },
  {
    "title": "Gym workout",
    "category": "fitness",
    "estimatedDuration": 60,
    "priority": "high",
    "type": "task",
    "startTime": "07:00",
    "scheduledDate": "${tomorrow}"
  }
]`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    })

    if (!openaiRes.ok) {
      const errorData = await openaiRes.json().catch(() => ({})) as any
      throw new Error(`OpenAI API error: ${openaiRes.statusText} - ${errorData.error?.message || 'Unknown error'}`)
    }

    const data = await openaiRes.json() as any
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('No response from OpenAI')
    }

    try {
      // Clean the response in case there's any extra text
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      const jsonString = jsonMatch ? jsonMatch[0] : content
      
      const tasks = JSON.parse(jsonString)
      
      if (!Array.isArray(tasks)) {
        throw new Error('Response is not an array')
      }

      const parsedTasks = tasks.map((task: any, index: number) => ({
        id: `ai-task-${index}-${Date.now()}`,
        title: task.title || 'Untitled Task',
        category: task.category || 'personal',
        estimatedDuration: task.estimatedDuration || 30,
        priority: task.priority || 'medium',
        type: task.type || 'task',
        startTime: task.startTime,
        scheduledDate: task.scheduledDate || today
      }))

      res.json({ tasks: parsedTasks })
    } catch (error) {
      console.error('Failed to parse OpenAI response:', content)
      throw new Error('Failed to parse AI response - please try again')
    }
  } catch (error) {
    console.error('AI parsing error:', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to parse tasks' })
  }
})

export { router as aiRoutes }