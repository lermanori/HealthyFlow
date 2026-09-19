/**
 * A claimed Guest keeps what was left of their ten (ADR-0026).
 *
 * The verification gate withholds the *next* monthly fifteen. It must never
 * reach backwards and take credits already given — someone who used three of
 * their ten as a Guest and then created an account still has seven, verified or
 * not. This drives the real `authorizeAction` path rather than the view, because
 * that is where a bug would actually confiscate them.
 */
import { Credits, VERIFICATION_REQUIRED_FROM } from '../../src/credits'
import { db } from '../../src/supabase-client'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    getCreditBalance: jest.fn(),
    claimGuestInitialCredits: jest.fn(),
    claimMonthlyFreeCredits: jest.fn(),
    sumAiCostUsdSince: jest.fn(),
    recordAiRefusal: jest.fn().mockResolvedValue(undefined),
    countUserActionsSince: jest.fn(),
    reserveCredits: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const AFTER_CUTOFF = new Date(VERIFICATION_REQUIRED_FROM.getTime() + 86_400_000).toISOString()

/** A Guest who created an account and has not confirmed the address. */
const claimedUnverified = {
  id: 'user-1',
  email: 'claimed@example.com',
  name: 'Claimed',
  role: 'user' as const,
  signup_method: 'password' as const,
  disabled_at: null,
  email_verified_at: null,
  created_at: AFTER_CUTOFF,
}

/** An ordinary one-credit text action. */
const textAction = {
  endpoint: '/ai/chat',
  model: 'gpt-4o-mini',
  userPrompt: 'plan my day',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue(claimedUnverified as never)
  mockDb.sumAiCostUsdSince.mockResolvedValue(0 as never)
  mockDb.countUserActionsSince.mockResolvedValue(0 as never)
  mockDb.getCreditBalance.mockResolvedValue(7 as never)
})

describe('a claimed Guest with credits left over', () => {
  it('may spend them, even though the address is unproven', async () => {
    jest.spyOn(Credits, 'reserve').mockResolvedValue(true as never)

    const result = await Credits.authorizeAction('user-1', textAction)

    expect(result.ok).toBe(true)
    // The monthly refill must never have been attempted for an unverified
    // account — that is the thing being withheld.
    expect(mockDb.claimMonthlyFreeCredits).not.toHaveBeenCalled()
  })

  it('never has those credits taken to enforce the rule', async () => {
    const reserve = jest.spyOn(Credits, 'reserve').mockResolvedValue(true as never)

    await Credits.authorizeAction('user-1', textAction)

    // Reserved the action's own price and nothing more. A gate that "resets" an
    // unverified balance would show up here as a different number.
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(reserve.mock.calls[0][0]).toBe('user-1')
    expect(reserve.mock.calls[0][1]).toBeGreaterThan(0)
  })
})

describe('a claimed Guest who has spent everything', () => {
  it('is told to confirm the address, not that it ran out of credits', async () => {
    mockDb.getCreditBalance.mockResolvedValue(0 as never)
    jest.spyOn(Credits, 'reserve').mockResolvedValue(false as never)

    const result = await Credits.authorizeAction('user-1', textAction)

    expect(result).toEqual({ ok: false, code: 'email_unverified' })
  })

  it('is told it ran out once the address is confirmed', async () => {
    // Same empty balance, proven address: now "insufficient credits" is the
    // truth, and pointing at verification would be the misleading answer.
    mockDb.getUserById.mockResolvedValue({
      ...claimedUnverified,
      email_verified_at: AFTER_CUTOFF,
    } as never)
    mockDb.claimMonthlyFreeCredits.mockResolvedValue({ status: 'already_claimed', balance: 0 } as never)
    jest.spyOn(Credits, 'reserve').mockResolvedValue(false as never)

    const result = await Credits.authorizeAction('user-1', textAction)

    expect(result).toEqual({ ok: false, code: 'insufficient_credits' })
  })
})

describe('an account that predates the rule', () => {
  it('still draws its monthly grant without ever confirming', async () => {
    mockDb.getUserById.mockResolvedValue({
      ...claimedUnverified,
      created_at: new Date(VERIFICATION_REQUIRED_FROM.getTime() - 86_400_000).toISOString(),
    } as never)
    mockDb.claimMonthlyFreeCredits.mockResolvedValue({ status: 'granted', balance: 15 } as never)
    jest.spyOn(Credits, 'reserve').mockResolvedValue(true as never)

    const result = await Credits.authorizeAction('user-1', textAction)

    expect(result.ok).toBe(true)
    // The grandfathered path must actually reach the refill, not merely avoid
    // the refusal.
    expect(mockDb.claimMonthlyFreeCredits).toHaveBeenCalled()
  })
})
