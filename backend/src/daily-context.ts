import { Achievements } from './achievements'
import { db } from './supabase-client'
import { Workouts } from './workouts'
import {
  calorieRowToClient,
  getItemsForDay,
  weightRowToClient,
} from './day-summary'
import {
  CALORIE_LOOKBACK_DAYS,
  DailyContextSchema,
  HABIT_LOOKBACK_DAYS,
  WORKOUT_LOOKBACK_DAYS,
  type DailyContext,
  type DailySignal,
  type DailySignalType,
} from './daily-context-schema'

export {
  DailyContextInputSchema,
  DailyContextSchema,
  DailySignalAffectedRecordSchema,
  DailySignalChangeSchema,
  DailySignalEvidenceSchema,
  DailySignalProposalSchema,
  DailySignalReviewInputSchema,
  DailySignalSchema,
  DailySignalTypeSchema,
} from './daily-context-schema'
export type {
  DailyContext,
  DailySignal,
  DailySignalType,
} from './daily-context-schema'

const SIGNAL_LIMIT = 3
type DailyContextForSignals = Omit<DailyContext, 'signals'> & { signals?: DailySignal[] }

export type SignalDetector = {
  type: DailySignalType
  version: number
  enabledByDefault: boolean
  evaluate: (context: DailyContextForSignals) => DailySignal[]
}

const SEVERITY_RANK: Record<DailySignal['severity'], number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
}

const CONFIDENCE_RANK: Record<DailySignal['confidence'], number> = {
  low: 0,
  medium: 1,
  high: 2,
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function isoDateOffset(date: string, offsetDays: number) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + offsetDays)
  return value.toISOString().slice(0, 10)
}

function previousDates(date: string, days: number) {
  return Array.from({ length: days }, (_, index) => isoDateOffset(date, -(index + 1)))
}

