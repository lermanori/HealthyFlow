import {
  achievementEntryToDaySummary,
  buildDaySummary,
  calorieRowToClient,
  deriveDailyPlanReferences,
  itemRowToClient,
  localClockTime,
  weightRowToClient,
} from '../src/day-summary'

describe('Daily Plan references', () => {
  it('composes source records without copying their display payloads', () => {
    const task = itemRowToClient({
      id: 'task-1', title: 'Write proposal', type: 'task', completed: false,
      start_time: '11:00', scheduled_date: '2026-08-03', created_at: '2026-08-03T06:00:00.000Z',
    })
    const habit = itemRowToClient({
      id: 'habit-1', title: 'Walk', type: 'habit', completed: false,
      habit_outcome: 'partial', scheduled_date: '2026-08-03', created_at: '2026-08-03T06:00:00.000Z',
      habitInfo: { chunks: [{ id: 'chunk-1', amount: 10, note: null, loggedTime: '10:20' }] },
    })

    const references = deriveDailyPlanReferences({
      items: [task, habit],
      calendar: {
        status: 'connected',
        reasonCode: null,
        events: [{
          id: 'event-1', provider: 'google', calendarId: 'primary', externalEventId: 'external-1',
          title: 'Client call', description: null, location: null,
          startAt: null, endAt: null, localStartTime: '09:00', localEndTime: '09:45',
          allDay: false, status: 'confirmed', htmlLink: null, completed: false, completedAt: null,
        }],
      },
      work: {
        status: 'scheduled',
        focusBlocks: [{
          id: '11111111-1111-4111-8111-111111111111', projectId: null, taskIds: [],
          standaloneTitle: 'Deep work', standaloneContext: null, scheduledDate: '2026-08-03',
          startTime: '10:00', plannedMinutes: 45, intendedOutcome: 'Draft ready', intendedEvidence: '',
          transitionMinutes: null, breakMinutes: null, status: 'active', reviewTrigger: null,
          startedAt: null, endedAt: null, createdAt: '', updatedAt: '', slot: '10:00',
          project: null, tasks: [],
        }],
      },
      calorieEntries: [{
        id: 'meal-1', date: '2026-08-03', time: '12:30', name: 'Lunch', calories: 560,
        protein: null, carbs: null, fat: null, quantity: null, createdAt: null, updatedAt: null,
        loggedTime: '12:30',
      }],
      weightEntry: null,
      workoutSessions: [],
      progressEntries: [],
      progressTargets: [{
        achievementId: 'target-1', name: 'Weight', unit: 'kg', targetValue: 75,
        latestValue: 77, targetProgress: 97,
      }],
      transitionBufferMinutes: 15,
    })

    expect(references.map(reference => reference.kind)).toEqual([
      'calendar_event',
      'calendar_transition',
      'focus_block',
      'habit_progress',
      'task',
      'calorie_entry',
      'habit',
      'progress_target',
    ])
    expect(references.find(reference => reference.kind === 'calendar_transition')).toMatchObject({
      sourceId: 'event-1',
      time: '09:45',
      endTime: '10:00',
      durationMinutes: 15,
      semantics: 'boundary',
    })
    expect(references.find(reference => reference.kind === 'progress_target')).toMatchObject({
      sourceId: 'target-1',
      time: null,
      semantics: 'plan',
    })
    expect(references.every(reference => !('title' in reference))).toBe(true)
  })

  it('keeps a selected Workout plan distinct from the actual Workout session', () => {
    const workout = itemRowToClient({
      id: 'workout-item-1', title: 'Push day', type: 'workout', category: 'fitness',
      completed: true, start_time: '17:00', workout_plan_id: 'plan-1',
      scheduled_date: '2026-08-03', created_at: '2026-08-03T06:00:00.000Z',
    })

    const references = deriveDailyPlanReferences({
      items: [workout],
      calendar: { status: 'connected_empty', reasonCode: null, events: [] },
      work: { status: 'not_scheduled', focusBlocks: [] },
      calorieEntries: [],
      weightEntry: null,
      workoutSessions: [{
        id: 'session-1', userId: 'user-1', date: '2026-08-03', title: 'Push day actual',
        notes: null, exercises: [], createdAt: '', updatedAt: '', loggedTime: '18:10',
      }],
      progressEntries: [],
      progressTargets: [],
      transitionBufferMinutes: 0,
    })

    expect(references).toContainEqual(expect.objectContaining({
      kind: 'workout_plan',
      sourceId: 'workout-item-1',
      workoutPlanId: 'plan-1',
      state: 'completed',
      semantics: 'plan',
    }))
    expect(references).toContainEqual(expect.objectContaining({
      kind: 'workout_session',
      sourceId: 'session-1',
      semantics: 'actual',
    }))
  })
})

