import express from 'express'
import { z } from 'zod'
import { db } from '../supabase-client'
import { aiCapabilityTools, cancelPendingAiAction, executePendingAiAction } from '../ai-capabilities'
import { buildDailyContext, DailyContextInputSchema } from '../daily-context'
import {
  Openai,
  parseMealsWithAi,
} from '../openai'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { isDemoPersonaEmail } from '../demo-personas'

const QUERY_TASKS_MODEL = 'gpt-3.5-turbo'
const QUERY_TASKS_MAX_TOKENS = 500
const PARSE_TASKS_MODEL = 'gpt-4o-mini'
const PARSE_TASKS_MAX_TOKENS = 1000
const CHAT_MODEL = 'gpt-4o-mini'
const ChatModel = z.enum(['gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5'])
const CHAT_MAX_TOKENS = 700
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000
const CHAT_RATE_LIMIT_MAX = 12
const MAX_CHAT_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_CHAT_TEXT_ATTACHMENT_CHARS = 12_000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

const router = express.Router()
const chatRateLimit = new Map<string, { count: number; resetAt: number }>()

function sweepExpiredChatRateLimits(now: number) {
  if (chatRateLimit.size <= 500) return
  for (const [key, value] of chatRateLimit.entries()) {
    if (value.resetAt <= now) chatRateLimit.delete(key)
  }
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
  sweepExpiredChatRateLimits(now)
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

const ChatAttachment = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('image'),
    name: z.string().trim().min(1).max(160),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    data: z.string().min(1),
  }),
  z.object({
    kind: z.literal('text'),
    name: z.string().trim().min(1).max(160),
    mimeType: z.enum(['text/plain', 'text/markdown']),
    text: z.string().trim().min(1).max(MAX_CHAT_TEXT_ATTACHMENT_CHARS),
  }),
])

const ChatRequest = z.object({
  messages: z.array(ChatMessage).min(1).max(30),
  model: ChatModel.default(CHAT_MODEL),
  attachment: ChatAttachment.optional(),
})

const StoredChatMessage = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(12_000),
  displayContent: z.string().max(12_000).optional(),
  hidden: z.boolean().optional(),
  attachment: z.unknown().optional(),
  toolEvents: z.unknown().optional(),
  pendingActions: z.unknown().optional(),
  error: z.boolean().optional(),
  createdAt: z.string().datetime().optional(),
})

const AssistantConversationSnapshot = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  model: ChatModel.default(CHAT_MODEL),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  messages: z.array(StoredChatMessage).max(200),
})

const ConversationParams = z.object({
  conversationId: z.string().uuid(),
})

async function isDemoHistoryUser(userId: string) {
  const user = await db.getUserById(userId)
  return isDemoPersonaEmail(user.email)
}

