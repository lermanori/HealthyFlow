import type { TaskSuggestion } from '../../lib/ai/parseTasksSchema'
import TaskDraftCard, { TaskDraftCardValue } from '../TaskDraftCard'

interface SuggestionCardProps {
  suggestion: TaskSuggestion
  isSelected: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<TaskSuggestion>) => void
  quickDates: Array<{ label: string; value: string }>
  ttsEnabled: boolean
  onSpeakDetails: () => void
}

function toDraftValue(suggestion: TaskSuggestion): TaskDraftCardValue {
  return {
    title: suggestion.title,
    category: suggestion.category,
    duration: suggestion.estimatedDuration,
    priority: suggestion.priority,
    type: suggestion.type,
    startTime: suggestion.startTime ?? '',
    scheduledDate: suggestion.scheduledDate,
    repeat: suggestion.type === 'habit' ? 'daily' : undefined,
  }
}

function toSuggestionPatch(patch: Partial<TaskDraftCardValue>): Partial<TaskSuggestion> {
  const next: Partial<TaskSuggestion> = {}
  if (patch.title != null) next.title = String(patch.title)
  if (patch.category != null) next.category = String(patch.category)
  if (patch.duration != null) {
    const parsed = Number(patch.duration)
    next.estimatedDuration = Number.isFinite(parsed) ? parsed : 0
  }
  if (patch.priority != null && ['high', 'medium', 'low'].includes(String(patch.priority))) {
    next.priority = patch.priority as TaskSuggestion['priority']
  }
  if (patch.type === 'task' || patch.type === 'habit') next.type = patch.type
  if (patch.startTime !== undefined) next.startTime = patch.startTime ? String(patch.startTime) : undefined
  if (patch.scheduledDate != null) next.scheduledDate = String(patch.scheduledDate)
  return next
}

export default function SuggestionCard({
  suggestion,
  isSelected,
  onToggle,
  onUpdate,
  quickDates,
  ttsEnabled,
  onSpeakDetails,
}: SuggestionCardProps) {
  return (
    <TaskDraftCard
      value={toDraftValue(suggestion)}
      selected={isSelected}
      selectable
      editable
      quickDates={quickDates}
      onToggle={onToggle}
      onChange={(patch) => onUpdate(toSuggestionPatch(patch))}
      onSpeakDetails={ttsEnabled ? onSpeakDetails : undefined}
    />
  )
}