// The timeline places dateless records and settled untimed items by *when they
// were logged*, so every one of these times has to be resolved against the
// user's timezone on the server. These tests pin that contract.

describe('localClockTime', () => {
  it('resolves an instant to wall-clock time in the given zone', () => {
    // 21:30 UTC is 23:30 in Jerusalem (UTC+2 in January).
    expect(localClockTime('2026-01-15T21:30:00.000Z', 'Asia/Jerusalem')).toBe('23:30')
    expect(localClockTime('2026-01-15T21:30:00.000Z', 'UTC')).toBe('21:30')
  })

  it('returns null rather than guessing when the zone or instant is unusable', () => {
    expect(localClockTime('2026-01-15T21:30:00.000Z', null)).toBeNull()
    expect(localClockTime('2026-01-15T21:30:00.000Z', 'Not/AZone')).toBeNull()
    expect(localClockTime(null, 'UTC')).toBeNull()
    expect(localClockTime('nonsense', 'UTC')).toBeNull()
  })
})

describe('resolvedTime', () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'task-1',
    title: 'Book dentist appointment',
    type: 'task',
    category: 'personal',
    completed: false,
    scheduled_date: '2026-07-28',
    created_at: '2026-07-28T06:00:00.000Z',
    ...overrides,
  })

  it('stamps a completed item from completed_at', () => {
    const item = itemRowToClient(
      row({ completed: true, completed_at: '2026-07-28T09:48:00.000Z' }),
      0,
      { timeZone: 'UTC' }
    )
    expect(item.resolvedTime).toBe('09:48')
  })

  it('falls back to updated_at for a Habit marked Not done, which has no completed_at', () => {
    const item = itemRowToClient(
      row({
        id: 'habit-1',
        type: 'habit',
        repeat_type: 'daily',
        habit_outcome: 'failed',
        completed_at: null,
        updated_at: '2026-07-28T14:05:00.000Z',
      }),
      0,
      { timeZone: 'UTC' }
    )
    expect(item.resolvedTime).toBe('14:05')
    expect(item.completed).toBe(false)
  })

  it('leaves a partial Habit unresolved so it stays in the Anytime backlog', () => {
    const item = itemRowToClient(
      row({
        id: 'habit-2',
        type: 'habit',
        repeat_type: 'daily',
        habit_outcome: 'partial',
        updated_at: '2026-07-28T09:56:00.000Z',
      }),
      1,
      { timeZone: 'UTC' }
    )
    expect(item.resolvedTime).toBeNull()
    expect(item.habitInfo?.outcome).toBe('partial')
  })

  it('leaves an untouched item unresolved', () => {
    expect(itemRowToClient(row(), 0, { timeZone: 'UTC' }).resolvedTime).toBeNull()
  })

  it('resolves against the user timezone, not the server one', () => {
    const item = itemRowToClient(
      row({ completed: true, completed_at: '2026-07-28T21:30:00.000Z' }),
      0,
      { timeZone: 'Asia/Jerusalem' }
    )
    expect(item.resolvedTime).toBe('00:30')
  })
})

