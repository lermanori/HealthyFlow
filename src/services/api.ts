/// <reference types="vite/client" />
import axios from 'axios'
import toast from 'react-hot-toast'
import { analytics } from '../lib/analytics'
import type { ItemSource, ItemType } from '../lib/analytics/types'
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
// const API_BASE_URL = 'https://healthyflow-production.up.railway.app/api'

const api = axios.create({
  baseURL: API_BASE_URL,
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (timeZone) {
    config.headers['X-Client-Time-Zone'] = timeZone
  }
  return config
})

// Handle auth and AI token errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token')
      window.location.reload()
    }
    if (error.response?.status === 402) {
      toast.error('Out of AI credits. Open Settings to subscribe or buy more.')
    }
    return Promise.reject(error)
  }
)

export interface Project {
  id: string
  name: string
  description?: string
  color: string // hex color for visual distinction
  userId: string
  createdAt: string
  isArchived: boolean
}

// Fields present on every item variant
interface ItemBase {
  id: string
  title: string
  category: string
  startTime?: string
  location?: string | null
  duration?: number
  completed: boolean
  scheduledDate: string
  createdAt: string
  overdueNotified?: boolean
  rolledOverFromTaskId?: string
  originalCreatedAt?: string
  completedAt?: string
  projectId?: string
  project?: Project
  position?: number | null
  googleEventId?: string | null
  syncedToGoogle?: boolean
  googleSyncStatus?: 'pending' | 'synced' | 'skipped' | 'failed'
}

export interface TaskItem extends ItemBase {
  type: 'task'
  repeat?: 'none'
}

export interface HabitItem extends ItemBase {
  type: 'habit'
  repeat?: 'daily' | 'weekly'
  isHabitInstance?: boolean
  originalHabitId?: string
}

export interface GroceryItem extends ItemBase {
  type: 'grocery'
  repeat?: 'none'
  groceryInfo?: {
    quantity?: string
    price?: number
    groceryCategory?: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'other'
    store?: string
    notes?: string
  }
}

export interface MealItem extends ItemBase {
  type: 'meal'
  repeat?: 'none'
  mealInfo?: {
    mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
    ingredients?: Array<{ name: string; amount: string }>
    instructions?: string
    dietPlanId?: string
  }
}

export interface WorkoutItem extends ItemBase {
  type: 'workout'
  repeat?: 'none'
  workoutInfo?: {
    exercises?: Array<{
      name: string
      sets?: number
      reps?: number
      weight?: number
      duration?: number
      restTime?: number
    }>
    workoutType?: 'strength' | 'cardio' | 'flexibility' | 'sports'
    intensity?: 'low' | 'medium' | 'high'
    caloriesBurned?: number
    workoutPlanId?: string
    notes?: string
  }
}

// Discriminated union — keyed on `type`
export type Item = TaskItem | HabitItem | GroceryItem | MealItem | WorkoutItem

// Backwards-compat alias — all existing `Task` references keep working
export type Task = Item
export type DeleteScope = 'instance' | 'habit'

export interface WeeklySummary {
  totalTasks: number
  completedTasks: number
  completionRate: number
  categories: Record<string, { total: number; completed: number }>
  streaks: Record<string, number>
}

export interface AIRecommendation {
  id: string
  message: string
  type: 'suggestion' | 'encouragement' | 'tip'
  createdAt: string
}

export type DailySignalType = 'schedule_overload' | 'habit_risk' | 'missing_calorie_log'

export interface DailySignal {
  id: string
  type: DailySignalType
  severity: 'info' | 'low' | 'medium' | 'high'
  confidence: 'low' | 'medium' | 'high'
  summary: string
  evidence: Record<string, unknown>
  suggestedAction: {
    type: string
    label: string
    targetId?: string | null
  } | null
}

export interface DailyContext {
  date: string
  generatedAt: string
  day: {
    tasks: unknown[]
    calorieEntries: unknown[]
    weight: unknown | null
    achievements: unknown[]
    workoutSessions: unknown[]
    calendarEvents: unknown[]
  }
  lookback: {
    habitHistory: { windowDays: number; days: unknown[] }
    calorieHistory: { windowDays: number; days: unknown[] }
    workoutHistory: { windowDays: number; days: unknown[] }
  }
  signals: DailySignal[]
}

