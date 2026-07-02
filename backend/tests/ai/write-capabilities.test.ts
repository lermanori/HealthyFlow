jest.mock('../../src/supabase-client', () => ({
  db: {
    getAiIdempotency: jest.fn(),
    createAiIdempotency: jest.fn(),
    createAiAuditLog: jest.fn(),
    getAiPendingAction: jest.fn(),
    markAiPendingActionExecuted: jest.fn(),
    getNextPosition: jest.fn().mockResolvedValue(7),
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

import { AiCapabilities, aiCapabilityTools, executePendingAiAction } from '../../src/ai-capabilities'
import { db } from '../../src/supabase-client'

describe('AI write capabilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(db.getNextPosition as jest.Mock).mockResolvedValue(7)
    ;(db.deleteCalorieEntry as jest.Mock).mockResolvedValue(undefined)
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
})
