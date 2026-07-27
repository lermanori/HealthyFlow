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

  it('derives explainable planning decisions without additional Item reads', async () => {
    const itemsForDay = jest.fn(async (_userId: string, date: string) => {
      if (date === '2026-07-27') {
        return [
          item({ id: 'unknown', title: 'Estimate me', scheduledDate: date, duration: null }),
          item({ id: 'deep-work', title: 'Deep work', scheduledDate: date, duration: 300 }),
          item({
            id: 'carry',
            title: 'Carry me',
            scheduledDate: '2026-07-24',
            duration: 60,
            rolledOverFromTaskId: 'original-carry',
          }),
        ]
      }
      return []
    })

    const summary = await buildWeekSummary('user-1', '2026-07-29', 'UTC', {
      includePlanning: true,
      now: new Date('2026-07-27T06:00:00.000Z'),
      dependencies: {
        itemsForDay,
        getSettings: async () => ({
          weekStartsOn: 1,
          planningWindow: {
            startTime: '08:00',
            endTime: '12:00',
            transitionBufferMinutes: 0,
          },
          calorieIntake: true,
          workoutTracker: true,
        }),
        getCalendarStatus: async () => ({ connected: true }) as any,
        getCalendarEvents: async () => [],
      },
    })

    expect(itemsForDay).toHaveBeenCalledTimes(7)
    expect(summary.planning.days[0]).toMatchObject({
      date: '2026-07-27',
      state: 'partial',
      knownDemandMinutes: 360,
      unknownDurationItemCount: 1,
      availableMinutes: 240,
      remainingMinutes: -120,
    })
    expect(summary.planning.decisions.map((decision) => decision.type)).toEqual(
      expect.arrayContaining(['missing_duration', 'rollover'])
    )
    expect(summary.planning.decisions.find((decision) => decision.type === 'missing_duration')?.actions)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'update_item',
          itemId: 'unknown',
          changes: { duration: 30 },
        }),
      ]))
  })

  it('finds overload placement and timed conflicts from one weekly snapshot', async () => {
    const itemsForDay = jest.fn(async (_userId: string, date: string) => date === '2026-07-27'
      ? [
          item({ id: 'move-me', title: 'Move me', scheduledDate: date, duration: 180 }),
          item({ id: 'keep-me', title: 'Keep me', scheduledDate: date, duration: 120 }),
          item({ id: 'timed', title: 'Timed focus', scheduledDate: date, startTime: '09:00', duration: 60 }),
        ]
      : [])

    const summary = await buildWeekSummary('user-1', '2026-07-29', 'UTC', {
      includePlanning: true,
      now: new Date('2026-07-27T06:00:00.000Z'),
      dependencies: {
        itemsForDay,
        getSettings: async () => ({
          weekStartsOn: 1,
          planningWindow: {
            startTime: '08:00',
            endTime: '12:00',
            transitionBufferMinutes: 0,
          },
          calorieIntake: true,
          workoutTracker: true,
        }),
        getCalendarStatus: async () => ({ connected: true }) as any,
        getCalendarEvents: async (_userId: string, date: string) => date === '2026-07-27'
          ? [{
              id: 'calendar-conflict',
              provider: 'google',
              calendarId: 'primary',
              externalEventId: 'external-conflict',
              title: 'Calendar conflict',
              description: null,
              location: null,
              startAt: null,
              endAt: null,
              localStartTime: '09:30',
              localEndTime: '10:30',
              allDay: false,
              status: 'confirmed',
              htmlLink: null,
              completed: false,
              completedAt: null,
            }]
          : [],
      },
    })

    expect(summary.planning.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'capacity_overload',
        actions: expect.arrayContaining([
          expect.objectContaining({
            kind: 'update_item',
            itemId: 'move-me',
            changes: { scheduledDate: '2026-07-28', startTime: null },
          }),
        ]),
      }),
      expect.objectContaining({
        type: 'schedule_conflict',
        actions: expect.arrayContaining([
          expect.objectContaining({
            kind: 'update_item',
            itemId: 'timed',
            changes: { startTime: null },
          }),
        ]),
      }),
    ]))
  })
})
