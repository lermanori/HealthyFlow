export interface TaskSuggestion {
  id: string
  title: string
  category: string
  estimatedDuration: number
  priority: 'high' | 'medium' | 'low'
  type: 'task' | 'habit'
  startTime?: string
  scheduledDate: string
}

export interface AITextAnalyzerProps {
  onClose?: () => void
  scheduledDate?: string
  enableTTS?: boolean
}
