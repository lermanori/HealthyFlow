// The global ceiling and the per-account cap are both "per UTC day"
// (ADR-0023, docs/runbooks/cost-guards.md), and the ceiling's total is one
// aggregate in the database, so it cannot stop counting at a row limit (#296).

jest.mock('../../src/supabase-client', () => ({
  db: {
    sumAiCostUsdSince: jest.fn(),
    recordAiRefusal: jest.fn().mockResolvedValue(undefined),
    countUserActionsSince: jest.fn(),
  },
}))

import { db } from '../../src/supabase-client'
import { Credits } from '../../src/credits'

const mockDb = db as jest.Mocked<typeof db>
const input = { endpoint: 'parse-tasks', model: 'gpt-4o-mini', userPrompt: 'plan my day' }

describe('daily cost guards count the UTC day', () => {
  const originalTz = process.env.TZ
  beforeEach(() => {
    jest.clearAllMocks()
    // 01:30 on the 19th in Jerusalem is still the 18th in UTC.
    process.env.TZ = 'Asia/Jerusalem'
    jest.useFakeTimers({ now: new Date('2026-09-18T22:30:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] })
  })
  afterEach(() => {
    jest.useRealTimers()
    process.env.TZ = originalTz
  })

  it('the global ceiling sums from UTC midnight whatever the server timezone', async () => {
    mockDb.sumAiCostUsdSince.mockResolvedValue(Credits.GLOBAL_DAILY_COST_CEILING_USD)

    const decision = await Credits.authorizeAction('user-1', input)

    expect(decision).toEqual({ ok: false, code: 'global_ceiling' })
    expect(mockDb.sumAiCostUsdSince).toHaveBeenCalledWith('2026-09-18T00:00:00.000Z')
  })

  it('the per-account cap counts from UTC midnight too', async () => {
    mockDb.sumAiCostUsdSince.mockResolvedValue(0)
    mockDb.countUserActionsSince.mockResolvedValue(Credits.FREE_DAILY_ACTION_CAP)

    const decision = await Credits.authorizeAction('user-1', input)

    expect(decision).toEqual({ ok: false, code: 'account_daily_cap' })
    expect(mockDb.countUserActionsSince).toHaveBeenCalledWith('user-1', '2026-09-18T00:00:00.000Z')
  })
})