function timeToMinutes(time: string | null | undefined) {
  if (!time) return null
  const match = /^(\d{2}):(\d{2})/.exec(time)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function hourFromIso(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCHours()
}

async function tasksForDay(userId: string, date: string) {
  return getItemsForDay(userId, date)
}

async function caloriesForDay(userId: string, date: string) {
  const rows = await db.getCalorieEntriesByDay(userId, date)
  return (rows ?? []).map(calorieRowToClient)
}

async function workoutSessionsForDay(userId: string, date: string) {
  return Workouts.listSessions(userId, date)
}

function scheduledTasks(tasks: DailyContext['day']['tasks']) {
  return tasks.filter((task) => !task.completed && timeToMinutes(task.startTime) != null)
}

const scheduleOverloadDetector: SignalDetector = {
  type: 'schedule_overload',
  version: 1,
  enabledByDefault: true,
  evaluate(context) {
    const scheduled = scheduledTasks(context.day.tasks)
    const windows = [
      { id: 'morning', label: 'morning', start: 8 * 60, end: 12 * 60 },
      { id: 'afternoon', label: 'afternoon', start: 12 * 60, end: 18 * 60 },
      { id: 'evening', label: 'evening', start: 18 * 60, end: 22 * 60 },
    ]

    const overloaded = windows
      .map((window) => {
        const items = scheduled.filter((task) => {
          const start = timeToMinutes(task.startTime)
          return start != null && start >= window.start && start < window.end
        })
        const totalMinutes = items.reduce((sum, task) => sum + (task.duration ?? 30), 0)
        return { ...window, items, totalMinutes }
      })
      .filter((window) => window.items.length >= 3 && window.totalMinutes >= 180)
      .sort((a, b) => b.totalMinutes - a.totalMinutes || b.items.length - a.items.length)[0]

    if (!overloaded) return []

    const candidate = overloaded.items
      .filter((item) => item.type === 'task' && item.startTime)
      .sort((a, b) => (
        (b.startTime ?? '').localeCompare(a.startTime ?? '')
        || a.id.localeCompare(b.id)
      ))[0]
    const signalId = `${context.date}:schedule_overload:${overloaded.id}${candidate ? `:${candidate.id}` : ''}`
    const signalBase = {
      id: signalId,
      type: 'schedule_overload' as const,
      severity: (overloaded.totalMinutes >= 240 || overloaded.items.length >= 5 ? 'high' : 'medium') as 'high' | 'medium',
      confidence: 'high' as const,
      summary: `Your ${overloaded.label} has ${overloaded.items.length} scheduled Items totaling about ${overloaded.totalMinutes} minutes.`,
      rationale: candidate
        ? `"${candidate.title}" is the latest-starting Task in this crowded window. Moving it to Anytime would free ${candidate.duration ?? 30} scheduled minutes without deleting it.`
        : `This window is crowded, but there is no exact Task change HealthyFlow can safely prepare. Review the schedule or open Talk to choose what should move.`,
      evidence: [
        { label: 'Window', value: overloaded.label },
        { label: 'Scheduled load', value: `${overloaded.items.length} Items · ${overloaded.totalMinutes} min` },
        ...(candidate ? [{ label: 'Concrete candidate', value: `${candidate.title} · ${candidate.startTime}` }] : []),
      ],
    }
    if (!candidate) {
      return [{
        ...signalBase,
        kind: 'informational',
        proposal: null,
      }]
    }

    return [{
      ...signalBase,
      kind: 'actionable',
      proposal: {
        capability: 'update_item',
        label: `Move "${candidate.title}" to Anytime`,
        arguments: {
          itemId: candidate.id,
          startTime: null,
          requestId: `daily-signal:${signalId}`,
        },
        affectedRecords: [{
          id: candidate.id,
          kind: 'task',
          title: candidate.title,
          date: candidate.scheduledDate ?? context.date,
        }],
        changes: [{
          field: 'startTime',
          label: 'Start time',
          before: candidate.startTime,
          after: null,
        }],
      },
    }]
  },
}

const habitRiskDetector: SignalDetector = {
  type: 'habit_risk',
  version: 1,
  enabledByDefault: true,
  evaluate(context) {
    const dueHabits = context.day.tasks.filter((task) => task.type === 'habit' && !task.completed)
    const signals: DailySignal[] = []

    for (const habit of dueHabits) {
      const habitKey = habit.originalHabitId ?? habit.id
      const missedDates = context.lookback.habitHistory.days
        .filter((day) => day.habits.some((candidate) => {
          const candidateKey = candidate.originalHabitId ?? candidate.id
          return candidateKey === habitKey && !candidate.completed
        }))
        .map((day) => day.date)

      if (missedDates.length < 2) continue

      signals.push({
        id: `${context.date}:habit_risk:${habitKey}`,
        type: 'habit_risk',
        kind: 'informational',
        severity: missedDates.length >= 3 ? 'high' : 'medium',
        confidence: 'high',
        summary: `You missed "${habit.title}" ${missedDates.length} recent days and it is due today.`,
        rationale: `The Habit is due today after ${missedDates.length} recent misses. “Do a smaller version” is useful guidance, but it is not an exact record change HealthyFlow can safely apply.`,
        evidence: [
          { label: 'Habit', value: habit.title },
          { label: 'Recent misses', value: missedDates.join(', ') },
          { label: 'Due', value: context.date },
        ],
        proposal: null,
      })
    }

    return signals
  },
}

const missingCalorieLogDetector: SignalDetector = {
  type: 'missing_calorie_log',
  version: 1,
  enabledByDefault: true,
  evaluate(context) {
    if (context.generatedAt.slice(0, 10) !== context.date) return []
    const currentHour = hourFromIso(context.generatedAt)
    if (currentHour == null || currentHour < 14) return []

    const hasLunchOrLaterToday = context.day.calorieEntries.some((entry) => {
      const minutes = timeToMinutes(entry.time) ?? 0
      return minutes >= 11 * 60
    })
    if (hasLunchOrLaterToday) return []

    const historicalLunchLogs = context.lookback.calorieHistory.days.flatMap((day) => (
      day.entries
        .filter((entry) => {
          const minutes = timeToMinutes(entry.time)
          return minutes != null && minutes >= 11 * 60 && minutes <= 15 * 60
        })
        .map((entry) => ({ date: day.date, entryId: entry.id, time: entry.time, name: entry.name }))
    ))

    if (historicalLunchLogs.length < 2) return []

    return [{
      id: `${context.date}:missing_calorie_log:lunch`,
      type: 'missing_calorie_log',
      kind: 'informational',
      severity: 'low',
      confidence: historicalLunchLogs.length >= 4 ? 'high' : 'medium',
      summary: 'No lunch or afternoon Calorie entry is logged yet, and recent history suggests you often log one by now.',
      rationale: `HealthyFlow found ${historicalLunchLogs.length} recent lunch-time logs, but it cannot know what you ate today. Logging remains a user-supplied action.`,
      evidence: [
        { label: 'Today', value: 'No lunch or afternoon entry' },
        { label: 'Recent pattern', value: `${historicalLunchLogs.length} lunch-time logs in 7 days` },
        { label: 'Checked after', value: `${String(currentHour).padStart(2, '0')}:00 UTC` },
      ],
      proposal: null,
    }]
  },
}

export const DAILY_SIGNAL_DETECTORS: SignalDetector[] = [
  scheduleOverloadDetector,
  habitRiskDetector,
  missingCalorieLogDetector,
]

export function deriveDailySignals(context: DailyContextForSignals): DailySignal[] {
  const detectorOrder = new Map(DAILY_SIGNAL_DETECTORS.map((detector, index) => [detector.type, index]))
  return DAILY_SIGNAL_DETECTORS
    .filter((detector) => detector.enabledByDefault)
    .flatMap((detector) => detector.evaluate(context))
    .sort((a, b) => {
      return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
        || CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]
        || (detectorOrder.get(a.type) ?? 0) - (detectorOrder.get(b.type) ?? 0)
    })
    .slice(0, SIGNAL_LIMIT)
}