const CHAT_SYSTEM_PROMPT = `You are the internal HealthyFlow assistant.

Answer questions using the provided HealthyFlow tools. Use the app vocabulary exactly: Item, Task, Habit, Habit instance, Calorie entry, Weight entry, Achievement, Workout session.

You can read data and you can use write tools when the user plainly asks for a change.

Write safety:
- Every write tool returns a preview and requires the user to Confirm or Cancel in the UI before the change is executed. This includes add/log/create tools, update_item, complete_task, and delete_item.
- Calling the write tool IS how you ask for confirmation: it produces the preview card with Confirm/Cancel buttons. When the user plainly asks for a change, call the write tool in the same turn — do NOT ask "should I?" in text first and wait for a reply.
- Item ids (for update_item, complete_task, delete_item) must come from a get_today or list_tasks result in the SAME turn. Never invent, guess, or reuse an id from earlier in the conversation — those tool results are not carried across turns. If you do not have the id, call list_tasks or get_today first, then call the write tool.
- Never say a write is complete until the user has confirmed it.

Food logging:
- When the user says they ate or drank something, treat it as a Calorie entry candidate.
- For an attached meal photo or nutrition label, always call parse_meal_entries before add_calorie_entry/add_calorie_entries. The tool receives the current image attachment automatically; use its returned values instead of estimating nutrition from the image yourself.
- First call search_calorie_history for the food name, and call list_calorie_entries for today if duplicates or daily context could matter.
- For vague or composite meals with multiple foods, use parse_meal_entries. It is the same parser as the Calories page "AI Meal Entry" flow.
- Use lookup_food_nutrition for single branded foods or nutrition-source lookup when user history is missing or weak.
- Prefer sources in this order: exact user history, fuzzy user history, structured nutrition source, curated web source, low-confidence estimate.
- If parse_meal_entries returns multiple meals, prefer add_calorie_entries so each food is saved as its own reusable Calorie entry under the same meal time.
- For every add_calorie_entry/add_calorie_entries preview, calories/protein/carbs/fat must be totals for the stated quantity. For example, quantity "3 eggs" should use about 210 calories, not a single egg's 70 calories.
- If the user gives a meal time, preserve it in the add_calorie_entry.time field, or every add_calorie_entries.entries[].time field for a multi-food meal, using HH:MM 24-hour local time.
- If parse_meal_entries or lookup_food_nutrition returns a low-confidence estimate, you may still prepare an add_calorie_entries or add_calorie_entry preview when the user asks to log/insert it, but say it is an estimate and invite edits.
- If you prepare an add_calorie_entry or add_calorie_entries preview, mention the source/confidence briefly and ask the user to confirm. Do not claim the Calorie entry was logged until confirmation.

Language:
- Answer in the same language as the user's latest message unless they explicitly ask for another language.
- Tool/action preview text, confirmation requests, and result summaries should follow that same language where practical.

Keep answers concise and grounded in tool results. If a tool result is empty, say that plainly.`

function normalizeTimeZone(timeZone?: string) {
  if (!timeZone) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return timeZone
  } catch {
    return 'UTC'
  }
}

function formatLocalDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function formatLocalTime(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.hour}:${byType.minute}`
}

export function buildChatSystemPrompt(timeZoneHeader?: string, now = new Date()) {
  const timeZone = normalizeTimeZone(timeZoneHeader)
  const today = formatLocalDate(now, timeZone)
  const currentTime = formatLocalTime(now, timeZone)
  const yesterday = formatLocalDate(new Date(now.getTime() - ONE_DAY_MS), timeZone)
  const tomorrow = formatLocalDate(new Date(now.getTime() + ONE_DAY_MS), timeZone)

  return `${CHAT_SYSTEM_PROMPT}

Date context:
- Client time zone: ${timeZone}
- Current local date: ${today}
- Current local time: ${currentTime}
- Yesterday: ${yesterday}
- Tomorrow: ${tomorrow}

Resolve relative dates and times such as today, yesterday, tomorrow, now, right now, this morning, tonight, and last night from this date and time context when choosing tool arguments. If the user says now or right now, use the current local time. Do not use model training-date assumptions.`
}

function attachmentMessageContent(content: string, attachment?: z.infer<typeof ChatAttachment>) {
  if (!attachment) return content

  if (attachment.kind === 'image') {
    return [
      {
        type: 'text' as const,
        text: `${content}

