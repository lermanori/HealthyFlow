import express from 'express'
import { z } from 'zod'
import { db } from '../supabase-client'
import { aiCapabilityTools, cancelPendingAiAction, executePendingAiAction } from '../ai-capabilities'
import {
  AiParsedMeals,
  defaultReview,
  evaluateOcrEvidence,
  NUTRITION_LABEL_OCR_JSON_SCHEMA,
  NUTRITION_LABEL_OCR_PROMPT,
  NUTRITION_LABEL_READING_RULES,
  NutritionLabelOcr,
  Openai,
  PARSED_MEALS_JSON_SCHEMA,
  TokenUsage,
  normalizeParsedMeal,
  nutritionLabelMealFromOcr,
} from '../openai'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { Credits, UnpricedModelError } from '../credits'

const ZERO_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
const QUERY_TASKS_MODEL = 'gpt-3.5-turbo'
const QUERY_TASKS_MAX_TOKENS = 500
const PARSE_TASKS_MODEL = 'gpt-4o-mini'
const PARSE_TASKS_MAX_TOKENS = 1000
const PARSE_MEALS_MODEL = 'gpt-4o-mini'
const PARSE_MEALS_MAX_TOKENS = 1000
const NUTRITION_LABEL_OCR_MAX_TOKENS = 1200
const CHAT_MODEL = 'gpt-4o-mini'
const CHAT_MAX_TOKENS = 700
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000
const CHAT_RATE_LIMIT_MAX = 12

const router = express.Router()
const chatRateLimit = new Map<string, { count: number; resetAt: number }>()

function unpricedModelResponse(res: express.Response, error: unknown) {
  if (error instanceof UnpricedModelError) {
    return res.status(500).json({ error: 'AI model pricing is not configured', code: 'unpriced_model' })
  }
  console.error('AI billing estimate failed:', error)
  return res.status(500).json({ error: 'AI billing failed', code: 'billing_error' })
}

function aiCallErrorResponse(
  res: express.Response,
  result: { code: string },
  fallback: { error: string; code: string }
) {
  if (result.code === 'insufficient_credits') {
    return res.status(402).json({ error: 'Insufficient AI tokens', code: 'insufficient_credits' })
  }
  if (result.code === 'unpriced_model') {
    return res.status(500).json({ error: 'AI model pricing is not configured', code: 'unpriced_model' })
  }
  if (result.code === 'billing_error') {
    return res.status(500).json({ error: 'AI billing failed', code: 'billing_error' })
  }
  return res.status(500).json(fallback)
}

function checkChatRateLimit(userId: string) {
  const now = Date.now()
  const current = chatRateLimit.get(userId)
  if (!current || current.resetAt <= now) {
    chatRateLimit.set(userId, { count: 1, resetAt: now + CHAT_RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (current.count >= CHAT_RATE_LIMIT_MAX) return false
  current.count += 1
  return true
}

const ChatMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
})

const ChatRequest = z.object({
  messages: z.array(ChatMessage).min(1).max(30),
})

const CHAT_SYSTEM_PROMPT = `You are the internal HealthyFlow assistant.

Answer questions using the provided HealthyFlow tools. Use the app vocabulary exactly: Item, Task, Habit, Habit instance, Calorie entry, Weight entry, Achievement, Workout session.

You can read data and you can use write tools when the user plainly asks for a change.

Write safety:
- Add-type tools may run directly when the user asks to add/log/create something.
- update_item, complete_task, and delete_item return a preview and require the user to Confirm or Cancel in the UI before the change is executed.
- Never say a confirm-class action is complete until the user has confirmed it.

Keep answers concise and grounded in tool results. If a tool result is empty, say that plainly.`

router.post('/chat', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = ChatRequest.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid chat input' })

  const userId = req.user.userId
  if (!checkChatRateLimit(userId)) {
    return res.status(429).json({ error: 'Too many assistant messages, please try again shortly.', code: 'rate_limited' })
  }

  const tools = aiCapabilityTools().map((tool) => ({
    ...tool,
    execute: (args: unknown) => tool.execute({ userId }, args),
  }))

  const result = await Openai.callBillableTools({
    userId,
    endpoint: 'ai-chat',
    model: CHAT_MODEL,
    systemPrompt: CHAT_SYSTEM_PROMPT,
    messages: parsed.data.messages,
    tools,
    temperature: 0.2,
    maxTokens: CHAT_MAX_TOKENS,
  })

  if (!result.ok) {
    return aiCallErrorResponse(res, result, {
      error: result.message || 'Assistant unavailable',
      code: result.code === 'tool_error' ? 'tool_error' : 'ai_chat_failed',
    })
  }

  const pendingAction = result.value.toolEvents
    .map((event) => (event.result as any)?.pendingAction)
    .find(Boolean) ?? null

  res.json({ ...result.value, pendingAction })
})

