jest.mock('../src/supabase-client', () => ({
  db: {
    getTasksWithRecurringHabits: jest.fn(),
    getCalorieEntriesByDay: jest.fn(),
    getWeightEntryByDay: jest.fn(),
  },
}))

jest.mock('../src/rollover', () => ({
  Rollover: {
    addCarryForwardRows: jest.fn(async (_userId, _date, rows) => rows),
  },
}))

jest.mock('../src/achievements', () => ({
  Achievements: {
    list: jest.fn(),
  },
  AchievementEntryCreateSchema: require('zod').z.object({}),
}))

jest.mock('../src/workouts', () => ({
  Workouts: {
    listSessions: jest.fn(),
  },
  WorkoutSessionCreateSchema: require('zod').z.object({
    date: require('zod').z.string(),
    exercises: require('zod').z.array(require('zod').z.unknown()).default([]),
  }),
}))

import { AiCapabilities } from '../src/ai-capabilities'
import {
  buildDailyContext,
  DailyContextSchema,
  deriveDailySignals,
} from '../src/daily-context'
import { Achievements } from '../src/achievements'
import { db } from '../src/supabase-client'
import { Workouts } from '../src/workouts'

const task = (overrides: Record<string, unknown> = {}) => ({
  id: overrides.id ?? 'task-1',
  title: overrides.title ?? 'Task',
  type: overrides.type ?? 'task',
  category: overrides.category ?? 'personal',
  completed: overrides.completed ?? false,
  completedAt: overrides.completedAt ?? null,
  scheduledDate: overrides.scheduledDate ?? '2026-07-02',
  startTime: overrides.startTime ?? null,
  duration: overrides.duration ?? 30,
  repeat: overrides.repeat ?? 'none',
  position: overrides.position ?? null,
  isHabitInstance: overrides.isHabitInstance ?? false,
  originalHabitId: overrides.originalHabitId ?? null,
  createdAt: overrides.createdAt ?? '2026-07-02T08:00:00.000Z',
})

const calorie = (overrides: Record<string, unknown> = {}) => ({
  id: overrides.id ?? 'cal-1',
  date: overrides.date ?? '2026-07-02',
  time: overrides.time ?? '12:30',
  name: overrides.name ?? 'Lunch',
  calories: overrides.calories ?? 500,
  protein: overrides.protein ?? null,
  carbs: overrides.carbs ?? null,
  fat: overrides.fat ?? null,
  quantity: overrides.quantity ?? null,
  createdAt: overrides.createdAt ?? '2026-07-02T12:30:00.000Z',
  updatedAt: overrides.updatedAt ?? null,
})

const baseContext = (overrides: Record<string, unknown> = {}): any => ({
  date: overrides.date ?? '2026-07-02',
  generatedAt: overrides.generatedAt ?? '2026-07-02T14:30:00.000Z',
  day: {
    tasks: [],
    calorieEntries: [],
    weight: null,
    achievements: [],
    workoutSessions: [],
    calendarEvents: [],
    ...((overrides.day as Record<string, unknown>) ?? {}),
  },
  lookback: {
    habitHistory: { windowDays: 3, days: [] },
    calorieHistory: { windowDays: 7, days: [] },
    workoutHistory: { windowDays: 14, days: [] },
    ...((overrides.lookback as Record<string, unknown>) ?? {}),
  },
})

