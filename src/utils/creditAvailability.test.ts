import test from 'node:test'
import assert from 'node:assert/strict'
import CreditContracts, { type CreditSummary } from '../../backend/src/credit-contracts'
import { availableActionCount } from './creditAvailability'

const baseSummary = {
  balance: 0,
  subscriptionBalance: 0,
  topupBalance: 0,
  usedThisMonth: 0,
  freeGrant: { state: 'claimed' as const, kind: 'monthly' as const, nextAvailableAt: '2026-10-01T00:00:00.000Z' },
  entitlementUsed: {
    photo: 0,
    premium: 0,
    photoCap: 100,
    premiumCap: 50,
  },
  pricing: {
    promoActive: false,
    phase: 'regular' as const,
    priceUsd: 19,
    topUpPriceUsd: 5,
    topUpCredits: 300,
    actionPrice: { text: 1, photo: 5, premium: 10 },
    foundingMemberLimit: 100,
  },
  subscription: {
    active: false,
    pricePhase: null,
    monthlyCredits: 0,
    renewalDate: null,
    lastMonthlyGrantAt: null,
    updatedAt: null,
  },
} satisfies CreditSummary

test('an available lazy Guest grant is included without changing stored balance', () => {
  const summary: CreditSummary = {
    ...baseSummary,
    freeGrant: { state: 'available', credits: 10, kind: 'guest_initial' },
  }

  assert.equal(summary.balance, 0)
  assert.equal(availableActionCount(summary), 10)
})

test('an available monthly grant is additive to a carried Guest balance', () => {
  const summary: CreditSummary = {
    ...baseSummary,
    balance: 3,
    topupBalance: 3,
    freeGrant: { state: 'available', credits: 15, kind: 'monthly' },
  }

  assert.equal(availableActionCount(summary), 18)
})

test('a claimed grant reports only the stored balance', () => {
  assert.equal(availableActionCount({ ...baseSummary, balance: 4, topupBalance: 4 }), 4)
})

test('an unavailable grant never becomes a guessed number', () => {
  const summary: CreditSummary = {
    ...baseSummary,
    balance: 4,
    topupBalance: 4,
    freeGrant: { state: 'unavailable', reason: 'Could not read free action entitlement.' },
  }

  assert.equal(availableActionCount(summary), null)
})

test('the shared response schema requires an explicit free-grant state', () => {
  const withoutGrant = { ...baseSummary } as Record<string, unknown>
  delete withoutGrant.freeGrant

  assert.equal(CreditContracts.CreditSummarySchema.safeParse(withoutGrant).success, false)
})
