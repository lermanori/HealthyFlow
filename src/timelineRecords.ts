/**
 * The Today timeline as the day's *record*, not only its plan.
 *
 * Every fact that belongs to a day earns a place on the clock. The placement
 * rule is one function (`timelineHour`); everything else here turns the
 * day-summary payload into flat rows the timeline can render.
 *
 * All wall-clock times arrive pre-resolved from the server (`resolvedTime`,
 * `loggedTime`), because they must reflect the *user's* timezone rather than the
 * viewing device's. Nothing in this file reads a clock.
 */

import type { DaySummary } from '../backend/src/day-summary-schema'
import type { Task } from './services/api'
import { getModulePresentation, moduleHealthHref } from './modulePresentation'

export type RecordKind = 'nutrition' | 'weight' | 'workout' | 'progress' | 'habit-progress'

export interface TimelineRecord {
  id: string
  kind: RecordKind
  /** Hour-slot key, e.g. "14:00". Always within FIRST_HOUR–LAST_HOUR. */
  hour: string
  /** Wall-clock time for display and within-hour ordering, e.g. "14:32". */
  time: string
  /** True when the hour was inferred from a logged-at timestamp, not a real clock time. */
  stamped: boolean
  title: string
  detail: string
  /** Navigational records link to their module page. */
  href?: string
  /** Habit progress chunks reopen the Habit's check-in sheet instead of navigating. */
  habitId?: string
}

export const FIRST_HOUR = 6
export const LAST_HOUR = 23

/** Hours outside the visible window clamp to the nearest edge so nothing is lost. */
export function slotKey(clock: string): string {
  const hour = Math.min(LAST_HOUR, Math.max(FIRST_HOUR, parseInt(clock, 10)))
  return `${String(hour).padStart(2, '0')}:00`
}

// ---------------------------------------------------------------------------
// Items — tasks and Habits keep their full card; we only decide placement.
// ---------------------------------------------------------------------------

/**
 * Settled: nothing further is owed today.
 *
 * `partial` is deliberately excluded. A Habit at 1/2 is the most *open* thing on
 * the board — treating it as settled would file it in the past and strip it from
 * the Anytime backlog where it is still actionable. Its progress chunks carry the
 * record instead (see `habitProgressRecords`).
 */
export function isSettled(task: Task): boolean {
  if (task.completed) return true
  if (task.type !== 'habit') return false
  const outcome = task.habitInfo?.outcome
  return outcome === 'completed' || outcome === 'failed'
}

/**
 * The whole placement rule.
 *   1. explicit startTime → that hour (a scheduled item stays where it was planned,
 *      even once done; its position is a fact about the plan)
 *   2. else settled       → the hour it was resolved
 *   3. else               → null; it stays in the Anytime backlog
 */
export function timelineHour(task: Task): string | null {
  if (task.startTime) return slotKey(task.startTime)
  if (!isSettled(task)) return null
  return task.resolvedTime ? slotKey(task.resolvedTime) : null
}

/** True when an item is on the clock only because it was settled. */
export function isStamped(task: Task): boolean {
  return !task.startTime && isSettled(task)
}

/** Sortable wall-clock time, so rows inside one hour order by minute, not by kind. */
export function timelineClock(task: Task): string {
  return task.startTime ?? task.resolvedTime ?? '00:00'
}

// ---------------------------------------------------------------------------
// Records — read-only rows for everything that isn't an item.
// ---------------------------------------------------------------------------

const nutritionHref = (date: string) => moduleHealthHref(getModulePresentation('calories'), date)
const workoutHref = (date: string) => moduleHealthHref(getModulePresentation('workouts'), date)
const progressHref = (date: string) => moduleHealthHref(getModulePresentation('achievements'), date)

function macroDetail(entry: DaySummary['calorieEntries'][number]): string {
  const macros = [
    entry.protein !== null ? `${entry.protein}p` : null,
    entry.carbs !== null ? `${entry.carbs}c` : null,
    entry.fat !== null ? `${entry.fat}f` : null,
  ].filter(Boolean)
  const head = entry.quantity ? `${entry.quantity} · ${entry.calories} cal` : `${entry.calories} cal`
  return macros.length > 0 ? `${head} · ${macros.join(' ')}` : head
}

