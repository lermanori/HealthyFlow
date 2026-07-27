import { buildWeekSummary } from '../src/day-summary'
import { WeekSummarySchema, type DaySummaryItem } from '../src/day-summary-schema'

const item = (overrides: Partial<DaySummaryItem>): DaySummaryItem => ({
  id: 'task-1',
  title: 'Plan',
  type: 'task',
  category: 'work',
  startTime: null,
  location: null,
  duration: 30,
  repeat: 'none',
  completed: false,
  scheduledDate: '2026-07-27',
  createdAt: '2026-07-01T00:00:00.000Z',
  overdueNotified: false,
  isHabitInstance: false,
  originalHabitId: null,
  rolledOverFromTaskId: null,
  originalCreatedAt: null,
  completedAt: null,
  position: 0,
  googleEventId: null,
  syncedToGoogle: false,
  googleSyncStatus: 'pending',
  ...overrides,
})

describe('WeekSummary', () => {
  it('returns seven canonical days with deduplicated completion and Habit cadence', async () => {
    const itemsForDay = jest.fn(async (_userId: string, date: string) => {
      if (date === '2026-07-27') {
        return [
          item({ id: 'rollover-1', title: 'Carry me', scheduledDate: date }),
          item({
            id: 'habit-parent-2026-07-27',
            title: 'Walk',
            type: 'habit',
            repeat: 'daily',
            scheduledDate: date,
            isHabitInstance: true,
            originalHabitId: 'habit-parent',
            habitInfo: { target: null, outcome: 'failed', progressTotal: 0 },
          }),
        ]
      }
      if (date === '2026-07-28') {
        return [
          item({ id: 'rollover-1', title: 'Carry me', scheduledDate: date }),
          item({
            id: 'habit-parent-2026-07-28',
            title: 'Walk',
            type: 'habit',
            repeat: 'daily',
            scheduledDate: date,
            isHabitInstance: true,
            originalHabitId: 'habit-parent',
            habitInfo: { target: null, outcome: 'completed', progressTotal: 0 },
            completed: true,
          }),
        ]
      }
      return []
    })

    const summary = await buildWeekSummary('user-1', '2026-07-29', 'UTC', {
      now: new Date('2026-07-29T10:00:00.000Z'),
      dependencies: {
        itemsForDay,
        getSettings: async () => ({
          weekStartsOn: 1,
          planningWindow: null,
          calorieIntake: true,
          workoutTracker: true,
        }),
        getCalendarStatus: async () => ({ connected: false }) as any,
        getCalendarEvents: async () => [],
      },
    })

    expect(WeekSummarySchema.safeParse(summary).success).toBe(true)
    expect(summary.week).toMatchObject({
      weekStartsOn: 1,
      startDate: '2026-07-27',
      endDate: '2026-08-02',
    })
    expect(summary.days).toHaveLength(7)
    expect(itemsForDay).toHaveBeenCalledTimes(7)
    expect(summary.completion).toMatchObject({
      total: 3,
      completed: 1,
      addressed: 2,
      remaining: 1,
    })
    expect(summary.habitCadence).toEqual([
      expect.objectContaining({
        originalHabitId: 'habit-parent',
        title: 'Walk',
        days: expect.arrayContaining([
          expect.objectContaining({ date: '2026-07-27', outcome: 'failed' }),
          expect.objectContaining({ date: '2026-07-28', outcome: 'completed' }),
        ]),
      }),
    ])
  })
})