export interface AnalyticsData {
  dailyStats: Array<{
    date: string
    total: number
    completed: number
    categories: Record<string, any>
  }>
  summary: {
    totalTasks: number
    completedTasks: number
    averageCompletionRate: number
  }
}

export interface BillingSettings {
  appTokensPerUsd: number
  markupRate: number
  minMarkupTokens: number
  updatedAt?: string | null
}

export interface TokenManagerUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  created_at: string
  balance: number
  subscription_balance: number
  topup_balance: number
  balance_updated_at: string | null
  subscription: CreditSubscriptionState | null
}

export interface TokenManagerTotals {
  requestCount: number
  billedTokens: number
  markupTokens: number
  baseTokens: number
  openAiCostUsd: number
  promptTokens: number
  completionTokens: number
  totalOpenAiTokens: number
}

export interface TokenManagerActivity {
  id: string
  userId: string
  userEmail: string | null
  userName: string | null
  endpoint: string | null
  model: string | null
  promptTokens: number
  completionTokens: number
  totalOpenAiTokens: number
  openAiCostUsd: number
  creditsDelta: number
  billedTokens: number
  reservedTokens: number | null
  baseTokens: number
  markupTokens: number
  reason: string | null
  estimated: boolean
  balanceBefore: number | null
  balanceAfter: number | null
  createdAt: string
}

export interface ContactMessage {
  id: string
  userId: string
  userEmail: string | null
  userName: string | null
  kind: 'subscribe' | 'topup'
  message: string
  status: 'pending' | 'handled'
  handledAt: string | null
  handledBy: string | null
  createdAt: string
  updatedAt: string
}

export interface TokenManagerOverview {
  users: TokenManagerUser[]
  settings: BillingSettings
  subscriptionPricing: CreditSubscriptionPricing
  totals: {
    today: TokenManagerTotals
    thisWeek: TokenManagerTotals
    thisMonth: TokenManagerTotals
  }
  activity: TokenManagerActivity[]
}

export interface CreditSubscriptionPricing {
  promoActive: boolean
  phase: 'promo' | 'regular'
  priceUsd: number
  monthlyCredits: number
  sellCreditsPerUsd: number
  updatedAt?: string | null
}

export interface CreditSubscriptionState {
  active: boolean
  pricePhase: 'promo' | 'regular' | null
  monthlyCredits: number
  renewalDate: string | null
  lastMonthlyGrantAt: string | null
  updatedAt: string | null
}

export interface CreditSummary {
  balance: number
  subscriptionBalance: number
  topupBalance: number
  usedThisMonth: number
  monthlyGrantUsed: number
  pricing: CreditSubscriptionPricing
  subscription: CreditSubscriptionState
}

// Auth Service
export const authService = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password })
    return response.data
  },

  signup: async (email: string, password: string, name: string) => {
    const response = await api.post('/auth/signup', { email, password, name })
    return response.data
  },

  verifyToken: async () => {
    const response = await api.get('/auth/verify')
    return response.data
  },
}

// Task Service
export const taskService = {
  getTasks: async (date?: string): Promise<Task[]> => {
    console.log('API - getTasks called with date:', date)
    const response = await api.get('/tasks', { params: { date } })
    console.log('API - getTasks response:', response.data)
    
    // Debug: Check for rolled over tasks
    const rolledOverTasks = response.data.filter((task: Task) => task.rolledOverFromTaskId)
    if (rolledOverTasks.length > 0) {
      console.log('🔄 Found rolled over tasks:', rolledOverTasks.map((t: Task) => ({ title: t.title, rolledOverFromTaskId: t.rolledOverFromTaskId })))
    }
    
    return response.data
  },

  addTask: async (
    task: Omit<Task, 'id' | 'createdAt' | 'completed'>,
    source: ItemSource = 'manual'
  ): Promise<Task> => {
    const response = await api.post('/tasks', task)
    const created: Task = response.data
    analytics.capture('item_created', {
      item_type: created.type as ItemType,
      category: created.category,
      source,
      has_start_time: Boolean(created.startTime),
      repeat: created.repeat ?? 'none',
    })
    return created
  },

  updateTask: async (
    id: string,
    updates: Partial<Task>,
    editScope?: 'instance' | 'habit'
  ): Promise<Task> => {
    const response = await api.put(`/tasks/${id}`, editScope ? { ...updates, editScope } : updates)
    return response.data
  },

  completeTask: async (id: string): Promise<Task> => {
    const response = await api.post(`/tasks/complete/${id}`)
    const completed: Task = response.data
    analytics.capture('item_completed', {
      item_type: completed.type as ItemType,
      category: completed.category,
    })
    return completed
  },

  deleteTask: async (id: string, deleteScope?: DeleteScope): Promise<void> => {
    await api.delete(`/tasks/${id}`, {
      data: deleteScope ? { deleteScope } : undefined,
    })
  },

  // Batch-persist Anytime backlog order; ids ordered front-to-back
  async reorderTasks(ids: string[]): Promise<void> {
    await api.patch('/tasks/reorder', { ids })
  },
}

