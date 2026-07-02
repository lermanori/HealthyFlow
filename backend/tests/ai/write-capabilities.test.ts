jest.mock('../../src/supabase-client', () => ({
  db: {
    getAiIdempotency: jest.fn(),
    createAiIdempotency: jest.fn(),
    createAiAuditLog: jest.fn(),
    getAiPendingAction: jest.fn(),
    markAiPendingActionExecuted: jest.fn(),
    createCalorieEntry: jest.fn(async (row) => ({
      ...row,
      created_at: '2026-07-02T10:00:00.000Z',
    })),
  },
}))

jest.mock('../../src/rollover', () => ({
  Rollover: { addCarryForwardRows: jest.fn() },
}))

import { AiCapabilities, executePendingAiAction } from '../../src/ai-capabilities'
import { db } from '../../src/supabase-client'

describe('AI write capabilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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

  it('audits successful writes with caller type', async () => {
    ;(db.getAiIdempotency as jest.Mock).mockResolvedValueOnce(null)

    await AiCapabilities.add_calorie_entry.execute(
      { userId: 'user-1', caller: 'mcp' } as any,
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