describe('Task Project context', () => {
  it('carries the linked Project metadata needed by the Today badge', () => {
    const item = itemRowToClient({
      id: 'task-1',
      title: 'Test phase 5',
      type: 'task',
      category: 'work',
      completed: true,
      scheduled_date: '2026-08-04',
      created_at: '2026-08-04T06:00:00.000Z',
      project_id: '11111111-1111-4111-8111-111111111111',
      project: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'HealthyFlow',
        color: '#0891b2',
      },
    })

    expect(item.projectId).toBe('11111111-1111-4111-8111-111111111111')
    expect(item.project).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'HealthyFlow',
      color: '#0891b2',
    })
  })
})

describe('habit progress chunks', () => {
  it('carries each chunk with its own logged time, oldest first', () => {
    const item = itemRowToClient(
      {
        id: 'habit-3',
        title: 'לקחת 3 כדורים',
        type: 'habit',
        repeat_type: 'daily',
        habit_outcome: 'partial',
        habit_target_value: 3,
        habit_target_unit: 'count',
        completed: false,
        scheduled_date: '2026-07-28',
        created_at: '2026-07-28T06:00:00.000Z',
      },
      2,
      {
        timeZone: 'UTC',
        chunkRows: [
          { id: 'c1', amount: 1, note: null, created_at: '2026-07-28T09:59:00.000Z' },
          { id: 'c2', amount: 1, note: 'after lunch', created_at: '2026-07-28T13:10:00.000Z' },
        ],
      }
    )

    expect(item.habitInfo?.chunks).toEqual([
      { id: 'c1', amount: 1, note: null, loggedTime: '09:59' },
      { id: 'c2', amount: 1, note: 'after lunch', loggedTime: '13:10' },
    ])
  })

  it('gives a Habit with no recorded progress an empty chunk list', () => {
    const item = itemRowToClient(
      { id: 'h', title: 'Stretch', type: 'habit', repeat_type: 'daily', completed: false, scheduled_date: '2026-07-28', created_at: '2026-07-28T06:00:00.000Z' },
      0,
      { timeZone: 'UTC' }
    )
    expect(item.habitInfo?.chunks).toEqual([])
  })
})

describe('loggedTime on dateless records', () => {
  it('prefers a Calorie entry’s explicit time over when it was logged', () => {
    const entry = calorieRowToClient(
      { id: 'c1', date: '2026-07-28', time: '08:15', name: 'Oats', calories: 410, created_at: '2026-07-28T20:00:00.000Z' },
      'UTC'
    )
    expect(entry.loggedTime).toBe('08:15')
  })

  it('places an untimed Calorie entry by when it was logged instead of dropping it', () => {
    const entry = calorieRowToClient(
      { id: 'c2', date: '2026-07-28', time: null, name: 'Snack', calories: 120, created_at: '2026-07-28T10:04:00.000Z' },
      'UTC'
    )
    expect(entry.loggedTime).toBe('10:04')
  })

  it('places a Weight entry by when it was logged', () => {
    const entry = weightRowToClient(
      { id: 'w1', date: '2026-07-28', weight_kg: 78.4, created_at: '2026-07-28T07:05:00.000Z' },
      'UTC'
    )
    expect(entry.loggedTime).toBe('07:05')
  })

  it('flattens an Achievement entry with the bits needed to render it', () => {
    const entry = achievementEntryToDaySummary(
      { id: 'a1', achievementId: 'def-1', value: 92.5, supportingValue: null, supportingUnit: null, notes: null, createdAt: '2026-07-28T18:30:00.000Z' },
      { name: 'Bench press 1RM', unit: 'kg' },
      'UTC'
    )
    expect(entry).toMatchObject({
      achievementId: 'def-1',
      name: 'Bench press 1RM',
      unit: 'kg',
      value: 92.5,
      loggedTime: '18:30',
    })
  })
})

