import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { ParsedMeal, ParseMealsPhoto, ParseMealsReview, parseMealsWithAi, RecoverableToolError } from './openai'
import {
  AchievementEntryCreateSchema,
  AchievementEntrySchema,
  AchievementSummarySchema,
  Achievements,
} from './achievements'
import { buildDaySummary, validateDailyPlacement } from './day-summary'
import {
  DailyPlanPlacementInputSchema,
  DailyPlanPlacementValidationSchema,
  DaySummaryCapacitySchema,
  DaySummarySchema,
  NutritionSummarySchema,
} from './day-summary-schema'
import {
  HabitProgress,
  HabitProgressDetailSchema,
  HabitProgressInputSchema,
  HabitOutcomeInputSchema,
} from './habit-progress'
import { Rollover } from './rollover'
import { db } from './supabase-client'
import { parseHabitInstanceId } from './utils/parseHabitInstanceId'
import {
  WorkoutSessionCreateSchema,
  WorkoutPlanSchema,
  WorkoutSessionSchema,
  Workouts,
} from './workouts'
import {
  buildDailyContext,
  DailyContextInputSchema,
  DailyContextSchema,
  type DailySignal,
} from './daily-context'
import { CapabilityItemSchema, CategorySchema } from './task-contracts'
import { Work } from './work'
import {
  CompleteWorkReviewInputSchema,
  CreateFocusBlockInputSchema,
  FocusBlockSchema,
  FocusBlockTransitionInputSchema,
  ProjectContextSchema,
  ReviewCompletionSchema,
  TaskRecordSchema,
  UpdateTaskRecordInputSchema,
  WorkProjectSchema,
  WorkProjectSummarySchema,
  WorkScopeSchema,
} from './work-contracts'

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
const MutationResultFields = { duplicated: z.boolean().optional() }
const TaskOutput = z.object({ item: CapabilityItemSchema, ...MutationResultFields })

