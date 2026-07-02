/**
 * Tests for the credits deep module (issue #43, Slice A).
 *
 * Behaviors tested:
 *   reserve  → true when RPC returns a balance, false when RPC returns null (insufficient)
 *   settle   → adjusts the reserve and writes actual token billing details
 *   grant    → adds credits via db helper and writes a positive-delta usage-log row
 *   getBalance → returns the db value, 0 when none
 */

import { db } from '../../src/supabase-client'

// ponytail: mock db so credits.ts logic is tested in isolation — no real Supabase calls
jest.mock('../../src/supabase-client', () => ({
  db: {
    getCreditBalance: jest.fn(),
    getBillingSettings: jest.fn(),
    updateBillingSettings: jest.fn(),
    getCreditSubscriptionSettings: jest.fn(),
    updateCreditSubscriptionSettings: jest.fn(),
    getCreditBuckets: jest.fn(),
    getUserCreditSubscription: jest.fn(),
    upsertUserCreditSubscription: jest.fn(),
    reserveCredits: jest.fn(),
    grantCredits: jest.fn(),
    grantSubscriptionCredits: jest.fn(),
    insertUsageLog: jest.fn(),
    setCreditBalance: jest.fn(),
    getUsersWithCreditBalances: jest.fn(),
    getUsageLogsSince: jest.fn(),
    getRecentUsageLogs: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

import {
  calculateAiTokenCharge,
  Credits,
  estimateReserveTokens,
  loadModelPricing,
  UnpricedModelError,
} from '../../src/credits'

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getBillingSettings.mockResolvedValue({
    app_tokens_per_usd: 1000,
    markup_rate: 0.25,
    min_markup_tokens: 5,
    updated_at: null,
  })
  mockDb.getCreditSubscriptionSettings.mockResolvedValue({
    promo_active: true,
    updated_at: null,
  })
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
  it('refunds over-reserved AI tokens and logs the actual charge', async () => {
    mockDb.grantCredits.mockResolvedValue(10)
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    const result = await Credits.settleReserved(
      'user-1',
      10,
      { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      { endpoint: '/api/ai/parse-tasks', model: 'gpt-4o-mini' }
    )

    expect(result).toEqual({ ok: true, chargeTokens: 6, adjustmentTokens: 4 })
    expect(mockDb.grantCredits).toHaveBeenCalledWith('user-1', 4)
    expect(mockDb.insertUsageLog).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        endpoint: '/api/ai/parse-tasks',
        model: 'gpt-4o-mini',
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        credits_delta: -6,
        reserved_tokens: 10,
        base_tokens: 1,
        markup_tokens: 5,
        estimated: false,
      })
    )
  })

  it('attempts to reserve extra AI tokens when actual usage exceeds the reserve', async () => {
    mockDb.reserveCredits.mockResolvedValue(0)
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    const result = await Credits.settleReserved(
      'user-1',
      5,
      { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 },
      { endpoint: '/api/ai/query-tasks', model: 'gpt-3.5-turbo' }
    )

    expect(result.ok).toBe(true)
    expect(mockDb.reserveCredits).toHaveBeenCalledWith('user-1', 2495)
    expect(mockDb.insertUsageLog).toHaveBeenCalledWith(
      expect.objectContaining({
        credits_delta: -2500,
        reserved_tokens: 5,
      })
    )
  })

  it('drains remaining balance (does NOT drop the result) when usage exceeds what the user can afford', async () => {
    // Actual usage far exceeds the reserve; the extra reserve fails (insufficient).
    mockDb.reserveCredits.mockResolvedValue(null)
    mockDb.getCreditBalance.mockResolvedValue(3) // 3 app tokens left after the initial reserve
    mockDb.setCreditBalance.mockResolvedValue(0)
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    const result = await Credits.settleReserved(
      'user-1',
      5,
      { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 },
      { endpoint: '/api/ai/query-tasks', model: 'gpt-3.5-turbo' }
    )

    // Still ok:true so the route returns the already-successful AI result.
    expect(result.ok).toBe(true)
    expect(mockDb.setCreditBalance).toHaveBeenCalledWith('user-1', 0)
    // credits_delta reflects what was actually taken: reserve (5) + drained (3) = 8.
    expect(mockDb.insertUsageLog).toHaveBeenCalledWith(
      expect.objectContaining({
        credits_delta: -8,
        reserved_tokens: 5,
        reason: 'settlement_underfunded',
      })
    )
  })
})

describe('Credits.refundReserve', () => {
  it('restores the held balance without a balance-affecting ledger row', async () => {
    mockDb.grantCredits.mockResolvedValue(10)
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    await Credits.refundReserve('user-1', 10, 'refund_failed_call')

    // Balance restored...
    expect(mockDb.grantCredits).toHaveBeenCalledWith('user-1', 10)
    // ...but the audit row is 0-delta so SUM(credits_delta) stays equal to the
    // real balance (the reserve was never logged as negative).
    expect(mockDb.insertUsageLog).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', credits_delta: 0, reason: 'refund_failed_call' })
    )
  })
})