describe('supporting.progress', () => {
  const dependenciesFor = (overrides: Record<string, jest.Mock> = {}) => ({
    itemsForDay: jest.fn().mockResolvedValue([]),
    getSettings: jest.fn().mockResolvedValue({ weekStartsOn: 1 }),
    getCalendarStatus: jest.fn().mockResolvedValue({ connected: false }),
    getCalendarEvents: jest.fn().mockResolvedValue([]),
    getCalorieEntries: jest.fn().mockResolvedValue([]),
    getWeightEntry: jest.fn().mockResolvedValue(null),
    getWorkoutSessions: jest.fn().mockResolvedValue([]),
    getAchievements: jest.fn().mockResolvedValue([]),
    // All nine sources, always. `buildDaySummary` merges a partial override onto
    // the Supabase-backed defaults, so a source left out here does not fall back
    // to nothing — it reaches the real database and hangs the test.
    listDayFocusBlocks: jest.fn().mockResolvedValue([]),
    ...overrides,
  })

  const summaryWith = (overrides: Record<string, jest.Mock> = {}) =>
    buildDaySummary('user-1', '2026-07-28', 'UTC', {
      now: new Date('2026-07-28T10:00:00.000Z'),
      dependencies: dependenciesFor(overrides) as never,
    })

  const achievement = {
    definition: { id: 'def-1', name: 'Bench press 1RM', unit: 'kg' },
    entries: [
      { id: 'a1', achievementId: 'def-1', date: '2026-07-28', value: 92.5, supportingValue: null, supportingUnit: null, notes: null, createdAt: '2026-07-28T18:30:00.000Z' },
      { id: 'a0', achievementId: 'def-1', date: '2026-07-21', value: 90, supportingValue: null, supportingUnit: null, notes: null, createdAt: '2026-07-21T18:00:00.000Z' },
    ],
  }

  it('returns only the entries recorded on this date', async () => {
    const summary = await summaryWith({
      getAchievements: jest.fn().mockResolvedValue([achievement]),
    })

    expect(summary.modules.achievements).toBe('enabled')
    expect(summary.supporting.progress.status).toBe('recorded')
    expect(summary.supporting.progress.entries).toHaveLength(1)
    expect(summary.supporting.progress.entries[0]).toMatchObject({ id: 'a1', loggedTime: '18:30' })
  })

  it('reports not_recorded when nothing was measured today', async () => {
    const summary = await summaryWith({
      getAchievements: jest.fn().mockResolvedValue([
        { ...achievement, entries: [achievement.entries[1]] },
      ]),
    })
    expect(summary.supporting.progress).toEqual({ status: 'not_recorded', entries: [], targets: [] })
  })

  it('carries target context without pretending a measurement happened today', async () => {
    const summary = await summaryWith({
      getAchievements: jest.fn().mockResolvedValue([{
        ...achievement,
        definition: { ...achievement.definition, targetValue: 100 },
        latest: achievement.entries[1],
        targetProgress: 90,
        entries: [achievement.entries[1]],
      }]),
    })

    expect(summary.supporting.progress).toMatchObject({
      status: 'not_recorded',
      entries: [],
      targets: [{
        achievementId: 'def-1',
        name: 'Bench press 1RM',
        unit: 'kg',
        targetValue: 100,
        latestValue: 90,
        targetProgress: 90,
      }],
    })
    expect(summary.dailyPlan.references).toContainEqual(expect.objectContaining({
      kind: 'progress_target',
      sourceId: 'def-1',
      semantics: 'plan',
    }))
  })

  it('hides Progress entirely when the module is switched off', async () => {
    const summary = await summaryWith({
      getSettings: jest.fn().mockResolvedValue({ weekStartsOn: 1, achievementTracker: false }),
      getAchievements: jest.fn().mockResolvedValue([achievement]),
    })

    expect(summary.modules.achievements).toBe('disabled')
    expect(summary.supporting.progress).toEqual({ status: 'disabled', entries: [], targets: [] })
    expect(summary.dailyPlan.references.some(reference => reference.module === 'progress')).toBe(false)
  })

  it('degrades to unavailable rather than failing the whole day when the source errors', async () => {
    const summary = await summaryWith({
      getAchievements: jest.fn().mockRejectedValue(new Error('boom')),
    })
    expect(summary.supporting.progress).toEqual({ status: 'unavailable', entries: [], targets: [] })
    expect(summary.dailyPlan.references.some(reference => reference.module === 'progress')).toBe(false)
  })
})