// Summary Service
export const summaryService = {
  getWeeklySummary: async (): Promise<WeeklySummary> => {
    const response = await api.get('/week-summary')
    return response.data
  },
}

// AI Service
export const aiService = {
  // ponytail: route not implemented server-side; return empty so UI shows graceful fallback, no 404
  getRecommendations: async (): Promise<AIRecommendation[]> => {
    return []
  },

  getDailyContext: async (date: string): Promise<DailyContext> => {
    const response = await api.get('/ai/daily-context', { params: { date } })
    return response.data
  },

  getPersonalizedTips: async (): Promise<string[]> => {
    const response = await api.get('/ai/tips')
    return response.data
  },

  getMotivationalMessage: async (): Promise<AIRecommendation> => {
    const response = await api.get('/ai/motivation')
    return response.data
  },

  parseTasks: async (
    text: string,
    photo?: { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string },
    defaultScheduleDate?: string
  ): Promise<{ items: ParsedItem[] }> => {
    const response = await api.post('/ai/parse-tasks', { text, photo, defaultScheduleDate })
    return response.data
  },

  chat: async (
    messages: AssistantChatMessage[],
    model?: AssistantChatModel,
    attachment?: AssistantChatAttachment
  ): Promise<AssistantChatResponse> => {
    const response = await api.post('/ai/chat', { messages, model, attachment })
    return response.data
  },

  confirmChatAction: async (actionId: string, args?: Record<string, unknown>): Promise<AssistantConfirmResponse> => {
    const response = await api.post('/ai/chat/confirm', { actionId, args })
    return response.data
  },

  cancelChatAction: async (actionId: string): Promise<AssistantPendingAction> => {
    const response = await api.post('/ai/chat/cancel', { actionId })
    return response.data
  },

  parseMeals: async (
    text: string,
    photo?: { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string },
    date?: string
  ): Promise<{ meals: ParsedMeal[]; review?: MealParseReview }> => {
    const response = await api.post('/ai/parse-meals', { text, photo, date })
    return response.data
  },
}

export interface AssistantChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type AssistantChatAttachment =
  | {
      kind: 'image'
      name: string
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
      data: string
    }
  | {
      kind: 'text'
      name: string
      mimeType: 'text/plain' | 'text/markdown'
      text: string
    }

export interface AssistantChatAttachmentMetadata {
  kind: 'image' | 'text'
  name: string
  mimeType: string
}

export type AssistantChatModel =
  | 'gpt-4o-mini'
  | 'gpt-5-mini'
  | 'gpt-5.4-mini'
  | 'gpt-5.4'
  | 'gpt-5.5'

export interface AssistantToolEvent {
  name: string
  args: unknown
  result: unknown
}

export interface AssistantChatResponse {
  message: string
  toolEvents: AssistantToolEvent[]
  pendingActions: AssistantPendingAction[]
}

export interface AssistantPendingAction {
  id: string
  capability: string
  args: Record<string, unknown>
  preview: unknown
  expiresAt: string
}

export interface AssistantConfirmResponse {
  result: unknown
  action: AssistantPendingAction
}

export interface MealParseReview {
  confidence: 'high' | 'medium' | 'low'
  score: number
  needsReview: boolean
  reasons: string[]
  summary: string | null
}

export interface ParsedMeal {
  name: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  quantity: string | null
}

export interface ParsedItem {
  title: string
  type: 'task' | 'habit'
  category: 'health' | 'work' | 'personal' | 'fitness' | 'grocery' | 'nutrition'
  duration: number
  priority: 'high' | 'medium' | 'low'
  startTime: string | null
  scheduledDate: string
  repeat: 'daily' | 'weekly' | 'none'
}

