import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { ParsedMeal, ParseMealsPhoto, ParseMealsReview, parseMealsWithAi, RecoverableToolError } from './openai'
import {
  AchievementEntryCreateSchema,
  Achievements,
} from './achievements'
import { Rollover } from './rollover'
import { db } from './supabase-client'
import { parseHabitInstanceId } from './utils/parseHabitInstanceId'
import {
  WorkoutSessionCreateSchema,
  Workouts,
} from './workouts'
import {
  buildDailyContext,
  DailyContextInputSchema,
  DailyContextSchema,
} from './daily-context'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const DateInput = z.object({
  date: z.string().regex(DATE_RE).optional(),
})

const LimitInput = DateInput.extend({
  limit: z.number().int().min(1).max(50).default(20),
})

const RecentLimitInput = z.object({
  limit: z.number().int().min(1).max(100).default(30),
})

const EmptyInput = z.object({})
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
type LimitInputValue = z.infer<typeof LimitInput>
type RecentLimitInputValue = z.infer<typeof RecentLimitInput>

const RequestId = z.string().trim().min(1).max(120).optional()
const Category = z.enum(['health', 'work', 'personal', 'fitness', 'grocery', 'nutrition'])
const TaskOutput = z.object({ item: z.unknown(), duplicated: z.boolean().optional() })

const AddTaskInput = z.object({
  title: z.string().trim().min(1).max(200),
  category: Category.default('personal'),
  duration: z.number().int().positive().default(15),
  startTime: z.string().regex(TIME_RE).nullable().optional(),
  scheduledDate: z.string().regex(DATE_RE).optional(),
  requestId: RequestId,
})

const AddHabitInput = z.object({
  title: z.string().trim().min(1).max(200),
  category: Category.default('health'),
  duration: z.number().int().positive().default(15),
  startTime: z.string().regex(TIME_RE).nullable().optional(),
  repeat: z.enum(['daily', 'weekly']).default('daily'),
  requestId: RequestId,
})

const AddCalorieEntryInput = z.object({
  date: z.string().regex(DATE_RE).optional().describe('Entry date as YYYY-MM-DD. Preserve a user-provided date when they mention one.'),
  time: z.string().regex(TIME_RE).nullable().optional().describe('Meal or entry time as HH:MM in 24-hour local time. Preserve a user-provided time when they mention one.'),
  name: z.string().trim().min(1).max(200),
  calories: z.number().int().nonnegative(),
  protein: z.number().nonnegative().nullable().optional(),
  carbs: z.number().nonnegative().nullable().optional(),
  fat: z.number().nonnegative().nullable().optional(),
  quantity: z.string().trim().max(120).nullable().optional(),
  requestId: RequestId,
})

const AddCalorieEntriesInput = z.object({
  entries: z.array(AddCalorieEntryInput.omit({ requestId: true })).min(1).max(20),
  requestId: RequestId,
})

const SearchCalorieHistoryInput = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(8),
})

const LookupFoodNutritionInput = z.object({
  query: z.string().trim().min(1).max(200),
  locale: z.enum(['he-IL', 'en-US', 'auto']).default('auto'),
  limit: z.number().int().min(1).max(10).default(5),
})

const ParseMealEntriesInput = z.object({
  text: z.string().trim().min(1).max(2000),
  date: z.string().regex(DATE_RE).optional(),
})

const NutritionCandidate = z.object({
  name: z.string(),
  quantity: z.string().nullable(),
  calories: z.number().int().nonnegative(),
  protein: z.number().nonnegative().nullable(),
  carbs: z.number().nonnegative().nullable(),
  fat: z.number().nonnegative().nullable(),
  sourceType: z.enum(['open_food_facts', 'curated_web', 'estimate']),
  sourceUrl: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  notes: z.string().nullable(),
})