Attachment: ${attachment.name} (${attachment.mimeType}). Inspect the attached image only as needed for the user's request. Do not claim the image was saved.`,
      },
      {
        type: 'image_url' as const,
        image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` },
      },
    ]
  }

  return `${content}

Attached text file: ${attachment.name} (${attachment.mimeType})

${attachment.text}`
}

router.get('/daily-context', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = DailyContextInputSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })

  try {
    res.json(await buildDailyContext(req.user.userId, parsed.data.date))
  } catch (error) {
    console.error('Daily context error:', error)
    res.status(500).json({ error: 'Failed to load daily context' })
  }
})

router.get('/conversations', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (await isDemoHistoryUser(req.user.userId)) return res.json([])
    res.json(await db.getAssistantConversations(req.user.userId))
  } catch (error) {
    console.error('Assistant conversations error:', error)
    res.status(500).json({ error: 'Failed to load chat history' })
  }
})

router.put('/conversations/:conversationId', authenticateToken, async (req: AuthRequest, res) => {
  const params = ConversationParams.safeParse(req.params)
  const body = AssistantConversationSnapshot.safeParse(req.body)
  if (!params.success || !body.success || params.data.conversationId !== body.data.id) {
    return res.status(400).json({ error: 'Invalid conversation' })
  }

  try {
    if (await isDemoHistoryUser(req.user.userId)) return res.json(body.data)
    res.json(await db.upsertAssistantConversation(req.user.userId, body.data))
  } catch (error) {
    console.error('Save assistant conversation error:', error)
    res.status(500).json({ error: 'Failed to save chat history' })
  }
})

router.delete('/conversations/:conversationId', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = ConversationParams.safeParse(req.params)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid conversation id' })

  try {
    if (await isDemoHistoryUser(req.user.userId)) return res.status(204).send()
    await db.archiveAssistantConversation(req.user.userId, parsed.data.conversationId)
    res.status(204).send()
  } catch (error) {
    console.error('Archive assistant conversation error:', error)
    res.status(500).json({ error: 'Failed to delete chat history' })
  }
})

router.post('/chat', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = ChatRequest.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid chat input' })

  const latestMessage = parsed.data.messages[parsed.data.messages.length - 1]
  if (parsed.data.attachment && latestMessage.role !== 'user') {
    return res.status(400).json({ error: 'Attachment must belong to the latest user message' })
  }
  if (parsed.data.attachment?.kind === 'image' && base64Size(parsed.data.attachment.data) > MAX_CHAT_IMAGE_BYTES) {
    return res.status(400).json({ error: 'Image attachment must be 4MB or smaller' })
  }

  const userId = req.user.userId
  if (!checkChatRateLimit(userId)) {
    return res.status(429).json({ error: 'Too many assistant messages, please try again shortly.', code: 'rate_limited' })
  }

  const capabilityContext = {
    userId,
    photo: parsed.data.attachment?.kind === 'image'
      ? {
          mimeType: parsed.data.attachment.mimeType,
          data: parsed.data.attachment.data,
        }
      : undefined,
  }
  const tools = aiCapabilityTools().map((tool) => ({
    ...tool,
    execute: (args: unknown) => tool.execute(capabilityContext, args),
  }))
  const messages = parsed.data.messages.map((message, index) => ({
    role: message.role,
    content: index === parsed.data.messages.length - 1
      ? attachmentMessageContent(message.content, parsed.data.attachment)
      : message.content,
  }))

  const result = await Openai.callBillableTools({
    userId,
    endpoint: 'ai-chat',
    model: parsed.data.model,
    systemPrompt: buildChatSystemPrompt(req.header('x-client-time-zone')),
    messages,
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

  const pendingActions = result.value.toolEvents
    .map((event) => (event.result as any)?.pendingAction)
    .filter(Boolean)

  res.json({ ...result.value, pendingActions })
})

const ConfirmBody = z.object({
  actionId: z.string().uuid(),
  args: z.record(z.string(), z.unknown()).optional(),
})

router.post('/chat/confirm', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = ConfirmBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid pending action id' })

  try {
    res.json(await executePendingAiAction(req.user.userId, parsed.data.actionId, parsed.data.args))
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

  const result = await parseMealsWithAi({ userId, text: trimmedText, photo })
  if (!result.ok) {
    return aiCallErrorResponse(res, result, {
      error: 'Could not parse — try again',
      code: 'ai_parse_failed',
    })
  }
  res.json(result.value)
})

export { router as aiRoutes }
