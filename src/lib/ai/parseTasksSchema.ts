import type { Category } from '../../../backend/src/task-contracts'

export interface TaskSuggestion {
  id: string
  title: string
  category: Category
  estimatedDuration: number
  priority: 'high' | 'medium' | 'low'
  type: 'task' | 'habit'
  startTime?: string
  scheduledDate: string
}

export interface AnalyzerPhoto {
  fileName: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  data: string
  previewUrl: string
}

export interface AITextAnalyzerProps {
  onClose?: () => void
  onConfirmed?: () => void
  scheduledDate?: string
  enableTTS?: boolean
}