describe('daily context signals', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fires schedule_overload for a packed day window', () => {
    const signals = deriveDailySignals(baseContext({
      day: {
        tasks: [
          task({ id: 't1', startTime: '13:00', duration: 60 }),
          task({ id: 't2', startTime: '14:00', duration: 60 }),
          task({ id: 't3', startTime: '15:00', duration: 60 }),
        ],
      },
    }))

    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({
      type: 'schedule_overload',
      severity: 'medium',
      confidence: 'high',
    })
    expect(signals[0].evidence).toMatchObject({ window: 'afternoon', itemCount: 3, totalMinutes: 180 })
  })

  it('keeps schedule_overload quiet for a balanced day', () => {
    const signals = deriveDailySignals(baseContext({
      day: {
        tasks: [
          task({ id: 't1', startTime: '09:00', duration: 30 }),
          task({ id: 't2', startTime: '14:00', duration: 30 }),
        ],
      },
    }))

    expect(signals.some((signal) => signal.type === 'schedule_overload')).toBe(false)
  })

  it('fires habit_risk when a due Habit was missed on recent days', () => {
    const dueHabit = task({
      id: 'habit-1-2026-07-02',
      title: 'Stretch',
      type: 'habit',
      originalHabitId: 'habit-1',
      isHabitInstance: true,
    })
    const missedHabit = (date: string) => task({
      id: `habit-1-${date}`,
      title: 'Stretch',
      type: 'habit',
      originalHabitId: 'habit-1',
      isHabitInstance: true,
      scheduledDate: date,
      completed: false,
    })

    const signals = deriveDailySignals(baseContext({
      day: { tasks: [dueHabit] },
      lookback: {
        habitHistory: {
          windowDays: 3,
          days: [
            { date: '2026-07-01', habits: [missedHabit('2026-07-01')] },
            { date: '2026-06-30', habits: [missedHabit('2026-06-30')] },
            { date: '2026-06-29', habits: [] },
          ],
        },
        calorieHistory: { windowDays: 7, days: [] },
        workoutHistory: { windowDays: 14, days: [] },
      },
    }))

    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'habit_risk',
        evidence: expect.objectContaining({
          habitId: 'habit-1',
          missedDates: ['2026-07-01', '2026-06-30'],
        }),
      }),
    ]))
  })

  it('keeps habit_risk quiet when the Habit was not repeatedly missed', () => {
    const signals = deriveDailySignals(baseContext({
      day: {
        tasks: [task({ id: 'habit-1-2026-07-02', type: 'habit', originalHabitId: 'habit-1', isHabitInstance: true })],
      },
      lookback: {
        habitHistory: {
          windowDays: 3,
          days: [
            { date: '2026-07-01', habits: [task({ id: 'habit-1-2026-07-01', type: 'habit', originalHabitId: 'habit-1', completed: true })] },
          ],
        },
        calorieHistory: { windowDays: 7, days: [] },
        workoutHistory: { windowDays: 14, days: [] },
      },
    }))

    expect(signals.some((signal) => signal.type === 'habit_risk')).toBe(false)
  })

  it('fires missing_calorie_log from bounded recent logging history', () => {
    const signals = deriveDailySignals(baseContext({
      lookback: {
        habitHistory: { windowDays: 3, days: [] },
        calorieHistory: {
          windowDays: 7,
          days: [
            { date: '2026-07-01', entries: [calorie({ id: 'c1', date: '2026-07-01', time: '12:10' })] },
            { date: '2026-06-30', entries: [calorie({ id: 'c2', date: '2026-06-30', time: '13:20' })] },
          ],
        },
        workoutHistory: { windowDays: 14, days: [] },
      },
    }))

    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'missing_calorie_log',
        severity: 'low',
        confidence: 'medium',
      }),
    ]))
  })

  it('keeps missing_calorie_log quiet before the meal window or when an entry exists', () => {
    const history = {
      habitHistory: { windowDays: 3, days: [] },
      calorieHistory: {
        windowDays: 7,
        days: [
          { date: '2026-07-01', entries: [calorie({ id: 'c1', date: '2026-07-01', time: '12:10' })] },
          { date: '2026-06-30', entries: [calorie({ id: 'c2', date: '2026-06-30', time: '13:20' })] },
        ],
      },
      workoutHistory: { windowDays: 14, days: [] },
    }

    expect(deriveDailySignals(baseContext({ generatedAt: '2026-07-02T10:30:00.000Z', lookback: history }))
      .some((signal) => signal.type === 'missing_calorie_log')).toBe(false)
    expect(deriveDailySignals(baseContext({ day: { calorieEntries: [calorie({ time: '12:00' })] }, lookback: history }))
      .some((signal) => signal.type === 'missing_calorie_log')).toBe(false)
  })

  it('ranks signals deterministically and caps output at three', () => {
    const dueHabit = (id: string) => task({
      id: `${id}-2026-07-02`,
      title: id,
      type: 'habit',
      originalHabitId: id,
      isHabitInstance: true,
    })
    const missedHabit = (id: string, date: string) => task({
      id: `${id}-${date}`,
      title: id,
      type: 'habit',
      originalHabitId: id,
      isHabitInstance: true,
      scheduledDate: date,
    })

    const signals = deriveDailySignals(baseContext({
      day: {
        tasks: [
          task({ id: 't1', startTime: '13:00', duration: 90 }),
          task({ id: 't2', startTime: '14:00', duration: 90 }),
          task({ id: 't3', startTime: '15:00', duration: 90 }),
          dueHabit('habit-a'),
          dueHabit('habit-b'),
        ],
      },
      lookback: {
        habitHistory: {
          windowDays: 3,
          days: [
            { date: '2026-07-01', habits: [missedHabit('habit-a', '2026-07-01'), missedHabit('habit-b', '2026-07-01')] },
            { date: '2026-06-30', habits: [missedHabit('habit-a', '2026-06-30'), missedHabit('habit-b', '2026-06-30')] },
          ],
        },
        calorieHistory: {
          windowDays: 7,
          days: [
            { date: '2026-07-01', entries: [calorie({ id: 'c1', date: '2026-07-01', time: '12:10' })] },
            { date: '2026-06-30', entries: [calorie({ id: 'c2', date: '2026-06-30', time: '13:20' })] },
          ],
        },
        workoutHistory: { windowDays: 14, days: [] },
      },
    }))

    expect(signals).toHaveLength(3)
    expect(signals.map((signal) => signal.type)).toEqual(['schedule_overload', 'habit_risk', 'habit_risk'])
  })
})

describe('get_daily_context capability', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(db.getTasksWithRecurringHabits as jest.Mock).mockResolvedValue([])
    ;(db.getCalorieEntriesByDay as jest.Mock).mockResolvedValue([])
    ;(db.getWeightEntryByDay as jest.Mock).mockResolvedValue(null)
    ;(Achievements.list as jest.Mock).mockResolvedValue([])
    ;(Workouts.listSessions as jest.Mock).mockResolvedValue([])
  })

  it('does not accept userId in the input schema shape', () => {
    expect(Object.keys((AiCapabilities.get_daily_context.inputSchema as any).shape)).toEqual(['date'])
  })

  it('returns a typed empty daily context', async () => {
    const value = await buildDailyContext('user-1', '2026-07-02')

    expect(DailyContextSchema.safeParse(value).success).toBe(true)
    expect(value).toMatchObject({
      date: '2026-07-02',
      day: {
        tasks: [],
        calorieEntries: [],
        weight: null,
        achievements: [],
        workoutSessions: [],
        calendarEvents: [],
      },
      signals: [],
    })
    expect(value.lookback.habitHistory.days).toHaveLength(3)
    expect(value.lookback.calorieHistory.days).toHaveLength(7)
    expect(value.lookback.workoutHistory.days).toHaveLength(14)
  })
})