const ConfirmBody = z.object({
  actionId: z.string().uuid(),
})

router.post('/chat/confirm', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = ConfirmBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid pending action id' })

  try {
    res.json(await executePendingAiAction(req.user.userId, parsed.data.actionId))
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not confirm action' })
  }
})

router.post('/chat/cancel', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = ConfirmBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid pending action id' })

  try {
    res.json(await cancelPendingAiAction(req.user.userId, parsed.data.actionId))
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not cancel action' })
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

// AI-powered task query endpoint
router.post('/query-tasks', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { question } = req.body

  try {
    const tasks = await db.getTasksByUserId(userId)

    if (!process.env.OPENAI_API_KEY) {
      // ponytail: mock dev branch makes no real AI call, so skip reserve/settle entirely
      return res.json({
        answer: `You asked: "${question}". You have ${tasks.length} tasks. (AI answer would go here.)`,
      })
    }

    const systemPrompt =
      "You are a productivity assistant. Answer questions about the user's tasks based on the provided data."
    const userPrompt = `Tasks: ${JSON.stringify(tasks)}\nQuestion: ${question}`
    const result = await Openai.callBillableText({
      userId,
      endpoint: 'query-tasks',
      model: QUERY_TASKS_MODEL,
      systemPrompt,
      userPrompt,
      temperature: 0.5,
      maxTokens: QUERY_TASKS_MAX_TOKENS,
    })

    if (!result.ok) {
      return aiCallErrorResponse(res, result, {
        error: 'AI service unavailable',
        code: 'ai_unavailable',
      })
    }
    res.json({ answer: result.value || 'No answer generated.' })
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// AI-powered Item parser: free-form text -> validated { items: ParsedItem[] }.
// See CONTEXT.md (Item / Task / Habit / parse-tasks) for the contract.
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
const ParseTasksRequest = z.object({
  text: z.string().max(2000).optional(),
  defaultScheduleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  photo: z.object({
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    data: z.string().min(1),
  }).optional(),
})
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

function base64Size(data: string) {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return Math.floor((data.length * 3) / 4) - padding
}

router.post('/parse-tasks', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const parsedBody = ParseTasksRequest.safeParse(req.body)

  if (!parsedBody.success) {
    return res.status(400).json({ error: 'Invalid analyzer input' })
  }

  const { text, photo, defaultScheduleDate } = parsedBody.data
  const trimmedText = text?.trim() ?? ''

  if (!trimmedText && !photo) {
    return res.status(400).json({ error: 'Text input or photo is required' })
  }

  if (photo && base64Size(photo.data) > MAX_PHOTO_BYTES) {
    return res.status(400).json({ error: 'Photo must be 5MB or smaller' })
  }

  const today = new Date().toISOString().split('T')[0]
  const defaultDate = defaultScheduleDate ?? today
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const userContent = photo
    ? [
        {
          type: 'text' as const,
          text: `User text: ${trimmedText || '(none)'}

If a photo is provided, inspect it for visible text, handwritten notes, calendar entries, whiteboard plans, or objects that imply actionable HealthyFlow Items. Return only items that are reasonably supported by the text or image.`,
        },
        {
          type: 'image_url' as const,
          image_url: { url: `data:${photo.mimeType};base64,${photo.data}` },
        },
      ]
    : trimmedText
  const systemPrompt = `Convert user input into a list of HealthyFlow Items.

Each Item is either a Task (one-shot, repeat: "none") or a Habit (recurring, repeat: "daily" or "weekly").

Field rules:
- category: one of health, work, personal, fitness, grocery, nutrition
- duration: estimated minutes (positive integer)
- startTime: "HH:MM" 24h or null if flexible
- scheduledDate: "YYYY-MM-DD"; for Habits use today's date (${today})
- If the user does not specify a date, schedule Tasks for the selected default date (${defaultDate})
- "tomorrow" -> ${tomorrow}, "tonight"/"evening" -> today, "this weekend" -> next Saturday
- If a photo contains a list, calendar, sticky notes, handwritten plan, or screenshot, extract each actionable item.
- Do not invent personal details that are not present in the text or photo.`

  const result = await Openai.callBillableStructured({
    userId,
    endpoint: 'parse-tasks',
    model: PARSE_TASKS_MODEL,
    systemPrompt,
    userPrompt: userContent,
    temperature: 0.2,
    maxTokens: PARSE_TASKS_MAX_TOKENS,
    schemaName: 'parsed_items',
    jsonSchema: PARSED_ITEMS_JSON_SCHEMA,
    parser: (v) => ParsedItems.parse(v),
  })

  if (!result.ok) {
    return aiCallErrorResponse(res, result, {
      error: 'Could not parse — try again',
      code: 'ai_parse_failed',
    })
  }
  res.json(result.value)
})

// AI-powered meal parser: free-form text and/or photo -> validated { meals: ParsedMeal[] }.
// Parallel pipeline to parse-tasks above — food/macro-shaped, not Item-shaped. See
// CONTEXT.md (Calorie entry / Macros) for the contract. Does not write to the DB;
// the frontend writes confirmed meals as calorie entries via the #48 calories CRUD.
const ParseMealsRequest = z.object({
  text: z.string().max(2000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  photo: z.object({
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    data: z.string().min(1),
  }).optional(),
})

router.post('/parse-meals', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const parsedBody = ParseMealsRequest.safeParse(req.body)

  if (!parsedBody.success) {
    return res.status(400).json({ error: 'Invalid analyzer input' })
  }

  const { text, photo } = parsedBody.data
  const trimmedText = text?.trim() ?? ''

  if (!trimmedText && !photo) {
    return res.status(400).json({ error: 'Text input or photo is required' })
  }

  if (photo && base64Size(photo.data) > MAX_PHOTO_BYTES) {
    return res.status(400).json({ error: 'Photo must be 5MB or smaller' })
  }

  const photoContent = photo
    ? [
        {
          type: 'text' as const,
          text: NUTRITION_LABEL_OCR_PROMPT,
        },
        {
          type: 'image_url' as const,
          image_url: { url: `data:${photo.mimeType};base64,${photo.data}` },
        },
      ]
    : null
  const userContent = photo
    ? [
        {
          type: 'text' as const,
          text: `User text: ${trimmedText || '(none)'}

If a photo is provided, inspect it for visible food items or a nutrition label. If a nutrition label is present, read its calories and macros directly.

${NUTRITION_LABEL_READING_RULES}

Return only meals that are reasonably supported by the text or image.`,
        },
        {
          type: 'image_url' as const,
          image_url: { url: `data:${photo.mimeType};base64,${photo.data}` },
        },
      ]
    : trimmedText
  const systemPrompt = `Estimate nutrition for the foods described by the user input.

Return a list of meals, each with:
- name: the food or drink name
- calories: estimated calories (nonnegative integer)
- protein, carbs, fat: estimated grams (nonnegative numbers), or null if unknown
- quantity: a short description of the amount (e.g. "2 eggs"), or null if not specified
- labelEvidence: nullable nutrition-label evidence for this exact item. Use null when no nutrition label supports the meal. When a label is visible, include the label basis, basis text/header, visible product/claim text, package amount/unit if visible, numeric and label columns top-to-bottom, calories/macros, and sodium/calcium if visible.

Rules:
- Estimate calories and macros as accurately as possible for each distinct food item mentioned.
- Macros may be null if you cannot reasonably estimate them.
- Do not invent foods that are not present in the text or photo.
- If a nutrition label is visible in the photo, follow these rules:
${NUTRITION_LABEL_READING_RULES}`
  let reservedTokens = 0
  let usage: TokenUsage = ZERO_USAGE

  try {
    reservedTokens = await Credits.estimateReserve({
      model: PARSE_MEALS_MODEL,
      systemPrompt: photo ? 'You are an OCR engine for nutrition labels. Return JSON only.' : systemPrompt,
      userPrompt: photoContent ?? userContent,
      maxOutputTokens: photo ? NUTRITION_LABEL_OCR_MAX_TOKENS : PARSE_MEALS_MAX_TOKENS,
    })
    const ok = await Credits.reserve(userId, reservedTokens)
    if (!ok) {
      return res.status(402).json({ error: 'Insufficient AI tokens', code: 'insufficient_credits' })
    }
  } catch (error) {
    return unpricedModelResponse(res, error)
  }

  if (photoContent) {
    const ocrResult = await Openai.callStructured({
      model: PARSE_MEALS_MODEL,
      systemPrompt: 'You are an OCR engine for nutrition labels. Return JSON only.',
      userPrompt: photoContent,
      temperature: 0,
      maxTokens: NUTRITION_LABEL_OCR_MAX_TOKENS,
      schemaName: 'nutrition_label_ocr',
      jsonSchema: NUTRITION_LABEL_OCR_JSON_SCHEMA,
      parser: (v) => NutritionLabelOcr.parse(v),
    })

    if (!ocrResult.ok) {
      await Credits.refundReserve(userId, reservedTokens, 'refund_failed_call')
      return res.status(500).json({ error: 'Could not parse — try again' })
    }
    usage = ocrResult.usage ?? ZERO_USAGE
    const ocrMeal = nutritionLabelMealFromOcr(ocrResult.value, trimmedText || undefined)
    const review = evaluateOcrEvidence(ocrResult.value)

    if (ocrMeal) {
      await Credits.settleReserved(userId, reservedTokens, usage, {
        endpoint: 'parse-meals',
        model: PARSE_MEALS_MODEL,
      })
      return res.json({ meals: [ocrMeal], review })
    }
  }

  const result = await Openai.callStructured({
    model: PARSE_MEALS_MODEL,
    systemPrompt,
    userPrompt: userContent,
    temperature: 0.2,
    maxTokens: PARSE_MEALS_MAX_TOKENS,
    schemaName: 'parsed_meals',
    jsonSchema: PARSED_MEALS_JSON_SCHEMA,
    parser: (v) => AiParsedMeals.parse(v),
  })

  if (!result.ok) {
    await Credits.refundReserve(userId, reservedTokens, 'refund_failed_call')
    return res.status(500).json({ error: 'Could not parse — try again' })
  }
  usage = {
    promptTokens: usage.promptTokens + (result.usage?.promptTokens ?? 0),
    completionTokens: usage.completionTokens + (result.usage?.completionTokens ?? 0),
    totalTokens: usage.totalTokens + (result.usage?.totalTokens ?? 0),
  }
  await Credits.settleReserved(userId, reservedTokens, usage, {
    endpoint: 'parse-meals',
    model: PARSE_MEALS_MODEL,
  })
  res.json({ meals: result.value.meals.map(normalizeParsedMeal), review: defaultReview() })
})

export { router as aiRoutes }
