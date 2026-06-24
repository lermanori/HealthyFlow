import { aiService } from '../../services/api'
import type { AnalyzerPhoto, TaskSuggestion } from './parseTasksSchema'

export async function parseTasks(
  text: string,
  photo?: AnalyzerPhoto,
  defaultScheduleDate?: string
): Promise<TaskSuggestion[]> {
  const { items } = await aiService.parseTasks(
    text,
    photo ? { mimeType: photo.mimeType, data: photo.data } : undefined,
    defaultScheduleDate
  )
  return items.map((it) => ({
    id: crypto.randomUUID(),
    title: it.title,
    category: it.category,
    estimatedDuration: it.duration,
    priority: it.priority,
    type: it.type,
    startTime: it.startTime ?? undefined,
    scheduledDate: it.scheduledDate,
  }))
}
