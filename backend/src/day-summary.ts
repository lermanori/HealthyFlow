import { getGoogleCalendarStatus, syncGoogleCalendarEventsForDate } from './calendar'
import { logger } from './utils/logger'
import {
  CapacityReasonCodeSchema,
  DaySummaryCalendarEvent,
  DaySummaryCalendarEventSchema,
  DaySummaryCalorieEntry,
  DaySummaryCalorieEntrySchema,
  DaySummaryCapacity,
  DaySummaryItem,
  DaySummaryItemSchema,
  DaySummarySchema,
  DaySummaryAchievementEntry,
  DaySummaryAchievementEntrySchema,
  DaySummaryProgressTarget,
  DaySummaryWeightEntry,
  DaySummaryWeightEntrySchema,
  DailyPlanReference,
  DailyPlanReferenceSchema,
  DailyPlanPlacementInput,
  DailyPlanPlacementInputSchema,
  DailyPlanPlacementReason,
  DailyPlanPlacementValidation,
  DailyPlanPlacementValidationSchema,
  isDaySummaryItemAddressed,
  PlanningWindow,
  PlanningWindowSchema,
  type DaySummary,
} from './day-summary-schema'
import { Achievements } from './achievements'
import { Rollover } from './rollover'
import { db } from './supabase-client'
import { ReminderItem, ReminderItemSchema } from './task-contracts'
import { parseHabitInstanceId } from './utils/parseHabitInstanceId'
import { Work } from './work'
import { Workouts } from './workouts'

type CalendarSource = DaySummary['calendar']
type DateMode = DaySummary['dateMode']
type CapacityReasonCode = (typeof CapacityReasonCodeSchema)['_output']
type MinuteInterval = { start: number; end: number }

const CAPACITY_REASON_ORDER: CapacityReasonCode[] = CapacityReasonCodeSchema.options

// Placement blocks only on what HealthyFlow knows to be true. A missing or
// invalid timezone is the one gap that makes every clock time meaningless, so
// nothing can be asserted about a placement at all. Every other reason code —
// no planning window, an unreadable window, an optional Calendar we cannot see,
// an Item whose duration is unknown — informs the caller as an advisory warning
// on a `valid` result, and never refuses the placement on its own.
const BLOCKING_UNCERTAINTY_REASONS = new Set<CapacityReasonCode>([
  'timezone_missing',
  'timezone_invalid',
])

/**
 * The floor an obligation occupies when HealthyFlow knows *when* it starts but not
 * *how long* it runs. It is a minimum, not a guess at the real duration: uncertainty
 * about length must not erase certainty about the start time, so a placement landing
 * on top of an unmeasured Item is still a real collision.
 */
export const MINIMUM_OBLIGATION_MINUTES = 15

const normalizeClockTime = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const candidate = value.slice(0, 5)
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate) ? candidate : null
}