// Analytics Service
export const analyticsService = {
  getProductivityAnalytics: async (period: number = 7): Promise<AnalyticsData> => {
    const response = await api.get('/analytics/productivity', { params: { period } })
    return response.data
  },

  getHabitStreaks: async () => {
    const response = await api.get('/analytics/streaks')
    return response.data
  },

  getTimeDistribution: async () => {
    const response = await api.get('/analytics/time-distribution')
    return response.data
  },
}

export const projectService = {
  getProjects: async (): Promise<Project[]> => {
    const response = await api.get('/projects')
    return response.data
  },

  createProject: async (project: Omit<Project, 'id' | 'createdAt' | 'userId'>): Promise<Project> => {
    const response = await api.post('/projects', project)
    return response.data
  },

  updateProject: async (id: string, updates: Partial<Project>): Promise<Project> => {
    const response = await api.put(`/projects/${id}`, updates)
    return response.data
  },

  deleteProject: async (id: string): Promise<void> => {
    await api.delete(`/projects/${id}`)
  },

  archiveProject: async (id: string): Promise<Project> => {
    const response = await api.patch(`/projects/${id}/archive`)
    return response.data
  }
}

export interface CalendarConnectionStatus {
  provider: 'google'
  connected: boolean
  accountEmail: string | null
  connectedAt: string | null
  scopes: string[]
}

export interface ExternalCalendarEvent {
  id: string
  provider: 'google'
  calendarId: string
  externalEventId: string
  title: string
  description: string | null
  location: string | null
  startAt: string | null
  endAt: string | null
  localStartTime: string | null
  localEndTime: string | null
  allDay: boolean
  status: string | null
  htmlLink: string | null
  completed: boolean
  completedAt: string | null
}

