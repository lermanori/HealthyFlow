import { Achievements } from './achievements'
import { getGoogleCalendarStatus, syncGoogleCalendarEventsForDate } from './calendar'
import {
  buildDaySummaryCore,
  itemRowToClient,
  validateDailyPlacementAgainstSummary,
  type DaySummaryDependencies,
  type DaySummarySourceError,
} from './day-summary-core'
import type {
  DaySummary,
  DaySummaryItem,
  DailyPlanPlacementInput,
  DailyPlanPlacementValidation,
} from './day-summary-schema'
import { DailyPlanPlacementInputSchema } from './day-summary-schema'
import { Rollover } from './rollover'
import { db } from './supabase-client'
import { parseHabitInstanceId } from './utils/parseHabitInstanceId'
import { logger } from './utils/logger'
import { Work } from './work'
import { Workouts } from './workouts'

export * from './day-summary-core'

export async function normalizeItemRows(
  rows: any[],
  timeZone?: string | null,
): Promise<DaySummaryItem[]> {
  const materializedHabitIds = rows
    .filter((row) => (
      row.type === 'habit'
      && (row.original_habit_id ?? row.originalHabitId)
      && !parseHabitInstanceId(String(row.id))
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

export async function getItemsForDay(
  userId: string,
  date: string,
  timeZone?: string | null,
): Promise<DaySummaryItem[]> {
  const datedRows = await db.getTasksWithRecurringHabits(userId, date)
  const rows = await Rollover.addCarryForwardRows(userId, date, datedRows)
  return normalizeItemRows(rows, timeZone)
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

export type DaySummaryBuildOptions = {
  now?: Date
  dependencies?: Partial<DaySummaryDependencies>
}

function logSourceError(failure: DaySummarySourceError) {
  const { userId, date, error } = failure
  if (failure.source === 'calendar_events') {
    logger.error('Day summary: Google Calendar events could not be fetched', { userId, date, error })
    return
  }
  logger.error('Day summary: Google Calendar connection status could not be read', { userId, date, error })
}

/** Supabase-backed adapter for the browser-safe day composition core. */
export function buildDaySummary(
  userId: string,
  date: string,
  timeZone: string | null | undefined,
  options: DaySummaryBuildOptions = {},
): Promise<DaySummary> {
  return buildDaySummaryCore(userId, date, timeZone, {
    now: options.now,
    dependencies: { ...defaultDependencies, ...options.dependencies },
    onSourceError: logSourceError,
  })
}

export async function validateDailyPlacement(
  userId: string,
  rawInput: DailyPlanPlacementInput,
  options: DaySummaryBuildOptions = {},
): Promise<DailyPlanPlacementValidation> {
  const input = DailyPlanPlacementInputSchema.parse(rawInput)
  const summary = await buildDaySummary(userId, input.date, input.timeZone, options)
  return validateDailyPlacementAgainstSummary(summary, input)
}
