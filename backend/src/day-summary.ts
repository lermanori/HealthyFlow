import { getGoogleCalendarStatus, syncGoogleCalendarEventsForDate } from './calendar'
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
  DaySummaryWeightEntry,
  DaySummaryWeightEntrySchema,
  isDaySummaryItemAddressed,
  PlanningWindow,
  PlanningWindowSchema,
  type DaySummary,
  type WeekDomain,
  type WeekPlanningDecision,
  type WeekPlanningSummary,
  type WeekSummary,
  WeekPlanningSummarySchema,
  WeekSummarySchema,
} from './day-summary-schema'
import { Rollover } from './rollover'
import { db } from './supabase-client'
import { parseHabitInstanceId } from './utils/parseHabitInstanceId'
import { Workouts } from './workouts'

type CalendarSource = DaySummary['calendar']
type DateMode = DaySummary['dateMode']
type CapacityReasonCode = (typeof CapacityReasonCodeSchema)['_output']
type MinuteInterval = { start: number; end: number }

const CAPACITY_REASON_ORDER: CapacityReasonCode[] = CapacityReasonCodeSchema.options

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

export function itemRowToClient(row: any, progressTotal = 0): DaySummaryItem {
  const parsedVirtual = typeof row.id === 'string' ? parseHabitInstanceId(row.id) : null
  const originalHabitId = row.original_habit_id ?? row.originalHabitId ?? parsedVirtual?.originalHabitId ?? null
  const type = ['task', 'habit', 'grocery', 'meal', 'workout'].includes(row.type) ? row.type : 'task'
  const repeat = ['none', 'daily', 'weekly'].includes(row.repeat_type ?? row.repeat)
    ? row.repeat_type ?? row.repeat
    : null
  const targetValue = numberOrNull(row.habit_target_value ?? row.habitInfo?.target?.value)
  const targetUnit = row.habit_target_unit ?? row.habitInfo?.target?.unit

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
    position: numberOrNull(row.position),
    googleEventId: row.google_event_id ?? row.googleEventId ?? null,
    syncedToGoogle: Boolean(row.synced_to_google ?? row.syncedToGoogle),
    googleSyncStatus: row.google_sync_status ?? row.googleSyncStatus ?? 'pending',
    ...(type === 'habit' ? {
      habitInfo: {
        target: targetValue != null && ['minutes', 'reps', 'count'].includes(targetUnit)
          ? { value: targetValue, unit: targetUnit }
          : null,
        outcome: row.habit_outcome ?? row.habitInfo?.outcome ?? (row.completed ? 'completed' : 'pending'),
        progressTotal: numberOrNull(row.habitInfo?.progressTotal) ?? progressTotal,
      },
    } : {}),
  })
}

export async function normalizeItemRows(rows: any[]): Promise<DaySummaryItem[]> {
  const materializedHabitIds = rows
    .filter((row) => (
      row.type === 'habit' &&
      (row.original_habit_id ?? row.originalHabitId) &&
      !parseHabitInstanceId(String(row.id))
    ))
    .map((row) => String(row.id))
  const progressTotals = typeof db.getHabitProgressTotals === 'function'
    ? await db.getHabitProgressTotals(materializedHabitIds)
    : {}

  return rows.map((row) => itemRowToClient(row, progressTotals[row.id] ?? 0))
}

export async function getItemsForDay(userId: string, date: string): Promise<DaySummaryItem[]> {
  const datedRows = await db.getTasksWithRecurringHabits(userId, date)
  const rows = await Rollover.addCarryForwardRows(userId, date, datedRows)
  return normalizeItemRows(rows)
}

export function calorieRowToClient(row: any): DaySummaryCalorieEntry {
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
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  })
}

