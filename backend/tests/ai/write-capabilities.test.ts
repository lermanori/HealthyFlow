jest.mock('../../src/supabase-client', () => ({
  db: {
    getAiIdempotency: jest.fn(),
    createAiIdempotency: jest.fn(),
    createAiAuditLog: jest.fn(),
    createCalorieEntry: jest.fn(async (row) => ({
      ...row,
      created_at: '2026-07-02T10:00:00.000Z',
    })),
  },
}))

jest.mock('../../src/rollover', () => ({
  Rollover: { addCarryForwardRows: jest.fn() },
}))

import { AiCapabilities } from '../../src/ai-capabilities'
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
})
