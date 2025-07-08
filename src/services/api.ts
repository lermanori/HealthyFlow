/// <reference types="vite/client" />
import axios from 'axios'
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
  return config
})

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.reload()
    }
    return Promise.reject(error)
  }
)

export interface Task {
  id: string
  title: string
  type: 'task' | 'habit'
  startTime?: string
  duration?: number
  completed: boolean
  category: string
  repeat?: 'daily' | 'weekly' | 'none'
  scheduledDate?: string
  createdAt: string
  overdueNotified?: boolean
  isHabitInstance?: boolean
  originalHabitId?: string
  rolledOverFromTaskId?: string
  originalCreatedAt?: string
}

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

  updateTask: async (id: string, updates: Partial<Task>): Promise<Task> => {
    const response = await api.put(`/tasks/${id}`, updates)
    return response.data
  },

  completeTask: async (id: string): Promise<Task> => {
    const response = await api.post(`/tasks/complete/${id}`)
    return response.data
  },

  deleteTask: async (id: string): Promise<void> => {
    await api.delete(`/tasks/${id}`)
  },

  // Rollover incomplete tasks without dates to current day
  async rolloverTasks(toDate: string): Promise<{ success: boolean; message: string; rolledOverTasks: number }> {
    const response = await api.post('/tasks/rollover', { toDate })
    return response.data
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
  getRecommendations: async (): Promise<AIRecommendation[]> => {
    const response = await api.post('/ai/recommend')
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

  // OpenAI Integration (when API key is provided)
  getOpenAIRecommendations: async (taskHistory: any[]): Promise<AIRecommendation[]> => {
    const apiKey = localStorage.getItem('openai_api_key')
    if (!apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const response = await api.post('/ai/openai-recommendations', {
      taskHistory,
      apiKey
    })
    return response.data
  },
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

export default api