const numberOrNull = (value: unknown): number | null => {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Extra context the timeline needs but the raw row can't supply on its own. */
type ItemContext = {
  timeZone?: string | null
  /** Raw `habit_progress_entries` rows for this instance, oldest first. */
  chunkRows?: any[]
}

export function itemRowToClient(row: any, progressTotal = 0, context: ItemContext = {}): DaySummaryItem {
  const parsedVirtual = typeof row.id === 'string' ? parseHabitInstanceId(row.id) : null
  const originalHabitId = row.original_habit_id ?? row.originalHabitId ?? parsedVirtual?.originalHabitId ?? null
  const type = ['task', 'habit', 'grocery', 'meal', 'workout'].includes(row.type) ? row.type : 'task'
  const repeat = ['none', 'daily', 'weekly'].includes(row.repeat_type ?? row.repeat)
    ? row.repeat_type ?? row.repeat
    : null
  const targetValue = numberOrNull(row.habit_target_value ?? row.habitInfo?.target?.value)
  const targetUnit = row.habit_target_unit ?? row.habitInfo?.target?.unit

  const outcome = row.habit_outcome ?? row.habitInfo?.outcome ?? (row.completed ? 'completed' : 'pending')
  // Settled means nothing further is owed today. `partial` is deliberately absent:
  // a Habit at 1/2 is the most open thing on the board, so it keeps no resolvedTime
  // and stays in the Anytime backlog. Its chunks carry the record instead.
  const settled = Boolean(row.completed) || outcome === 'completed' || outcome === 'failed'
  // completed_at is only written for a `completed` outcome, so a Habit marked
  // Not done would otherwise have no timestamp at all.
  const resolvedAt = settled
    ? (row.completed_at ?? row.completedAt ?? row.updated_at ?? row.updatedAt ?? null)
    : null

  return DaySummaryItemSchema.parse({
    id: String(row.id),
    title: String(row.title ?? ''),
    type,
    category: row.category ?? null,
    startTime: normalizeClockTime(row.start_time ?? row.startTime),
    location: row.location ?? null,
    duration: numberOrNull(row.duration),
    repeat,
    completed: Boolean(row.completed),
    scheduledDate: row.scheduled_date ?? row.scheduledDate ?? null,
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
    overdueNotified: Boolean(row.overdue_notified ?? row.overdueNotified),
    isHabitInstance: Boolean(
      parsedVirtual ||
      row.is_habit_instance ||
      row.isHabitInstance ||
      originalHabitId
    ),
    originalHabitId,
    rolledOverFromTaskId: row.rolled_over_from_task_id ?? row.rolledOverFromTaskId ?? null,
    originalCreatedAt: row.original_created_at ?? row.originalCreatedAt ?? null,
    completedAt: row.completed_at ?? row.completedAt ?? null,
    projectId: row.project_id ?? row.projectId ?? null,
    project: row.project ? {
      id: String(row.project.id),
      name: String(row.project.name ?? ''),
      color: String(row.project.color ?? ''),
    } : null,
    position: numberOrNull(row.position),
    googleEventId: row.google_event_id ?? row.googleEventId ?? null,
    syncedToGoogle: Boolean(row.synced_to_google ?? row.syncedToGoogle),
    googleSyncStatus: row.google_sync_status ?? row.googleSyncStatus ?? 'pending',
    resolvedTime: localClockTime(resolvedAt, context.timeZone),
    ...(type === 'habit' ? {
      habitInfo: {
        target: targetValue != null && ['minutes', 'reps', 'count'].includes(targetUnit)
          ? { value: targetValue, unit: targetUnit }
          : null,
        outcome,
        progressTotal: numberOrNull(row.habitInfo?.progressTotal) ?? progressTotal,
        chunks: (context.chunkRows ?? row.habitInfo?.chunks ?? []).map((chunk: any) => ({
          id: String(chunk.id),
          amount: Number(chunk.amount),
          note: chunk.note ?? null,
          loggedTime: chunk.loggedTime !== undefined
            ? chunk.loggedTime
            : localClockTime(chunk.created_at ?? chunk.createdAt, context.timeZone),
        })),
      },
    } : {}),
    ...(type === 'workout' && (row.workout_plan_id ?? row.workoutInfo?.workoutPlanId) ? {
      workoutInfo: {
        workoutPlanId: String(row.workout_plan_id ?? row.workoutInfo.workoutPlanId),
      },
    } : {}),
  })
}

export async function normalizeItemRows(
  rows: any[],
  timeZone?: string | null
): Promise<DaySummaryItem[]> {
  const materializedHabitIds = rows
    .filter((row) => (
      row.type === 'habit' &&
      (row.original_habit_id ?? row.originalHabitId) &&
      !parseHabitInstanceId(String(row.id))
    ))
    .map((row) => String(row.id))

  // One batched fetch supplies both the total and the per-chunk timestamps.
  const chunksByInstance: Record<string, any[]> = typeof db.getHabitProgressEntriesForInstances === 'function'
    ? await db.getHabitProgressEntriesForInstances(materializedHabitIds)
    : {}

  return rows.map((row) => {
    const chunkRows = chunksByInstance[row.id] ?? []
    const progressTotal = chunkRows.reduce((sum: number, chunk: any) => sum + Number(chunk.amount), 0)
    return itemRowToClient(row, progressTotal, { timeZone, chunkRows })
  })
}

// The reminder projection. Kept beside itemRowToClient and coercing through the
// same Boolean()/normalizeClockTime helpers, so a row decides a reminder the
// same way whether it arrives here or on the full day payload.
export function reminderRowToClient(row: any): ReminderItem {
  return ReminderItemSchema.parse({
    id: String(row.id),
    title: String(row.title ?? ''),
    startTime: normalizeClockTime(row.start_time ?? row.startTime),
    completed: Boolean(row.completed),
    scheduledDate: row.scheduled_date ?? row.scheduledDate ?? null,
    overdueNotified: Boolean(row.overdue_notified ?? row.overdueNotified),
  })
}

export async function getItemsForDay(
  userId: string,
  date: string,
  timeZone?: string | null
): Promise<DaySummaryItem[]> {
  const datedRows = await db.getTasksWithRecurringHabits(userId, date)
  const rows = await Rollover.addCarryForwardRows(userId, date, datedRows)
  return normalizeItemRows(rows, timeZone)
}

export function calorieRowToClient(row: any, timeZone?: string | null): DaySummaryCalorieEntry {
  const createdAt = row.created_at ?? row.createdAt ?? null
  return DaySummaryCalorieEntrySchema.parse({
    id: String(row.id),
    date: String(row.date),
    time: normalizeClockTime(row.time),
    name: String(row.name ?? ''),
    calories: Number(row.calories),
    protein: numberOrNull(row.protein),
    carbs: numberOrNull(row.carbs),
    fat: numberOrNull(row.fat),
    quantity: row.quantity ?? null,
    createdAt,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    // An explicit `time` wins; otherwise the entry is placed by when it was logged
    // rather than being dropped off the timeline for lacking a clock time.
    loggedTime: normalizeClockTime(row.time) ?? localClockTime(createdAt, timeZone),
  })
}

export function weightRowToClient(row: any, timeZone?: string | null): DaySummaryWeightEntry {
  const createdAt = row.created_at ?? row.createdAt ?? null
  return DaySummaryWeightEntrySchema.parse({
    id: String(row.id),
    date: String(row.date),
    weightKg: Number(row.weight_kg ?? row.weightKg),
    createdAt,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    loggedTime: localClockTime(createdAt, timeZone),
  })
}

export function achievementEntryToDaySummary(
  entry: any,
  definition: any,
  timeZone?: string | null
): DaySummaryAchievementEntry {
  return DaySummaryAchievementEntrySchema.parse({
    id: String(entry.id),
    achievementId: String(entry.achievementId ?? entry.achievement_id),
    name: String(definition.name ?? ''),
    unit: String(definition.unit ?? ''),
    value: Number(entry.value),
    supportingValue: numberOrNull(entry.supportingValue ?? entry.supporting_value),
    supportingUnit: entry.supportingUnit ?? entry.supporting_unit ?? null,
    notes: entry.notes ?? null,
    createdAt: entry.createdAt ?? entry.created_at ?? null,
    loggedTime: localClockTime(entry.createdAt ?? entry.created_at, timeZone),
  })
}

export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function minutesToTime(value: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.floor(value)))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

function hourSlot(value: string | null): string | null {
  return value ? `${value.slice(0, 2)}:00` : null
}

type DailyPlanSources = {
  items: DaySummaryItem[]
  calendar: CalendarSource
  work: DaySummary['work']
  calorieEntries: DaySummaryCalorieEntry[]
  weightEntry: DaySummaryWeightEntry | null
  workoutSessions: DaySummary['supporting']['workouts']['sessions']
  progressEntries: DaySummaryAchievementEntry[]
  progressTargets: DaySummaryProgressTarget[]
  transitionBufferMinutes: number
}

/**
 * Compose the day by reference. These records deliberately contain identifiers,
 * timing, and lifecycle only; names, metrics, and mutation state remain owned by
 * their source module records in the same DaySummary response.
 */
