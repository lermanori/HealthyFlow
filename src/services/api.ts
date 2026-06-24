/// <reference types="vite/client" />
import axios from 'axios'
import toast from 'react-hot-toast'
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

// Handle auth and credit errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.reload()
    }
    if (error.response?.status === 402) {
      toast.error('Out of AI credits')
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

  addTask: async (task: Omit<Task, 'id' | 'createdAt' | 'completed'>): Promise<Task> => {
    const response = await api.post('/tasks', task)
    return response.data
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
    return response.data
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

  queryTasks: async (question: string): Promise<{ answer: string }> => {
    const response = await api.post('/ai/query-tasks', { question })
    return response.data
  },
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

  syncTimedTasks: async (date: string): Promise<{ synced: number }> => {
    const response = await api.post('/calendar/google/sync-timed-tasks', {
      date,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    return response.data
  },
}

export const creditsService = {
  getBalance: async (): Promise<{ balance: number }> => {
    const response = await api.get('/credits/balance')
    return response.data
  },
}

export default api