describe('loadModelPricing', () => {
  it('returns defaults when no override env is set', () => {
    expect(loadModelPricing(undefined)['gpt-4o-mini'].inputUsdPerMillion).toBe(0.15)
  })

  it('merges a valid JSON override over the defaults', () => {
    const pricing = loadModelPricing('{"gpt-4o-mini":{"inputUsdPerMillion":0.3,"outputUsdPerMillion":1.2}}')
    expect(pricing['gpt-4o-mini']).toEqual({ inputUsdPerMillion: 0.3, outputUsdPerMillion: 1.2 })
    expect(pricing['gpt-3.5-turbo'].inputUsdPerMillion).toBe(0.50) // default still present
  })

  it('falls back to defaults on malformed JSON', () => {
    expect(loadModelPricing('not json')['gpt-4o-mini'].inputUsdPerMillion).toBe(0.15)
  })
})

describe('billing math', () => {
  it('charges tiny calls with at least the 5-token markup', () => {
    expect(calculateAiTokenCharge('gpt-4o-mini', {
      promptTokens: 100,
      completionTokens: 50,
    })).toEqual({
      baseTokens: 1,
      markupTokens: 5,
      totalTokens: 6,
    })
  })

  it('uses 25% markup for larger calls', () => {
    expect(calculateAiTokenCharge('gpt-3.5-turbo', {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    })).toEqual({
      baseTokens: 2000,
      markupTokens: 500,
      totalTokens: 2500,
    })
  })

  it('rounds final charges up', () => {
    expect(calculateAiTokenCharge('gpt-4o-mini', {
      promptTokens: 1,
      completionTokens: 1,
    }).totalTokens).toBe(6)
  })

  it('throws before reservation for unpriced models', () => {
    expect(() => estimateReserveTokens({
      model: 'unknown-model',
      systemPrompt: 'sys',
      userPrompt: 'hello',
      maxOutputTokens: 100,
    })).toThrow(UnpricedModelError)
  })

  it('uses persisted markup settings for reserve estimates', async () => {
    mockDb.getBillingSettings.mockResolvedValue({
      app_tokens_per_usd: 1000,
      markup_rate: 1,
      min_markup_tokens: 10,
      updated_at: null,
    })

    const reserve = await Credits.estimateReserve({
      model: 'gpt-4o-mini',
      systemPrompt: 'sys',
      userPrompt: 'hello',
      maxOutputTokens: 100,
    })

    expect(reserve).toBe(11)
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

describe('subscription pricing and grants', () => {
  it('keeps cost metering at 1000 app tokens per dollar while promo sell rate is 500 credits per dollar', async () => {
    mockDb.getCreditSubscriptionSettings.mockResolvedValue({ promo_active: true, updated_at: null })

    const pricing = await Credits.getSubscriptionPricing()

    expect(Credits.APP_TOKENS_PER_USD).toBe(1000)
    expect(pricing).toEqual(expect.objectContaining({
      promoActive: true,
      phase: 'promo',
      priceUsd: 1,
      monthlyCredits: 500,
      sellCreditsPerUsd: 500,
    }))
  })

  it('uses regular sell rate of 250 credits per dollar when promo is off', async () => {
    mockDb.getCreditSubscriptionSettings.mockResolvedValue({ promo_active: false, updated_at: null })

    const pricing = await Credits.getSubscriptionPricing()

    expect(pricing.phase).toBe('regular')
    expect(pricing.priceUsd).toBe(2)
    expect(pricing.sellCreditsPerUsd).toBe(250)
  })

  it('activates a subscription and grants exactly the monthly non-rollover bucket', async () => {
    mockDb.getCreditBalance.mockResolvedValue(100)
    mockDb.upsertUserCreditSubscription.mockResolvedValue({
      user_id: 'user-1',
      active: true,
      price_phase: 'promo',
      monthly_credits: 500,
      renewal_date: '2026-08-01',
      last_monthly_grant_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    })
    mockDb.grantSubscriptionCredits.mockResolvedValue(600)
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    const result = await Credits.activateSubscription('user-1', { active: true, grantMonthlyCredits: true })

    expect(mockDb.grantSubscriptionCredits).toHaveBeenCalledWith('user-1', 500)
    expect(mockDb.insertUsageLog).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      credits_delta: 500,
      reason: 'subscription_monthly_grant_promo',
      balance_before: 100,
      balance_after: 600,
    }))
    expect(result.balance).toBe(600)
  })

  it('grants top-ups at the active sell rate and stacks them through grantCredits', async () => {
    mockDb.getCreditBalance.mockResolvedValue(25)
    mockDb.grantCredits.mockResolvedValue(1025)
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    const result = await Credits.grantTopUp('user-1', 2)

    expect(mockDb.grantCredits).toHaveBeenCalledWith('user-1', 1000)
    expect(mockDb.insertUsageLog).toHaveBeenCalledWith(expect.objectContaining({
      credits_delta: 1000,
      reason: 'topup_promo_2_usd',
      balance_before: 25,
      balance_after: 1025,
    }))
    expect(result.credits).toBe(1000)
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

describe('Credits.setBalance', () => {
  it('sets the final balance and logs the delta with before/after values', async () => {
    mockDb.getCreditBalance.mockResolvedValue(10)
    mockDb.setCreditBalance.mockResolvedValue(25)
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    const result = await Credits.setBalance('user-1', 25)

    expect(result).toEqual({ balance: 25, delta: 15 })
    expect(mockDb.setCreditBalance).toHaveBeenCalledWith('user-1', 25)
    expect(mockDb.insertUsageLog).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      credits_delta: 15,
      reason: 'admin_balance_set',
      balance_before: 10,
      balance_after: 25,
    }))
  })
})