export function weightRowToClient(row: any): DaySummaryWeightEntry {
  return DaySummaryWeightEntrySchema.parse({
    id: String(row.id),
    date: String(row.date),
    weightKg: Number(row.weight_kg ?? row.weightKg),
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
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

  if (input.calendar.status === 'not_connected') reasons.push('calendar_not_connected')
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
}

const defaultDependencies: DaySummaryDependencies = {
  itemsForDay: getItemsForDay,
  getSettings: (userId) => db.getUserSettings(userId),
  getCalendarStatus: getGoogleCalendarStatus,
  getCalendarEvents: syncGoogleCalendarEventsForDate,
  getCalorieEntries: (userId, date) => db.getCalorieEntriesByDay(userId, date),
  getWeightEntry: (userId, date) => db.getWeightEntryByDay(userId, date),
  getWorkoutSessions: (userId, date) => Workouts.listSessions(userId, date),
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
    dependencies.itemsForDay(userId, date),
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
    } catch {
      return { status: 'unavailable', reasonCode: 'sync_failed', events: [] }
    }
  }, () => ({ status: 'unavailable', reasonCode: 'status_unavailable', events: [] }))

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
  const [calendar, nutritionRows, workoutRows] = await Promise.all([
    calendarPromise,
    nutritionPromise,
    workoutsPromise,
  ])

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
      ? nutritionRows[0].value.map(calorieRowToClient)
      : []
    const weight = nutritionRows[1].status === 'fulfilled' && nutritionRows[1].value
      ? weightRowToClient(nutritionRows[1].value)
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
          sessions: workoutRows.sessions,
        }
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
      nutrition: nutritionEnabled == null ? 'unavailable' : nutritionEnabled ? 'enabled' : 'disabled',
      workouts: workoutsEnabled == null ? 'unavailable' : workoutsEnabled ? 'enabled' : 'disabled',
    },
    items,
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
    },
  })
}

const WEEK_DOMAIN_ORDER: WeekDomain[] = [
  'task',
  'habit',
  'calendar',
  'workout',
  'meal',
  'grocery',
]

function uniqueWeekItems(days: { items: DaySummaryItem[] }[]) {
  const seen = new Set<string>()
  const result: DaySummaryItem[] = []
  for (const day of days) {
    for (const item of day.items) {
      if (item.type !== 'habit') {
        if (seen.has(item.id)) continue
        seen.add(item.id)
      }
      result.push(item)
    }
  }
  return result
}

function habitCadence(days: { date: string; items: DaySummaryItem[] }[]) {
  const rows = new Map<string, WeekSummary['habitCadence'][number]>()
  days.forEach((day, dayIndex) => {
    for (const item of day.items) {
      if (item.type !== 'habit') continue
      const originalHabitId = item.originalHabitId ?? item.id
      if (!rows.has(originalHabitId)) {
        rows.set(originalHabitId, {
          originalHabitId,
          title: item.title,
          target: item.habitInfo?.target ?? null,
          days: Array(7).fill(null),
        })
      }
      const outcome = item.habitInfo?.outcome ?? (item.completed ? 'completed' : 'pending')
      rows.get(originalHabitId)!.days[dayIndex] = {
        date: day.date,
        itemId: item.id,
        outcome,
        progressTotal: item.habitInfo?.progressTotal ?? 0,
        completed: item.completed,
        addressed: isDaySummaryItemAddressed(item),
      }
    }
  })
  return Array.from(rows.values())
}

function weekContributions(
  items: DaySummaryItem[],
  days: { calendar: CalendarSource }[]
): WeekSummary['contributions'] {
  const counts = new Map<WeekDomain, { total: number; completed: number; addressed: number }>()
  const add = (domain: WeekDomain, completed: boolean, addressed: boolean) => {
    const current = counts.get(domain) ?? { total: 0, completed: 0, addressed: 0 }
    current.total += 1
    if (completed) current.completed += 1
    if (addressed) current.addressed += 1
    counts.set(domain, current)
  }
  items.forEach((item) => add(item.type, item.completed, isDaySummaryItemAddressed(item)))
  days.flatMap((day) => day.calendar.events)
    .forEach((event) => add('calendar', event.completed, event.completed))
  return WEEK_DOMAIN_ORDER
    .filter((domain) => counts.has(domain))
    .map((domain) => ({ domain, ...counts.get(domain)! }))
}

function dayDistance(from: string, to: string) {
  return Math.max(0, Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000
  ))
}