const CalorieEntrySchema = z.object({
  id: z.string(),
  date: z.string().regex(DATE_RE),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  name: z.string(),
  calories: z.number().int().nonnegative(),
  protein: z.number().nonnegative().nullable(),
  carbs: z.number().nonnegative().nullable(),
  fat: z.number().nonnegative().nullable(),
  quantity: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

const WeightEntrySchema = z.object({
  id: z.string(),
  date: z.string().regex(DATE_RE),
  weightKg: z.number().positive(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

const AddTaskInput = z.object({
  title: z.string().trim().min(1).max(200),
  category: CategorySchema.default('personal'),
  duration: z.number().int().positive().default(15),
  startTime: z.string().regex(TIME_RE).nullable().optional(),
  scheduledDate: z.string().regex(DATE_RE).optional(),
  requestId: RequestId,
})

const AddHabitInput = z.object({
  title: z.string().trim().min(1).max(200),
  category: CategorySchema.default('health'),
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
  category: CategorySchema.optional(),
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

const DayPlanInput = z.object({
  date: z.string().regex(DATE_RE),
  timeZone: z.string().trim().min(1).max(80).nullable().optional(),
})

const PlaceItemInput = z.object({
  itemId: z.string().min(1),
  scheduledDate: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE).nullable(),
  position: z.number().int().nonnegative().nullable().optional(),
  requestId: RequestId,
})

const ProjectIdInput = z.object({ projectId: z.string().uuid() })
const ReviewTaskAlignmentInput = ProjectIdInput.extend({
  taskIds: z.array(z.string().uuid()).min(1).max(20),
})
const TaskAlignmentSchema = z.object({
  project: WorkProjectSchema,
  tasks: z.array(TaskRecordSchema.extend({
    aligned: z.boolean(),
    reason: z.string(),
  })),
})
const CreateFocusBlockCapabilityInput = CreateFocusBlockInputSchema.safeExtend({ requestId: RequestId })
const TransitionFocusBlockCapabilityInput = z.object({
  focusBlockId: z.string().uuid(),
  action: FocusBlockTransitionInputSchema.shape.action,
  requestId: RequestId,
})
const CompleteWorkReviewCapabilityInput = CompleteWorkReviewInputSchema.extend({
  focusBlockId: z.string().uuid(),
  requestId: RequestId,
})
const UpdateWorkTaskCapabilityInput = UpdateTaskRecordInputSchema.and(z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  requestId: RequestId,
}))
const UpdateProjectContextInput = z.object({
  projectId: z.string().uuid(),
  context: ProjectContextSchema.partial().refine(value => Object.keys(value).length > 0, 'No Project context changes supplied'),
  requestId: RequestId,
})

const PlanMealTimingInput = DayPlanInput.extend({
  meal: z.string().trim().min(1).max(120),
  preferredTime: z.string().regex(TIME_RE),
  durationMinutes: z.number().int().positive().max(240).default(30),
})
const MealTimingProposalSchema = z.object({
  meal: z.string(),
  validation: DailyPlanPlacementValidationSchema,
})
const ScheduleMealInput = z.object({
  title: z.string().trim().min(1).max(200),
  scheduledDate: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  duration: z.number().int().positive().max(240).default(30),
  requestId: RequestId,
})
const ScheduleWorkoutInput = z.object({
  workoutPlanId: z.string().uuid(),
  scheduledDate: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  duration: z.number().int().positive().max(480).default(60),
  requestId: RequestId,
})
const HabitReferenceInput = z.object({
  itemId: z.string().min(1),
  date: z.string().regex(DATE_RE).optional(),
  requestId: RequestId,
})
const RecordHabitOutcomeInput = HabitReferenceInput.extend({
  outcome: HabitOutcomeInputSchema.shape.outcome,
})
const RecordHabitProgressInput = HabitReferenceInput.extend({
  amount: HabitProgressInputSchema.shape.amount,
  note: HabitProgressInputSchema.shape.note,
})
const ExplainRolloverInput = z.object({
  itemId: z.string().min(1).optional(),
  date: z.string().regex(DATE_RE),
})
const RolloverExplanationSchema = z.object({
  date: z.string().regex(DATE_RE),
  rule: z.literal('incomplete_untimed_tasks_carry_forward'),
  items: z.array(CapabilityItemSchema),
})
const DeferTaskInput = z.object({
  itemId: z.string().min(1),
  deferToDate: z.string().regex(DATE_RE),
  requestId: RequestId,
})

const taskToClient = (row: any) => ({
  id: row.id,
  title: row.title,
  type: row.type,
  category: row.category ?? null,
  completed: Boolean(row.completed),
  scheduledDate: row.scheduled_date ?? null,
  startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
  location: row.location ?? null,
  duration: row.duration ?? null,
  repeat: row.repeat_type ?? null,
  position: row.position ?? null,
  isHabitInstance: Boolean(row.is_habit_instance),
  originalHabitId: row.original_habit_id ?? null,
  rolledOverFromTaskId: row.rolled_over_from_task_id ?? null,
  originalCreatedAt: row.original_created_at ?? null,
  googleEventId: row.google_event_id ?? null,
  syncedToGoogle: Boolean(row.synced_to_google),
  createdAt: row.created_at ?? null,
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
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
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
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
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
export const AiCapabilityModuleSchema = z.enum([
  'calendar_daily_plan',
  'work',
  'nutrition',
  'workouts',
  'habits',
  'progress',
  'tasks',
])
export const AiCapabilityKindSchema = z.enum(['read', 'proposal', 'write', 'outcome'])
export const AiCapabilityAvailabilitySchema = z.enum(['runtime', 'registered'])
export type AiCapabilityModule = z.infer<typeof AiCapabilityModuleSchema>
export type AiCapabilityKind = z.infer<typeof AiCapabilityKindSchema>
export type AiCapabilityAvailability = z.infer<typeof AiCapabilityAvailabilitySchema>

export const AiCapabilityErrorCodeSchema = z.enum([
  'unsupported_capability',
  'invalid_input',
  'invalid_output',
  'not_found',
  'forbidden',
  'conflict',
  'execution_failed',
])
export const AiCapabilityErrorSchema = z.object({
  code: AiCapabilityErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
})
export type AiCapabilityError = z.infer<typeof AiCapabilityErrorSchema>

export const AiCapabilityInventorySchema = z.object({
  name: z.string(),
  description: z.string(),
  modules: z.array(AiCapabilityModuleSchema).min(1),
  kind: AiCapabilityKindSchema,
  availability: AiCapabilityAvailabilitySchema,
  risk: z.enum(['auto', 'confirm']),
  scope: z.string().nullable(),
  confirmation: z.enum(['not_required', 'required']),
  idempotency: z.enum(['not_applicable', 'request_id']),
  audit: z.enum(['not_applicable', 'required']),
  errorCodes: z.array(AiCapabilityErrorCodeSchema).min(1),
  bounded: z.literal(true),
})

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
  modules: AiCapabilityModule[]
  kind: AiCapabilityKind
  availability: AiCapabilityAvailability
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

type MutationApplication<TResult = unknown> = {
  result: TResult
  targetIds: unknown[]
}

type ReadOrProposalCapabilityDefinition = Omit<
  AiCapabilityDefinition,
  'name' | 'availability' | 'risk'
> & {
  kind: 'read' | 'proposal'
  availability?: AiCapabilityAvailability
}

type MutationCapabilityDefinition = Omit<
  AiCapabilityDefinition,
  'name' | 'availability' | 'risk' | 'execute'
> & {
  kind: 'write' | 'outcome'
  availability?: AiCapabilityAvailability
  apply: (ctx: AiCapabilityContext, input: any) => Promise<MutationApplication>
}

type RawAiCapabilityDefinition = ReadOrProposalCapabilityDefinition | MutationCapabilityDefinition

type MaterializedCapabilityDefinitions<TDefinitions extends Record<string, RawAiCapabilityDefinition>> = {
  [TName in keyof TDefinitions]: Omit<TDefinitions[TName], 'apply' | 'availability'> & {
    name: TName & string
    availability: AiCapabilityAvailability
    risk: TDefinitions[TName]['kind'] extends 'write' | 'outcome' ? 'confirm' : 'auto'
    execute: (ctx: AiCapabilityContext, input: any) => Promise<any>
  }
}

function mutationResult<TResult>(result: TResult, targetIds: unknown[]): MutationApplication<TResult> {
  return { result, targetIds }
}

function defineCapabilities<const TDefinitions extends Record<string, RawAiCapabilityDefinition>>(
  definitions: TDefinitions,
): MaterializedCapabilityDefinitions<TDefinitions> {
  const capabilities: Record<string, AiCapabilityDefinition> = {}

  for (const [name, definition] of Object.entries(definitions)) {
    const availability = definition.availability ?? 'runtime'
    if (definition.kind === 'write' || definition.kind === 'outcome') {
      const { apply, ...metadata } = definition
      capabilities[name] = {
        ...metadata,
        name,
        availability,
        risk: 'confirm',
        async execute(ctx, input) {
          return withIdempotency(ctx, name, input.requestId, async () => {
            const application = await apply(ctx, input)
            await auditWrite(ctx, name, input, application.result, application.targetIds)
            return application.result
          })
        },
      }
      continue
    }

    const readDefinition = definition as ReadOrProposalCapabilityDefinition
    capabilities[name] = {
      ...readDefinition,
      name,
      availability,
      risk: 'auto',
    }
  }

  return capabilities as MaterializedCapabilityDefinitions<TDefinitions>
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

async function createPlannedItem(
  ctx: AiCapabilityContext,
  input: {
    title: string
    type: 'meal' | 'workout'
    category: 'nutrition' | 'fitness'
    scheduledDate: string
    startTime: string
    duration: number
    requestId?: string
    workoutPlanId?: string
  },
) {
  const row = await db.createTask({
    id: uuidv4(),
    user_id: ctx.userId,
    title: input.title,
    type: input.type,
    category: input.category,
    scheduled_date: input.scheduledDate,
    start_time: input.startTime,
    duration: input.duration,
    repeat_type: 'none',
    position: null,
    workout_plan_id: input.workoutPlanId ?? null,
  })
  const result = { item: taskToClient(row) }
  return mutationResult(result, [row.id])
}

export const AiCapabilities = defineCapabilities({
  get_today: {
    description: "Return a bounded overview of today's HealthyFlow Tasks, Habit instances, calories, weight, achievements, and workout sessions.",
    modules: ['calendar_daily_plan', 'work', 'nutrition', 'workouts', 'habits', 'progress', 'tasks'],
    kind: 'read',
    inputSchema: EmptyInput,
    outputSchema: z.object({
      date: z.string(),
      tasks: z.array(CapabilityItemSchema),
      calorieEntries: z.array(CalorieEntrySchema),
      weight: WeightEntrySchema.nullable(),
      achievements: z.array(AchievementSummarySchema),
      workoutSessions: z.array(WorkoutSessionSchema),
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
    description: 'Return an anchored daily context with bounded lookback windows and deterministic cross-module signals.',
    modules: ['calendar_daily_plan'],
    kind: 'read',
    inputSchema: DailyContextInputSchema,
    outputSchema: DailyContextSchema,
    async execute(ctx, input) {
      const parsed = input as z.infer<typeof DailyContextInputSchema>
      return buildDailyContext(ctx.userId, parsed.date)
    },
  },
  get_daily_plan: {
    description: 'Read the bounded, typed Daily Plan and its owning-module references for one date.',
    modules: ['calendar_daily_plan'],
    kind: 'read',
    availability: 'registered',
    inputSchema: DayPlanInput,
    outputSchema: DaySummarySchema,
    async execute(ctx, input) {
      return buildDaySummary(ctx.userId, input.date, input.timeZone)
    },
  },
  compute_daily_availability: {
    description: 'Compute bounded deterministic availability from the Daily Plan without changing it.',
    modules: ['calendar_daily_plan'],
    kind: 'proposal',
    availability: 'registered',
    inputSchema: DayPlanInput,
    outputSchema: z.object({
      date: z.string().regex(DATE_RE),
      capacity: DaySummaryCapacitySchema,
    }),
    async execute(ctx, input) {
      const summary = await buildDaySummary(ctx.userId, input.date, input.timeZone)
      return { date: input.date, capacity: summary.capacity }
    },
  },
  validate_daily_plan: {
    description: 'Validate and preview a possible timed placement against deterministic Daily Plan capacity without writing.',
    modules: ['calendar_daily_plan'],
    kind: 'proposal',
    availability: 'registered',
    inputSchema: DailyPlanPlacementInputSchema,
    outputSchema: DailyPlanPlacementValidationSchema,
    execute(ctx, input) {
      return validateDailyPlacement(ctx.userId, input)
    },
  },
  list_work_projects: {
    description: 'List the authenticated user’s bounded Work Projects and open Task counts.',
    modules: ['work'],
    kind: 'read',
    availability: 'registered',
    inputSchema: EmptyInput,
    outputSchema: z.object({ projects: z.array(WorkProjectSummarySchema) }),
    async execute(ctx) {
      return { projects: await Work.listProjects(ctx.userId) }
    },
  },
  get_work_scope: {
    description: 'Read one user-owned Project scope with its Tasks, Focus blocks, and Work sessions.',
    modules: ['work'],
    kind: 'read',
    availability: 'registered',
    inputSchema: ProjectIdInput,
    outputSchema: WorkScopeSchema,
    execute(ctx, input) {
      return Work.getScope(ctx.userId, input.projectId)
    },
  },
  review_task_alignment: {
    description: 'Review whether selected user-owned Work Tasks serve their Project target without changing either record.',
    modules: ['work'],
    kind: 'proposal',
    availability: 'registered',
    inputSchema: ReviewTaskAlignmentInput,
    outputSchema: TaskAlignmentSchema,
    async execute(ctx, input) {
      const scope = await Work.getScope(ctx.userId, input.projectId)
      if (!scope.project) throw Object.assign(new Error('Project not found'), { status: 404 })
      const selected = input.taskIds.map((taskId: string) => {
        const task = scope.tasks.find(candidate => candidate.id === taskId)
        if (!task) throw Object.assign(new Error('Work Task not found'), { status: 404 })
        const aligned = task.relation !== 'Optional polish' && task.relation !== 'Unrelated'
        return {
          ...task,
          aligned,
          reason: task.relation
            ? `${task.relation} relative to the Project target.`
            : 'No target relationship has been recorded.',
        }
      })
      return { project: scope.project, tasks: selected }
    },
  },
  list_tasks: {
    description: 'List bounded Tasks and Habit instances for a specific date, defaulting to today.',
    modules: ['tasks'],
    kind: 'read',
    inputSchema: LimitInput,
    outputSchema: z.object({
      date: z.string(),
      tasks: z.array(CapabilityItemSchema),
    }),
    async execute(ctx, input) {
      const parsed = input as LimitInputValue
      const date = parsed.date ?? todayIso()
      return { date, tasks: await tasksForDay(ctx.userId, date, parsed.limit) }
    },
  },
  list_habit_instances: {
    description: 'List bounded Habit instances relevant to one date, including virtual instances synthesized by the Habit module.',
    modules: ['habits'],
    kind: 'read',
    availability: 'registered',
    inputSchema: LimitInput,
    outputSchema: z.object({
      date: z.string().regex(DATE_RE),
      habits: z.array(CapabilityItemSchema),
    }),
    async execute(ctx, input) {
      const date = input.date ?? todayIso()
      const items = await tasksForDay(ctx.userId, date, input.limit)
      return { date, habits: items.filter(item => item.type === 'habit') }
    },
  },
  explain_rollover: {
    description: 'Explain the single ADR-0002 Rollover rule and list the authenticated user’s carried Tasks for a date.',
    modules: ['tasks'],
    kind: 'read',
    availability: 'registered',
    inputSchema: ExplainRolloverInput,
    outputSchema: RolloverExplanationSchema,
    async execute(ctx, input) {
      const rows = await Rollover.listForDay(ctx.userId, input.date)
      const items = rows.map(taskToClient).filter(item => !input.itemId || item.id === input.itemId)
      return { date: input.date, rule: 'incomplete_untimed_tasks_carry_forward' as const, items }
    },
  },
  list_calorie_entries: {
    description: 'List bounded Calorie entries for a specific date, defaulting to today.',
    modules: ['nutrition'],
    kind: 'read',
    inputSchema: LimitInput,
    outputSchema: z.object({
      date: z.string(),
      entries: z.array(CalorieEntrySchema),
    }),
    async execute(ctx, input) {
      const parsed = input as LimitInputValue
      const date = parsed.date ?? todayIso()
      const rows = await db.getCalorieEntriesByDay(ctx.userId, date)
      return { date, entries: clampRows(rows.map(calorieToClient), parsed.limit) }
    },
  },
  get_nutrition_context: {
    description: 'Read the bounded Nutrition status, logged history, macro totals, and current Weight context for one date.',
    modules: ['nutrition'],
    kind: 'read',
    availability: 'registered',
    inputSchema: DayPlanInput,
    outputSchema: z.object({
      date: z.string().regex(DATE_RE),
      nutrition: NutritionSummarySchema,
    }),
    async execute(ctx, input) {
      const summary = await buildDaySummary(ctx.userId, input.date, input.timeZone)
      return { date: input.date, nutrition: summary.supporting.nutrition }
    },
  },
  search_calorie_history: {
    description: 'Search the user-owned reusable Calorie entry history for exact and fuzzy food matches. Prefer exact history over online nutrition lookup.',
    modules: ['nutrition'],
    kind: 'read',
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
    description: 'Look up nutrition candidates for a food query through backend-controlled online sources. Use only when user history is missing or weak; never treat low-confidence estimates as certain.',
    modules: ['nutrition'],
    kind: 'read',
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
    description: 'Use the same AI Meal Entry parser as the Calories page for an attached meal or nutrition-label photo, or to split a vague or composite meal description into separate reusable Calorie entry candidates. In internal Talk, the current image attachment is passed to this parser automatically. Use this before add_calorie_entry/add_calorie_entries for attached food images and multi-food meals.',
    modules: ['nutrition'],
    kind: 'proposal',
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
  plan_meal_timing: {
    description: 'Propose and validate Meal timing as a plan; this never records a Calorie outcome.',
    modules: ['nutrition'],
    kind: 'proposal',
    availability: 'registered',
    inputSchema: PlanMealTimingInput,
    outputSchema: MealTimingProposalSchema,
    async execute(ctx, input) {
      const validation = await validateDailyPlacement(ctx.userId, {
        date: input.date,
        timeZone: input.timeZone,
        startTime: input.preferredTime,
        durationMinutes: input.durationMinutes,
        transitionMinutes: 0,
      })
      return { meal: input.meal, validation }
    },
  },
  list_weight_summary: {
    description: 'Return recent Weight entries with latest, previous, and delta values.',
    modules: ['progress'],
    kind: 'read',
    inputSchema: RecentLimitInput,
    outputSchema: z.object({
      entries: z.array(WeightEntrySchema),
      latest: WeightEntrySchema.nullable(),
      previous: WeightEntrySchema.nullable(),
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
    description: 'List active Achievement definitions with recent entries and progress summaries.',
    modules: ['progress'],
    kind: 'read',
    inputSchema: z.object({
      entryLimit: z.number().int().min(1).max(100).default(30),
    }),
    outputSchema: z.object({
      achievements: z.array(AchievementSummarySchema),
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
    description: 'List bounded Workout sessions for a specific date, defaulting to today.',
    modules: ['workouts'],
    kind: 'read',
    inputSchema: LimitInput,
    outputSchema: z.object({
      date: z.string(),
      sessions: z.array(WorkoutSessionSchema),
    }),
    async execute(ctx, input) {
      const parsed = input as LimitInputValue
      const date = parsed.date ?? todayIso()
      const sessions = await Workouts.listSessions(ctx.userId, date)
      return { date, sessions: clampRows(sessions, parsed.limit) }
    },
  },
  list_workout_plans: {
    description: 'List the authenticated user’s Workout plans with bounded exercise definitions.',
    modules: ['workouts'],
    kind: 'read',
    availability: 'registered',
    inputSchema: EmptyInput,
    outputSchema: z.object({ plans: z.array(WorkoutPlanSchema) }),
    async execute(ctx) {
      return { plans: await Workouts.listPlans(ctx.userId) }
    },
  },
  place_item: {
    description: 'Preview then apply a confirmed date/time placement to one user-owned Item.',
    modules: ['calendar_daily_plan', 'tasks'],
    kind: 'write',
    availability: 'registered',
    scope: 'hf:write:update',
    inputSchema: PlaceItemInput,
    outputSchema: TaskOutput,
    async preview(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      return taskPreview('place_item', task, {
        placement: { scheduledDate: input.scheduledDate, startTime: input.startTime, position: input.position ?? null },
      })
    },
    async apply(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      const row = await db.updateTask(task.id, {
        scheduled_date: input.scheduledDate,
        start_time: input.startTime,
        position: input.startTime ? null : input.position ?? await db.getNextPosition(ctx.userId, input.scheduledDate),
      })
      return mutationResult({ item: taskToClient(row) }, [row.id])
    },
  },
  create_focus_block: {
    description: 'Preview then create a confirmed Focus block through the Work service.',
    modules: ['work'],
    kind: 'write',
    availability: 'registered',
    scope: 'hf:write:add',
    inputSchema: CreateFocusBlockCapabilityInput,
    outputSchema: z.object({ focusBlock: FocusBlockSchema, ...MutationResultFields }),
    async preview(ctx, input) {
      if (input.projectId) await Work.getScope(ctx.userId, input.projectId)
      return addPreview('create_focus_block', { focusBlock: input })
    },
    async apply(ctx, input) {
      const { requestId: _requestId, ...createInput } = input
      const focusBlock = await Work.createFocusBlock(ctx.userId, createInput)
      return mutationResult({ focusBlock }, [focusBlock.id])
    },
  },
  transition_focus_block: {
    description: 'Preview then apply a confirmed start, finish, blocked, drift, continue, or cancel transition through the Work state machine.',
    modules: ['work'],
    kind: 'write',
    availability: 'registered',
    scope: 'hf:write:update',
    inputSchema: TransitionFocusBlockCapabilityInput,
    outputSchema: z.object({ focusBlock: FocusBlockSchema, ...MutationResultFields }),
    async preview(_ctx, input) {
      return { action: 'transition_focus_block', focusBlockId: input.focusBlockId, transition: input.action }
    },
    async apply(ctx, input) {
      const focusBlock = await Work.transitionFocusBlock(ctx.userId, input.focusBlockId, { action: input.action })
      return mutationResult({ focusBlock }, [focusBlock.id])
    },
  },
  complete_work_review: {
    description: 'Preview then record a confirmed structured Work review and the resulting Work session.',
    modules: ['work'],
    kind: 'outcome',
    availability: 'registered',
    scope: 'hf:write:complete',
    inputSchema: CompleteWorkReviewCapabilityInput,
    outputSchema: ReviewCompletionSchema.extend(MutationResultFields),
    async preview(_ctx, input) {
      return { action: 'complete_work_review', focusBlockId: input.focusBlockId, review: input }
    },
    async apply(ctx, input) {
      const { focusBlockId, requestId: _requestId, ...reviewInput } = input
      const result = await Work.completeReview(ctx.userId, focusBlockId, reviewInput)
      return mutationResult(result, [result.focusBlock.id, result.review.id, result.session.id])
    },
  },
  update_work_task: {
    description: 'Preview then update one user-owned Work Task through its Project scope.',
    modules: ['work'],
    kind: 'write',
    availability: 'registered',
    scope: 'hf:write:update',
    inputSchema: UpdateWorkTaskCapabilityInput,
    outputSchema: z.object({ task: TaskRecordSchema, ...MutationResultFields }),
    async preview(ctx, input) {
      const scope = await Work.getScope(ctx.userId, input.projectId)
      const task = scope.tasks.find(candidate => candidate.id === input.taskId)
      if (!task) throw Object.assign(new Error('Work Task not found'), { status: 404 })
      return { action: 'update_work_task', task, updates: input }
    },
    async apply(ctx, input) {
      const { projectId, taskId, requestId: _requestId, ...updates } = input
      const task = await Work.updateTask(ctx.userId, projectId, taskId, updates)
      return mutationResult({ task }, [task.id])
    },
  },
  update_project_context: {
    description: 'Preview then merge a confirmed bounded context update into one user-owned Work Project.',
    modules: ['work'],
    kind: 'write',
    availability: 'registered',
    scope: 'hf:write:update',
    inputSchema: UpdateProjectContextInput,
    outputSchema: z.object({ project: WorkProjectSchema, ...MutationResultFields }),
    async preview(ctx, input) {
      const scope = await Work.getScope(ctx.userId, input.projectId)
      if (!scope.project) throw Object.assign(new Error('Project not found'), { status: 404 })
      return { action: 'update_project_context', project: scope.project, context: input.context }
    },
    async apply(ctx, input) {
      const project = await Work.updateProject(ctx.userId, input.projectId, { context: input.context })
      return mutationResult({ project }, [project.id])
    },
  },
  schedule_meal: {
    description: 'Preview then schedule a planned Meal Item; this does not log calories or claim the meal happened.',
    modules: ['nutrition'],
    kind: 'write',
    availability: 'registered',
    scope: 'hf:write:add',
    inputSchema: ScheduleMealInput,
    outputSchema: TaskOutput,
    async preview(_ctx, input) {
      return addPreview('schedule_meal', { item: { ...input, type: 'meal', category: 'nutrition' } })
    },
    apply(ctx, input) {
      return createPlannedItem(ctx, {
        ...input,
        type: 'meal',
        category: 'nutrition',
      })
    },
  },
  schedule_workout: {
    description: 'Preview then schedule a user-owned Workout plan as a planned Workout Item; this does not record a session.',
    modules: ['workouts'],
    kind: 'write',
    availability: 'registered',
    scope: 'hf:write:add',
    inputSchema: ScheduleWorkoutInput,
    outputSchema: TaskOutput,
    async preview(ctx, input) {
      const plan = (await Workouts.listPlans(ctx.userId)).find(candidate => candidate.id === input.workoutPlanId)
      if (!plan) throw Object.assign(new Error('Workout plan not found'), { status: 404 })
      return addPreview('schedule_workout', { plan, placement: input })
    },
    async apply(ctx, input) {
      const plan = (await Workouts.listPlans(ctx.userId)).find(candidate => candidate.id === input.workoutPlanId)
      if (!plan) throw Object.assign(new Error('Workout plan not found'), { status: 404 })
      return createPlannedItem(ctx, {
        ...input,
        title: plan.name,
        type: 'workout',
        category: 'fitness',
      })
    },
  },
  record_habit_outcome: {
    description: 'Preview then record an explicit outcome for one user-owned Habit instance.',
    modules: ['habits'],
    kind: 'outcome',
    availability: 'registered',
    scope: 'hf:write:complete',
    inputSchema: RecordHabitOutcomeInput,
    outputSchema: z.object({ detail: HabitProgressDetailSchema, ...MutationResultFields }),
    async preview(ctx, input) {
      const current = await HabitProgress.get(ctx.userId, input.itemId, input.date)
      return { action: 'record_habit_outcome', current, outcome: input.outcome }
    },
    async apply(ctx, input) {
      const detail = await HabitProgress.setOutcome(ctx.userId, input.itemId, { outcome: input.outcome, date: input.date })
      return mutationResult({ detail }, [detail.habit.id])
    },
  },
  record_habit_progress: {
    description: 'Preview then add explicit progress to one user-owned measurable Habit instance.',
    modules: ['habits'],
    kind: 'outcome',
    availability: 'registered',
    scope: 'hf:write:add',
    inputSchema: RecordHabitProgressInput,
    outputSchema: z.object({ detail: HabitProgressDetailSchema, ...MutationResultFields }),
    async preview(ctx, input) {
      const current = await HabitProgress.get(ctx.userId, input.itemId, input.date)
      return { action: 'record_habit_progress', current, amount: input.amount, note: input.note ?? null }
    },
    async apply(ctx, input) {
      const detail = await HabitProgress.add(ctx.userId, input.itemId, {
        amount: input.amount,
        note: input.note,
        date: input.date,
      })
      return mutationResult({ detail }, [detail.habit.id])
    },
  },
  defer_task: {
    description: 'Preview then defer one user-owned Task to an explicit later date.',
    modules: ['tasks'],
    kind: 'write',
    availability: 'registered',
    scope: 'hf:write:update',
    inputSchema: DeferTaskInput,
    outputSchema: TaskOutput,
    async preview(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      return taskPreview('defer_task', task, { deferToDate: input.deferToDate })
    },
    async apply(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      if (task.type !== 'task') throw Object.assign(new Error('Only a Task can be deferred'), { status: 400 })
      const row = await db.updateTask(task.id, {
        scheduled_date: input.deferToDate,
        start_time: null,
        completed: false,
        completed_at: null,
        position: await db.getNextPosition(ctx.userId, input.deferToDate),
      })
      return mutationResult({ item: taskToClient(row) }, [row.id])
    },
  },
  add_task: {
    description: 'Preview then add a one-shot Task. Internal chat must ask for confirmation before executing.',
    modules: ['tasks'],
    kind: 'write',
    scope: 'hf:write:add',
    inputSchema: AddTaskInput,
    outputSchema: TaskOutput,
    async preview(_ctx, input) {
      return addPreview('add_task', { item: previewTaskRow(input, 'task') })
    },
    async apply(ctx, input) {
      const row = await db.createTask(await taskRow(input, ctx.userId, 'task'))
      return mutationResult({ item: taskToClient(row) }, [row.id])
    },
  },
  add_habit: {
    description: 'Preview then add a recurring Habit template. Internal chat must ask for confirmation before executing.',
    modules: ['habits'],
    kind: 'write',
    scope: 'hf:write:add',
    inputSchema: AddHabitInput,
    outputSchema: TaskOutput,
    async preview(_ctx, input) {
      return addPreview('add_habit', { item: previewTaskRow(input, 'habit') })
    },
    async apply(ctx, input) {
      const row = await db.createTask(await taskRow(input, ctx.userId, 'habit'))
      return mutationResult({ item: taskToClient(row) }, [row.id])
    },
  },
  add_calorie_entry: {
    description: 'Preview then add a Calorie entry. Internal chat must ask for confirmation before executing.',
    modules: ['nutrition'],
    kind: 'outcome',
    scope: 'hf:write:add',
    inputSchema: AddCalorieEntryInput,
    outputSchema: z.object({ entry: CalorieEntrySchema, ...MutationResultFields }),
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
    async apply(ctx, input) {
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
      return mutationResult({ entry: calorieToClient(row) }, [row.id])
    },
  },
  add_calorie_entries: {
    description: 'Preview then add multiple Calorie entries as one meal group. Use this for vague or composite meals so each food remains reusable in calorie history.',
    modules: ['nutrition'],
    kind: 'outcome',
    scope: 'hf:write:add',
    inputSchema: AddCalorieEntriesInput,
    outputSchema: z.object({ entries: z.array(CalorieEntrySchema), ...MutationResultFields }),
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
    async apply(ctx, input) {
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
      return mutationResult({ entries: rows.map(calorieToClient) }, rows.map((row) => row.id))
    },
  },
  add_weight_entry: {
    description: 'Preview then add a Weight entry for a date. Internal chat must ask for confirmation before executing.',
    modules: ['progress'],
    kind: 'outcome',
    scope: 'hf:write:add',
    inputSchema: AddWeightEntryInput,
    outputSchema: z.object({ entry: WeightEntrySchema, ...MutationResultFields }),
    async preview(_ctx, input) {
      return addPreview('add_weight_entry', {
        entry: {
          date: input.date ?? todayIso(),
          weightKg: input.weightKg,
        },
      })
    },
    async apply(ctx, input) {
      const row = await db.createWeightEntry({
        id: uuidv4(),
        user_id: ctx.userId,
        date: input.date ?? todayIso(),
        weight_kg: input.weightKg,
      })
      return mutationResult({ entry: weightToClient(row) }, [row.id])
    },
  },
  add_achievement_entry: {
    description: 'Preview then add an Achievement entry to an existing Achievement definition.',
    modules: ['progress'],
    kind: 'outcome',
    scope: 'hf:write:add',
    inputSchema: AddAchievementEntryInput,
    outputSchema: z.object({ entry: AchievementEntrySchema, ...MutationResultFields }),
    async preview(_ctx, input) {
      const { requestId: _requestId, ...entry } = input
      return addPreview('add_achievement_entry', { entry })
    },
    async apply(ctx, input) {
      const { achievementId, requestId: _requestId, ...entry } = input
      const result = { entry: await Achievements.createEntry(ctx.userId, achievementId, entry) }
      return mutationResult(result, [result.entry.id])
    },
  },
  add_workout_session: {
    description: 'Preview then add a Workout session with exercises.',
    modules: ['workouts'],
    kind: 'outcome',
    scope: 'hf:write:add',
    inputSchema: AddWorkoutSessionInput,
    outputSchema: z.object({ session: WorkoutSessionSchema, ...MutationResultFields }),
    async preview(_ctx, input) {
      const { requestId: _requestId, ...session } = input
      return addPreview('add_workout_session', { session })
    },
    async apply(ctx, input) {
      const { requestId: _requestId, ...sessionInput } = input
      const result = { session: await Workouts.createSession(ctx.userId, sessionInput) }
      return mutationResult(result, [result.session.id])
    },
  },
  update_item: {
    description: 'Preview then update a Task or Habit instance. Internal chat must ask for confirmation before executing.',
    modules: ['tasks'],
    kind: 'write',
    scope: 'hf:write:update',
    inputSchema: UpdateItemInput,
    outputSchema: TaskOutput,
    async preview(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      return taskPreview('update_item', task, { updates: input })
    },
    async apply(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      const updates: Record<string, unknown> = {}
      if (input.title !== undefined) updates.title = input.title
      if (input.category !== undefined) updates.category = input.category
      if (input.duration !== undefined) updates.duration = input.duration
      if (input.startTime !== undefined) updates.start_time = input.startTime
      if (input.scheduledDate !== undefined) updates.scheduled_date = input.scheduledDate
      if (input.position !== undefined) updates.position = input.position
      const row = await db.updateTask(task.id, updates)
      return mutationResult({ item: taskToClient(row) }, [row.id])
    },
  },
  complete_task: {
    description: 'Preview then complete a Task or Habit instance. Internal chat must ask for confirmation before executing.',
    modules: ['tasks'],
    kind: 'outcome',
    scope: 'hf:write:complete',
    inputSchema: CompleteTaskInput,
    outputSchema: TaskOutput,
    async preview(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      return taskPreview('complete_task', task)
    },
    async apply(ctx, input) {
      const { task, parsedVirtual } = await getOwnedTask(ctx.userId, input.itemId)
      const row = parsedVirtual
        ? await db.createHabitInstance(parsedVirtual.originalHabitId, parsedVirtual.date, ctx.userId, { completed: true })
        : await db.updateTask(task.id, { completed: true, completed_at: new Date().toISOString() })
      return mutationResult({ item: taskToClient(row) }, [row.id])
    },
  },
  delete_item: {
    description: 'Preview then delete a Task or Habit instance. Internal chat must ask for confirmation before executing.',
    modules: ['tasks'],
    kind: 'write',
    scope: 'hf:write:delete',
    inputSchema: DeleteItemInput,
    outputSchema: z.object({ deleted: z.boolean(), itemId: z.string(), duplicated: z.boolean().optional() }),
    async preview(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      return taskPreview('delete_item', task, { deleteScope: input.deleteScope })
    },
    async apply(ctx, input) {
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
      return mutationResult({ deleted: true, itemId: input.itemId }, [input.itemId])
    },
  },
} satisfies Record<string, RawAiCapabilityDefinition>)

export const aiCapabilityInventory = (Object.values(AiCapabilities) as AiCapabilityDefinition[]).map(capability => {
  const mutation = capability.kind === 'write' || capability.kind === 'outcome'
  return AiCapabilityInventorySchema.parse({
    name: capability.name,
    description: capability.description,
    modules: capability.modules,
    kind: capability.kind,
    availability: capability.availability,
    risk: capability.risk,
    scope: capability.scope ?? null,
    confirmation: mutation ? 'required' : 'not_required',
    idempotency: mutation ? 'request_id' : 'not_applicable',
    audit: mutation ? 'required' : 'not_applicable',
    errorCodes: AiCapabilityErrorCodeSchema.options,
    bounded: true,
  })
})

export type AiCapabilityName = keyof typeof AiCapabilities

function zodDetails(error: z.ZodError) {
  return error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }))
}

function executionError(error: unknown): AiCapabilityError {
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : null
  const message = error instanceof Error ? error.message : 'Capability execution failed'
  if (error instanceof RecoverableToolError || status === 404) {
    return { code: 'not_found', message, retryable: false }
  }
  if (status === 403 || message === 'Forbidden') return { code: 'forbidden', message: 'Forbidden', retryable: false }
  if (status === 400) return { code: 'invalid_input', message, retryable: false }
  if (status === 409 || /already|duplicate/i.test(message)) return { code: 'conflict', message, retryable: false }
  if (/not found/i.test(message)) return { code: 'not_found', message, retryable: false }
  return { code: 'execution_failed', message, retryable: true }
}

async function runAiCapability(
  capability: AiCapabilityDefinition,
  ctx: AiCapabilityContext,
  args: unknown,
) {
  const parsed = capability.inputSchema.parse(args ?? {})
  const value = await capability.execute(ctx, parsed)
  return capability.outputSchema.parse(value)
}

export async function executeAiCapability(
  ctx: AiCapabilityContext,
  capabilityName: string,
  args: unknown,
): Promise<{ ok: true; value: unknown } | { ok: false; error: AiCapabilityError }> {
  const capability = AiCapabilities[capabilityName as AiCapabilityName] as AiCapabilityDefinition | undefined
  if (!capability) {
    return {
      ok: false,
      error: {
        code: 'unsupported_capability',
        message: `Unsupported capability: ${capabilityName}`,
        retryable: false,
      },
    }
  }

  let parsed: unknown
  try {
    parsed = capability.inputSchema.parse(args ?? {})
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: { code: 'invalid_input', message: 'Capability input is invalid', retryable: false, details: zodDetails(error) },
      }
    }
    return { ok: false, error: executionError(error) }
  }

  let value: unknown
  try {
    value = await capability.execute(ctx, parsed)
  } catch (error) {
    return { ok: false, error: executionError(error) }
  }

  try {
    return { ok: true, value: capability.outputSchema.parse(value) }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: { code: 'invalid_output', message: 'Capability output violated its contract', retryable: false, details: zodDetails(error) },
      }
    }
    return { ok: false, error: executionError(error) }
  }
}

function pendingActionToClient(row: any) {
  return {
    id: row.id,
    capability: row.capability,
    args: row.args,
    preview: row.preview,
    expiresAt: row.expires_at,
  }
}

export class PendingAiActionUnavailableError extends Error {
  readonly code = 'pending_action_unavailable'
}

export class DailySignalReviewError extends Error {
  constructor(
    message: string,
    readonly code: 'daily_signal_stale' | 'daily_signal_informational'
  ) {
    super(message)
  }
}

export async function preparePendingAiAction(
  ctx: AiCapabilityContext,
  capabilityName: string,
  args: unknown
) {
  const capability = AiCapabilities[capabilityName as AiCapabilityName] as AiCapabilityDefinition | undefined
  if (!capability || capability.risk !== 'confirm') throw new Error('Invalid pending action capability')
  const parsed = capability.inputSchema.parse(args ?? {})
  const preview = await capability.preview?.(ctx, parsed)
  const row = await db.createAiPendingAction({
    user_id: ctx.userId,
    capability: capability.name,
    args: parsed,
    preview,
    caller: ctx.caller ?? 'internal',
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })
  return pendingActionToClient(row)
}

export async function prepareDailySignalAction(
  userId: string,
  input: { date: string; signalId: string }
): Promise<{ signal: DailySignal; pendingAction: ReturnType<typeof pendingActionToClient> }> {
  const context = await buildDailyContext(userId, input.date)
  const signal = context.signals.find((candidate) => candidate.id === input.signalId)
  if (!signal) {
    throw new DailySignalReviewError(
      'This Daily Signal is no longer current. Refresh Daily Signals and review the latest plan.',
      'daily_signal_stale'
    )
  }
  if (signal.kind !== 'actionable') {
    throw new DailySignalReviewError(
      'This Daily Signal is informational and does not contain an exact change to apply.',
      'daily_signal_informational'
    )
  }

  const pendingAction = await preparePendingAiAction(
    { userId, caller: 'internal' },
    signal.proposal.capability,
    signal.proposal.arguments
  )
  return { signal, pendingAction }
}

export function aiCapabilityTools(options: {
  mode?: 'internal' | 'mcp'
  scopes?: string[]
  caller?: AiCaller
  includeRegistered?: boolean
} = {}) {
  const mode = options.mode ?? 'internal'
  const scopes = options.scopes ?? []
  return (Object.values(AiCapabilities) as AiCapabilityDefinition[]).filter((capability) => {
    if (!options.includeRegistered && capability.availability === 'registered') return false
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
        return { pendingAction: await preparePendingAiAction(ctx, capability.name, parsed) }
      }
      return runAiCapability(capability, ctx, parsed)
    },
  }))
}

export async function executePendingAiAction(userId: string, actionId: string, overrides?: unknown) {
  const action = await db.getAiPendingAction(actionId)
  if (!action || action.user_id !== userId) throw new Error('Pending action not found')
  if (action.executed_at || action.canceled_at || new Date(action.expires_at).getTime() <= Date.now()) {
    throw new PendingAiActionUnavailableError('Pending action is no longer available')
  }
  const capability = AiCapabilities[action.capability as AiCapabilityName] as AiCapabilityDefinition | undefined
  if (!capability || capability.risk !== 'confirm') throw new Error('Invalid pending action')
  const editedArgs = overrides && typeof overrides === 'object' && !Array.isArray(overrides)
    ? { ...(action.args as Record<string, unknown>), ...(overrides as Record<string, unknown>) }
    : action.args
  const parsed = capability.inputSchema.parse(editedArgs)
  const result = await runAiCapability(capability, { userId, caller: action.caller ?? 'internal' }, parsed)
  await db.markAiPendingActionExecuted(actionId)
  return { result, action: pendingActionToClient({ ...action, args: parsed }) }
}

export async function cancelPendingAiAction(userId: string, actionId: string) {
  const row = await db.cancelAiPendingAction(actionId, userId)
  if (!row) throw new Error('Pending action not found')
  return pendingActionToClient(row)
}
