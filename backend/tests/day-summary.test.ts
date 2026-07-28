import {
  buildDaySummary,
  deriveAttention,
  deriveCapacity,
  deriveDateMode,
  unionIntervals,
} from '../src/day-summary'
import {
  DaySummaryCalendarEvent,
  DaySummaryItem,
  DaySummarySchema,
} from '../src/day-summary-schema'

const item = (overrides: Partial<DaySummaryItem> = {}): DaySummaryItem => ({
  id: 'item-1',
  title: 'Item',
  type: 'task',
  category: 'personal',
  startTime: null,
  location: null,
  duration: 30,
  repeat: 'none',
  completed: false,
  scheduledDate: '2026-07-27',
  createdAt: '2026-07-20T08:00:00.000Z',
  overdueNotified: false,
  isHabitInstance: false,
  originalHabitId: null,
  rolledOverFromTaskId: null,
  originalCreatedAt: null,
  completedAt: null,
  position: null,
  googleEventId: null,
  syncedToGoogle: false,
  googleSyncStatus: 'pending',
  resolvedTime: null,
  ...overrides,
})

const event = (overrides: Partial<DaySummaryCalendarEvent> = {}): DaySummaryCalendarEvent => ({
  id: 'event-1',
  provider: 'google',
  calendarId: 'primary',
  externalEventId: 'google-1',
  title: 'Calendar event',
  description: null,
  location: null,
  startAt: '2026-07-27T09:30:00.000Z',
  endAt: '2026-07-27T10:30:00.000Z',
  localStartTime: '09:30',
  localEndTime: '10:30',
  allDay: false,
  status: 'confirmed',
  htmlLink: null,
  completed: false,
  completedAt: null,
  ...overrides,
})

const planningWindow = {
  startTime: '08:00',
  endTime: '18:00',
  transitionBufferMinutes: 15,
}