function deriveWeekPlanning(summary: WeekSummary): WeekPlanningSummary['planning'] {
  const seenItems = new Set<string>()
  const assigned = new Map<string, DaySummaryItem[]>()
  for (const day of summary.days) {
    assigned.set(day.date, day.items.filter((item) => {
      if (item.type === 'habit' || isDaySummaryItemAddressed(item) || seenItems.has(item.id)) return false
      seenItems.add(item.id)
      return true
    }))
  }

  const planningDays: WeekPlanningSummary['planning']['days'] = summary.days.map((day) => {
    const items = assigned.get(day.date) ?? []
    const flexible = items.filter((item) => !item.startTime)
    const knownDemandMinutes = flexible.reduce(
      (total, item) => total + (item.duration != null && item.duration > 0 ? Math.round(item.duration) : 0),
      0
    )
    const unknownDurationItemCount = flexible.filter(
      (item) => item.duration == null || item.duration <= 0
    ).length
    const availableMinutes = day.capacity.status === 'complete'
      ? day.capacity.availableMinutes
      : day.capacity.status === 'partial'
        ? day.capacity.availableUpperBoundMinutes
        : null
    const remainingMinutes = availableMinutes == null ? null : availableMinutes - knownDemandMinutes
    const state = day.capacity.status === 'unavailable'
      ? 'unavailable' as const
      : day.capacity.status === 'partial' || unknownDurationItemCount > 0
        ? 'partial' as const
        : remainingMinutes != null && remainingMinutes < 0
          ? 'overloaded' as const
          : remainingMinutes != null && remainingMinutes <= 30
            ? 'tight' as const
            : 'open' as const
    return {
      date: day.date,
      state,
      knownDemandMinutes,
      unknownDurationItemCount,
      availableMinutes,
      remainingMinutes,
    }
  })

  const decisions: WeekPlanningDecision[] = []
  const unavailableDays = summary.days.filter((day) => day.capacity.status === 'unavailable')
  if (unavailableDays.length > 0) {
    const reasons = Array.from(new Set(unavailableDays.flatMap((day) => day.capacity.reasonCodes)))
    decisions.push({
      id: `capacity-unavailable:${summary.week.startDate}`,
      type: 'capacity_unavailable',
      severity: 'high',
      score: 110,
      title: 'Finish capacity setup for an honest weekly plan',
      rationale: 'HealthyFlow cannot compare workload with available time until the planning window and timezone are usable.',
      date: null,
      itemIds: [],
      evidence: [
        { label: 'Affected days', value: `${unavailableDays.length} of 7` },
        { label: 'Missing input', value: reasons.join(', ').replace(/_/g, ' ') },
      ],
      actions: [
        { id: 'open-planning-settings', kind: 'open_settings', label: 'Open planning settings' },
      ],
    })
  }

  for (const day of summary.days) {
    const items = assigned.get(day.date) ?? []
    for (const item of items) {
      if (item.duration == null || item.duration <= 0) {
        decisions.push({
          id: `missing-duration:${item.id}:${day.date}`,
          type: 'missing_duration',
          severity: 'high',
          score: 100,
          title: `"${item.title}" needs a time estimate`,
          rationale: 'Until this Item has a duration, the day’s capacity is only partly known.',
          date: day.date,
          itemIds: [item.id],
          evidence: [
            { label: 'Day', value: day.date },
            { label: 'Current estimate', value: 'Unknown' },
          ],
          actions: [
            { id: `duration-30:${item.id}`, kind: 'update_item', label: 'Set 30 minutes', itemId: item.id, changes: { duration: 30 } },
            { id: `duration-60:${item.id}`, kind: 'update_item', label: 'Set 60 minutes', itemId: item.id, changes: { duration: 60 } },
            { id: `inspect:${day.date}`, kind: 'select_day', label: 'Review the day', date: day.date },
          ],
        })
      }

      if (
        item.rolledOverFromTaskId &&
        item.scheduledDate &&
        item.scheduledDate < day.date
      ) {
        const carriedDays = dayDistance(item.scheduledDate, day.date)
        decisions.push({
          id: `rollover:${item.id}:${day.date}`,
          type: 'rollover',
          severity: carriedDays >= 3 ? 'high' : 'medium',
          score: 70 + Math.min(carriedDays, 20),
          title: `"${item.title}" has carried forward ${carriedDays} ${carriedDays === 1 ? 'day' : 'days'}`,
          rationale: 'Give the Item an intentional date so it stops silently following the plan.',
          date: day.date,
          itemIds: [item.id],
          evidence: [
            { label: 'Originally planned', value: item.scheduledDate },
            { label: 'First visible this week', value: day.date },
          ],
          actions: [
            {
              id: `commit-date:${item.id}:${day.date}`,
              kind: 'update_item',
              label: `Commit to ${day.date}`,
              itemId: item.id,
              changes: { scheduledDate: day.date, startTime: null },
            },
            { id: `inspect:${day.date}`, kind: 'select_day', label: 'Review the day', date: day.date },
          ],
        })
      }
    }
  }

  for (const [index, fact] of planningDays.entries()) {
    if (fact.state !== 'overloaded' || fact.remainingMinutes == null) continue
    const items = (assigned.get(fact.date) ?? [])
      .filter((item) => !item.startTime && item.duration != null && item.duration > 0)
      .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0) || a.id.localeCompare(b.id))
    const candidate = items[0]
    if (!candidate) continue
    const target = planningDays.find((day, targetIndex) =>
      targetIndex !== index &&
      summary.days[targetIndex].dateMode !== 'past' &&
      day.state === 'open' &&
      day.remainingMinutes != null &&
      day.remainingMinutes >= (candidate.duration ?? 0)
    )
    decisions.push({
      id: `overload:${fact.date}`,
      type: 'capacity_overload',
      severity: 'high',
      score: 90 + Math.min(Math.abs(fact.remainingMinutes), 60),
      title: `${fact.date} has ${Math.abs(fact.remainingMinutes)} minutes more work than capacity`,
      rationale: target
        ? `"${candidate.title}" fits on ${target.date} without overloading it.`
        : 'No other day has enough confirmed room, so this day needs a manual tradeoff.',
      date: fact.date,
      itemIds: items.map((item) => item.id),
      evidence: [
        { label: 'Flexible demand', value: `${fact.knownDemandMinutes} min` },
        { label: 'Usable capacity', value: `${fact.availableMinutes ?? 0} min` },
      ],
      actions: target
        ? [
            {
              id: `move:${candidate.id}:${target.date}`,
              kind: 'update_item',
              label: `Move "${candidate.title}" to ${target.date}`,
              itemId: candidate.id,
              changes: { scheduledDate: target.date, startTime: null },
            },
            { id: `inspect:${fact.date}`, kind: 'select_day', label: 'Review overloaded day', date: fact.date },
          ]
        : [{ id: `inspect:${fact.date}`, kind: 'select_day', label: 'Review overloaded day', date: fact.date }],
    })
  }

  for (const day of summary.days) {
    const intervals: Array<{
      id: string
      title: string
      itemId: string | null
      start: number
      end: number
    }> = []
    for (const item of assigned.get(day.date) ?? []) {
      const start = timeToMinutes(item.startTime)
      if (start == null || item.duration == null || item.duration <= 0) continue
      intervals.push({ id: `item:${item.id}`, title: item.title, itemId: item.id, start, end: start + item.duration })
    }
    for (const event of day.calendar.events) {
      if (event.completed || event.status === 'cancelled') continue
      const start = timeToMinutes(event.localStartTime)
      const end = timeToMinutes(event.localEndTime)
      if (start == null || end == null || end <= start) continue
      intervals.push({ id: `calendar:${event.id}`, title: event.title, itemId: null, start, end })
    }
    intervals.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
    const reported = new Set<string>()
    for (let leftIndex = 0; leftIndex < intervals.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < intervals.length; rightIndex += 1) {
        const left = intervals[leftIndex]
        const right = intervals[rightIndex]
        if (right.start >= left.end) break
        const movable = right.itemId ? right : left.itemId ? left : null
        if (!movable?.itemId || reported.has(movable.itemId)) continue
        reported.add(movable.itemId)
        decisions.push({
          id: `conflict:${day.date}:${left.id}:${right.id}`,
          type: 'schedule_conflict',
          severity: 'high',
          score: 95,
          title: `"${left.title}" overlaps "${right.title}"`,
          rationale: 'Two obligations occupy the same time. Moving the Item to Anytime preserves it without guessing a new start time.',
          date: day.date,
          itemIds: [movable.itemId],
          evidence: [
            { label: 'Day', value: day.date },
            { label: 'Overlap', value: `${minutesToTime(Math.max(left.start, right.start))}–${minutesToTime(Math.min(left.end, right.end))}` },
          ],
          actions: [
            {
              id: `anytime:${movable.itemId}`,
              kind: 'update_item',
              label: `Move "${movable.title}" to Anytime`,
              itemId: movable.itemId,
              changes: { startTime: null },
            },
            { id: `inspect:${day.date}`, kind: 'select_day', label: 'Review the day', date: day.date },
          ],
        })
      }
    }
  }

  decisions.sort((a, b) =>
    b.score - a.score ||
    (a.date ?? '').localeCompare(b.date ?? '') ||
    a.id.localeCompare(b.id)
  )
  return { days: planningDays, decisions }
}

