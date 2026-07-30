import { format, addDays } from 'date-fns'
import { getCategoryPresentation } from '../../categoryPresentation'

// Class strings are written out in full on purpose: Tailwind's JIT scans source
// for complete literals, so anything assembled from a template gets purged.
export const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high': return 'text-state-danger bg-state-danger/20 border-state-danger/30'
    case 'medium': return 'text-state-warning bg-state-warning/20 border-state-warning/30'
    case 'low': return 'text-state-success bg-state-success/20 border-state-success/30'
    default: return 'text-ink-muted bg-raised border-line'
  }
}

// Delegates to the shared presentation so the analyzer can't drift from the rest
// of the app. The previous local map covered only four of the six categories and
// silently rendered grocery and nutrition as personal.
export const getCategoryColor = (category: string) =>
  getCategoryPresentation(category).className

export const getDateLabel = (date: string) => {
  const today = format(new Date(), 'yyyy-MM-dd')
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  if (date === today) return 'Today'
  if (date === tomorrow) return 'Tomorrow'
  return format(new Date(date), 'MMM d')
}

export const getDateColor = (date: string) => {
  const today = format(new Date(), 'yyyy-MM-dd')
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  if (date === today) return 'text-accent bg-accent/20 border-accent/30'
  if (date === tomorrow) return 'text-state-info bg-state-info/20 border-state-info/30'
  return 'text-ink-muted bg-raised border-line'
}