export function deriveDailyPlanReferences(sources: DailyPlanSources): DailyPlanReference[] {
  const references: unknown[] = []

  for (const event of sources.calendar.events) {
    const time = event.localStartTime
    references.push({
      id: `calendar-event:${event.id}`,
      sourceId: event.id,
      kind: 'calendar_event',
      module: 'calendar',
      time,
      slot: hourSlot(time),
      semantics: 'boundary',
      state: 'fixed',
      endTime: event.localEndTime,
    })

    const startMinutes = timeToMinutes(event.localStartTime)
    const endMinutes = timeToMinutes(event.localEndTime)
    const transitionEnd = endMinutes == null
      ? null
      : Math.min(23 * 60 + 59, endMinutes + sources.transitionBufferMinutes)
    const canceled = event.status === 'cancelled' || event.status === 'canceled'
    if (
      !event.allDay && !canceled && startMinutes != null && endMinutes != null &&
      endMinutes > startMinutes && transitionEnd != null && transitionEnd > endMinutes
    ) {
      const transitionTime = minutesToTime(endMinutes)
      references.push({
        id: `calendar-transition:${event.id}`,
        sourceId: event.id,
        kind: 'calendar_transition',
        module: 'calendar',
        time: transitionTime,
        slot: hourSlot(transitionTime),
        semantics: 'boundary',
        state: 'protected',
        endTime: minutesToTime(transitionEnd),
        durationMinutes: transitionEnd - endMinutes,
      })
    }
  }

  for (const block of sources.work.focusBlocks) {
    const semantics = block.status === 'completed'
      ? 'actual'
      : block.status === 'reviewing' || block.status === 'canceled'
        ? 'boundary'
        : 'plan'
    references.push({
      id: `focus-block:${block.id}`,
      sourceId: block.id,
      kind: 'focus_block',
      module: 'work',
      time: block.startTime,
      slot: block.slot,
      semantics,
      state: block.status,
    })
  }

  for (const item of sources.items) {
    const time = item.startTime ?? item.resolvedTime
    const state = item.type === 'habit'
      ? item.habitInfo?.outcome ?? (item.completed ? 'completed' : 'pending')
      : item.completed ? 'completed' : 'planned'
    // Completing a Meal or Workout Item only settles the plan; it does not
    // fabricate a Calorie entry or Workout session. Those actuals remain
    // separate module-owned records below.
    const actual = item.type === 'meal' || item.type === 'workout'
      ? false
      : item.type === 'habit'
        ? state === 'completed' || state === 'failed'
        : state === 'completed'
    const kind = item.type === 'meal'
      ? 'meal_plan'
      : item.type === 'workout'
        ? 'workout_plan'
        : item.type
    const module = item.type === 'habit'
      ? 'habits'
      : item.type === 'meal'
        ? 'nutrition'
        : item.type === 'workout'
          ? 'workouts'
          : 'tasks'
    references.push({
      id: `${kind}:${item.id}`,
      sourceId: item.id,
      kind,
      module,
      time,
      slot: hourSlot(time),
      semantics: actual ? 'actual' : 'plan',
      state,
      ...(item.type === 'workout' ? {
        workoutPlanId: item.workoutInfo?.workoutPlanId ?? null,
      } : {}),
    })

    if (item.type === 'habit') {
      for (const chunk of item.habitInfo?.chunks ?? []) {
        references.push({
          id: `habit-progress:${chunk.id}`,
          sourceId: chunk.id,
          itemId: item.id,
          kind: 'habit_progress',
          module: 'habits',
          time: chunk.loggedTime,
          slot: hourSlot(chunk.loggedTime),
          semantics: 'actual',
          state: 'recorded',
        })
      }
    }
  }

  for (const entry of sources.calorieEntries) {
    references.push({
      id: `calorie-entry:${entry.id}`,
      sourceId: entry.id,
      kind: 'calorie_entry',
      module: 'nutrition',
      time: entry.loggedTime,
      slot: hourSlot(entry.loggedTime),
      semantics: 'actual',
      state: 'recorded',
    })
  }

  if (sources.weightEntry) {
    references.push({
      id: `weight-entry:${sources.weightEntry.id}`,
      sourceId: sources.weightEntry.id,
      kind: 'weight_entry',
      module: 'nutrition',
      time: sources.weightEntry.loggedTime,
      slot: hourSlot(sources.weightEntry.loggedTime),
      semantics: 'actual',
      state: 'recorded',
    })
  }

  for (const session of sources.workoutSessions) {
    references.push({
      id: `workout-session:${session.id}`,
      sourceId: session.id,
      kind: 'workout_session',
      module: 'workouts',
      time: session.loggedTime,
      slot: hourSlot(session.loggedTime),
      semantics: 'actual',
      state: 'recorded',
    })
  }

  for (const target of sources.progressTargets) {
    references.push({
      id: `progress-target:${target.achievementId}`,
      sourceId: target.achievementId,
      kind: 'progress_target',
      module: 'progress',
      time: null,
      slot: null,
      semantics: 'plan',
      state: 'target',
    })
  }

  for (const entry of sources.progressEntries) {
    references.push({
      id: `progress-entry:${entry.id}`,
      sourceId: entry.id,
      kind: 'progress_entry',
      module: 'progress',
      time: entry.loggedTime,
      slot: hourSlot(entry.loggedTime),
      semantics: 'actual',
      state: 'recorded',
    })
  }

  return references
    .map(reference => DailyPlanReferenceSchema.parse(reference))
    .sort((left, right) => {
      if (left.time == null && right.time == null) return left.id.localeCompare(right.id)
      if (left.time == null) return 1
      if (right.time == null) return -1
      return left.time.localeCompare(right.time) || left.id.localeCompare(right.id)
    })
}

export function unionIntervals(intervals: MinuteInterval[]): MinuteInterval[] {
  const sorted = intervals
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const union: MinuteInterval[] = []

  for (const interval of sorted) {
    const current = union[union.length - 1]
    if (!current || interval.start > current.end) {
      union.push({ ...interval })
    } else {
      current.end = Math.max(current.end, interval.end)
    }
  }

  return union
}

function validTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

function localDateAndMinutes(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  const date = `${part('year')}-${part('month')}-${part('day')}`
  return {
    date,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  }
}

/**
 * An ISO timestamp as wall-clock time in the user's timezone.
 *
 * The timeline places dateless records (weight, workout sessions, Achievement
 * entries) and settled untimed items by when they were logged, so this has to be
 * resolved server-side where the timezone is known — deriving it in the browser
 * would place a record by the *viewer's* clock, not the user's.
 */
export function localClockTime(
  iso: string | null | undefined,
  timeZone: string | null | undefined
): string | null {
  if (!iso) return null
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  if (!validTimeZone(timeZone)) return null
  const minutes = localDateAndMinutes(parsed, timeZone).minutes
  return minutesToTime(minutes)
}

