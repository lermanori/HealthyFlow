import { z } from 'zod'
import { Achievements } from './achievements'
import { Rollover } from './rollover'
import { db } from './supabase-client'
import { Workouts } from './workouts'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SIGNAL_LIMIT = 3
const HABIT_LOOKBACK_DAYS = 3
const CALORIE_LOOKBACK_DAYS = 7
const WORKOUT_LOOKBACK_DAYS = 14

export const DailyContextInputSchema = z.object({
  date: z.string().regex(DATE_RE).optional(),
})

export const DailySignalTypeSchema = z.enum([
  'schedule_overload',
  'habit_risk',
  'missing_calorie_log',
])

export const DailySignalSchema = z.object({
  id: z.string(),
  type: DailySignalTypeSchema,
  severity: z.enum(['info', 'low', 'medium', 'high']),
  confidence: z.enum(['low', 'medium', 'high']),
  summary: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  suggestedAction: z.object({
    type: z.string(),
    label: z.string(),
    targetId: z.string().nullable().optional(),
  }).nullable(),
})

const DailyTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  category: z.string().nullable().optional(),
  completed: z.boolean(),
  completedAt: z.string().nullable(),
  scheduledDate: z.string().nullable(),
  startTime: z.string().nullable(),
  duration: z.number().nullable(),
  repeat: z.string().nullable().optional(),
  position: z.number().nullable(),
  isHabitInstance: z.boolean(),
  originalHabitId: z.string().nullable(),
  createdAt: z.string().nullable(),
})

const DailyCalorieEntrySchema = z.object({
  id: z.string(),
  date: z.string(),
  time: z.string().nullable(),
  name: z.string(),
  calories: z.number(),
  protein: z.number().nullable(),
  carbs: z.number().nullable(),
  fat: z.number().nullable(),
  quantity: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

const DailyWeightSchema = z.object({
  id: z.string(),
  date: z.string(),
  weightKg: z.number(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

const HabitHistoryDaySchema = z.object({
  date: z.string(),
  habits: z.array(DailyTaskSchema),
})

const CalorieHistoryDaySchema = z.object({
  date: z.string(),
  entries: z.array(DailyCalorieEntrySchema),
})

const WorkoutHistoryDaySchema = z.object({
  date: z.string(),
  sessions: z.array(z.unknown()),
})

export const DailyContextSchema = z.object({
  date: z.string().regex(DATE_RE),
  generatedAt: z.string(),
  day: z.object({
    tasks: z.array(DailyTaskSchema),
    calorieEntries: z.array(DailyCalorieEntrySchema),
    weight: DailyWeightSchema.nullable(),
    achievements: z.array(z.unknown()),
    workoutSessions: z.array(z.unknown()),
    calendarEvents: z.array(z.unknown()),
  }),
  lookback: z.object({
    habitHistory: z.object({
      windowDays: z.literal(HABIT_LOOKBACK_DAYS),
      days: z.array(HabitHistoryDaySchema),
    }),
    calorieHistory: z.object({
      windowDays: z.literal(CALORIE_LOOKBACK_DAYS),
      days: z.array(CalorieHistoryDaySchema),
    }),
    workoutHistory: z.object({
      windowDays: z.literal(WORKOUT_LOOKBACK_DAYS),
      days: z.array(WorkoutHistoryDaySchema),
    }),
  }),
  signals: z.array(DailySignalSchema),
})

export type DailySignalType = z.infer<typeof DailySignalTypeSchema>
export type DailySignal = z.infer<typeof DailySignalSchema>
export type DailyContext = z.infer<typeof DailyContextSchema>
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

function dailyTaskToClient(row: any): z.infer<typeof DailyTaskSchema> {
  const originalHabitId = row.original_habit_id ?? row.originalHabitId ?? null
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    type: String(row.type ?? 'task'),
    category: row.category ?? null,
    completed: Boolean(row.completed),
    completedAt: row.completed_at ?? row.completedAt ?? null,
    scheduledDate: row.scheduled_date ?? row.scheduledDate ?? null,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : row.startTime ? String(row.startTime).slice(0, 5) : null,
    duration: typeof row.duration === 'number' ? row.duration : row.duration == null ? null : Number(row.duration),
    repeat: row.repeat_type ?? row.repeat ?? null,
    position: typeof row.position === 'number' ? row.position : row.position == null ? null : Number(row.position),
    isHabitInstance: Boolean(row.is_habit_instance ?? row.isHabitInstance),
    originalHabitId,
    createdAt: row.created_at ?? row.createdAt ?? null,
  }
}

function calorieToClient(row: any): z.infer<typeof DailyCalorieEntrySchema> {
  return {
    id: String(row.id),
    date: String(row.date),
    time: row.time ? String(row.time).slice(0, 5) : null,
    name: String(row.name ?? ''),
    calories: Number(row.calories ?? 0),
    protein: row.protein == null ? null : Number(row.protein),
    carbs: row.carbs == null ? null : Number(row.carbs),
    fat: row.fat == null ? null : Number(row.fat),
    quantity: row.quantity ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

function weightToClient(row: any): z.infer<typeof DailyWeightSchema> {
  return {
    id: String(row.id),
    date: String(row.date),
    weightKg: Number(row.weight_kg ?? row.weightKg),
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

async function tasksForDay(userId: string, date: string) {
  const datedRows = await db.getTasksWithRecurringHabits(userId, date)
  const rows = await Rollover.addCarryForwardRows(userId, date, datedRows)
  return rows.map(dailyTaskToClient)
}

async function caloriesForDay(userId: string, date: string) {
  const rows = await db.getCalorieEntriesByDay(userId, date)
  return (rows ?? []).map(calorieToClient)
}

async function workoutSessionsForDay(userId: string, date: string) {
  return Workouts.listSessions(userId, date)
}

function scheduledTasks(tasks: Array<z.infer<typeof DailyTaskSchema>>) {
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

    return [{
      id: `${context.date}:schedule_overload:${overloaded.id}`,
      type: 'schedule_overload',
      severity: overloaded.totalMinutes >= 240 || overloaded.items.length >= 5 ? 'high' : 'medium',
      confidence: 'high',
      summary: `Your ${overloaded.label} has ${overloaded.items.length} scheduled items totaling about ${overloaded.totalMinutes} minutes.`,
      evidence: {
        window: overloaded.id,
        itemCount: overloaded.items.length,
        totalMinutes: overloaded.totalMinutes,
        itemIds: overloaded.items.map((item) => item.id),
      },
      suggestedAction: {
        type: 'move_to_anytime',
        label: 'Move one item to Anytime',
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
        severity: missedDates.length >= 3 ? 'high' : 'medium',
        confidence: 'high',
        summary: `You missed "${habit.title}" ${missedDates.length} recent days and it is due today.`,
        evidence: {
          habitId: habitKey,
          habitTitle: habit.title,
          missedDates,
          dueToday: true,
        },
        suggestedAction: {
          type: 'reduce_scope',
          label: 'Do a smaller version today',
          targetId: habit.id,
        },
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
      severity: 'low',
      confidence: historicalLunchLogs.length >= 4 ? 'high' : 'medium',
      summary: 'No lunch or afternoon Calorie entry is logged yet, and recent history suggests you often log one by now.',
      evidence: {
        checkedAfterHourUtc: currentHour,
        historicalLunchLogCount: historicalLunchLogs.length,
        historicalExamples: historicalLunchLogs.slice(0, 5),
      },
      suggestedAction: {
        type: 'open_calorie_entry',
        label: 'Log a Calorie entry',
      },
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
      weight: weightRow ? weightToClient(weightRow) : null,
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