const CalorieHistoryMatch = z.object({
  id: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  calories: z.number().int().nonnegative(),
  protein: z.number().nonnegative().nullable(),
  carbs: z.number().nonnegative().nullable(),
  fat: z.number().nonnegative().nullable(),
  usageCount: z.number().int().nonnegative(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  matchType: z.enum(['exact', 'fuzzy']),
  score: z.number().min(0).max(1),
})

const AddWeightEntryInput = z.object({
  date: z.string().regex(DATE_RE).optional(),
  weightKg: z.number().positive(),
  requestId: RequestId,
})

const AddAchievementEntryInput = AchievementEntryCreateSchema.extend({
  achievementId: z.string().uuid(),
  requestId: RequestId,
})

const AddWorkoutSessionInput = WorkoutSessionCreateSchema.extend({
  requestId: RequestId,
})

const UpdateItemInput = z.object({
  itemId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  category: Category.optional(),
  duration: z.number().int().positive().optional(),
  startTime: z.string().regex(TIME_RE).nullable().optional(),
  scheduledDate: z.string().regex(DATE_RE).optional(),
  position: z.number().int().nonnegative().nullable().optional(),
  requestId: RequestId,
})

const CompleteTaskInput = z.object({
  itemId: z.string().min(1),
  requestId: RequestId,
})

const DeleteItemInput = z.object({
  itemId: z.string().min(1),
  deleteScope: z.enum(['instance', 'habit']).default('instance'),
  requestId: RequestId,
})

const taskToClient = (row: any) => ({
  id: row.id,
  title: row.title,
  type: row.type,
  category: row.category,
  completed: Boolean(row.completed),
  scheduledDate: row.scheduled_date,
  startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
  location: row.location ?? null,
  duration: row.duration,
  repeat: row.repeat_type,
  position: row.position ?? null,
  isHabitInstance: Boolean(row.is_habit_instance),
  originalHabitId: row.original_habit_id ?? null,
  rolledOverFromTaskId: row.rolled_over_from_task_id,
  originalCreatedAt: row.original_created_at,
  googleEventId: row.google_event_id ?? null,
  syncedToGoogle: Boolean(row.synced_to_google),
  createdAt: row.created_at,
})

const calorieToClient = (row: any) => ({
  id: row.id,
  date: row.date,
  time: row.time ? String(row.time).slice(0, 5) : null,
  name: row.name,
  calories: row.calories,
  protein: row.protein ?? null,
  carbs: row.carbs ?? null,
  fat: row.fat ?? null,
  quantity: row.quantity ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const calorieItemToClient = (row: any) => ({
  id: row.id,
  name: row.name,
  normalizedName: row.normalized_name,
  calories: row.calories,
  protein: row.protein ?? null,
  carbs: row.carbs ?? null,
  fat: row.fat ?? null,
  usageCount: row.usage_count ?? 0,
  lastUsedAt: row.last_used_at ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
})

const weightToClient = (row: any) => ({
  id: row.id,
  date: row.date,
  weightKg: Number(row.weight_kg),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function clampRows<T>(rows: T[], limit: number) {
  return rows.slice(0, limit)
}

function normalizeFoodText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TOKEN_SYNONYMS: Record<string, string[]> = {
  danone: ['דנונה'],
  דנונה: ['danone'],
  pro: ['פרו'],
  פרו: ['pro'],
  protein: ['חלבון'],
  חלבון: ['protein'],
  yogurt: ['יוגורט'],
  yoghurt: ['יוגורט'],
  יוגורט: ['yogurt', 'yoghurt'],
}

function foodTokens(value: string) {
  const tokens = normalizeFoodText(value).split(' ').filter(Boolean)
  const expanded = new Set(tokens)
  for (const token of tokens) {
    for (const synonym of TOKEN_SYNONYMS[token] ?? []) expanded.add(synonym)
  }
  return expanded
}

function calorieItemScore(query: string, row: any) {
  const queryTokens = foodTokens(query)
  const itemTokens = foodTokens(`${row.name ?? ''} ${row.normalized_name ?? ''}`)
  if (queryTokens.size === 0 || itemTokens.size === 0) return 0
  let overlap = 0
  for (const token of itemTokens) {
    if (queryTokens.has(token)) overlap += 1
  }
  return overlap / Math.max(itemTokens.size, 1)
}

function uniqueById(rows: any[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (!row?.id || seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

async function searchCalorieHistory(userId: string, query: string, limit: number) {
  const normalizedQuery = normalizeFoodText(query)
  const exact = await db.getCalorieItemByNormalizedName(userId, normalizedQuery)
  const [recent, mostUsed] = await Promise.all([
    db.getRecentCalorieItems(userId, 100),
    db.getMostUsedCalorieItems(userId, 100),
  ])
  const candidates = uniqueById([exact, ...recent, ...mostUsed].filter(Boolean))
  const scored = candidates
    .map((row) => {
      const isExact = normalizeFoodText(row.normalized_name ?? row.name ?? '') === normalizedQuery
      return {
        ...calorieItemToClient(row),
        matchType: isExact ? 'exact' as const : 'fuzzy' as const,
        score: isExact ? 1 : calorieItemScore(query, row),
      }
    })
    .filter((match) => match.matchType === 'exact' || match.score >= 0.34)
    .sort((a, b) => b.score - a.score || b.usageCount - a.usageCount)

  return clampRows(scored, limit)
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function openFoodFactsCandidate(product: any): z.infer<typeof NutritionCandidate> | null {
  const nutriments = product?.nutriments ?? {}
  const calories = numberOrNull(nutriments['energy-kcal_serving'] ?? nutriments['energy-kcal'])
  if (calories == null) return null
  const quantity = typeof product.quantity === 'string' && product.quantity.trim() ? product.quantity.trim() : null
  const code = typeof product.code === 'string' ? product.code : null
  return {
    name: String(product.product_name || product.product_name_he || product.generic_name || 'Food product'),
    quantity,
    calories: Math.round(calories),
    protein: numberOrNull(nutriments.proteins_serving ?? nutriments.proteins),
    carbs: numberOrNull(nutriments.carbohydrates_serving ?? nutriments.carbohydrates),
    fat: numberOrNull(nutriments.fat_serving ?? nutriments.fat),
    sourceType: 'open_food_facts',
    sourceUrl: code ? `https://world.openfoodfacts.org/product/${code}` : null,
    confidence: product.product_name ? 'medium' : 'low',
    notes: 'Matched by Open Food Facts product search; verify serving size before confirming.',
  }
}

function curatedDanoneProCandidate(query: string): z.infer<typeof NutritionCandidate> | null {
  const tokens = foodTokens(query)
  const isDanonePro = (tokens.has('דנונה') || tokens.has('danone')) && (tokens.has('פרו') || tokens.has('pro'))
  const isProteinYogurt = (tokens.has('חלבון') || tokens.has('protein')) && (tokens.has('יוגורט') || tokens.has('yogurt') || tokens.has('yoghurt'))
  if (!isDanonePro || !isProteinYogurt) return null
  return {
    name: 'דנונה PRO יוגורט חלבון 20 גרם',
    quantity: '200g cup',
    calories: 140,
    protein: 20,
    carbs: 7,
    fat: 3,
    sourceType: 'curated_web',
    sourceUrl: 'https://www.fuder.co.il/foods/%D7%93%D7%A0%D7%95%D7%A0%D7%94-%D7%A4%D7%A8%D7%95-%D7%9C%D7%91%D7%9F-20-%D7%92%D7%A8%D7%9D-%D7%97%D7%9C%D7%91%D7%95%D7%9F-1-5/',
    confidence: 'medium',
    notes: 'Curated Israeli nutrition page for a 200g Danone PRO cup; user should confirm the exact flavor/package.',
  }
}

function estimateProteinFoodCandidate(query: string): z.infer<typeof NutritionCandidate> | null {
  const proteinMatch = normalizeFoodText(query).match(/(?:protein|חלבון)\s*(\d{1,2})|(\d{1,2})\s*(?:g|גרם)?\s*(?:protein|חלבון)/)
  const protein = proteinMatch ? Number(proteinMatch[1] ?? proteinMatch[2]) : null
  if (!protein) return null
  return {
    name: query,
    quantity: null,
    calories: Math.round(protein * 7),
    protein,
    carbs: null,
    fat: null,
    sourceType: 'estimate',
    sourceUrl: null,
    confidence: 'low',
    notes: 'Low-confidence estimate from the stated protein amount because no product source matched.',
  }
}

function hebrewNumberBefore(text: string, wordPattern: RegExp) {
  const match = text.match(new RegExp(`(?:עם\\s*)?(\\d+(?:\\.\\d+)?)\\s*(?:${wordPattern.source})`))
  if (match) return Number(match[1])
  return wordPattern.test(text) ? 1 : 0
}

function halfCountAfter(text: string, wordPattern: RegExp) {
  if (!wordPattern.test(text)) return 0
  return /וחצי|חצי/.test(text) ? 1.5 : 1
}

function estimateVagueMealCandidates(query: string): Array<z.infer<typeof NutritionCandidate>> {
  const text = normalizeFoodText(query)
  const hasMealFood = /(שקשוקה|ביצים|ביצה|פיתה|טחינה|חביתה|סלט|אורז|עוף|טוסט|כריך|סנדוויץ|פסטה|יוגורט|קוטג|טונה)/.test(text)
  if (!hasMealFood) return []

  const candidates: Array<z.infer<typeof NutritionCandidate>> = []
  const estimate = (
    name: string,
    quantity: string,
    calories: number,
    protein: number,
    carbs: number,
    fat: number
  ) => candidates.push({
    name,
    quantity,
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    sourceType: 'estimate',
    sourceUrl: null,
    confidence: 'low',
    notes: 'Low-confidence estimate for one part of a vague or composite meal. Confirm or edit the preview before saving.',
  })

  if (/שקשוקה/.test(text)) {
    estimate('בסיס שקשוקה', 'sauce/base estimate', 150, 4, 12, 9)
  }

  const eggs = Math.max(hebrewNumberBefore(text, /ביצים|ביצה/), /ביצה/.test(text) && !/ביצים/.test(text) ? 1 : 0)
  if (eggs > 0) {
    estimate('ביצים', `${eggs} egg${eggs === 1 ? '' : 's'}`, eggs * 70, eggs * 6, eggs * 0.5, eggs * 5)
  }

  const pita = halfCountAfter(text, /פיתה|פיתות/)
  if (pita > 0) {
    estimate('פיתה', `${pita} pita`, pita * 170, pita * 6, pita * 33, pita * 1)
  }

  if (/טחינה/.test(text)) {
    estimate('טחינה', 'unspecified serving', 180, 5, 6, 16)
  }

  return candidates
}

async function lookupFoodNutrition(query: string, limit: number) {
  const candidates: z.infer<typeof NutritionCandidate>[] = []

  try {
    const url = new URL('https://world.openfoodfacts.org/cgi/search.pl')
    url.searchParams.set('search_terms', query)
    url.searchParams.set('search_simple', '1')
    url.searchParams.set('action', 'process')
    url.searchParams.set('json', '1')
    url.searchParams.set('page_size', String(Math.min(limit, 10)))
    const res = await fetch(url, {
      // Explicit ADR-0003 exception: one allowlisted nutrition source, bounded by timeout.
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'HealthyFlow/1.0 nutrition lookup' },
    })
    if (res.ok) {
      const body = await res.json() as { products?: unknown[] }
      for (const product of body.products ?? []) {
        const candidate = openFoodFactsCandidate(product)
        if (candidate) candidates.push(candidate)
      }
    }
  } catch (error) {
    console.warn('Open Food Facts lookup failed:', error)
  }

  const curated = curatedDanoneProCandidate(query)
  if (curated) candidates.push(curated)
  if (candidates.length === 0) {
    const proteinEstimate = estimateProteinFoodCandidate(query)
    if (proteinEstimate) candidates.push(proteinEstimate)
    else candidates.push(...estimateVagueMealCandidates(query))
  }

  return clampRows(candidates, limit)
}

async function tasksForDay(userId: string, date: string, limit: number) {
  const datedRows = await db.getTasksWithRecurringHabits(userId, date)
  const rows = await Rollover.addCarryForwardRows(userId, date, datedRows)
  return clampRows(rows.map(taskToClient), limit)
}

export type AiCapabilityRisk = 'auto' | 'confirm'
export type AiCaller = 'internal' | 'mcp'
export type AiCapabilityContext = {
  userId: string
  caller?: AiCaller
  model?: string | null
  photo?: ParseMealsPhoto
  groundedMeals?: Array<z.infer<typeof ParsedMeal>>
}

export type AiCapabilityDefinition<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> = {
  name: string
  description: string
  risk: AiCapabilityRisk
  scope?: string
  inputSchema: TInput
  outputSchema: TOutput
  execute: (ctx: AiCapabilityContext, input: any) => Promise<any>
  preview?: (ctx: AiCapabilityContext, input: any) => Promise<unknown>
}

async function withIdempotency<T>(
  ctx: AiCapabilityContext,
  tool: string,
  requestId: string | undefined,
  execute: () => Promise<T>
): Promise<any> {
  if (requestId) {
    const existing = await db.getAiIdempotency(ctx.userId, requestId, tool)
    if (existing) return { ...(existing.result as Record<string, unknown>), duplicated: true }
  }

  const result = await execute()
  if (requestId) {
    await db.createAiIdempotency({
      user_id: ctx.userId,
      request_id: requestId,
      tool,
      result,
    })
  }
  return result
}

async function auditWrite(ctx: AiCapabilityContext, tool: string, args: unknown, result: unknown, targetIds: unknown[] = []) {
  await db.createAiAuditLog({
    user_id: ctx.userId,
    caller: ctx.caller ?? 'internal',
    tool,
    args_summary: args,
    target_ids: targetIds,
    result,
    model: ctx.model ?? null,
    request_id: typeof args === 'object' && args && 'requestId' in args ? String((args as Record<string, unknown>).requestId ?? '') || null : null,
  })
}

async function taskRow(input: z.infer<typeof AddTaskInput>, userId: string, type: 'task' | 'habit') {
  const scheduledDate = type === 'task'
    ? (input.scheduledDate ?? todayIso())
    : null
  const position = type === 'task' && !input.startTime && scheduledDate
    ? await db.getNextPosition(userId, scheduledDate)
    : null
  return {
    id: uuidv4(),
    user_id: userId,
    title: input.title,
    type,
    category: input.category,
    start_time: input.startTime ?? null,
    duration: input.duration,
    repeat_type: type === 'habit' ? (input as z.infer<typeof AddHabitInput>).repeat : 'none',
    scheduled_date: scheduledDate,
    position,
  }
}

function previewTaskDbRow(input: z.infer<typeof AddTaskInput>, type: 'task' | 'habit') {
  const scheduledDate = type === 'task' ? (input.scheduledDate ?? todayIso()) : null
  return {
    id: uuidv4(),
    user_id: 'preview-user',
    title: input.title,
    type,
    category: input.category,
    start_time: input.startTime ?? null,
    duration: input.duration,
    repeat_type: type === 'habit' ? (input as z.infer<typeof AddHabitInput>).repeat : 'none',
    scheduled_date: scheduledDate,
    position: null,
  }
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function itemNotFound(itemId: string) {
  return new RecoverableToolError(
    `No Item found with id "${itemId}". Call list_tasks or get_today to get real Item ids, then retry.`,
  )
}

async function getOwnedTask(userId: string, itemId: string) {
  const parsed = parseHabitInstanceId(itemId)
  const lookupId = parsed ? parsed.originalHabitId : itemId
  // Guard the id shape before it reaches Postgres: an id the model invented
  // (e.g. "1") is not a uuid and would otherwise leak a raw 22P02 error. Treat
  // it as a recoverable "not found" so the model can re-list Items and retry.
  if (!UUID_RE.test(lookupId)) throw itemNotFound(itemId)
  let task: any
  try {
    task = await db.getTaskById(lookupId)
  } catch (error: any) {
    // PGRST116 = ".single()" matched no rows. That is a recoverable not-found;
    // any other error (DB down, etc.) still aborts and surfaces as tool_error.
    if (error?.code === 'PGRST116') throw itemNotFound(itemId)
    throw error
  }
  if (!task || task.user_id !== userId) throw itemNotFound(itemId)
  return { task, parsedVirtual: parsed }
}

function taskPreview(action: string, row: any, extra: Record<string, unknown> = {}) {
  return {
    action,
    item: taskToClient(row),
    ...extra,
  }
}

function previewTaskRow(input: z.infer<typeof AddTaskInput>, type: 'task' | 'habit') {
  return taskToClient({
    ...previewTaskDbRow(input, type),
    completed: false,
    original_habit_id: null,
    created_at: null,
  })
}

function addPreview(action: string, value: unknown) {
  return { action, willCreate: value }
}

export const AiCapabilities = {
  get_today: {
    name: 'get_today',
    description: "Return a bounded overview of today's HealthyFlow Tasks, Habit instances, calories, weight, achievements, and workout sessions.",
    risk: 'auto',
    inputSchema: EmptyInput,
    outputSchema: z.object({
      date: z.string(),
      tasks: z.array(z.unknown()),
      calorieEntries: z.array(z.unknown()),
      weight: z.unknown().nullable(),
      achievements: z.array(z.unknown()),
      workoutSessions: z.array(z.unknown()),
    }),
    async execute(ctx) {
      const date = todayIso()
      const [tasks, calorieRows, weightRow, achievements, workoutSessions] = await Promise.all([
        tasksForDay(ctx.userId, date, 20),
        db.getCalorieEntriesByDay(ctx.userId, date),
        db.getWeightEntryByDay(ctx.userId, date),
        Achievements.list(ctx.userId, { includeArchived: false, entryLimit: 10 }),
        Workouts.listSessions(ctx.userId, date),
      ])
      return {
        date,
        tasks,
        calorieEntries: clampRows(calorieRows.map(calorieToClient), 20),
        weight: weightRow ? weightToClient(weightRow) : null,
        achievements: clampRows(achievements, 20),
        workoutSessions: clampRows(workoutSessions, 20),
      }
    },
  },
  get_daily_context: {
    name: 'get_daily_context',
    description: 'Return an anchored daily context with bounded lookback windows and deterministic cross-module signals.',
    risk: 'auto',
    inputSchema: DailyContextInputSchema,
    outputSchema: DailyContextSchema,
    async execute(ctx, input) {
      const parsed = input as z.infer<typeof DailyContextInputSchema>
      return buildDailyContext(ctx.userId, parsed.date)
    },
  },
  list_tasks: {
    name: 'list_tasks',
    description: 'List bounded Tasks and Habit instances for a specific date, defaulting to today.',
    risk: 'auto',
    inputSchema: LimitInput,
    outputSchema: z.object({
      date: z.string(),
      tasks: z.array(z.unknown()),
    }),
    async execute(ctx, input) {
      const parsed = input as LimitInputValue
      const date = parsed.date ?? todayIso()
      return { date, tasks: await tasksForDay(ctx.userId, date, parsed.limit) }
    },
  },
  list_calorie_entries: {
    name: 'list_calorie_entries',
    description: 'List bounded Calorie entries for a specific date, defaulting to today.',
    risk: 'auto',
    inputSchema: LimitInput,
    outputSchema: z.object({
      date: z.string(),
      entries: z.array(z.unknown()),
    }),
    async execute(ctx, input) {
      const parsed = input as LimitInputValue
      const date = parsed.date ?? todayIso()
      const rows = await db.getCalorieEntriesByDay(ctx.userId, date)
      return { date, entries: clampRows(rows.map(calorieToClient), parsed.limit) }
    },
  },
  search_calorie_history: {
    name: 'search_calorie_history',
    description: 'Search the user-owned reusable Calorie entry history for exact and fuzzy food matches. Prefer exact history over online nutrition lookup.',
    risk: 'auto',
    inputSchema: SearchCalorieHistoryInput,
    outputSchema: z.object({
      query: z.string(),
      matches: z.array(CalorieHistoryMatch),
    }),
    async execute(ctx, input) {
      const parsed = input as z.infer<typeof SearchCalorieHistoryInput>
      return {
        query: parsed.query,
        matches: await searchCalorieHistory(ctx.userId, parsed.query, parsed.limit),
      }
    },
  },
  lookup_food_nutrition: {
    name: 'lookup_food_nutrition',
    description: 'Look up nutrition candidates for a food query through backend-controlled online sources. Use only when user history is missing or weak; never treat low-confidence estimates as certain.',
    risk: 'auto',
    inputSchema: LookupFoodNutritionInput,
    outputSchema: z.object({
      query: z.string(),
      locale: z.enum(['he-IL', 'en-US', 'auto']),
      candidates: z.array(NutritionCandidate),
      notes: z.string().nullable(),
    }),
    async execute(_ctx, input) {
      const parsed = input as z.infer<typeof LookupFoodNutritionInput>
      const candidates = await lookupFoodNutrition(parsed.query, parsed.limit)
      return {
        query: parsed.query,
        locale: parsed.locale,
        candidates,
        notes: candidates.length === 0 ? 'No nutrition source matched this query.' : null,
      }
    },
  },
  parse_meal_entries: {
    name: 'parse_meal_entries',
    description: 'Use the same AI Meal Entry parser as the Calories page for an attached meal or nutrition-label photo, or to split a vague or composite meal description into separate reusable Calorie entry candidates. In internal Talk, the current image attachment is passed to this parser automatically. Use this before add_calorie_entry/add_calorie_entries for attached food images and multi-food meals.',
    risk: 'auto',
    inputSchema: ParseMealEntriesInput,
    outputSchema: z.object({
      date: z.string().optional(),
      meals: z.array(ParsedMeal),
      review: ParseMealsReview,
    }),
    async execute(ctx, input) {
      const parsed = input as z.infer<typeof ParseMealEntriesInput>
      const result = await parseMealsWithAi({
        userId: ctx.userId,
        text: parsed.text,
        photo: ctx.photo,
        endpoint: 'ai-chat-parse-meals',
      })
      if (!result.ok) throw new Error(result.message)
      if (ctx.photo) ctx.groundedMeals = result.value.meals
      return {
        date: parsed.date,
        ...result.value,
      }
    },
  },
  list_weight_summary: {
    name: 'list_weight_summary',
    description: 'Return recent Weight entries with latest, previous, and delta values.',
    risk: 'auto',
    inputSchema: RecentLimitInput,
    outputSchema: z.object({
      entries: z.array(z.unknown()),
      latest: z.unknown().nullable(),
      previous: z.unknown().nullable(),
      deltaKg: z.number().nullable(),
    }),
    async execute(ctx, input) {
      const parsed = input as RecentLimitInputValue
      const rows = await db.getRecentWeightEntries(ctx.userId, parsed.limit)
      const entries = rows.map(weightToClient).reverse()
      const latest = entries[entries.length - 1] ?? null
      const previous = entries[entries.length - 2] ?? null
      const deltaKg = latest && previous ? latest.weightKg - previous.weightKg : null
      return { entries, latest, previous, deltaKg }
    },
  },
  list_achievements: {
    name: 'list_achievements',
    description: 'List active Achievement definitions with recent entries and progress summaries.',
    risk: 'auto',
    inputSchema: z.object({
      entryLimit: z.number().int().min(1).max(100).default(30),
    }),
    outputSchema: z.object({
      achievements: z.array(z.unknown()),
    }),
    async execute(ctx, input) {
      const parsed = input as { entryLimit: number }
      return {
        achievements: await Achievements.list(ctx.userId, {
          includeArchived: false,
          entryLimit: parsed.entryLimit,
        }),
      }
    },
  },
  list_workout_sessions: {
    name: 'list_workout_sessions',
    description: 'List bounded Workout sessions for a specific date, defaulting to today.',
    risk: 'auto',
    inputSchema: LimitInput,
    outputSchema: z.object({
      date: z.string(),
      sessions: z.array(z.unknown()),
    }),
    async execute(ctx, input) {
      const parsed = input as LimitInputValue
      const date = parsed.date ?? todayIso()
      const sessions = await Workouts.listSessions(ctx.userId, date)
      return { date, sessions: clampRows(sessions, parsed.limit) }
    },
  },
  add_task: {
    name: 'add_task',
    description: 'Preview then add a one-shot Task. Internal chat must ask for confirmation before executing.',
    risk: 'confirm',
    scope: 'hf:write:add',
    inputSchema: AddTaskInput,
    outputSchema: TaskOutput,
    async preview(_ctx, input) {
      return addPreview('add_task', { item: previewTaskRow(input, 'task') })
    },
    async execute(ctx, input) {
      return withIdempotency(ctx, 'add_task', input.requestId, async () => {
        const row = await db.createTask(await taskRow(input, ctx.userId, 'task'))
        const result = { item: taskToClient(row) }
        await auditWrite(ctx, 'add_task', input, result, [row.id])
        return result
      })
    },
  },
  add_habit: {
    name: 'add_habit',
    description: 'Preview then add a recurring Habit template. Internal chat must ask for confirmation before executing.',
    risk: 'confirm',
    scope: 'hf:write:add',
    inputSchema: AddHabitInput,
    outputSchema: TaskOutput,
    async preview(_ctx, input) {
      return addPreview('add_habit', { item: previewTaskRow(input, 'habit') })
    },
    async execute(ctx, input) {
      return withIdempotency(ctx, 'add_habit', input.requestId, async () => {
        const row = await db.createTask(await taskRow(input, ctx.userId, 'habit'))
        const result = { item: taskToClient(row) }
        await auditWrite(ctx, 'add_habit', input, result, [row.id])
        return result
      })
    },
  },
  add_calorie_entry: {
    name: 'add_calorie_entry',
    description: 'Preview then add a Calorie entry. Internal chat must ask for confirmation before executing.',
    risk: 'confirm',
    scope: 'hf:write:add',
    inputSchema: AddCalorieEntryInput,
    outputSchema: z.object({ entry: z.unknown(), duplicated: z.boolean().optional() }),
    async preview(_ctx, input) {
      return addPreview('add_calorie_entry', {
        entry: {
          date: input.date ?? todayIso(),
          time: input.time ?? null,
          name: input.name,
          calories: input.calories,
          protein: input.protein ?? null,
          carbs: input.carbs ?? null,
          fat: input.fat ?? null,
          quantity: input.quantity ?? null,
        },
      })
    },
    async execute(ctx, input) {
      return withIdempotency(ctx, 'add_calorie_entry', input.requestId, async () => {
        const row = await db.createCalorieEntry({
          id: uuidv4(),
          user_id: ctx.userId,
          date: input.date ?? todayIso(),
          time: input.time ?? null,
          name: input.name,
          calories: input.calories,
          protein: input.protein ?? null,
          carbs: input.carbs ?? null,
          fat: input.fat ?? null,
          quantity: input.quantity ?? null,
        })
        const result = { entry: calorieToClient(row) }
        await auditWrite(ctx, 'add_calorie_entry', input, result, [row.id])
        return result
      })
    },
  },
  add_calorie_entries: {
    name: 'add_calorie_entries',
    description: 'Preview then add multiple Calorie entries as one meal group. Use this for vague or composite meals so each food remains reusable in calorie history.',
    risk: 'confirm',
    scope: 'hf:write:add',
    inputSchema: AddCalorieEntriesInput,
    outputSchema: z.object({ entries: z.array(z.unknown()), duplicated: z.boolean().optional() }),
    async preview(_ctx, input) {
      return addPreview('add_calorie_entries', {
        entries: input.entries.map((entry: z.infer<typeof AddCalorieEntryInput>) => ({
          date: entry.date ?? todayIso(),
          time: entry.time ?? null,
          name: entry.name,
          calories: entry.calories,
          protein: entry.protein ?? null,
          carbs: entry.carbs ?? null,
          fat: entry.fat ?? null,
          quantity: entry.quantity ?? null,
        })),
      })
    },
    async execute(ctx, input) {
      return withIdempotency(ctx, 'add_calorie_entries', input.requestId, async () => {
        const rows = []
        try {
          for (const entry of input.entries) {
            rows.push(await db.createCalorieEntry({
              id: uuidv4(),
              user_id: ctx.userId,
              date: entry.date ?? todayIso(),
              time: entry.time ?? null,
              name: entry.name,
              calories: entry.calories,
              protein: entry.protein ?? null,
              carbs: entry.carbs ?? null,
              fat: entry.fat ?? null,
              quantity: entry.quantity ?? null,
            }))
          }
        } catch (error) {
          await Promise.allSettled(rows.map((row) => db.deleteCalorieEntry(row.id)))
          throw error
        }
        const result = { entries: rows.map(calorieToClient) }
        await auditWrite(ctx, 'add_calorie_entries', input, result, rows.map((row) => row.id))
        return result
      })
    },
  },
  add_weight_entry: {
    name: 'add_weight_entry',
    description: 'Preview then add a Weight entry for a date. Internal chat must ask for confirmation before executing.',
    risk: 'confirm',
    scope: 'hf:write:add',
    inputSchema: AddWeightEntryInput,
    outputSchema: z.object({ entry: z.unknown(), duplicated: z.boolean().optional() }),
    async preview(_ctx, input) {
      return addPreview('add_weight_entry', {
        entry: {
          date: input.date ?? todayIso(),
          weightKg: input.weightKg,
        },
      })
    },
    async execute(ctx, input) {
      return withIdempotency(ctx, 'add_weight_entry', input.requestId, async () => {
        const row = await db.createWeightEntry({
          id: uuidv4(),
          user_id: ctx.userId,
          date: input.date ?? todayIso(),
          weight_kg: input.weightKg,
        })
        const result = { entry: weightToClient(row) }
        await auditWrite(ctx, 'add_weight_entry', input, result, [row.id])
        return result
      })
    },
  },
  add_achievement_entry: {
    name: 'add_achievement_entry',
    description: 'Preview then add an Achievement entry to an existing Achievement definition.',
    risk: 'confirm',
    scope: 'hf:write:add',
    inputSchema: AddAchievementEntryInput,
    outputSchema: z.object({ entry: z.unknown(), duplicated: z.boolean().optional() }),
    async preview(_ctx, input) {
      const { requestId: _requestId, ...entry } = input
      return addPreview('add_achievement_entry', { entry })
    },
    async execute(ctx, input) {
      return withIdempotency(ctx, 'add_achievement_entry', input.requestId, async () => {
        const { achievementId, requestId: _requestId, ...entry } = input
        const result = { entry: await Achievements.createEntry(ctx.userId, achievementId, entry) }
        await auditWrite(ctx, 'add_achievement_entry', input, result, [result.entry.id])
        return result
      })
    },
  },
  add_workout_session: {
    name: 'add_workout_session',
    description: 'Preview then add a Workout session with exercises.',
    risk: 'confirm',
    scope: 'hf:write:add',
    inputSchema: AddWorkoutSessionInput,
    outputSchema: z.object({ session: z.unknown(), duplicated: z.boolean().optional() }),
    async preview(_ctx, input) {
      const { requestId: _requestId, ...session } = input
      return addPreview('add_workout_session', { session })
    },
    async execute(ctx, input) {
      return withIdempotency(ctx, 'add_workout_session', input.requestId, async () => {
        const { requestId: _requestId, ...sessionInput } = input
        const result = { session: await Workouts.createSession(ctx.userId, sessionInput) }
        await auditWrite(ctx, 'add_workout_session', input, result, [result.session.id])
        return result
      })
    },
  },
  update_item: {
    name: 'update_item',
    description: 'Preview then update a Task or Habit instance. Internal chat must ask for confirmation before executing.',
    risk: 'confirm',
    scope: 'hf:write:update',
    inputSchema: UpdateItemInput,
    outputSchema: TaskOutput,
    async preview(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      return taskPreview('update_item', task, { updates: input })
    },
    async execute(ctx, input) {
      return withIdempotency(ctx, 'update_item', input.requestId, async () => {
        const { task } = await getOwnedTask(ctx.userId, input.itemId)
        const updates: Record<string, unknown> = {}
        if (input.title !== undefined) updates.title = input.title
        if (input.category !== undefined) updates.category = input.category
        if (input.duration !== undefined) updates.duration = input.duration
        if (input.startTime !== undefined) updates.start_time = input.startTime
        if (input.scheduledDate !== undefined) updates.scheduled_date = input.scheduledDate
        if (input.position !== undefined) updates.position = input.position
        const row = await db.updateTask(task.id, updates)
        const result = { item: taskToClient(row) }
        await auditWrite(ctx, 'update_item', input, result, [row.id])
        return result
      })
    },
  },
  complete_task: {
    name: 'complete_task',
    description: 'Preview then complete a Task or Habit instance. Internal chat must ask for confirmation before executing.',
    risk: 'confirm',
    scope: 'hf:write:complete',
    inputSchema: CompleteTaskInput,
    outputSchema: TaskOutput,
    async preview(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      return taskPreview('complete_task', task)
    },
    async execute(ctx, input) {
      return withIdempotency(ctx, 'complete_task', input.requestId, async () => {
        const { task, parsedVirtual } = await getOwnedTask(ctx.userId, input.itemId)
        const row = parsedVirtual
          ? await db.createHabitInstance(parsedVirtual.originalHabitId, parsedVirtual.date, ctx.userId, { completed: true })
          : await db.updateTask(task.id, { completed: true, completed_at: new Date().toISOString() })
        const result = { item: taskToClient(row) }
        await auditWrite(ctx, 'complete_task', input, result, [row.id])
        return result
      })
    },
  },
  delete_item: {
    name: 'delete_item',
    description: 'Preview then delete a Task or Habit instance. Internal chat must ask for confirmation before executing.',
    risk: 'confirm',
    scope: 'hf:write:delete',
    inputSchema: DeleteItemInput,
    outputSchema: z.object({ deleted: z.boolean(), itemId: z.string(), duplicated: z.boolean().optional() }),
    async preview(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      return taskPreview('delete_item', task, { deleteScope: input.deleteScope })
    },
    async execute(ctx, input) {
      return withIdempotency(ctx, 'delete_item', input.requestId, async () => {
        const { task, parsedVirtual } = await getOwnedTask(ctx.userId, input.itemId)
        if (parsedVirtual) {
          await db.softDeleteHabitInstance(parsedVirtual.originalHabitId, parsedVirtual.date, ctx.userId)
        } else if (task.type === 'habit' && input.deleteScope === 'habit') {
          await db.deleteHabitSeries(task.original_habit_id || task.id, ctx.userId)
        } else if (task.type === 'habit') {
          await db.softDeleteTask(task.id)
        } else {
          await db.deleteTask(task.id)
        }
        const result = { deleted: true, itemId: input.itemId }
        await auditWrite(ctx, 'delete_item', input, result, [input.itemId])
        return result
      })
    },
  },
} satisfies Record<string, AiCapabilityDefinition>

export type AiCapabilityName = keyof typeof AiCapabilities

function pendingActionToClient(row: any) {
  return {
    id: row.id,
    capability: row.capability,
    args: row.args,
    preview: row.preview,
    expiresAt: row.expires_at,
  }
}

export function aiCapabilityTools(options: { mode?: 'internal' | 'mcp'; scopes?: string[]; caller?: AiCaller } = {}) {
  const mode = options.mode ?? 'internal'
  const scopes = options.scopes ?? []
  return (Object.values(AiCapabilities) as AiCapabilityDefinition[]).filter((capability) => {
    if (mode === 'mcp' && capability.scope && !scopes.includes(capability.scope)) return false
    return true
  }).map((capability) => ({
    name: capability.name,
    description: capability.risk === 'confirm' && mode === 'mcp'
      ? `${capability.description} Destructive or state-changing action: MCP clients should ask the user before calling this tool.`
      : capability.description,
    risk: capability.risk,
    scope: capability.scope,
    inputSchema: capability.inputSchema,
    outputSchema: capability.outputSchema,
    parameters: z.toJSONSchema(capability.inputSchema),
    execute: async (ctx: AiCapabilityContext, args: unknown) => {
      let parsed: any = capability.inputSchema.parse(args ?? {})
      if (capability.name === 'add_calorie_entry' && ctx.photo && ctx.groundedMeals?.length === 1) {
        const meal = ctx.groundedMeals[0]
        parsed = {
          ...parsed,
          name: meal.name,
          quantity: meal.quantity,
          calories: meal.calories,
          protein: meal.protein,
          carbs: meal.carbs,
          fat: meal.fat,
        }
      }
      if (capability.risk === 'confirm' && mode === 'internal') {
        const preview = await capability.preview?.(ctx, parsed)
        const row = await db.createAiPendingAction({
          user_id: ctx.userId,
          capability: capability.name,
          args: parsed,
          preview,
          caller: 'internal',
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        })
        return { pendingAction: pendingActionToClient(row) }
      }
      return capability.execute(ctx, parsed)
    },
  }))
}

export async function executePendingAiAction(userId: string, actionId: string, overrides?: unknown) {
  const action = await db.getAiPendingAction(actionId)
  if (!action || action.user_id !== userId) throw new Error('Pending action not found')
  if (action.executed_at || action.canceled_at || new Date(action.expires_at).getTime() <= Date.now()) {
    throw new Error('Pending action is no longer available')
  }
  const capability = AiCapabilities[action.capability as AiCapabilityName] as AiCapabilityDefinition | undefined
  if (!capability || capability.risk !== 'confirm') throw new Error('Invalid pending action')
  const editedArgs = overrides && typeof overrides === 'object' && !Array.isArray(overrides)
    ? { ...(action.args as Record<string, unknown>), ...(overrides as Record<string, unknown>) }
    : action.args
  const parsed = capability.inputSchema.parse(editedArgs)
  const result = await capability.execute({ userId, caller: action.caller ?? 'internal' }, parsed)
  await db.markAiPendingActionExecuted(actionId)
  return { result, action: pendingActionToClient({ ...action, args: parsed }) }
}

export async function cancelPendingAiAction(userId: string, actionId: string) {
  const row = await db.cancelAiPendingAction(actionId, userId)
  if (!row) throw new Error('Pending action not found')
  return pendingActionToClient(row)
}