function exerciseDetail(session: DaySummary['supporting']['workouts']['sessions'][number]): string {
  const names = session.exercises.map((exercise) => exercise.name)
  if (names.length === 0) return 'No exercises logged'
  const noun = names.length === 1 ? 'exercise' : 'exercises'
  return `${names.length} ${noun} · ${names.slice(0, 3).join(', ')}`
}

/**
 * Progress chunks as timeline rows — one per chunk, at the minute it was recorded.
 * This is the only honest record of a partial Habit: "pill 1 at 09:59, pill 2 at
 * 13:10" is two events, not one item with an invented time. The running total
 * rides along so a chunk reads in context.
 */
export function habitProgressRecords(tasks: Task[]): TimelineRecord[] {
  const records: TimelineRecord[] = []

  for (const task of tasks) {
    if (task.type !== 'habit') continue
    const chunks = task.habitInfo?.chunks ?? []
    if (chunks.length === 0) continue

    const target = task.habitInfo?.target ?? null
    let running = 0

    for (const chunk of chunks) {
      running += chunk.amount
      if (!chunk.loggedTime) continue
      const unit = target?.unit ?? ''
      const context = target ? ` → ${running} / ${target.value} ${unit}` : ''
      records.push({
        id: `habit-progress:${chunk.id}`,
        kind: 'habit-progress',
        hour: slotKey(chunk.loggedTime),
        time: chunk.loggedTime,
        stamped: true,
        title: task.title,
        detail: `+${chunk.amount} ${unit}${context}${chunk.note ? ` · ${chunk.note}` : ''}`.trim(),
        habitId: task.id,
      })
    }
  }

  return records
}

/** Every non-item fact on the day, gated on its module being enabled. */
export function buildTimelineRecords(summary: DaySummary, tasks: Task[] = []): TimelineRecord[] {
  const records: TimelineRecord[] = []
  const date = summary.date

  if (summary.modules.nutrition === 'enabled') {
    for (const entry of summary.calorieEntries) {
      if (!entry.loggedTime) continue
      records.push({
        id: `nutrition:${entry.id}`,
        kind: 'nutrition',
        hour: slotKey(entry.loggedTime),
        time: entry.loggedTime,
        stamped: entry.time === null,
        title: entry.name,
        detail: macroDetail(entry),
        href: nutritionHref(date),
      })
    }

    const weight = summary.supporting.nutrition.weight
    if (weight.status === 'recorded' && weight.entry?.loggedTime) {
      records.push({
        id: `weight:${weight.entry.id}`,
        kind: 'weight',
        hour: slotKey(weight.entry.loggedTime),
        time: weight.entry.loggedTime,
        stamped: true,
        title: 'Weight',
        detail: `${weight.entry.weightKg} kg`,
        href: nutritionHref(date),
      })
    }
  }

  if (summary.modules.workouts === 'enabled') {
    for (const session of summary.supporting.workouts.sessions) {
      if (!session.loggedTime) continue
      records.push({
        id: `workout:${session.id}`,
        kind: 'workout',
        hour: slotKey(session.loggedTime),
        time: session.loggedTime,
        stamped: true,
        title: session.title ?? 'Workout session',
        detail: exerciseDetail(session),
        href: workoutHref(date),
      })
    }
  }

  if (summary.modules.achievements === 'enabled') {
    for (const entry of summary.supporting.progress.entries) {
      if (!entry.loggedTime) continue
      records.push({
        id: `progress:${entry.id}`,
        kind: 'progress',
        hour: slotKey(entry.loggedTime),
        time: entry.loggedTime,
        stamped: true,
        title: entry.name,
        detail: `${entry.value} ${entry.unit}`,
        href: progressHref(date),
      })
    }
  }

  records.push(...habitProgressRecords(tasks))

  return records.sort((a, b) => a.time.localeCompare(b.time))
}

export function groupRecordsByHour(records: TimelineRecord[]): Record<string, TimelineRecord[]> {
  const buckets: Record<string, TimelineRecord[]> = {}
  for (const record of records) {
    (buckets[record.hour] ??= []).push(record)
  }
  return buckets
}
