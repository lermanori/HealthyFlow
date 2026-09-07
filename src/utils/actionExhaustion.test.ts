import test from 'node:test'
import assert from 'node:assert/strict'
import { actionExhaustionView } from './actionExhaustion'

const summary = {
  balance: 0,
  subscriptionBalance: 0,
  topupBalance: 0,
  usedThisMonth: 15,
  entitlementUsed: { photo: 0, premium: 0, photoCap: 100, premiumCap: 50 },
  pricing: {
    promoActive: false,
    phase: 'regular',
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
} as const

test('an exhausted Guest is offered Claim and Founders Club', () => {
  const view = actionExhaustionView({
    ...summary,
    freeGrant: { state: 'claimed', kind: 'guest_initial', nextAvailableAt: null },
  })

  assert.deepEqual(view, {
    kind: 'guest',
    title: 'You have used your 10 Guest AI actions.',
    detail: 'Create a free account for 15 AI actions each calendar month.',
  })
})

test('an exhausted claimed account uses the server-provided renewal boundary', () => {
  const view = actionExhaustionView({
    ...summary,
    freeGrant: {
      state: 'claimed',
      kind: 'monthly',
      nextAvailableAt: '2026-10-01T00:00:00.000Z',
    },
  })

  assert.deepEqual(view, {
    kind: 'monthly',
    title: 'You have used this month’s 15 AI actions.',
    nextAvailableAt: '2026-10-01T00:00:00.000Z',
  })
})

test('a failed entitlement read stays unavailable instead of becoming exhaustion', () => {
  const view = actionExhaustionView({
    ...summary,
    freeGrant: { state: 'unavailable', reason: 'Could not read free action entitlement.' },
  })

  assert.deepEqual(view, {
    kind: 'unavailable',
    title: 'Action availability is unavailable.',
    detail: 'Could not read free action entitlement.',
  })
})

test('an account with spendable or unclaimed actions is not exhausted', () => {
  assert.equal(actionExhaustionView({
    ...summary,
    balance: 1,
    topupBalance: 1,
    freeGrant: { state: 'claimed', kind: 'monthly', nextAvailableAt: '2026-10-01T00:00:00.000Z' },
  }), null)
  assert.equal(actionExhaustionView({
    ...summary,
    freeGrant: { state: 'available', credits: 15, kind: 'monthly' },
  }), null)
})