export function deriveDateMode(date: string, timeZone: string | null | undefined, now: Date): DateMode {
  if (!validTimeZone(timeZone)) return 'unknown'
  const localDate = localDateAndMinutes(now, timeZone).date
  if (date < localDate) return 'past'
  if (date > localDate) return 'future'
  return 'today'
}

function capacityReasons(values: CapacityReasonCode[]): CapacityReasonCode[] {
  const unique = new Set(values)
  return CAPACITY_REASON_ORDER.filter((reason) => unique.has(reason))
}

export function deriveCapacity(input: {
  date: string
  dateMode: DateMode
  timeZone: string | null | undefined
  now: Date
  planningWindow: unknown
  items: DaySummaryItem[]
  calendar: CalendarSource
}): DaySummaryCapacity {
  const reasons: CapacityReasonCode[] = []
  if (!input.timeZone) reasons.push('timezone_missing')
  else if (!validTimeZone(input.timeZone)) reasons.push('timezone_invalid')

  const parsedWindow = PlanningWindowSchema.safeParse(input.planningWindow)
  if (input.planningWindow == null) reasons.push('planning_window_missing')
  else if (!parsedWindow.success) reasons.push('planning_window_invalid')

  if (reasons.length > 0 || !parsedWindow.success || !validTimeZone(input.timeZone)) {
    return {
      status: 'unavailable',
      window: null,
      basis: null,
      reasonCodes: capacityReasons(reasons),
    }
  }

  const planningWindow = parsedWindow.data
  const windowStart = timeToMinutes(planningWindow.startTime)!
  const windowEnd = timeToMinutes(planningWindow.endTime)!
  const nowMinutes = input.dateMode === 'today'
    ? localDateAndMinutes(input.now, input.timeZone).minutes
    : windowStart
  const consideredStart = input.dateMode === 'today'
    ? Math.min(windowEnd, Math.max(windowStart, nowMinutes))
    : windowStart
  const consideredEnd = windowEnd
  const scope: 'remaining' | 'historical' | 'planned' = input.dateMode === 'past'
    ? 'historical'
    : input.dateMode === 'future'
      ? 'planned'
      : 'remaining'
  const intervals: MinuteInterval[] = []
  let timedItemCount = 0
  let calendarEventCount = 0
  let bufferedIntervalCount = 0

  const addInterval = (start: number, end: number) => {
    const clippedStart = Math.max(consideredStart, start)
    const clippedEnd = Math.min(consideredEnd, end + planningWindow.transitionBufferMinutes)
    if (clippedEnd <= clippedStart) return
    intervals.push({ start: clippedStart, end: clippedEnd })
    bufferedIntervalCount += 1
  }

  for (const item of input.items) {
    if (!item.startTime) continue
    const start = timeToMinutes(item.startTime)
    if (start == null) {
      reasons.push('item_invalid_start_time')
      continue
    }
    timedItemCount += 1
    if (item.duration == null) {
      reasons.push('item_missing_duration')
      continue
    }
    if (!Number.isFinite(item.duration) || item.duration <= 0) {
      reasons.push('item_invalid_duration')
      continue
    }
    addInterval(start, start + Math.round(item.duration))
  }

  // A Calendar the user never connected is outside the system's world, exactly
  // like an obligation they never wrote down anywhere — it is not missing data,
  // so it does not make the answer partial. Treating it as a reason meant every
  // account without Google Calendar could only ever be told "at most X", which
  // is a hedge against a choice the user made deliberately.
  //
  // `unavailable` stays a reason and must: there the user did connect a
  // Calendar, so its obligations are genuinely part of their day, and the read
  // failed. That is a real unknown and Capacity should refuse to sound certain.
  if (input.calendar.status === 'unavailable') reasons.push('calendar_unavailable')

  for (const event of input.calendar.events) {
    if (event.status === 'cancelled') continue
    calendarEventCount += 1
    if (event.allDay) {
      reasons.push('calendar_event_all_day')
      continue
    }
    if (!event.localStartTime || !event.localEndTime) {
      reasons.push('calendar_event_missing_time')
      continue
    }
    const start = timeToMinutes(event.localStartTime)
    const end = timeToMinutes(event.localEndTime)
    if (start == null || end == null || end <= start) {
      reasons.push('calendar_event_invalid_time')
      continue
    }
    addInterval(start, end)
  }

  const united = unionIntervals(intervals)
  const knownLoadMinutes = united.reduce((sum, interval) => sum + interval.end - interval.start, 0)
  const consideredMinutes = Math.max(0, consideredEnd - consideredStart)
  const availableUpperBoundMinutes = Math.max(0, consideredMinutes - knownLoadMinutes)
  const window = {
    startTime: planningWindow.startTime,
    endTime: planningWindow.endTime,
    transitionBufferMinutes: planningWindow.transitionBufferMinutes,
    totalMinutes: windowEnd - windowStart,
    consideredStartTime: minutesToTime(consideredStart),
    consideredEndTime: minutesToTime(consideredEnd),
    consideredMinutes,
    bufferPolicy: 'after_each_obligation' as const,
  }
  const basis = {
    scope,
    knownLoadMinutes,
    timedItemCount,
    calendarEventCount,
    bufferedIntervalCount,
  }
  const reasonCodes = capacityReasons(reasons)

  return reasonCodes.length > 0
    ? {
        status: 'partial',
        window,
        basis,
        availableUpperBoundMinutes,
        reasonCodes,
      }
    : {
        status: 'complete',
        window,
        basis,
        availableMinutes: availableUpperBoundMinutes,
        reasonCodes: [],
      }
}

