import test from 'node:test'
import assert from 'node:assert/strict'
import { actionExhaustionView } from './actionExhaustion'
import CreditContracts from '../../backend/src/credit-contracts'

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

test('a Guest whose network already took the grant is told so, not told they spent it', () => {
  const view = actionExhaustionView({
    ...summary,
    freeGrant: { state: 'network_limited', kind: 'guest_initial' },
  })

  assert.deepEqual(view, {
    kind: 'network',
    title: 'Free Guest AI actions have already been used on this network today.',
    detail: 'Create a free account for 15 AI actions each calendar month.',
  })
})

test('a network-limited Guest is still network-limited once they hold a balance', () => {
  // Balance can arrive from the Founders Club without the network reservation
  // ever being won. A usable balance is not exhaustion, so nothing is shown.
  const view = actionExhaustionView({
    ...summary,
    balance: 4,
    freeGrant: { state: 'network_limited', kind: 'guest_initial' },
  })

  assert.equal(view, null)
})

test('an account that never proved its address is told the 15 are locked, not spent', () => {
  const view = actionExhaustionView({
    ...summary,
    freeGrant: { state: 'email_unverified', kind: 'monthly' },
  })

  assert.deepEqual(view, {
    kind: 'email_unverified',
    title: 'Confirm your email to unlock your 15 AI actions a month.',
    detail: 'We sent a link when you signed up. Ask for a new one if you cannot find it.',
  })
})

test('an unverified account with credits left is shown nothing, because those are still theirs', () => {
  // Claiming a Guest account leaves whatever remained of their ten. The gate
  // withholds the next fifteen; it does not confiscate what was already given.
  assert.equal(actionExhaustionView({
    ...summary,
    balance: 4,
    freeGrant: { state: 'email_unverified', kind: 'monthly' },
  }), null)
})

test('a client older than the server degrades one unknown state, not the whole summary', () => {
  // Shipping `network_limited` broke every client that predated it. An iOS build
  // can be weeks old with no way to force an update, so the reader has to bend.
  const parsed = CreditContracts.ReadableCreditSummarySchema.parse({
    ...summary,
    freeGrant: { state: 'a_state_shipped_later', kind: 'monthly' },
  })

  assert.equal(parsed.freeGrant.state, 'unavailable')
  assert.equal(actionExhaustionView(parsed)?.kind, 'unavailable')
})
