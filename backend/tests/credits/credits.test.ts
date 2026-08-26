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
    claimSignupCreditGrant: jest.fn(),
    getFoundingSignupCreditGrantCount: jest.fn(),
    getSignupCreditGrant: jest.fn(),
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
  ACTION_PRICE,
  calculateAiTokenCharge,
  classifyAction,
  Credits,
  loadModelPricing,
  priceAction,
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
  mockDb.getFoundingSignupCreditGrantCount.mockResolvedValue(0)
  mockDb.getSignupCreditGrant.mockResolvedValue(null)
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

describe('Credits.settleAction', () => {
  const textAction = {
    ok: true as const,
    actionClass: 'text' as const,
    credits: 1,
    charged: 1,
    coveredBy: 'balance' as const,
  }

  it('records the price the user paid and the cost we incurred, in their own units', async () => {
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    await Credits.settleAction(
      'user-1',
      textAction,
      { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      { endpoint: '/api/ai/parse-tasks', model: 'gpt-4o-mini' }
    )

    const row = mockDb.insertUsageLog.mock.calls[0][0] as any
    // What they paid: one action.
    expect(row.credits_delta).toBe(-1)
    expect(row.action_class).toBe('text')
    // What it cost us: dollars, and nowhere near the price.
    expect(row.cost_usd).toBeCloseTo(0.000045, 6)
    expect(row.cost_usd).toBeLessThan(0.001)
  })

  it('charges nothing when a Cloud entitlement covered the action, and still records the cost', async () => {
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    await Credits.settleAction(
      'user-1',
      { ...textAction, charged: 0, coveredBy: 'entitlement' },
      { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      { endpoint: '/api/ai/parse-tasks', model: 'gpt-4o-mini' }
    )

    const row = mockDb.insertUsageLog.mock.calls[0][0] as any
    expect(row.credits_delta).toBe(0)
    expect(row.reason).toBe('covered_by_subscription')
    // The cost is still ours and still recorded — an unmetered action is not a
    // free one, and the global ceiling has to be able to see it.
    expect(row.cost_usd).toBeGreaterThan(0)
  })

  it('never moves the balance at settlement, however large the actual usage', async () => {
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    await Credits.settleAction(
      'user-1',
      textAction,
      { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 },
      { endpoint: '/api/ai/query-tasks', model: 'gpt-3.5-turbo' }
    )

    // The price was fixed before the call, so there is nothing to reconcile. This
    // is what deleted the underfunded branch that used to drain a balance to zero.
    expect(mockDb.grantCredits).not.toHaveBeenCalled()
    expect(mockDb.reserveCredits).not.toHaveBeenCalled()
    expect(mockDb.setCreditBalance).not.toHaveBeenCalled()
    expect((mockDb.insertUsageLog.mock.calls[0][0] as any).credits_delta).toBe(-1)
  })
})

describe('Credits.refundAction', () => {
  const charged = {
    ok: true as const,
    actionClass: 'photo' as const,
    credits: 5,
    charged: 5,
    coveredBy: 'balance' as const,
  }

  it('restores the charged credits without a balance-affecting ledger row', async () => {
    mockDb.grantCredits.mockResolvedValue(10)
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    await Credits.refundAction('user-1', charged, 'refund_failed_call')

    expect(mockDb.grantCredits).toHaveBeenCalledWith('user-1', 5)
    // The audit row is 0-delta so SUM(credits_delta) stays equal to the real
    // balance — the reserve was never logged as negative in the first place.
    expect(mockDb.insertUsageLog).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', credits_delta: 0, reason: 'refund_failed_call' })
    )
  })

  it('gives nothing back for an entitlement action, but still logs the attempt', async () => {
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    await Credits.refundAction(
      'user-1',
      { ...charged, charged: 0, coveredBy: 'entitlement' },
      'refund_failed_call'
    )

    expect(mockDb.grantCredits).not.toHaveBeenCalled()
    // A failure nobody can see is a failure nobody can fix.
    expect(mockDb.insertUsageLog).toHaveBeenCalled()
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

  it('refuses to price a model we cannot cost', () => {
    // A model we cannot cost is a model we must not call: this is what stops an
    // unbudgeted model reaching production behind an environment variable.
    expect(() => priceAction({
      endpoint: 'parse-tasks',
      model: 'unknown-model',
      userPrompt: 'hello',
    })).toThrow(UnpricedModelError)
  })

  it('does not let the cost meter move a user-facing price', async () => {
    // The markup settings are cost accounting. Doubling them must not change what
    // anyone is charged — that coupling is exactly what drifted before ADR-0013.
    mockDb.getBillingSettings.mockResolvedValue({
      app_tokens_per_usd: 1000,
      markup_rate: 1,
      min_markup_tokens: 10,
      updated_at: null,
    })

    expect(priceAction({
      endpoint: 'parse-tasks',
      model: 'gpt-4o-mini',
      userPrompt: 'hello',
    })).toBe(ACTION_PRICE.text)
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

describe('launch signup credits', () => {
  it('publishes the founding offer while founding grants remain', async () => {
    mockDb.getFoundingSignupCreditGrantCount.mockResolvedValue(7)

    const offer = await Credits.getLaunchOffer()

    expect(offer).toEqual({
      foundingMemberLimit: 100,
      // Seats at the founding PRICE, not a credit tier (ADR-0012).
      foundingMembersRemaining: 93,
      welcomeCredits: 50,
      monthlyFreeCredits: 15,
      foundingPriceUsd: 9,
      regularPriceUsd: 19,
      topUpPriceUsd: 5,
      topUpCredits: 300,
      actionPrice: { text: 1, photo: 5, premium: 10 },
      subscriptionIncludes: {
        unlimitedText: true,
        textDailyCap: 100,
        photoMonthly: 100,
        premiumMonthly: 50,
      },
    })
  })

  it('grants the same welcome credits after the founding seats are gone', async () => {
    // Founding is a Cloud PRICE, not a credit cohort (ADR-0012). Exhausting the
    // seats changes what a subscription costs, never what a new account receives.
    mockDb.getFoundingSignupCreditGrantCount.mockResolvedValue(100)

    const offer = await Credits.getLaunchOffer()

    expect(offer.foundingMembersRemaining).toBe(0)
    expect(offer.welcomeCredits).toBe(Credits.WELCOME_CREDITS)
  })

  it('claims the idempotent signup grant through the database contract', async () => {
    mockDb.claimSignupCreditGrant.mockResolvedValue({
      credits: 50,
      cohort: 'standard',
      balance: 50,
      alreadyGranted: false,
    })

    const grant = await Credits.grantSignupCredits('user-1')

    expect(mockDb.claimSignupCreditGrant).toHaveBeenCalledWith('user-1', {
      foundingMemberLimit: 100,
      foundingCredits: 50,
      standardCredits: 50,
    })
    expect(grant).toEqual({
      credits: 50,
      cohort: 'standard',
      balance: 50,
      alreadyGranted: false,
    })
  })
})

describe('subscription pricing and grants', () => {
  it('keeps cost metering separate from the $9 founding subscription and $5 top-up', async () => {
    mockDb.getCreditSubscriptionSettings.mockResolvedValue({ promo_active: true, updated_at: null })

    const pricing = await Credits.getSubscriptionPricing()

    // The cost meter still exists and still means milli-dollars — it just no
    // longer appears anywhere in what is sold.
    expect(Credits.APP_TOKENS_PER_USD).toBe(1000)
    expect(pricing).toEqual(expect.objectContaining({
      promoActive: true,
      phase: 'promo',
      priceUsd: 9,
      topUpPriceUsd: 5,
      topUpCredits: 300,
      actionPrice: { text: 1, photo: 5, premium: 10 },
      foundingMemberLimit: 100,
    }))
    expect(pricing).not.toHaveProperty('sellCreditsPerUsd')
    expect(pricing).not.toHaveProperty('monthlyCredits')
  })

  it('uses the $19 regular subscription price without changing top-up value', async () => {
    mockDb.getCreditSubscriptionSettings.mockResolvedValue({ promo_active: false, updated_at: null })

    const pricing = await Credits.getSubscriptionPricing()

    expect(pricing.phase).toBe('regular')
    expect(pricing.priceUsd).toBe(19)
    // There is no dollars-to-credits rate to assert. Packs are the only sale unit,
    // and the pack does not change when the subscription price does.
    expect(pricing.topUpCredits).toBe(Credits.TOP_UP_CREDITS)
    expect(pricing).not.toHaveProperty('sellCreditsPerUsd')
  })

  it('activates a subscription without granting any credits', async () => {
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

    // Cloud sells the day on every device and includes text AI as an entitlement
    // checked per call. There is no monthly bucket to hand over any more.
    expect(mockDb.grantSubscriptionCredits).not.toHaveBeenCalled()
    // ...and writes no grant row either. A subscription that grants nothing has
    // nothing to log; the entitlement shows up per action, in each action's row.
    expect(mockDb.insertUsageLog).not.toHaveBeenCalled()
    // The balance is untouched by activation: it was 100 before and stays 100.
    expect(result.balance).toBe(100)
  })

  it('keeps the $9 founding price for a first-100 account that subscribes later', async () => {
    mockDb.getCreditSubscriptionSettings.mockResolvedValue({ promo_active: false, updated_at: null })
    mockDb.getSignupCreditGrant.mockResolvedValue({
      user_id: 'user-1',
      cohort: 'founding',
      credits: 250,
      balance_after: 250,
      created_at: '2026-07-28T00:00:00.000Z',
    })

    const pricing = await Credits.getSubscriptionPricing('user-1')

    expect(pricing.phase).toBe('promo')
    expect(pricing.priceUsd).toBe(9)
  })

  it('does not offer an unclassified legacy account the founding price after 100 grants', async () => {
    mockDb.getFoundingSignupCreditGrantCount.mockResolvedValue(100)

    const pricing = await Credits.getSubscriptionPricing('legacy-user')

    expect(pricing.phase).toBe('regular')
    expect(pricing.priceUsd).toBe(19)
  })

  it('uses the $19 regular price when a canceled founding subscription is reactivated', async () => {
    mockDb.getSignupCreditGrant.mockResolvedValue({
      user_id: 'user-1',
      cohort: 'founding',
      credits: 250,
      balance_after: 250,
      created_at: '2026-07-28T00:00:00.000Z',
    })
    mockDb.getUserCreditSubscription.mockResolvedValue({
      user_id: 'user-1',
      active: false,
      price_phase: 'promo',
      monthly_credits: 500,
      renewal_date: null,
      last_monthly_grant_at: null,
      updated_at: '2026-07-28T00:00:00.000Z',
    })
    mockDb.getCreditBalance.mockResolvedValue(250)
    mockDb.upsertUserCreditSubscription.mockResolvedValue({
      user_id: 'user-1',
      active: true,
      price_phase: 'regular',
      monthly_credits: 500,
      renewal_date: '2026-08-28',
      last_monthly_grant_at: null,
      updated_at: '2026-07-28T00:00:00.000Z',
    })

    const result = await Credits.activateSubscription('user-1', {
      active: true,
      grantMonthlyCredits: false,
    })

    expect(mockDb.upsertUserCreditSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ price_phase: 'regular' })
    )
    expect(result.pricing.priceUsd).toBe(19)
  })

  it('grants the $5 top-up as 300 non-expiring actions', async () => {
    mockDb.getCreditBalance.mockResolvedValue(25)
    mockDb.grantCredits.mockResolvedValue(325)
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    const result = await Credits.grantTopUp('user-1', 5)

    expect(mockDb.grantCredits).toHaveBeenCalledWith('user-1', 300)
    expect(mockDb.insertUsageLog).toHaveBeenCalledWith(expect.objectContaining({
      credits_delta: 300,
      reason: 'topup_promo_5_usd',
      balance_before: 25,
      balance_after: 325,
    }))
    expect(result.credits).toBe(300)
  })

  it('grants whole packs, never a per-dollar rate', () => {
    // The drift ADR-0013 exists to prevent: dollars multiplied by a credits-per-
    // dollar figure, with nothing asserting what that figure should be.
    mockDb.getCreditBalance.mockResolvedValue(0)
    mockDb.grantCredits.mockResolvedValue(600)
    mockDb.insertUsageLog.mockResolvedValue(undefined)

    return Credits.grantTopUp('user-1', 10).then((result) => {
      expect(result.credits).toBe(600)
      expect(result.credits % Credits.TOP_UP_CREDITS).toBe(0)
    })
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