const compareItems = (a: DaySummaryItem, b: DaySummaryItem) => {
  const aTime = timeToMinutes(a.startTime)
  const bTime = timeToMinutes(b.startTime)
  if (aTime != null && bTime == null) return -1
  if (aTime == null && bTime != null) return 1
  if (aTime != null && bTime != null && aTime !== bTime) return aTime - bTime
  const aPosition = a.position ?? Number.MAX_SAFE_INTEGER
  const bPosition = b.position ?? Number.MAX_SAFE_INTEGER
  return aPosition - bPosition || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

const compareEvents = (a: DaySummaryCalendarEvent, b: DaySummaryCalendarEvent) =>
  (timeToMinutes(a.localStartTime) ?? Number.MAX_SAFE_INTEGER) -
    (timeToMinutes(b.localStartTime) ?? Number.MAX_SAFE_INTEGER) ||
  a.id.localeCompare(b.id)

export function deriveAttention(input: {
  items: DaySummaryItem[]
  calendarEvents: DaySummaryCalendarEvent[]
  dateMode: DateMode
  nowMinutes: number | null
}): DaySummary['attention'] {
  const incomplete = input.items.filter((item) => !isDaySummaryItemAddressed(item)).sort(compareItems)
  const completionState = input.items.length === 0
    ? 'empty_day'
    : incomplete.length === 0
      ? 'completed_day'
      : null
  let focus: DaySummary['attention']['focus']

  if (completionState) {
    focus = { state: completionState, itemId: null, reasonCode: null }
  } else if (input.dateMode === 'past') {
    focus = { state: 'past_incomplete', itemId: incomplete[0].id, reasonCode: 'past_incomplete_item' }
  } else if (input.dateMode === 'future') {
    focus = { state: 'future_planned', itemId: incomplete[0].id, reasonCode: 'first_future_item' }
  } else if (input.dateMode === 'today' && input.nowMinutes != null) {
    const active = incomplete
      .filter((item) => {
        const start = timeToMinutes(item.startTime)
        return start != null && item.duration != null && item.duration > 0 &&
          start <= input.nowMinutes! && start + item.duration > input.nowMinutes!
      })
      .sort(compareItems)[0]
    const overdue = incomplete
      .filter((item) => {
        const start = timeToMinutes(item.startTime)
        return start != null && start <= input.nowMinutes! && item.id !== active?.id
      })
      .sort(compareItems)[0]
    const anytime = incomplete.filter((item) => !item.startTime).sort(compareItems)[0]
    const selected = active ?? overdue ?? anytime
    focus = selected
      ? {
          state: 'selected',
          itemId: selected.id,
          reasonCode: active
            ? 'active_timed_item'
            : overdue
              ? 'overdue_timed_item'
              : 'first_anytime_item',
        }
      : { state: 'nothing_needs_attention', itemId: null, reasonCode: null }
  } else {
    focus = { state: 'nothing_needs_attention', itemId: null, reasonCode: null }
  }

  const plannedCandidates = incomplete
    .filter((item) => {
      const start = timeToMinutes(item.startTime)
      if (start == null || input.dateMode === 'past') return false
      return input.dateMode !== 'today' || input.nowMinutes == null || start > input.nowMinutes
    })
    .sort(compareItems)
  const nextItem = plannedCandidates[0] ?? null
  const nextPlannedItem = nextItem && nextItem.startTime
    ? { id: nextItem.id, title: nextItem.title, startTime: nextItem.startTime }
    : null

  const calendarCandidates = input.calendarEvents
    .filter((event) => {
      const start = timeToMinutes(event.localStartTime)
      if (event.completed || event.status === 'cancelled' || event.allDay || start == null || input.dateMode === 'past') return false
      return input.dateMode !== 'today' || input.nowMinutes == null || start > input.nowMinutes
    })
    .sort(compareEvents)
  const nextEvent = calendarCandidates[0] ?? null
  const nextCalendarObligation = nextEvent && nextEvent.localStartTime
    ? {
        id: nextEvent.id,
        title: nextEvent.title,
        startTime: nextEvent.localStartTime,
        endTime: nextEvent.localEndTime,
      }
    : null

  if (!nextPlannedItem && !nextCalendarObligation) {
    return { focus, nextPlannedItem: null, nextCalendarObligation: null, nextObligation: null }
  }

  const itemStart = timeToMinutes(nextPlannedItem?.startTime)
  const eventStart = timeToMinutes(nextCalendarObligation?.startTime)
  const useCalendar = eventStart != null && (itemStart == null || eventStart <= itemStart)
  const selected = useCalendar ? nextCalendarObligation! : nextPlannedItem!
  const selectedEnd = useCalendar
    ? timeToMinutes(nextCalendarObligation?.endTime) ?? eventStart! + 1
    : itemStart! + (nextItem?.duration && nextItem.duration > 0 ? nextItem.duration : 1)
  const selectedStart = useCalendar ? eventStart! : itemStart!
  const conflictIds = [
    ...plannedCandidates
      .filter((item) => item.id !== selected.id)
      .filter((item) => {
        const start = timeToMinutes(item.startTime)
        const end = start == null ? null : start + (item.duration && item.duration > 0 ? item.duration : 1)
        return start != null && end != null && start < selectedEnd && end > selectedStart
      })
      .map((item) => `item:${item.id}`),
    ...calendarCandidates
      .filter((event) => event.id !== selected.id)
      .filter((event) => {
        const start = timeToMinutes(event.localStartTime)
        const end = timeToMinutes(event.localEndTime) ?? (start == null ? null : start + 1)
        return start != null && end != null && start < selectedEnd && end > selectedStart
      })
      .map((event) => `calendar:${event.id}`),
  ].sort()
  const reasonCode = nextPlannedItem && nextCalendarObligation
    ? itemStart === eventStart
      ? 'calendar_wins_same_time_tie'
      : useCalendar
        ? 'calendar_precedes_planned_item'
        : 'planned_item_precedes_calendar'
    : useCalendar
      ? 'only_calendar_obligation'
      : 'only_planned_item'

  return {
    focus,
    nextPlannedItem,
    nextCalendarObligation,
    nextObligation: {
      source: useCalendar ? 'calendar' : 'item',
      id: selected.id,
      title: selected.title,
      startTime: selected.startTime,
      reasonCode,
      conflictIds,
    },
  }
}

function completionFor(items: DaySummaryItem[]): DaySummary['completion'] {
  const completed = items.filter((item) => item.completed).length
  const addressed = items.filter(isDaySummaryItemAddressed).length
  const total = items.length
  return {
    state: total === 0 ? 'empty' : addressed === total ? 'complete' : 'in_progress',
    total,
    completed,
    addressed,
    remaining: total - addressed,
    percent: total === 0 ? null : Math.round((addressed / total) * 100),
  }
}

function habitSummary(items: DaySummaryItem[]): DaySummary['supporting']['habits'] {
  const habits = items.filter((item) => item.type === 'habit')
  const count = (outcome: 'pending' | 'partial' | 'completed' | 'failed') =>
    habits.filter((habit) => habit.habitInfo?.outcome === outcome).length
  return {
    status: 'available',
    total: habits.length,
    pending: count('pending'),
    partial: count('partial'),
    completed: count('completed'),
    failed: count('failed'),
    targeted: habits.filter((habit) => habit.habitInfo?.target != null).length,
  }
}

function metricSummary(entries: DaySummaryCalorieEntry[], key: 'protein' | 'carbs' | 'fat') {
  if (entries.length === 0) return { status: 'unavailable' as const, value: null }
  const known = entries.filter((entry) => entry[key] != null)
  if (known.length === 0) return { status: 'unavailable' as const, value: null }
  return {
    status: known.length === entries.length ? 'complete' as const : 'partial' as const,
    value: known.reduce((sum, entry) => sum + (entry[key] ?? 0), 0),
  }
}

function isoDateOffset(date: string, offset: number) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
}

