jest.mock('../../src/supabase-client', () => ({
  db: {
    getAiIdempotency: jest.fn(),
    createAiIdempotency: jest.fn(),
    createAiAuditLog: jest.fn(),
    getAiPendingAction: jest.fn(),
    markAiPendingActionExecuted: jest.fn(),
    cancelAiPendingAction: jest.fn(),
    getNextPosition: jest.fn().mockResolvedValue(7),
    getProjectById: jest.fn(),
    getTaskById: jest.fn(),
    updateTask: jest.fn(),
    createTask: jest.fn(async (row) => ({
      ...row,
      completed: false,
      created_at: '2026-07-02T10:00:00.000Z',
    })),
    createCalorieEntry: jest.fn(async (row) => ({
      ...row,
      created_at: '2026-07-02T10:00:00.000Z',
      updated_at: '2026-07-02T10:00:00.000Z',
    })),
    deleteCalorieEntry: jest.fn(),
    createWeightEntry: jest.fn(async (row) => ({
      ...row,
      created_at: '2026-07-02T10:00:00.000Z',
      updated_at: '2026-07-02T10:00:00.000Z',
    })),
  },
}))

jest.mock('../../src/rollover', () => ({
  Rollover: { addCarryForwardRows: jest.fn() },
}))

import {
  AiCapabilities,
  aiCapabilityTools,
  cancelPendingAiAction,
  executeAiCapability,
  executePendingAiAction,
  PendingAiActionUnavailableError,
} from '../../src/ai-capabilities'
import { db } from '../../src/supabase-client'
import * as DaySummary from '../../src/day-summary'
import { HabitProgress } from '../../src/habit-progress'
import { Work } from '../../src/work'
import { Workouts } from '../../src/workouts'

