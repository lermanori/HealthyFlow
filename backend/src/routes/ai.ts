import express from 'express'
import { z } from 'zod'
import { db } from '../supabase-client'
import { Openai } from '../openai'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

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

// AI-powered task query endpoint
router.post('/query-tasks', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { question } = req.body

  try {
    const tasks = await db.getTasksByUserId(userId)

    if (!process.env.OPENAI_API_KEY) {
      // Mock answer for development
      return res.json({
        answer: `You asked: "${question}". You have ${tasks.length} tasks. (AI answer would go here.)`,
      })
    }

    const result = await Openai.callText({
      model: 'gpt-3.5-turbo',
      systemPrompt:
        "You are a productivity assistant. Answer questions about the user's tasks based on the provided data.",
      userPrompt: `Tasks: ${JSON.stringify(tasks)}\nQuestion: ${question}`,
      temperature: 0.5,
      maxTokens: 500,
    })

    if (!result.ok) {
      return res.json({ answer: 'AI service unavailable.' })
    }
    res.json({ answer: result.value || 'No answer generated.' })
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

  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const result = await Openai.callStructured({
    model: 'gpt-4o-mini',
    systemPrompt: `Convert user input into a list of HealthyFlow Items.

Each Item is either a Task (one-shot, repeat: "none") or a Habit (recurring, repeat: "daily" or "weekly").

Field rules:
- category: one of health, work, personal, fitness, grocery, nutrition
- duration: estimated minutes (positive integer)
- startTime: "HH:MM" 24h or null if flexible
- scheduledDate: "YYYY-MM-DD"; for Habits use today's date (${today})
- "tomorrow" -> ${tomorrow}, "tonight"/"evening" -> today, "this weekend" -> next Saturday`,
    userPrompt: text,
    temperature: 0.2,
    schemaName: 'parsed_items',
    jsonSchema: PARSED_ITEMS_JSON_SCHEMA,
    parser: (v) => ParsedItems.parse(v),
  })

  if (!result.ok) {
    return res.status(500).json({ error: 'Could not parse — try again' })
  }
  res.json(result.value)
})

export { router as aiRoutes }