function weekDates(date: string, weekStartsOn: number) {
  const selected = new Date(`${date}T00:00:00.000Z`)
  const offset = (selected.getUTCDay() - weekStartsOn + 7) % 7
  const startDate = isoDateOffset(date, -offset)
  return Array.from({ length: 7 }, (_, index) => isoDateOffset(startDate, index))
}

type DaySummaryDependencies = {
  itemsForDay: typeof getItemsForDay
  getSettings: typeof db.getUserSettings
  getCalendarStatus: typeof getGoogleCalendarStatus
  getCalendarEvents: typeof syncGoogleCalendarEventsForDate
  getCalorieEntries: typeof db.getCalorieEntriesByDay
  getWeightEntry: typeof db.getWeightEntryByDay
  getWorkoutSessions: typeof Workouts.listSessions
  getAchievements: typeof Achievements.list
  listDayFocusBlocks: typeof Work.listDayFocusBlocks
}

const defaultDependencies: DaySummaryDependencies = {
  itemsForDay: getItemsForDay,
  getSettings: (userId) => db.getUserSettings(userId),
  getCalendarStatus: getGoogleCalendarStatus,
  getCalendarEvents: syncGoogleCalendarEventsForDate,
  getCalorieEntries: (userId, date) => db.getCalorieEntriesByDay(userId, date),
  getWeightEntry: (userId, date) => db.getWeightEntryByDay(userId, date),
  getWorkoutSessions: (userId, date) => Workouts.listSessions(userId, date),
  getAchievements: (userId, options) => Achievements.list(userId, options),
  listDayFocusBlocks: (userId, date) => Work.listDayFocusBlocks(userId, date),
}