describe('DaySummary capacity derivation', () => {
  it('unions overlapping obligations and after-obligation buffers', () => {
    expect(unionIntervals([
      { start: 60, end: 120 },
      { start: 90, end: 180 },
      { start: 240, end: 300 },
    ])).toEqual([
      { start: 60, end: 180 },
      { start: 240, end: 300 },
    ])

    const capacity = deriveCapacity({
      date: '2026-07-27',
      dateMode: 'future',
      timeZone: 'Asia/Jerusalem',
      now: new Date('2026-07-26T08:00:00.000Z'),
      planningWindow,
      items: [item({ startTime: '09:00', duration: 60, completed: true })],
      calendar: { status: 'connected', reasonCode: null, events: [event()] },
    })

    expect(capacity).toMatchObject({
      status: 'complete',
      availableMinutes: 495,
      basis: {
        scope: 'planned',
        knownLoadMinutes: 105,
        timedItemCount: 1,
        calendarEventCount: 1,
      },
    })
  })

  it('uses the remaining planning window for today', () => {
    const capacity = deriveCapacity({
      date: '2026-07-27',
      dateMode: 'today',
      timeZone: 'UTC',
      now: new Date('2026-07-27T10:00:00.000Z'),
      planningWindow,
      items: [item({ startTime: '09:00', duration: 120 })],
      calendar: { status: 'connected_empty', reasonCode: null, events: [] },
    })

    expect(capacity).toMatchObject({
      status: 'complete',
      window: {
        consideredStartTime: '10:00',
        consideredEndTime: '18:00',
        consideredMinutes: 480,
      },
      basis: { scope: 'remaining', knownLoadMinutes: 75 },
      availableMinutes: 405,
    })
  })

  it('uses historical and full-window semantics for past and future dates', () => {
    expect(deriveCapacity({
      date: '2026-07-25',
      dateMode: 'past',
      timeZone: 'UTC',
      now: new Date('2026-07-27T12:00:00.000Z'),
      planningWindow,
      items: [],
      calendar: { status: 'connected_empty', reasonCode: null, events: [] },
    })).toMatchObject({
      status: 'complete',
      basis: { scope: 'historical' },
      availableMinutes: 600,
    })

    expect(deriveCapacity({
      date: '2026-07-29',
      dateMode: 'future',
      timeZone: 'UTC',
      now: new Date('2026-07-27T12:00:00.000Z'),
      planningWindow,
      items: [],
      calendar: { status: 'connected_empty', reasonCode: null, events: [] },
    })).toMatchObject({
      status: 'complete',
      basis: { scope: 'planned' },
      availableMinutes: 600,
    })
  })

  it('returns partial capacity with known load and an upper bound for missing inputs', () => {
    const capacity = deriveCapacity({
      date: '2026-07-27',
      dateMode: 'future',
      timeZone: 'UTC',
      now: new Date('2026-07-26T08:00:00.000Z'),
      planningWindow,
      items: [
        item({ id: 'known', startTime: '09:00', duration: 60 }),
        item({ id: 'unknown', startTime: '12:00', duration: null }),
      ],
      calendar: {
        status: 'not_connected',
        reasonCode: 'not_connected',
        events: [],
      },
    })

    expect(capacity).toEqual(expect.objectContaining({
      status: 'partial',
      basis: expect.objectContaining({ knownLoadMinutes: 75 }),
      availableUpperBoundMinutes: 525,
      reasonCodes: ['calendar_not_connected', 'item_missing_duration'],
    }))
    expect(capacity).not.toHaveProperty('availableMinutes')
  })

  it('treats all-day and malformed timed calendar obligations as partial', () => {
    const capacity = deriveCapacity({
      date: '2026-07-27',
      dateMode: 'future',
      timeZone: 'UTC',
      now: new Date('2026-07-26T08:00:00.000Z'),
      planningWindow,
      items: [],
      calendar: {
        status: 'connected',
        reasonCode: null,
        events: [
          event({ id: 'all-day', allDay: true, localStartTime: null, localEndTime: null }),
          event({ id: 'missing-end', localEndTime: null }),
          event({ id: 'bad-range', localStartTime: '12:00', localEndTime: '11:00' }),
        ],
      },
    })

    expect(capacity).toMatchObject({
      status: 'partial',
      reasonCodes: [
        'calendar_event_all_day',
        'calendar_event_missing_time',
        'calendar_event_invalid_time',
      ],
    })
  })

  it('returns unavailable without a valid explicit planning window and timezone', () => {
    expect(deriveCapacity({
      date: '2026-07-27',
      dateMode: 'unknown',
      timeZone: null,
      now: new Date(),
      planningWindow: null,
      items: [],
      calendar: { status: 'connected_empty', reasonCode: null, events: [] },
    })).toEqual({
      status: 'unavailable',
      window: null,
      basis: null,
      reasonCodes: ['planning_window_missing', 'timezone_missing'],
    })

    expect(deriveCapacity({
      date: '2026-07-27',
      dateMode: 'unknown',
      timeZone: 'Not/A_Timezone',
      now: new Date(),
      planningWindow: { startTime: '18:00', endTime: '08:00', transitionBufferMinutes: 15 },
      items: [],
      calendar: { status: 'connected_empty', reasonCode: null, events: [] },
    })).toMatchObject({
      status: 'unavailable',
      reasonCodes: ['planning_window_invalid', 'timezone_invalid'],
    })
  })

  it('classifies dates in the supplied timezone', () => {
    const now = new Date('2026-07-26T22:30:00.000Z')
    expect(deriveDateMode('2026-07-27', 'Asia/Jerusalem', now)).toBe('today')
    expect(deriveDateMode('2026-07-26', 'Asia/Jerusalem', now)).toBe('past')
    expect(deriveDateMode('2026-07-28', 'Asia/Jerusalem', now)).toBe('future')
    expect(deriveDateMode('2026-07-27', 'Not/A_Timezone', now)).toBe('unknown')
  })
})

