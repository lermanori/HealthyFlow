import type { Attention, ProjectStatus, TargetRelation } from '../../services/api'

// Presentation for the Work module, kept out of the components so the meaning
// of a relationship or an attention level is defined once. Every value is a
// semantic token, never a hex code, so both themes are covered.

/**
 * A Task's relationship to its Project target. The ramp is deliberate:
 * Unblocking reads as the warning colour because an unblocking Task is the one
 * standing between the user and the target; Optional and "Unrelated now" are
 * intentionally quiet so they cannot compete for attention with work that moves
 * the target.
 */
export const RELATION_CLASS: Record<TargetRelation, string> = {
  'Unblocking': 'border-state-warning/30 bg-state-warning/10 text-state-warning',
  'Direct progress': 'border-accent/30 bg-accent/10 text-accent',
  'Maintenance': 'border-line-strong bg-raised text-ink-soft',
  'Optional polish': 'border-line-strong text-ink-muted',
  'Unrelated': 'border-line-strong text-ink-muted',
}

export const ATTENTION_CLASS: Record<Attention, string> = {
  Focused: 'text-accent',
  Mixed: 'text-ink-soft',
  Drifted: 'text-state-warning',
}

export const PROJECT_STATUS_CLASS: Record<ProjectStatus, string> = {
  Planned: 'border-line-strong bg-raised text-ink-soft',
  Active: 'border-accent/30 bg-accent/10 text-accent',
  Paused: 'border-line-strong bg-raised text-ink-muted',
  Done: 'border-state-success/30 bg-state-success/10 text-state-success',
}

/** Offered Focus block lengths, in focused minutes. */
export const FOCUS_DURATIONS = [25, 45, 60] as const

/** What a Project has not recorded yet is said, not hidden. */
export const NOT_RECORDED = 'Not recorded yet'

export const orNotRecorded = (value: string | null | undefined) =>
  value?.trim() || NOT_RECORDED

/**
 * Work sessions are stamped with an absolute time. Rendering them relative
 * ("Today, 10:00") is what makes a list of sessions readable as a history.
 */
export function formatSessionTime(occurredAt: string) {
  const date = new Date(occurredAt)
  if (Number.isNaN(date.getTime())) return occurredAt

  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const days = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86_400_000,
  )

  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  if (days > 1 && days < 7) return `${date.toLocaleDateString(undefined, { weekday: 'long' })}, ${time}`
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}