export async function buildDaySummary(
  userId: string,
  date: string,
  timeZone: string | null | undefined,
  options: {
    now?: Date
    dependencies?: Partial<DaySummaryDependencies>
  } = {}
): Promise<DaySummary> {
  const now = options.now ?? new Date()
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const [items, settingsResult] = await Promise.all([
    dependencies.itemsForDay(userId, date, timeZone),
    dependencies.getSettings(userId).then(
      (settings) => ({ status: 'available' as const, settings }),
      () => ({ status: 'unavailable' as const, settings: {} as Record<string, unknown> })
    ),
  ])

  const rawSettings = settingsResult.settings
  const weekStartsOn = typeof rawSettings.weekStartsOn === 'number' &&
    Number.isInteger(rawSettings.weekStartsOn) &&
    rawSettings.weekStartsOn >= 0 &&
    rawSettings.weekStartsOn <= 6
    ? rawSettings.weekStartsOn
    : 1
  const rawPlanningWindow = rawSettings.planningWindow ?? null
  const parsedPlanningWindow = PlanningWindowSchema.safeParse(rawPlanningWindow)
  const planningWindow = parsedPlanningWindow.success ? parsedPlanningWindow.data : null
  const nutritionEnabled = settingsResult.status === 'available'
    ? rawSettings.calorieIntake !== false
    : null
  const workoutsEnabled = settingsResult.status === 'available'
    ? rawSettings.workoutTracker !== false
    : null
  const achievementsEnabled = settingsResult.status === 'available'
    ? rawSettings.achievementTracker !== false
    : null
  const dates = weekDates(date, weekStartsOn)
  const weekItems = await Promise.all(dates.map((weekDate) =>
    weekDate === date ? Promise.resolve(items) : dependencies.itemsForDay(userId, weekDate)
  ))

  const calendarPromise: Promise<CalendarSource> = dependencies.getCalendarStatus(userId).then(async (status) => {
    if (!status.connected) {
      return { status: 'not_connected', reasonCode: 'not_connected', events: [] }
    }
    try {
      const events = (await dependencies.getCalendarEvents(userId, date))
        .map((event) => DaySummaryCalendarEventSchema.parse(event))
      return {
        status: events.length > 0 ? 'connected' : 'connected_empty',
        reasonCode: null,
        events,
      }
    } catch (error) {
      // Degrading the day is correct — one module failing must not fail the
      // whole day — but discarding the cause is not. `sync_failed` reaches the
      // user as "Calendar obligations could not be checked" and downgrades
      // Capacity from an exact figure to an upper bound, so the reason it
      // happened has to survive somewhere.
      logger.error('Day summary: Google Calendar events could not be fetched', { userId, date, error })
      return { status: 'unavailable', reasonCode: 'sync_failed', events: [] }
    }
  }, (error) => {
    logger.error('Day summary: Google Calendar connection status could not be read', { userId, date, error })
    return { status: 'unavailable', reasonCode: 'status_unavailable', events: [] }
  })

  const nutritionPromise = nutritionEnabled === true
    ? Promise.allSettled([
        dependencies.getCalorieEntries(userId, date),
        dependencies.getWeightEntry(userId, date),
      ])
    : Promise.resolve(null)
  const workoutsPromise = workoutsEnabled === true
    ? dependencies.getWorkoutSessions(userId, date).then(
        (sessions) => ({ status: 'available' as const, sessions }),
        () => ({ status: 'unavailable' as const, sessions: [] })
      )
    : Promise.resolve(null)
  const achievementsPromise = achievementsEnabled === true
    ? dependencies.getAchievements(userId, { includeArchived: false, entryLimit: 60 }).then(
        (summaries) => ({ status: 'available' as const, summaries }),
        () => ({ status: 'unavailable' as const, summaries: [] as any[] })
      )
    : Promise.resolve(null)
  // Work has no toggle, so it is always queried — but a failure still degrades
  // to `unavailable` rather than taking the day down with it.
  const workPromise = dependencies.listDayFocusBlocks(userId, date).then(
    (blocks) => ({ status: 'available' as const, blocks }),
    () => ({ status: 'unavailable' as const, blocks: [] })
  )
  const [calendar, nutritionRows, workoutRows, achievementRows, workRows] = await Promise.all([
    calendarPromise,
    nutritionPromise,
    workoutsPromise,
    achievementsPromise,
    workPromise,
  ])

  const work: DaySummary['work'] = workRows.status === 'unavailable'
    ? { status: 'unavailable', focusBlocks: [] }
    : { status: workRows.blocks.length > 0 ? 'scheduled' : 'not_scheduled', focusBlocks: workRows.blocks }

  let calorieEntries: DaySummaryCalorieEntry[] = []
  let nutrition: DaySummary['supporting']['nutrition']
  if (nutritionEnabled === false) {
    nutrition = {
      status: 'disabled',
      entries: [],
      calories: { status: 'unavailable', value: null },
      protein: { status: 'unavailable', value: null },
      carbs: { status: 'unavailable', value: null },
      fat: { status: 'unavailable', value: null },
      weight: { status: 'disabled', entry: null },
    }
  } else if (nutritionEnabled == null || !nutritionRows) {
    nutrition = {
      status: 'unavailable',
      entries: [],
      calories: { status: 'unavailable', value: null },
      protein: { status: 'unavailable', value: null },
      carbs: { status: 'unavailable', value: null },
      fat: { status: 'unavailable', value: null },
      weight: { status: 'unavailable', entry: null },
    }
  } else {
    calorieEntries = nutritionRows[0].status === 'fulfilled'
      ? nutritionRows[0].value.map((row: any) => calorieRowToClient(row, timeZone))
      : []
    const weight = nutritionRows[1].status === 'fulfilled' && nutritionRows[1].value
      ? weightRowToClient(nutritionRows[1].value, timeZone)
      : null
    nutrition = {
      status: nutritionRows[0].status === 'rejected'
        ? 'unavailable'
        : calorieEntries.length === 0
          ? 'not_logged'
          : 'available',
      entries: calorieEntries,
      calories: nutritionRows[0].status === 'rejected' || calorieEntries.length === 0
        ? { status: 'unavailable', value: null }
        : { status: 'complete', value: calorieEntries.reduce((sum, entry) => sum + entry.calories, 0) },
      protein: nutritionRows[0].status === 'rejected'
        ? { status: 'unavailable', value: null }
        : metricSummary(calorieEntries, 'protein'),
      carbs: nutritionRows[0].status === 'rejected'
        ? { status: 'unavailable', value: null }
        : metricSummary(calorieEntries, 'carbs'),
      fat: nutritionRows[0].status === 'rejected'
        ? { status: 'unavailable', value: null }
        : metricSummary(calorieEntries, 'fat'),
      weight: nutritionRows[1].status === 'rejected'
        ? { status: 'unavailable', entry: null }
        : weight
          ? { status: 'recorded', entry: weight }
          : { status: 'not_recorded', entry: null },
    }
  }

  const workouts: DaySummary['supporting']['workouts'] = workoutsEnabled === false
    ? { status: 'disabled', sessions: [] }
    : workoutsEnabled == null || !workoutRows || workoutRows.status === 'unavailable'
      ? { status: 'unavailable', sessions: [] }
      : {
          status: workoutRows.sessions.length > 0 ? 'logged' : 'not_logged',
          sessions: workoutRows.sessions.map((session: any) => ({
            ...session,
            loggedTime: localClockTime(session.createdAt ?? session.created_at, timeZone),
          })),
        }
  // Only entries recorded on this date belong on this day's timeline; the list
  // endpoint returns each definition's recent history.
  const progress: DaySummary['supporting']['progress'] = achievementsEnabled === false
    ? { status: 'disabled', entries: [], targets: [] }
    : achievementsEnabled == null || !achievementRows || achievementRows.status === 'unavailable'
      ? { status: 'unavailable', entries: [], targets: [] }
      : (() => {
          const entries = achievementRows.summaries.flatMap((summary: any) =>
            (summary.entries ?? [])
              .filter((entry: any) => entry.date === date)
              .map((entry: any) => achievementEntryToDaySummary(entry, summary.definition, timeZone))
          )
          const targets = achievementRows.summaries
            .filter((summary: any) => summary.definition?.targetValue != null)
            .map((summary: any) => ({
              achievementId: String(summary.definition.id),
              name: String(summary.definition.name ?? ''),
              unit: String(summary.definition.unit ?? ''),
              targetValue: Number(summary.definition.targetValue),
              latestValue: numberOrNull(summary.latest?.value),
              targetProgress: numberOrNull(summary.targetProgress),
            }))
          return {
            status: entries.length > 0 ? 'recorded' as const : 'not_recorded' as const,
            entries,
            targets,
          }
        })()

  const dateMode = deriveDateMode(date, timeZone, now)
  const currentMinutes = dateMode === 'today' && validTimeZone(timeZone)
    ? localDateAndMinutes(now, timeZone).minutes
    : null
  const attention = deriveAttention({
    items,
    calendarEvents: calendar.events,
    dateMode,
    nowMinutes: currentMinutes,
  })
  const capacity = deriveCapacity({
    date,
    dateMode,
    timeZone,
    now,
    planningWindow: rawPlanningWindow,
    items,
    calendar,
  })
  const dailyPlan = {
    references: deriveDailyPlanReferences({
      items,
      calendar,
      work,
      calorieEntries,
      weightEntry: nutrition.weight.entry,
      workoutSessions: workouts.sessions,
      progressEntries: progress.entries,
      progressTargets: progress.targets,
      transitionBufferMinutes: planningWindow?.transitionBufferMinutes ?? 0,
    }),
  }

  return DaySummarySchema.parse({
    version: 1,
    date,
    generatedAt: now.toISOString(),
    timeZone: validTimeZone(timeZone) ? timeZone : timeZone ?? null,
    dateMode,
    settings: {
      sourceStatus: settingsResult.status,
      planningWindow,
    },
    modules: {
      habits: 'enabled',
      work: 'enabled',
      nutrition: nutritionEnabled == null ? 'unavailable' : nutritionEnabled ? 'enabled' : 'disabled',
      workouts: workoutsEnabled == null ? 'unavailable' : workoutsEnabled ? 'enabled' : 'disabled',
      achievements: achievementsEnabled == null ? 'unavailable' : achievementsEnabled ? 'enabled' : 'disabled',
    },
    items,
    work,
    calendar,
    calorieEntries,
    completion: completionFor(items),
    week: {
      weekStartsOn,
      startDate: dates[0],
      endDate: dates[6],
      days: dates.map((weekDate, index) => ({
        date: weekDate,
        total: weekItems[index].length,
        completed: weekItems[index].filter((item) => item.completed).length,
        addressed: weekItems[index].filter(isDaySummaryItemAddressed).length,
      })),
    },
    attention,
    capacity,
    supporting: {
      habits: habitSummary(items),
      nutrition,
      workouts,
      progress,
    },
    dailyPlan,
  })
}