// Focus blocks are the one timeline row Today does not own: Work owns the
// record, Today only renders and executes it. These pin that the day carries
// them honestly — including when Work is unreachable.
describe('work.focusBlocks', () => {
  const dependenciesFor = (overrides: Record<string, jest.Mock> = {}) => ({
    itemsForDay: jest.fn().mockResolvedValue([]),
    getSettings: jest.fn().mockResolvedValue({ weekStartsOn: 1 }),
    getCalendarStatus: jest.fn().mockResolvedValue({ connected: false }),
    getCalendarEvents: jest.fn().mockResolvedValue([]),
    getCalorieEntries: jest.fn().mockResolvedValue([]),
    getWeightEntry: jest.fn().mockResolvedValue(null),
    getWorkoutSessions: jest.fn().mockResolvedValue([]),
    getAchievements: jest.fn().mockResolvedValue([]),
    listDayFocusBlocks: jest.fn().mockResolvedValue([]),
    ...overrides,
  })

  const summaryWith = (overrides: Record<string, jest.Mock> = {}) =>
    buildDaySummary('user-1', '2026-07-28', 'UTC', {
      now: new Date('2026-07-28T10:00:00.000Z'),
      dependencies: dependenciesFor(overrides) as never,
    })

  const block = {
    id: '44444444-4444-4444-8444-444444444444',
    projectId: '22222222-2222-4222-8222-222222222222',
    taskIds: [],
    standaloneTitle: null,
    standaloneContext: null,
    scheduledDate: '2026-07-28',
    startTime: '14:30',
    slot: '14:00',
    plannedMinutes: 45,
    intendedOutcome: 'Reminder emails send on schedule',
    intendedEvidence: 'A passing reminder smoke test',
    transitionMinutes: null,
    breakMinutes: null,
    status: 'planned' as const,
    reviewTrigger: null,
    startedAt: null,
    endedAt: null,
    createdAt: '2026-07-27T08:00:00.000Z',
    updatedAt: '2026-07-27T08:00:00.000Z',
    project: null,
    tasks: [],
  }

  it('carries the day\'s blocks with their server-resolved hour slot', async () => {
    const listDayFocusBlocks = jest.fn().mockResolvedValue([block])
    const summary = await summaryWith({ listDayFocusBlocks })

    expect(listDayFocusBlocks).toHaveBeenCalledWith('user-1', '2026-07-28')
    expect(summary.work.status).toBe('scheduled')
    expect(summary.work.focusBlocks).toHaveLength(1)
    expect(summary.work.focusBlocks[0]).toMatchObject({ startTime: '14:30', slot: '14:00' })
  })

  it('reports an empty day as not_scheduled, not unavailable', async () => {
    const summary = await summaryWith()
    expect(summary.work).toEqual({ status: 'not_scheduled', focusBlocks: [] })
  })

  it('degrades to unavailable rather than failing the whole day when Work errors', async () => {
    const summary = await summaryWith({
      listDayFocusBlocks: jest.fn().mockRejectedValue(new Error('boom')),
    })
    expect(summary.work).toEqual({ status: 'unavailable', focusBlocks: [] })
    expect(summary.dailyPlan.references.some(reference => reference.module === 'work')).toBe(false)
    // The rest of the day still resolves.
    expect(summary.version).toBe(1)
    expect(summary.completion).toBeDefined()
  })

  it('is always enabled — Work has no user-facing toggle', async () => {
    const summary = await summaryWith()
    expect(summary.modules.work).toBe('enabled')
  })
})