export const calendarService = {
  getGoogleStatus: async (): Promise<CalendarConnectionStatus> => {
    const response = await api.get('/calendar/google/status')
    return response.data
  },

  getGoogleConnectUrl: async (): Promise<string> => {
    const response = await api.get('/calendar/google/connect-url')
    return response.data.url
  },

  disconnectGoogle: async (): Promise<void> => {
    await api.delete('/calendar/google/disconnect')
  },

  getGoogleEvents: async (date: string): Promise<ExternalCalendarEvent[]> => {
    const response = await api.get('/calendar/google/events', { params: { date } })
    return response.data
  },

  updateGoogleEventCompletion: async (id: string, completed: boolean): Promise<ExternalCalendarEvent> => {
    const response = await api.patch(`/calendar/google/events/${id}/completion`, { completed })
    return response.data
  },

  updateGoogleEventSchedule: async (
    id: string,
    update: { date: string; startTime: string }
  ): Promise<ExternalCalendarEvent> => {
    const response = await api.patch(`/calendar/google/events/${id}/schedule`, {
      ...update,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    return response.data
  },

  syncTimedTasks: async (date: string): Promise<{ synced: number }> => {
    const response = await api.post('/calendar/google/sync-timed-tasks', {
      date,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    return response.data
  },
}

// Fire credits_exhausted once per app session, not on every summary fetch.
let creditsExhaustedReported = false

export const creditsService = {
  getBalance: async (): Promise<{ balance: number }> => {
    const response = await api.get('/credits/balance')
    return response.data
  },

  getSummary: async (): Promise<CreditSummary> => {
    const response = await api.get('/credits/summary')
    const summary: CreditSummary = response.data
    analytics.setUserProperties({
      subscription_active: summary.subscription.active,
      credit_balance_bucket: summary.balance <= 0 ? 'none' : summary.balance < 25 ? 'low' : 'ok',
    })
    if (summary.balance <= 0 && !creditsExhaustedReported) {
      creditsExhaustedReported = true
      analytics.capture('credits_exhausted')
    }
    return summary
  },
}

export const contactMessagesService = {
  create: async (input: { kind: 'subscribe' | 'topup'; message: string }): Promise<ContactMessage> => {
    const response = await api.post('/contact-messages', input)
    analytics.capture('upgrade_request_sent', { kind: input.kind })
    return response.data
  },
}

export interface UserSettings {
  notifications: boolean
  dailyReminders: boolean
  weeklyReports: boolean
  aiSuggestions: boolean
  smartReminders: boolean
  completionSounds: boolean
  calorieIntake: boolean
  achievementTracker: boolean
  workoutTracker: boolean
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
  onboardingStatus: 'active' | 'completed' | 'skipped'
  theme: 'midnight' | 'white'
}

export const settingsService = {
  getSettings: async (): Promise<UserSettings> => {
    const response = await api.get('/settings')
    return response.data
  },

  updateSettings: async (partial: Partial<UserSettings>): Promise<UserSettings> => {
    const response = await api.patch('/settings', partial)
    return response.data
  },
}

export interface PushSubscriptionJSON {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

export type TouchpointType = 'morning' | 'midday' | 'weekly'

export interface DailyTouchpointRhythm {
  enabled: boolean
  time: string
  days: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>
  lastSent: string | null
}

export interface WeeklyTouchpointRhythm {
  enabled: boolean
  time: string
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6
  lastSent: string | null
}

export interface UserRhythm {
  timezone: string
  morning: DailyTouchpointRhythm
  midday: DailyTouchpointRhythm
  weekly: WeeklyTouchpointRhythm
}

export type UserRhythmPatch = Partial<{
  timezone: string
  morning: Partial<DailyTouchpointRhythm>
  midday: Partial<DailyTouchpointRhythm>
  weekly: Partial<WeeklyTouchpointRhythm>
}>

export const pushService = {
  subscribe: async (subscription: PushSubscriptionJSON): Promise<void> => {
    await api.post('/proactivity/push/subscribe', subscription)
  },
  unsubscribe: async (endpoint: string): Promise<void> => {
    await api.delete('/proactivity/push/subscribe', { data: { endpoint } })
  },
  sendTest: async (): Promise<void> => {
    await api.post('/proactivity/test-notification')
  },
  getKickoff: async (type: 'morning' | 'midday' | 'weekly'): Promise<string> => {
    const response = await api.get('/proactivity/kickoff', { params: { type } })
    return response.data.message
  },
}

export const rhythmService = {
  getRhythm: async (): Promise<UserRhythm> => {
    const response = await api.get('/proactivity/rhythm')
    return response.data
  },
  updateRhythm: async (partial: UserRhythmPatch): Promise<UserRhythm> => {
    const response = await api.put('/proactivity/rhythm', partial)
    return response.data
  },
}

export type ApiTokenScope = 'hf:read' | 'hf:write:add' | 'hf:write:update' | 'hf:write:complete' | 'hf:write:delete'

export interface ApiTokenRecord {
  id: string
  name: string
  scopes: ApiTokenScope[]
  audience: 'mcp'
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface CreatedApiToken {
  token: string
  record: ApiTokenRecord
}

export const connectionsService = {
  listTokens: async (): Promise<ApiTokenRecord[]> => {
    const response = await api.get('/settings/connections/tokens')
    return response.data
  },

  createToken: async (input: { name: string; scopes: ApiTokenScope[] }): Promise<CreatedApiToken> => {
    const response = await api.post('/settings/connections/tokens', { ...input, audience: 'mcp' })
    return response.data
  },

  revokeToken: async (tokenId: string): Promise<ApiTokenRecord> => {
    const response = await api.delete(`/settings/connections/tokens/${tokenId}`)
    return response.data
  },
}

export const onboardingService = {
  complete: async (): Promise<{ status: 'completed' }> => {
    const response = await api.post('/onboarding/complete')
    analytics.capture('onboarding_completed')
    analytics.setUserProperties({ onboarding_status: 'completed' })
    return response.data
  },

  skip: async (): Promise<{ status: 'skipped' }> => {
    const response = await api.post('/onboarding/skip')
    analytics.capture('onboarding_skipped')
    analytics.setUserProperties({ onboarding_status: 'skipped' })
    return response.data
  },
}

export interface CalorieEntry {
  id: string
  userId: string
  date: string
  time: string | null
  name: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  quantity: string | null
  createdAt: string
  updatedAt: string
}

export type CalorieEntryInput = {
  date: string
  time?: string | null
  name: string
  calories: number
  protein?: number | null
  carbs?: number | null
  fat?: number | null
  quantity?: string | null
}

export interface CalorieItem {
  id: string
  userId: string
  name: string
  normalizedName: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  usageCount: number
  lastUsedAt: string
  createdAt: string
  updatedAt: string
}

export const caloriesService = {
  list: async (date: string): Promise<CalorieEntry[]> => {
    const response = await api.get('/calories', { params: { date } })
    return response.data
  },

  create: async (entry: CalorieEntryInput, source: ItemSource = 'manual'): Promise<CalorieEntry> => {
    const response = await api.post('/calories', entry)
    analytics.capture('calorie_entry_logged', { source })
    return response.data
  },

  update: async (id: string, patch: Partial<CalorieEntryInput>): Promise<CalorieEntry> => {
    const response = await api.patch(`/calories/${id}`, patch)
    return response.data
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/calories/${id}`)
  },

  items: async (sort: 'recent' | 'most-used', limit = 8): Promise<CalorieItem[]> => {
    const response = await api.get('/calories/items', { params: { sort, limit } })
    return response.data
  },
}

export interface WeightEntry {
  id: string
  userId: string
  date: string
  weightKg: number
  createdAt: string
  updatedAt: string
}

export type WeightEntryInput = {
  date: string
  weightKg: number
}

export interface WeightTrend {
  entries: WeightEntry[]
  latest: WeightEntry | null
  previous: WeightEntry | null
  deltaKg: number | null
}

export const weightService = {
  getByDate: async (date: string): Promise<WeightEntry | null> => {
    const response = await api.get('/weight', { params: { date } })
    return response.data
  },

  recent: async (limit = 30): Promise<WeightTrend> => {
    const response = await api.get('/weight/recent', { params: { limit } })
    return response.data
  },

  create: async (entry: WeightEntryInput): Promise<WeightEntry> => {
    const response = await api.post('/weight', entry)
    analytics.capture('weight_logged')
    return response.data
  },

  update: async (id: string, patch: Partial<WeightEntryInput>): Promise<WeightEntry> => {
    const response = await api.patch(`/weight/${id}`, patch)
    return response.data
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/weight/${id}`)
  },
}

export interface WorkoutExercise {
  id: string
  sessionId: string
  name: string
  sets: number | null
  reps: number | null
  weightKg: number | null
  durationMinutes: number | null
  distanceKm: number | null
  notes: string | null
  position: number
}

export type WorkoutExerciseInput = {
  name: string
  sets?: number | null
  reps?: number | null
  weightKg?: number | null
  durationMinutes?: number | null
  distanceKm?: number | null
  notes?: string | null
  position?: number
}

export interface WorkoutSession {
  id: string
  userId: string
  date: string
  title: string | null
  notes: string | null
  exercises: WorkoutExercise[]
  createdAt: string
  updatedAt: string
}

export type WorkoutSessionInput = {
  date: string
  title?: string | null
  notes?: string | null
  exercises: WorkoutExerciseInput[]
}

export type WorkoutSessionPatch = {
  date?: string
  title?: string | null
  notes?: string | null
}

export interface WorkoutExerciseItem {
  id: string
  userId: string
  name: string
  normalizedName: string
  usageCount: number
  lastUsedAt: string
  createdAt: string
  updatedAt: string
}

export const workoutsService = {
  list: async (date: string): Promise<WorkoutSession[]> => {
    const response = await api.get('/workouts', { params: { date } })
    return response.data
  },

  create: async (session: WorkoutSessionInput): Promise<WorkoutSession> => {
    const response = await api.post('/workouts', session)
    analytics.capture('workout_logged')
    return response.data
  },

  update: async (id: string, patch: WorkoutSessionPatch): Promise<WorkoutSession> => {
    const response = await api.patch(`/workouts/${id}`, patch)
    return response.data
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/workouts/${id}`)
  },

  addExercise: async (sessionId: string, exercise: WorkoutExerciseInput): Promise<WorkoutExercise> => {
    const response = await api.post(`/workouts/${sessionId}/exercises`, exercise)
    return response.data
  },

  updateExercise: async (exerciseId: string, patch: Partial<WorkoutExerciseInput>): Promise<WorkoutExercise> => {
    const response = await api.patch(`/workouts/exercises/${exerciseId}`, patch)
    return response.data
  },

  removeExercise: async (exerciseId: string): Promise<void> => {
    await api.delete(`/workouts/exercises/${exerciseId}`)
  },

  items: async (sort: 'recent' | 'most-used', limit = 8): Promise<WorkoutExerciseItem[]> => {
    const response = await api.get('/workouts/exercises', { params: { sort, limit } })
    return response.data
  },
}

export type AchievementMetricType = 'reps' | 'weight' | 'duration' | 'distance' | 'custom'
export type AchievementBetterDirection = 'higher' | 'lower'

export interface AchievementDefinition {
  id: string
  userId: string
  name: string
  category: string | null
  metricType: AchievementMetricType
  unit: string
  betterDirection: AchievementBetterDirection
  targetValue: number | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AchievementEntry {
  id: string
  achievementId: string
  userId: string
  date: string
  value: number
  supportingValue: number | null
  supportingUnit: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface AchievementSummary {
  definition: AchievementDefinition
  entries: AchievementEntry[]
  latest: AchievementEntry | null
  previous: AchievementEntry | null
  personalBest: AchievementEntry | null
  trend: {
    delta: number | null
    direction: 'up' | 'down' | 'flat' | 'none'
    isImprovement: boolean | null
  }
  targetProgress: number | null
}

export type AchievementDefinitionInput = {
  name: string
  category?: string | null
  metricType: AchievementMetricType
  unit: string
  betterDirection: AchievementBetterDirection
  targetValue?: number | null
}

export type AchievementEntryInput = {
  date: string
  value: number
  supportingValue?: number | null
  supportingUnit?: string | null
  notes?: string | null
}

export const achievementService = {
  list: async (options: { includeArchived?: boolean; entryLimit?: number } = {}): Promise<AchievementSummary[]> => {
    const response = await api.get('/achievements', { params: options })
    return response.data
  },

  create: async (definition: AchievementDefinitionInput): Promise<AchievementDefinition> => {
    const response = await api.post('/achievements', definition)
    return response.data
  },

  update: async (id: string, patch: Partial<AchievementDefinitionInput> & { archived?: boolean }): Promise<AchievementDefinition> => {
    const response = await api.patch(`/achievements/${id}`, patch)
    return response.data
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/achievements/${id}`)
  },

  addEntry: async (achievementId: string, entry: AchievementEntryInput): Promise<AchievementEntry> => {
    const response = await api.post(`/achievements/${achievementId}/entries`, entry)
    analytics.capture('achievement_recorded')
    return response.data
  },

  updateEntry: async (entryId: string, patch: Partial<AchievementEntryInput>): Promise<AchievementEntry> => {
    const response = await api.patch(`/achievements/entries/${entryId}`, patch)
    return response.data
  },

  removeEntry: async (entryId: string): Promise<void> => {
    await api.delete(`/achievements/entries/${entryId}`)
  },
}

export const tokenManagerService = {
  getOverview: async (): Promise<TokenManagerOverview> => {
    const response = await api.get('/admin/token-manager/overview')
    return response.data
  },

  getContactMessages: async (status: 'pending' | 'handled' | 'all' = 'pending'): Promise<ContactMessage[]> => {
    const response = await api.get('/admin/token-manager/contact-messages', { params: { status } })
    return response.data
  },

  updateContactMessageStatus: async (
    messageId: string,
    status: 'pending' | 'handled'
  ): Promise<ContactMessage> => {
    const response = await api.patch(`/admin/token-manager/contact-messages/${messageId}`, { status })
    return response.data
  },

  setUserBalance: async (userId: string, balance: number): Promise<{ balance: number; delta: number }> => {
    const response = await api.patch(`/admin/token-manager/users/${userId}/balance`, { balance })
    return response.data
  },

  updateSettings: async (settings: { markupRate: number; minMarkupTokens: number }): Promise<BillingSettings> => {
    const response = await api.patch('/admin/token-manager/settings', settings)
    return response.data
  },

  updateSubscriptionPricing: async (settings: { promoActive: boolean }): Promise<CreditSubscriptionPricing> => {
    const response = await api.patch('/admin/token-manager/subscription-pricing', settings)
    return response.data
  },

  updateUserSubscription: async (
    userId: string,
    input: { active: boolean; grantMonthlyCredits: boolean }
  ): Promise<{ subscription: CreditSubscriptionState; balance: number; pricing: CreditSubscriptionPricing }> => {
    const response = await api.patch(`/admin/token-manager/users/${userId}/subscription`, input)
    return response.data
  },

  grantTopUp: async (
    userId: string,
    input: { dollars: number }
  ): Promise<{ balance: number; credits: number; dollars: number; pricing: CreditSubscriptionPricing }> => {
    const response = await api.post(`/admin/token-manager/users/${userId}/top-up`, input)
    return response.data
  },
}

export default api