function capacityAvailableMinutes(capacity: DaySummaryCapacity): number | null {
  if (capacity.status === 'complete') return capacity.availableMinutes
  if (capacity.status === 'partial') return capacity.availableUpperBoundMinutes
  return null
}

/**
 * The collision check. It runs for every placement, whatever the capacity status
 * is, because it depends on the day's obligations — not on the user's preferences.
 * A planning window contributes exactly one integer here (the transition buffer)
 * and one advisory boundary; its absence must never disable the check.
 *
 * Hard conflicts (real overlaps) and the soft out-of-window warning are returned
 * separately so only the former can refuse a placement.
 */
function placementConflictReasons(
  summary: DaySummary,
  input: DailyPlanPlacementInput,
): { conflicts: DailyPlanPlacementReason[]; outsidePlanningWindow: boolean } {
  const start = timeToMinutes(input.startTime)!
  const end = start + input.durationMinutes + input.transitionMinutes
  // `window` is null whenever capacity is unavailable (no window configured, an
  // unreadable one, or an unusable timezone).
  const window = summary.capacity.status === 'unavailable' ? null : summary.capacity.window
  const windowStart = window ? timeToMinutes(window.consideredStartTime)! : null
  const windowEnd = window ? timeToMinutes(window.consideredEndTime)! : null
  const outsidePlanningWindow = windowStart != null && windowEnd != null
    && (start < windowStart || end > windowEnd)
  const reasons: DailyPlanPlacementReason[] = []

  const buffer = window?.transitionBufferMinutes ?? 0
  const intervals = [
    // A usable start time is enough to occupy the clock. An Item whose duration is
    // missing or unusable falls back to MINIMUM_OBLIGATION_MINUTES rather than
    // dropping out of the check. An Item with no usable start time contributes no
    // interval — there is nowhere to place it — so it stays advisory only.
    ...summary.items
      .filter(item => !item.completed && item.startTime != null && timeToMinutes(item.startTime) != null)
      .map(item => {
        const start = timeToMinutes(item.startTime!)!
        const measured = item.duration != null && Number.isFinite(item.duration) && item.duration > 0
          ? Math.round(item.duration)
          : MINIMUM_OBLIGATION_MINUTES
        return { id: `item:${item.id}`, start, end: start + measured + buffer }
      }),
    ...summary.calendar.events
      .filter(event => event.localStartTime && event.localEndTime && !event.completed)
      .map(event => ({ id: `calendar_event:${event.id}`, start: timeToMinutes(event.localStartTime!)!, end: timeToMinutes(event.localEndTime!)! + buffer })),
    ...summary.work.focusBlocks
      .filter(block => block.status !== 'canceled' && block.status !== 'completed')
      .map(block => ({
        id: `focus_block:${block.id}`,
        start: timeToMinutes(block.startTime)!,
        end: timeToMinutes(block.startTime)!
          + block.plannedMinutes
          + (block.breakMinutes ?? 0)
          + (block.transitionMinutes ?? 0)
          + buffer,
      })),
  ]

  for (const interval of intervals) {
    if (start < interval.end && end > interval.start) {
      reasons.push(`conflicts_with:${interval.id}` as DailyPlanPlacementReason)
    }
  }
  return { conflicts: [...new Set(reasons)], outsidePlanningWindow }
}

export async function validateDailyPlacement(
  userId: string,
  rawInput: DailyPlanPlacementInput,
  options: {
    now?: Date
    dependencies?: Partial<DaySummaryDependencies>
  } = {},
): Promise<DailyPlanPlacementValidation> {
  const input = DailyPlanPlacementInputSchema.parse(rawInput)
  const summary = await buildDaySummary(userId, input.date, input.timeZone, options)
  const requestedMinutes = input.durationMinutes + input.transitionMinutes
  const reasons: DailyPlanPlacementReason[] = [...summary.capacity.reasonCodes]
  // Always runs — a `valid` status must mean the collision check executed.
  const { conflicts, outsidePlanningWindow } = placementConflictReasons(summary, input)
  const availableMinutes = capacityAvailableMinutes(summary.capacity)
  // A window-derived budget: a preference, so it warns rather than refuses.
  const insufficientKnownCapacity = availableMinutes != null && requestedMinutes > availableMinutes
  const hasBlockingUncertainty = summary.capacity.reasonCodes
    .some(reason => BLOCKING_UNCERTAINTY_REASONS.has(reason))
  let status: DailyPlanPlacementValidation['status']

  // Only a real overlap refuses. Uncertainty about the clock itself is the only
  // thing that makes the answer unknowable; everything else is advisory.
  if (conflicts.length > 0) status = 'invalid'
  else if (hasBlockingUncertainty) status = 'indeterminate'
  else status = 'valid'

  // Every reason stays visible, including on a `valid` result, so a caller can
  // always see why a placement was accepted unbounded.
  if (insufficientKnownCapacity) reasons.push('insufficient_available_minutes')
  if (outsidePlanningWindow) reasons.push('outside_planning_window')
  reasons.push(...conflicts)

  return DailyPlanPlacementValidationSchema.parse({
    date: input.date,
    status,
    requestedMinutes,
    availableMinutes,
    reasons,
    preview: {
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      transitionMinutes: input.transitionMinutes,
    },
  })
}