describe('DaySummary attention derivation', () => {
  it('selects active, overdue, and Anytime focus in deterministic order', () => {
    const items = [
      item({ id: 'anytime-b', startTime: null, position: 2 }),
      item({ id: 'overdue', startTime: '08:00', duration: 30 }),
      item({ id: 'active', startTime: '10:00', duration: 60 }),
      item({ id: 'next', startTime: '11:30', duration: 30 }),
      item({ id: 'anytime-a', startTime: null, position: 1 }),
    ]
    expect(deriveAttention({
      items,
      calendarEvents: [],
      dateMode: 'today',
      nowMinutes: 10 * 60 + 15,
    }).focus).toEqual({
      state: 'selected',
      itemId: 'active',
      reasonCode: 'active_timed_item',
    })

    expect(deriveAttention({
      items: items.filter((candidate) => candidate.id !== 'active'),
      calendarEvents: [],
      dateMode: 'today',
      nowMinutes: 10 * 60 + 15,
    }).focus).toEqual({
      state: 'selected',
      itemId: 'overdue',
      reasonCode: 'overdue_timed_item',
    })

    expect(deriveAttention({
      items: items.filter((candidate) => candidate.id.startsWith('anytime')),
      calendarEvents: [],
      dateMode: 'today',
      nowMinutes: 10 * 60 + 15,
    }).focus).toEqual({
      state: 'selected',
      itemId: 'anytime-a',
      reasonCode: 'first_anytime_item',
    })
  })

  it('keeps focus, next planned Item, and next Calendar obligation separate', () => {
    const attention = deriveAttention({
      items: [
        item({ id: 'anytime', startTime: null, position: 0 }),
        item({ id: 'planned', title: 'Planned Item', startTime: '11:00', duration: 60 }),
      ],
      calendarEvents: [event({ id: 'calendar', title: 'Calendar obligation', localStartTime: '11:00', localEndTime: '11:30' })],
      dateMode: 'today',
      nowMinutes: 10 * 60,
    })

    expect(attention.focus.itemId).toBe('anytime')
    expect(attention.nextPlannedItem?.id).toBe('planned')
    expect(attention.nextCalendarObligation?.id).toBe('calendar')
    expect(attention.nextObligation).toMatchObject({
      source: 'calendar',
      id: 'calendar',
      reasonCode: 'calendar_wins_same_time_tie',
      conflictIds: ['item:planned'],
    })
  })

  it('returns explicit empty, completed, past-incomplete, future, and no-attention states', () => {
    expect(deriveAttention({
      items: [],
      calendarEvents: [],
      dateMode: 'today',
      nowMinutes: 600,
    }).focus.state).toBe('empty_day')
    expect(deriveAttention({
      items: [item({ completed: true })],
      calendarEvents: [],
      dateMode: 'today',
      nowMinutes: 600,
    }).focus.state).toBe('completed_day')
    expect(deriveAttention({
      items: [item({ id: 'past' })],
      calendarEvents: [],
      dateMode: 'past',
      nowMinutes: null,
    }).focus).toMatchObject({ state: 'past_incomplete', itemId: 'past' })
    expect(deriveAttention({
      items: [item({ id: 'future' })],
      calendarEvents: [],
      dateMode: 'future',
      nowMinutes: null,
    }).focus).toMatchObject({ state: 'future_planned', itemId: 'future' })
    expect(deriveAttention({
      items: [item({ startTime: '15:00' })],
      calendarEvents: [],
      dateMode: 'today',
      nowMinutes: 600,
    }).focus.state).toBe('nothing_needs_attention')
  })

  it('does not keep a failed binary Habit in focus or upcoming obligations', () => {
    const attention = deriveAttention({
      items: [
        item({
          id: 'failed-habit',
          title: 'Do not smoke',
          type: 'habit',
          startTime: '09:00',
          completed: false,
          habitInfo: {
            target: null,
            outcome: 'failed',
            progressTotal: 0,
            chunks: [],
          },
        }),
        item({ id: 'pending-task', title: 'Pending Task', startTime: null }),
      ],
      calendarEvents: [],
      dateMode: 'today',
      nowMinutes: 10 * 60,
    })

    expect(attention.focus.itemId).toBe('pending-task')
    expect(attention.nextPlannedItem).toBeNull()
  })
})

