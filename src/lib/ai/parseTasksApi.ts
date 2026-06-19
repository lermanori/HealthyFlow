import { aiService } from '../../services/api'
import type { TaskSuggestion } from './parseTasksSchema'

export async function parseTasks(text: string): Promise<TaskSuggestion[]> {
  const { items } = await aiService.parseTasks(text)
  return items.map((it, idx) => ({
    id: `ai-${idx}`,
    title: it.title,
    category: it.category,
    estimatedDuration: it.duration,
    priority: it.priority,
    type: it.type,
    startTime: it.startTime ?? undefined,
    scheduledDate: it.scheduledDate,
  }))
}