type WeekSummaryOptions = {
  now?: Date
  includePlanning?: boolean
  dependencies?: Partial<Pick<
    DaySummaryDependencies,
    'itemsForDay' | 'getSettings' | 'getCalendarStatus' | 'getCalendarEvents'
  >>
}

export function buildWeekSummary(
  userId: string,
  anchorDate: string,
  timeZone: string | null | undefined,
  options: WeekSummaryOptions & { includePlanning: true }
): Promise<WeekPlanningSummary>
export function buildWeekSummary(
  userId: string,
  anchorDate: string,
  timeZone: string | null | undefined,
  options?: WeekSummaryOptions
): Promise<WeekSummary>
export async function buildWeekSummary(
  userId: string,
  anchorDate: string,
  timeZone: string | null | undefined,
  options: WeekSummaryOptions = {}
): Promise<WeekSummary | WeekPlanningSummary> {
  const now = options.now ?? new Date()
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const settings = await dependencies.getSettings(userId)
  const weekStartsOn = typeof settings.weekStartsOn === 'number' &&
    Number.isInteger(settings.weekStartsOn) &&
    settings.weekStartsOn >= 0 &&
    settings.weekStartsOn <= 6
    ? settings.weekStartsOn
    : 1
  const dates = weekDates(anchorDate, weekStartsOn)
  const itemsByDay = await Promise.all(dates.map((date) => dependencies.itemsForDay(userId, date)))
  const planningWindowResult = PlanningWindowSchema.safeParse(settings.planningWindow ?? null)
  const planningWindow = planningWindowResult.success ? planningWindowResult.data : null

  let calendarStatus: Awaited<ReturnType<typeof dependencies.getCalendarStatus>> | null = null
  try {
    calendarStatus = await dependencies.getCalendarStatus(userId)
  } catch {
    calendarStatus = null
  }

  const calendars: CalendarSource[] = !calendarStatus
    ? dates.map(() => ({ status: 'unavailable', reasonCode: 'status_unavailable', events: [] }))
    : !calendarStatus.connected
      ? dates.map(() => ({ status: 'not_connected', reasonCode: 'not_connected', events: [] }))
      : await Promise.all(dates.map(async (date): Promise<CalendarSource> => {
          try {
            const events = (await dependencies.getCalendarEvents(userId, date))
              .map((event) => DaySummaryCalendarEventSchema.parse(event))
            return {
              status: events.length > 0 ? 'connected' : 'connected_empty',
              reasonCode: null,
              events,
            }
          } catch {
            return { status: 'unavailable', reasonCode: 'sync_failed', events: [] }
          }
        }))

  const days: WeekSummary['days'] = dates.map((date, index) => {
    const dateMode = deriveDateMode(date, timeZone, now)
    return {
      date,
      dateMode,
      items: itemsByDay[index],
      calendar: calendars[index],
      completion: completionFor(itemsByDay[index]),
      capacity: deriveCapacity({
        date,
        dateMode,
        timeZone,
        now,
        planningWindow: settings.planningWindow ?? null,
        items: itemsByDay[index],
        calendar: calendars[index],
      }),
    }
  })
  const items = uniqueWeekItems(days)
  const completion = completionFor(items)
  const calendarEvents = days.flatMap((day) => day.calendar.events)

  const summary = WeekSummarySchema.parse({
    version: 1,
    generatedAt: now.toISOString(),
    timeZone: validTimeZone(timeZone) ? timeZone : timeZone ?? null,
    week: {
      weekStartsOn,
      startDate: dates[0],
      endDate: dates[6],
    },
    settings: {
      sourceStatus: 'available',
      planningWindow,
    },
    modules: {
      habits: 'enabled',
      nutrition: settings.calorieIntake === false ? 'disabled' : 'enabled',
      workouts: settings.workoutTracker === false ? 'disabled' : 'enabled',
    },
    days,
    completion,
    obligations: {
      total: calendarEvents.length,
      completed: calendarEvents.filter((event) => event.completed).length,
    },
    contributions: weekContributions(items, days),
    habitCadence: habitCadence(days),
  })
  return options.includePlanning
    ? WeekPlanningSummarySchema.parse({ ...summary, planning: deriveWeekPlanning(summary) })
    : summary
}