describe('DaySummary composition', () => {
  const dependenciesFor = (overrides: Record<string, jest.Mock> = {}) => ({
    itemsForDay: jest.fn().mockResolvedValue([]),
    getSettings: jest.fn().mockResolvedValue({
      weekStartsOn: 1,
      calorieIntake: true,
      workoutTracker: true,
      planningWindow,
    }),
    getCalendarStatus: jest.fn().mockResolvedValue({ connected: false }),
    getCalendarEvents: jest.fn().mockResolvedValue([]),
    getCalorieEntries: jest.fn().mockResolvedValue([]),
    getWeightEntry: jest.fn().mockResolvedValue(null),
    getWorkoutSessions: jest.fn().mockResolvedValue([]),
    ...overrides,
  })

  it('counts a failed binary Habit as addressed without counting it as completed', async () => {
    const failedHabit = item({
      id: 'failed-habit',
      title: 'Do not smoke',
      type: 'habit',
      startTime: '09:00',
      completed: false,
      habitInfo: {
        target: null,
        outcome: 'failed',
        progressTotal: 0,
        chunks: [],
      },
    })
    const pendingTask = item({ id: 'pending-task', title: 'Pending Task' })
    const summary = await buildDaySummary('user-1', '2026-07-27', 'UTC', {
      now: new Date('2026-07-27T10:00:00.000Z'),
      dependencies: dependenciesFor({
        itemsForDay: jest.fn().mockImplementation((_userId, date) =>
          Promise.resolve(date === '2026-07-27' ? [failedHabit, pendingTask] : [])
        ),
      }),
    })

    expect(summary.completion).toMatchObject({
      total: 2,
      completed: 0,
      addressed: 1,
      remaining: 1,
      percent: 50,
    })
    expect(summary.week.days.find((day) => day.date === '2026-07-27')).toMatchObject({
      total: 2,
      completed: 0,
      addressed: 1,
    })
    expect(summary.attention.focus.itemId).toBe('pending-task')
  })

  it('keeps the core Item plan when optional sources are unavailable', async () => {
    const coreItems = [
      item({
        id: 'habit-parent-2026-07-27',
        type: 'habit',
        repeat: 'daily',
        isHabitInstance: true,
        originalHabitId: 'habit-parent',
        habitInfo: {
          target: { value: 20, unit: 'minutes' },
          outcome: 'partial',
          progressTotal: 10,
          chunks: [],
        },
      }),
    ]
    const dependencies = {
      itemsForDay: jest.fn().mockResolvedValue(coreItems),
      getSettings: jest.fn().mockResolvedValue({
        weekStartsOn: 1,
        calorieIntake: true,
        workoutTracker: true,
        planningWindow,
      }),
      getCalendarStatus: jest.fn().mockRejectedValue(new Error('calendar down')),
      getCalendarEvents: jest.fn(),
      getCalorieEntries: jest.fn().mockRejectedValue(new Error('calories down')),
      getWeightEntry: jest.fn().mockResolvedValue(null),
      getWorkoutSessions: jest.fn().mockRejectedValue(new Error('workouts down')),
    }

    const summary = await buildDaySummary('user-1', '2026-07-27', 'UTC', {
      now: new Date('2026-07-27T10:00:00.000Z'),
      dependencies,
    })

    expect(DaySummarySchema.safeParse(summary).success).toBe(true)
    expect(summary.items).toEqual(coreItems)
    expect(summary.calendar).toEqual({
      status: 'unavailable',
      reasonCode: 'status_unavailable',
      events: [],
    })
    expect(summary.capacity).toMatchObject({
      status: 'partial',
      reasonCodes: ['calendar_unavailable'],
    })
    expect(summary.supporting.habits).toMatchObject({ total: 1, partial: 1, targeted: 1 })
    expect(summary.supporting.nutrition.status).toBe('unavailable')
    expect(summary.supporting.workouts.status).toBe('unavailable')
    expect(dependencies.itemsForDay).toHaveBeenCalledTimes(7)
  })

  it('keeps exact zero nutrition values distinct from missing macro values', async () => {
    const dependencies = dependenciesFor({
      getCalorieEntries: jest.fn().mockResolvedValue([
        {
          id: 'entry-1',
          date: '2026-07-27',
          time: '08:00',
          name: 'Zero-value entry',
          calories: 0,
          protein: 0,
          carbs: null,
          fat: 0,
          quantity: null,
          created_at: null,
          updated_at: null,
        },
        {
          id: 'entry-2',
          date: '2026-07-27',
          time: null,
          name: 'Partially tracked entry',
          calories: 0,
          protein: 0,
          carbs: 12,
          fat: null,
          quantity: null,
          created_at: null,
          updated_at: null,
        },
      ]),
    })

    const summary = await buildDaySummary('user-1', '2026-07-27', 'UTC', {
      now: new Date('2026-07-27T10:00:00.000Z'),
      dependencies,
    })

    expect(summary.supporting.nutrition).toMatchObject({
      status: 'available',
      calories: { status: 'complete', value: 0 },
      protein: { status: 'complete', value: 0 },
      carbs: { status: 'partial', value: 12 },
      fat: { status: 'partial', value: 0 },
      weight: { status: 'not_recorded', entry: null },
    })
  })

  it('keeps Calorie-entry and Weight source states independent', async () => {
    const weightRow = {
      id: 'weight-1',
      date: '2026-07-27',
      weight_kg: 72.4,
      created_at: null,
      updated_at: null,
    }
    const caloriesUnavailable = await buildDaySummary('user-1', '2026-07-27', 'UTC', {
      dependencies: dependenciesFor({
        getCalorieEntries: jest.fn().mockRejectedValue(new Error('calories down')),
        getWeightEntry: jest.fn().mockResolvedValue(weightRow),
      }),
    })
    const weightUnavailable = await buildDaySummary('user-1', '2026-07-27', 'UTC', {
      dependencies: dependenciesFor({
        getCalorieEntries: jest.fn().mockResolvedValue([]),
        getWeightEntry: jest.fn().mockRejectedValue(new Error('weight down')),
      }),
    })

    expect(caloriesUnavailable.supporting.nutrition).toMatchObject({
      status: 'unavailable',
      calories: { status: 'unavailable', value: null },
      weight: {
        status: 'recorded',
        entry: { date: '2026-07-27', weightKg: 72.4 },
      },
    })
    expect(weightUnavailable.supporting.nutrition).toMatchObject({
      status: 'not_logged',
      calories: { status: 'unavailable', value: null },
      weight: { status: 'unavailable', entry: null },
    })
  })

  it('omits disabled optional sources and marks unresolved module settings unavailable', async () => {
    const disabled = dependenciesFor({
      getSettings: jest.fn().mockResolvedValue({
        calorieIntake: false,
        workoutTracker: false,
      }),
    })
    const disabledSummary = await buildDaySummary('user-1', '2026-07-27', 'UTC', {
      dependencies: disabled,
    })

    expect(disabledSummary.modules).toEqual({
      habits: 'enabled',
      nutrition: 'disabled',
      workouts: 'disabled',
      achievements: 'enabled',
    })
    expect(disabledSummary.supporting.nutrition.status).toBe('disabled')
    expect(disabledSummary.supporting.workouts.status).toBe('disabled')
    expect(disabled.getCalorieEntries).not.toHaveBeenCalled()
    expect(disabled.getWeightEntry).not.toHaveBeenCalled()
    expect(disabled.getWorkoutSessions).not.toHaveBeenCalled()

    const unavailable = dependenciesFor({
      getSettings: jest.fn().mockRejectedValue(new Error('settings down')),
    })
    const unavailableSummary = await buildDaySummary('user-1', '2026-07-27', 'UTC', {
      dependencies: unavailable,
    })

    expect(unavailableSummary.modules).toEqual({
      habits: 'enabled',
      nutrition: 'unavailable',
      workouts: 'unavailable',
      achievements: 'unavailable',
    })
    expect(unavailableSummary.supporting.nutrition.status).toBe('unavailable')
    expect(unavailableSummary.supporting.workouts.status).toBe('unavailable')
    expect(unavailable.getCalorieEntries).not.toHaveBeenCalled()
    expect(unavailable.getWeightEntry).not.toHaveBeenCalled()
    expect(unavailable.getWorkoutSessions).not.toHaveBeenCalled()
  })

  it('summarizes mixed Habit outcomes and logged versus unlogged Workout sessions', async () => {
    const habits = [
      ['pending', 0],
      ['partial', 4],
      ['completed', 10],
      ['failed', 2],
    ].map(([outcome, progressTotal], index) => item({
      id: `habit-${index}`,
      title: `Habit ${index}`,
      type: 'habit',
      repeat: 'daily',
      isHabitInstance: true,
      originalHabitId: `habit-parent-${index}`,
      completed: outcome === 'completed',
      habitInfo: {
        target: index === 0 ? null : { value: 10, unit: 'count' },
        outcome: outcome as 'pending' | 'partial' | 'completed' | 'failed',
        progressTotal: progressTotal as number,
        chunks: [],
      },
    }))
    const session = {
      id: 'session-1',
      userId: 'user-1',
      date: '2026-07-27',
      title: 'Strength',
      notes: null,
      exercises: [],
      createdAt: '2026-07-27T18:00:00.000Z',
      updatedAt: '2026-07-27T18:00:00.000Z',
    }
    const logged = await buildDaySummary('user-1', '2026-07-27', 'UTC', {
      dependencies: dependenciesFor({
        itemsForDay: jest.fn().mockResolvedValue(habits),
        getWorkoutSessions: jest.fn().mockResolvedValue([session]),
      }),
    })
    const unlogged = await buildDaySummary('user-1', '2026-07-27', 'UTC', {
      dependencies: dependenciesFor({
        itemsForDay: jest.fn().mockResolvedValue(habits),
        getWorkoutSessions: jest.fn().mockResolvedValue([]),
      }),
    })

    expect(logged.supporting.habits).toEqual({
      status: 'available',
      total: 4,
      pending: 1,
      partial: 1,
      completed: 1,
      failed: 1,
      targeted: 3,
    })
    expect(logged.supporting.workouts).toMatchObject({
      status: 'logged',
      sessions: [{ id: 'session-1', title: 'Strength' }],
    })
    expect(unlogged.supporting.workouts).toEqual({
      status: 'not_logged',
      sessions: [],
    })
  })

  it('fails the composition when the core Item plan is unavailable', async () => {
    await expect(buildDaySummary('user-1', '2026-07-27', 'UTC', {
      dependencies: {
        itemsForDay: jest.fn().mockRejectedValue(new Error('items down')),
        getSettings: jest.fn().mockResolvedValue({}),
      },
    })).rejects.toThrow('items down')
  })
})