export async function buildDailyContext(userId: string, date = todayIso()): Promise<DailyContext> {
  const habitDates = previousDates(date, HABIT_LOOKBACK_DAYS)
  const calorieDates = previousDates(date, CALORIE_LOOKBACK_DAYS)
  const workoutDates = previousDates(date, WORKOUT_LOOKBACK_DAYS)

  const [
    tasks,
    calorieEntries,
    weightRow,
    achievements,
    workoutSessions,
    habitHistoryDays,
    calorieHistoryDays,
    workoutHistoryDays,
  ] = await Promise.all([
    tasksForDay(userId, date),
    caloriesForDay(userId, date),
    db.getWeightEntryByDay(userId, date),
    Achievements.list(userId, { includeArchived: false, entryLimit: 20 }),
    workoutSessionsForDay(userId, date),
    Promise.all(habitDates.map(async (historyDate) => ({
      date: historyDate,
      habits: (await tasksForDay(userId, historyDate)).filter((task) => task.type === 'habit'),
    }))),
    Promise.all(calorieDates.map(async (historyDate) => ({
      date: historyDate,
      entries: await caloriesForDay(userId, historyDate),
    }))),
    Promise.all(workoutDates.map(async (historyDate) => ({
      date: historyDate,
      sessions: await workoutSessionsForDay(userId, historyDate),
    }))),
  ])

  const contextWithoutSignals: DailyContextForSignals = {
    date,
    generatedAt: new Date().toISOString(),
    day: {
      tasks,
      calorieEntries,
      weight: weightRow ? weightRowToClient(weightRow) : null,
      achievements,
      workoutSessions,
      calendarEvents: [],
    },
    lookback: {
      habitHistory: {
        windowDays: HABIT_LOOKBACK_DAYS,
        days: habitHistoryDays,
      },
      calorieHistory: {
        windowDays: CALORIE_LOOKBACK_DAYS,
        days: calorieHistoryDays,
      },
      workoutHistory: {
        windowDays: WORKOUT_LOOKBACK_DAYS,
        days: workoutHistoryDays,
      },
    },
  }

  return DailyContextSchema.parse({
    ...contextWithoutSignals,
    signals: deriveDailySignals(contextWithoutSignals),
  })
}