describe('AI write capabilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(db.getNextPosition as jest.Mock).mockResolvedValue(7)
    ;(db.deleteCalorieEntry as jest.Mock).mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('executes Calendar proposals deterministically under the server-owned identity', async () => {
    jest.spyOn(DaySummary, 'validateDailyPlacement').mockResolvedValueOnce({
      date: '2026-08-03',
      status: 'valid',
      requestedMinutes: 105,
      availableMinutes: 480,
      reasons: [],
      preview: { startTime: '09:00', durationMinutes: 90, transitionMinutes: 15 },
    })

    const result = await executeAiCapability(
      { userId: 'user-1', caller: 'internal' },
      'validate_daily_plan',
      {
        date: '2026-08-03',
        timeZone: 'Asia/Jerusalem',
        startTime: '09:00',
        durationMinutes: 90,
        transitionMinutes: 15,
      },
    )

    expect(DaySummary.validateDailyPlacement).toHaveBeenCalledWith('user-1', {
      date: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      startTime: '09:00',
      durationMinutes: 90,
      transitionMinutes: 15,
    })
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ status: 'valid', requestedMinutes: 105, availableMinutes: 480 }),
    })
  })

  it('delegates a confirmed Focus block write to Work and records idempotency and audit', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce(null)
    const focusBlock = {
      id: 'ae7b3ba8-01b7-46c2-ab84-4857946f2aa0',
      projectId: null,
      taskIds: [],
      standaloneTitle: 'Registry contract',
      standaloneContext: null,
      scheduledDate: '2026-08-03',
      startTime: '09:00',
      plannedMinutes: 90,
      intendedOutcome: 'Complete the registry',
      intendedEvidence: 'Green contract tests',
      transitionMinutes: null,
      breakMinutes: null,
      status: 'planned' as const,
      reviewTrigger: null,
      startedAt: null,
      endedAt: null,
      createdAt: '2026-08-03T06:00:00.000Z',
      updatedAt: '2026-08-03T06:00:00.000Z',
    }
    jest.spyOn(Work, 'createFocusBlock').mockResolvedValueOnce(focusBlock)

    const result = await executeAiCapability(
      { userId: 'user-1', caller: 'mcp' },
      'create_focus_block',
      {
        projectId: null,
        taskIds: [],
        standaloneTitle: 'Registry contract',
        scheduledDate: '2026-08-03',
        startTime: '09:00',
        plannedMinutes: 90,
        intendedOutcome: 'Complete the registry',
        intendedEvidence: 'Green contract tests',
        requestId: 'focus-create-1',
      },
    )

    expect(Work.createFocusBlock).toHaveBeenCalledWith(
      'user-1',
      expect.not.objectContaining({ requestId: expect.anything() }),
      { requestId: 'focus-create-1' },
    )
    expect(result).toEqual({ ok: true, value: { focusBlock } })
    expect(db.createAiIdempotency).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1', request_id: 'focus-create-1', tool: 'create_focus_block',
    }))
    expect(db.createAiAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1', caller: 'mcp', tool: 'create_focus_block',
    }))
  })

  it('adds a confirmed Task to its Project with the target relationship intact', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce(null)
    const projectId = '40000000-0000-4000-8000-000000000004'
    const task = {
      id: '50000000-0000-4000-8000-000000000005',
      title: 'Define the App Store submission checklist',
      status: 'open' as const,
      relation: 'Direct progress' as const,
      scheduledDate: null,
      duration: 30,
    }
    ;(db.getProjectById as jest.Mock).mockResolvedValueOnce({
      id: projectId,
      user_id: 'user-1',
    })
    ;(db.createTask as jest.Mock).mockResolvedValueOnce({
      id: task.id,
      user_id: 'user-1',
      title: task.title,
      type: 'task',
      category: 'work',
      project_id: projectId,
      target_relation: task.relation,
      duration: task.duration,
      scheduled_date: null,
      completed: false,
      deferred_at: null,
    })

    const result = await executeAiCapability(
      { userId: 'user-1', caller: 'internal' },
      'add_work_task',
      {
        projectId,
        title: task.title,
        relation: task.relation,
        duration: task.duration,
        scheduledDate: null,
        requestId: 'work-task-create-1',
      },
    )

    expect(db.createTask).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      project_id: projectId,
      title: task.title,
      target_relation: task.relation,
      duration: task.duration,
      scheduled_date: null,
    }))
    expect(result).toEqual({ ok: true, value: { task } })
    expect(db.createAiIdempotency).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1', request_id: 'work-task-create-1', tool: 'add_work_task',
    }))
    expect(db.createAiAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1', tool: 'add_work_task', target_ids: [task.id],
    }))
  })

  it('delegates a confirmed Habit outcome to Habit Progress ownership rules', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce(null)
    const detail = {
      habit: {
        id: 'habit-instance-1',
        title: 'Walk',
        type: 'habit' as const,
        category: 'health',
        startTime: null,
        duration: 20,
        repeat: 'daily' as const,
        completed: true,
        scheduledDate: '2026-08-03',
        createdAt: '2026-08-01T06:00:00.000Z',
        originalHabitId: 'habit-1',
        isHabitInstance: true as const,
        position: null,
        habitInfo: { target: null, outcome: 'completed' as const, progressTotal: 0 },
      },
      entries: [],
    }
    jest.spyOn(HabitProgress, 'setOutcome').mockResolvedValueOnce(detail)

    const result = await executeAiCapability(
      { userId: 'user-1', caller: 'internal' },
      'record_habit_outcome',
      { itemId: 'habit-1_2026-08-03', date: '2026-08-03', outcome: 'completed', requestId: 'habit-outcome-1' },
    )

    expect(HabitProgress.setOutcome).toHaveBeenCalledWith(
      'user-1',
      'habit-1_2026-08-03',
      { date: '2026-08-03', outcome: 'completed' },
    )
    expect(result).toEqual({ ok: true, value: { detail } })
    expect(db.createAiAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1', tool: 'record_habit_outcome', target_ids: ['habit-instance-1'],
    }))
  })

  it('dedupes add-type writes by requestId', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce({
      result: { entry: { id: 'existing-entry' } },
    })

    const result = await AiCapabilities.add_calorie_entry.execute(
      { userId: 'user-1' },
      { requestId: 'req-1', name: 'Lunch', calories: 300 }
    )

    expect(result).toEqual({ entry: { id: 'existing-entry' }, duplicated: true })
    expect(db.createCalorieEntry).not.toHaveBeenCalled()
  })

  it('creates one user-owned reusable Workout plan and reuses its idempotent result', async () => {
    const plan = {
      id: '30000000-0000-4000-8000-000000000003',
      userId: 'user-1',
      name: 'Full body strength',
      color: '#22d3ee',
      note: 'Three balanced sessions each week.',
      position: 0,
      exercises: [{
        id: '31000000-0000-4000-8000-000000000003',
        planId: '30000000-0000-4000-8000-000000000003',
        name: 'Goblet squat',
        sets: 3,
        reps: 8,
        weightKg: 20,
        durationMinutes: null,
        distanceKm: null,
        notes: 'Controlled tempo',
        position: 0,
      }],
      createdAt: '2026-08-28T10:00:00.000Z',
      updatedAt: '2026-08-28T10:00:00.000Z',
    }
    const input = {
      requestId: 'workout-plan-strength-1',
      name: plan.name,
      color: plan.color,
      note: plan.note,
      exercises: plan.exercises.map(({ id: _id, planId: _planId, ...exercise }) => exercise),
    }
    ;(db.getAiIdempotency as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ result: { plan } })
    const createPlan = jest.spyOn(Workouts, 'createPlan').mockResolvedValueOnce(plan)

    await expect(executeAiCapability(
      { userId: 'user-1', caller: 'internal' },
      'add_workout_plan',
      input,
    )).resolves.toEqual({ ok: true, value: { plan } })
    await expect(executeAiCapability(
      { userId: 'user-1', caller: 'internal' },
      'add_workout_plan',
      input,
    )).resolves.toEqual({ ok: true, value: { plan, duplicated: true } })

    expect(createPlan).toHaveBeenCalledTimes(1)
    expect(createPlan).toHaveBeenCalledWith('user-1', expect.not.objectContaining({ requestId: expect.anything() }))
    expect(db.createAiAuditLog).toHaveBeenCalledTimes(1)
    expect(db.createAiAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      tool: 'add_workout_plan',
      request_id: input.requestId,
      target_ids: [plan.id],
    }))
  })

  it('surfaces a reusable Workout plan write failure without auditing or caching a result', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce(null)
    jest.spyOn(Workouts, 'createPlan').mockRejectedValueOnce(new Error('Workout plan store unavailable'))

    await expect(executeAiCapability(
      { userId: 'user-1', caller: 'internal' },
      'add_workout_plan',
      {
        requestId: 'workout-plan-failure-1',
        name: 'Unavailable plan',
        exercises: [{ name: 'Squat' }],
      },
    )).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'execution_failed',
        message: 'Workout plan store unavailable',
        retryable: true,
      }),
    })
    expect(db.createAiAuditLog).not.toHaveBeenCalled()
    expect(db.createAiIdempotency).not.toHaveBeenCalled()
  })

  it('does not create a reusable Workout plan after its proposal is canceled or expires', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    ;(db.cancelAiPendingAction as jest.Mock).mockResolvedValueOnce({
      id: 'action-canceled',
      user_id: 'user-1',
      capability: 'add_workout_plan',
      args: { requestId: 'plan-canceled', name: 'Canceled plan', exercises: [{ name: 'Squat' }] },
      preview: {},
      expires_at: expiresAt,
      canceled_at: new Date().toISOString(),
    })
    const createPlan = jest.spyOn(Workouts, 'createPlan')

    await expect(cancelPendingAiAction('user-1', 'action-canceled')).resolves.toEqual(expect.objectContaining({
      id: 'action-canceled',
      capability: 'add_workout_plan',
    }))

    ;(db.getAiPendingAction as jest.Mock).mockResolvedValueOnce({
      id: 'action-expired-plan',
      user_id: 'user-1',
      capability: 'add_workout_plan',
      args: { requestId: 'plan-expired', name: 'Expired plan', exercises: [{ name: 'Squat' }] },
      preview: {},
      caller: 'internal',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      executed_at: null,
      canceled_at: null,
    })
    await expect(executePendingAiAction('user-1', 'action-expired-plan'))
      .rejects.toBeInstanceOf(PendingAiActionUnavailableError)
    expect(createPlan).not.toHaveBeenCalled()
  })

  it('audits successful MCP writes with caller type', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce(null)
    const tool = aiCapabilityTools({ mode: 'mcp', scopes: ['hf:write:add'], caller: 'mcp' })
      .find((candidate) => candidate.name === 'add_calorie_entry')
    expect(tool).toBeDefined()

    await tool?.execute(
      { userId: 'user-1', caller: 'mcp' },
      { requestId: 'req-2', date: '2026-07-02', name: 'Lunch', calories: 300 }
    )

    expect(db.createAiAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      caller: 'mcp',
      tool: 'add_calorie_entry',
    }))
    expect(db.createAiIdempotency).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      request_id: 'req-2',
      tool: 'add_calorie_entry',
    }))
  })

  it('does not reveal or mutate an Item owned by another user', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce(null)
    ;(db.getTaskById as jest.Mock).mockResolvedValueOnce({
      id: '16ae2cbb-69cc-43e3-aabb-3f6ab553f6d0',
      user_id: 'user-2',
      type: 'task',
    })

    const result = await executeAiCapability(
      { userId: 'user-1', caller: 'mcp' },
      'place_item',
      {
        itemId: '16ae2cbb-69cc-43e3-aabb-3f6ab553f6d0',
        scheduledDate: '2026-08-04',
        startTime: '09:00',
        requestId: 'foreign-item-attempt',
      },
    )

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'not_found', retryable: false }),
    })
    expect(db.updateTask).not.toHaveBeenCalled()
    expect(db.createAiAuditLog).not.toHaveBeenCalled()
  })

  it('adds untimed Tasks at the next Anytime backlog position', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce(null)
    ;(db.getNextPosition as jest.Mock).mockResolvedValueOnce(4)

    const result = await AiCapabilities.add_task.execute(
      { userId: 'user-1' },
      { requestId: 'task-1', title: 'Buy milk', category: 'personal', duration: 10, scheduledDate: '2026-07-02' }
    )

    expect(db.getNextPosition).toHaveBeenCalledWith('user-1', '2026-07-02')
    expect(db.createTask).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      title: 'Buy milk',
      position: 4,
    }))
    expect(result.item).toEqual(expect.objectContaining({
      title: 'Buy milk',
      position: 4,
    }))
  })

  it('creates multiple calorie entries as one confirmed meal group', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce(null)

    const result = await AiCapabilities.add_calorie_entries.execute(
      { userId: 'user-1', caller: 'internal' } as any,
      {
        requestId: 'req-group-1',
        entries: [
          { date: '2026-07-02', time: '20:30', name: 'בסיס שקשוקה', calories: 150, protein: 4 },
          { date: '2026-07-02', time: '20:30', name: 'ביצים', calories: 210, protein: 18 },
        ],
      }
    )

    expect(result.entries).toHaveLength(2)
    expect(db.createCalorieEntry).toHaveBeenCalledTimes(2)
    expect(db.createCalorieEntry).toHaveBeenNthCalledWith(1, expect.objectContaining({
      user_id: 'user-1',
      date: '2026-07-02',
      time: '20:30',
      name: 'בסיס שקשוקה',
      calories: 150,
    }))
    expect(db.createCalorieEntry).toHaveBeenNthCalledWith(2, expect.objectContaining({
      user_id: 'user-1',
      date: '2026-07-02',
      time: '20:30',
      name: 'ביצים',
      calories: 210,
    }))
    expect(db.createAiAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      tool: 'add_calorie_entries',
      target_ids: expect.any(Array),
    }))
  })

  it('rolls back inserted calorie entries when a later entry fails', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce(null)
    ;(db.createCalorieEntry as jest.Mock)
      .mockResolvedValueOnce({
        id: 'entry-created',
        user_id: 'user-1',
        date: '2026-07-02',
        time: null,
        name: 'First',
        calories: 100,
        created_at: '2026-07-02T10:00:00.000Z',
      })
      .mockRejectedValueOnce(new Error('insert failed'))

    await expect(AiCapabilities.add_calorie_entries.execute(
      { userId: 'user-1', caller: 'internal' },
      {
        requestId: 'req-group-fail',
        entries: [
          { date: '2026-07-02', name: 'First', calories: 100 },
          { date: '2026-07-02', name: 'Second', calories: 200 },
        ],
      }
    )).rejects.toThrow('insert failed')

    expect(db.deleteCalorieEntry).toHaveBeenCalledWith('entry-created')
    expect(db.createAiIdempotency).not.toHaveBeenCalled()
    expect(db.createAiAuditLog).not.toHaveBeenCalled()
  })

  it('returns client fields that match REST mappers for AI-created rows', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValue(null)
    ;(db.createTask as jest.Mock).mockResolvedValueOnce({
      id: 'task-1',
      user_id: 'user-1',
      title: 'Visit clinic',
      type: 'task',
      category: 'health',
      completed: false,
      scheduled_date: '2026-07-02',
      start_time: null,
      location: 'Clinic',
      duration: 30,
      repeat_type: 'none',
      position: 7,
      original_habit_id: null,
      rolled_over_from_task_id: 'old-task',
      original_created_at: '2026-07-01T10:00:00.000Z',
      google_event_id: 'google-1',
      synced_to_google: true,
      created_at: '2026-07-02T10:00:00.000Z',
    })
    ;(db.createWeightEntry as jest.Mock).mockResolvedValueOnce({
      id: 'weight-1',
      user_id: 'user-1',
      date: '2026-07-02',
      weight_kg: 82,
      created_at: '2026-07-02T10:00:00.000Z',
      updated_at: '2026-07-02T10:05:00.000Z',
    })

    const task = await AiCapabilities.add_task.execute(
      { userId: 'user-1' },
      { requestId: 'mapper-task', title: 'Visit clinic', category: 'health', duration: 30, scheduledDate: '2026-07-02' }
    )
    const calorie = await AiCapabilities.add_calorie_entry.execute(
      { userId: 'user-1' },
      { requestId: 'mapper-calorie', date: '2026-07-02', name: 'Lunch', calories: 300 }
    )
    const weight = await AiCapabilities.add_weight_entry.execute(
      { userId: 'user-1' },
      { requestId: 'mapper-weight', date: '2026-07-02', weightKg: 82 }
    )

    expect(task.item).toEqual(expect.objectContaining({
      location: 'Clinic',
      rolledOverFromTaskId: 'old-task',
      originalCreatedAt: '2026-07-01T10:00:00.000Z',
      googleEventId: 'google-1',
      syncedToGoogle: true,
    }))
    expect(calorie.entry).toEqual(expect.objectContaining({
      updatedAt: '2026-07-02T10:00:00.000Z',
    }))
    expect(weight.entry).toEqual(expect.objectContaining({
      updatedAt: '2026-07-02T10:05:00.000Z',
    }))
  })

  it('executes edited pending action args on confirm', async () => {
    ;(db.getAiPendingAction as jest.Mock).mockResolvedValueOnce({
      id: 'action-1',
      user_id: 'user-1',
      capability: 'add_calorie_entry',
      args: {
        requestId: 'req-3',
        date: '2026-07-02',
        name: 'Lunch',
        calories: 300,
      },
      preview: {},
      caller: 'internal',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      executed_at: null,
      canceled_at: null,
    })
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce(null)

    await executePendingAiAction('user-1', 'action-1', {
      name: 'Protein yogurt',
      calories: 100,
      protein: 20,
    })

    expect(db.createCalorieEntry).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      name: 'Protein yogurt',
      calories: 100,
      protein: 20,
    }))
    expect(db.markAiPendingActionExecuted).toHaveBeenCalledWith('action-1')
  })

  it('returns a typed recoverable error when a pending action expires', async () => {
    ;(db.getAiPendingAction as jest.Mock).mockResolvedValueOnce({
      id: 'action-expired',
      user_id: 'user-1',
      capability: 'add_calorie_entry',
      args: {
        requestId: 'req-expired',
        date: '2026-07-02',
        name: 'Lunch',
        calories: 300,
      },
      preview: {},
      caller: 'internal',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      executed_at: null,
      canceled_at: null,
    })

    await expect(executePendingAiAction('user-1', 'action-expired'))
      .rejects.toBeInstanceOf(PendingAiActionUnavailableError)
    expect(db.createCalorieEntry).not.toHaveBeenCalled()
    expect(db.markAiPendingActionExecuted).not.toHaveBeenCalled()
  })
})
