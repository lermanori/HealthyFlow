/**
 * Tests for the credits deep module (issue #43, Slice A).
 *
 * Behaviors tested:
 *   reserve  → true when RPC returns a balance, false when RPC returns null (insufficient)
 *   settle   → writes a usage-log row with token counts + negative credits_delta
 *   grant    → adds credits via db helper and writes a positive-delta usage-log row
 *   getBalance → returns the db value, 0 when none
 */

import { db } from '../../src/supabase-client'

// ponytail: mock db so credits.ts logic is tested in isolation — no real Supabase calls
jest.mock('../../src/supabase-client', () => ({
  db: {
    getCreditBalance: jest.fn(),
    reserveCredits: jest.fn(),
    grantCredits: jest.fn(),
    insertUsageLog: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

import { Credits } from '../../src/credits'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('Credits.reserve', () => {
  it('returns true when the RPC returns a new balance', async () => {
    mockDb.reserveCredits.mockResolvedValue(4)

    const ok = await Credits.reserve('user-1', 1)

    expect(ok).toBe(true)
    expect(mockDb.reserveCredits).toHaveBeenCalledWith('user-1', 1)
  })

  it('returns false when the RPC returns null (insufficient balance)', async () => {
    mockDb.reserveCredits.mockResolvedValue(null)

    const ok = await Credits.reserve('user-1', 1)

    expect(ok).toBe(false)
  })
})

describe('Credits.settle', () => {
  it('logs the actual token usage with a negative credits_delta', async () => {
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    await Credits.settle(
      'user-1',
      { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      { endpoint: '/api/ai/parse-tasks', model: 'gpt-4o-mini' }
    )

    expect(mockDb.insertUsageLog).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        endpoint: '/api/ai/parse-tasks',
        model: 'gpt-4o-mini',
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        credits_delta: -Credits.CREDITS_PER_ACTION,
      })
    )
  })
})

describe('Credits.grant', () => {
  it('adds credits via the grant helper and logs a positive-delta entry', async () => {
    mockDb.grantCredits.mockResolvedValue(10)
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    await Credits.grant('user-1', 10, 'signup bonus')

    expect(mockDb.grantCredits).toHaveBeenCalledWith('user-1', 10)
    expect(mockDb.insertUsageLog).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        credits_delta: 10,
        reason: 'signup bonus',
      })
    )
  })
})

describe('Credits.getBalance', () => {
  it('returns the db value', async () => {
    mockDb.getCreditBalance.mockResolvedValue(7)

    const balance = await Credits.getBalance('user-1')

    expect(balance).toBe(7)
  })

  it('returns 0 when there is no row', async () => {
    mockDb.getCreditBalance.mockResolvedValue(0)

    const balance = await Credits.getBalance('user-1')

    expect(balance).toBe(0)
  })
})
