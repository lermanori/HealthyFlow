# Payment rails — what this pricing change left ready, and what is left to do

> **Written 2026-08-26**, at the end of the ADR-0013 implementation. A dated
> document in `docs/history/` — it describes the state of the work on that day and
> is not maintained. The decision it implements is in
> [`docs/adr/0013-a-credit-is-an-action.md`](../../adr/0013-a-credit-is-an-action.md),
> which *is* maintained; where they disagree, the ADR wins.

Whoever picks up payment integration: read the ADR first, then this. The pricing
model is decided and built. **Nothing about taking money is built**, and that is
deliberate — the rail is still an open decision
([#201](https://github.com/lermanori/HealthyFlow/issues/201), P0 since 2026-07-30).

---

## What is now true in the code

**A credit is one action.** Text 1, photo 5, premium model 10. The price is decided
before the call from the endpoint, whether the prompt carries an image, and the
model — all three already in scope at the billing boundary.

**One entry point decides everything:**

```ts
Credits.authorizeAction(userId, { endpoint, model, systemPrompt, userPrompt })
  → { ok: true, actionClass, credits, charged, coveredBy }
  | { ok: false, code: ActionRefusal }
```

It runs the request-shape guards, the global daily ceiling, the per-account daily
cap, the Cloud entitlement check and the balance reserve, in that order. Then
`settleAction` records the row and `refundAction` returns credits on a failed call.

**Price and cost no longer share a unit.** `ai_usage_log.credits_delta` is what the
user paid, in actions. `cost_usd` is what we paid, in dollars. `action_class` says
which price applied. Never sum the first two.

**What was deleted:** `SUBSCRIPTION_MONTHLY_CREDITS`, `sellCreditsPerUsd`,
`estimateReserveTokens`, `settleReserved`'s reconciliation (including the branch
that drained a balance to zero to cover an overage), and the founding/standard
signup-credit split.

**Verification, all green on this branch:** both typechecks, 828 backend tests
across 84 suites, 222 of 223 frontend tests (the failure is the Playwright browser
binary missing in the container, not the change), production build.

**One migration is written and unapplied:**
`supabase/migrations/20260826120000_credit_is_an_action.sql`. Nothing that depends
on `cost_usd`, `action_class` or the monthly refill works until it is applied —
including the global daily ceiling, which reads `cost_usd`.

---

## What is not built

### 1. The rail itself — #201

Still undecided, and this change does not decide it. What the pricing model now
assumes, either way:

- **Two SKUs only**: a Cloud subscription at $9 founding / $19 regular, and a
  $5 pack of 300 actions. No per-dollar credit rate exists any more, so a rail that
  wants to sell "$3 of credits" has nothing to multiply — it must sell packs.
- **`Credits.grantTopUp(userId, dollars)`** grants whole packs and takes the dollar
  figure only as an audit label. A webhook handler should call it with the amount
  actually charged; it will round to packs.
- **`Credits.activateSubscription(userId, { active })`** flips Cloud on and off and
  grants nothing. `grantMonthlyCredits` is still in the signature, ignored, and
  should be removed when its callers are next touched.

Both entry points are already idempotent enough for a webhook to call more than
once **except** `grantTopUp`, which is not — see Risk 1 below.

### 2. Founding as a price, not a cohort

ADR-0012 decided this in August and it is still half-done. `FOUNDING_MEMBER_LIMIT`
and `signup_credit_grants` now count welcome grants that are identical for
everybody, so **the founding counter no longer means anything.** Whoever builds the
rail should make the counter count *discounted subscriptions*, which is what the
landing page has always claimed it counts.

Until then, `getSubscriptionPricing` decides the founding price from
`getFoundingSignupCreditGrantCount()` — that is, from how many accounts have ever
signed up, not from how many have subscribed. It is wrong, it is only wrong in the
customer's favour, and it is written down here rather than left to be discovered.

### 3. The iPhone dead end

`SettingsPage.tsx` gates every purchase CTA behind `!isNativeApp` and tells a
native user "AI credit purchases are not yet available in the iOS app." A TestFlight
user who runs out has no path, in-app or out. That is a churn event aimed at the
person who has already demonstrated they value the product.

**Check Apple's current rules before writing the replacement copy.** In-app purchase
requirements, and what an app may say about buying elsewhere, have moved repeatedly.
Whatever this document assumed would be out of date.

### 4. Surfaces still describing the old model

- **`public/landing.html`** — pricing section still sells credits as the subscription
  benefit, in both the static HTML and the JS branch that rewrites it at runtime.
  Both need changing; see the marketing report at
  `docs/history/product/2026-08-26-marketing-focus.md`.
- **Analytics** — `upgrade_cta_clicked` and `upgrade_request_sent` carry a `credits`
  property that is now `0` for a subscription. Any dashboard reading it as
  "credits bought" will silently mislead.

---

## Risks a payment rail must handle

**1. `grantTopUp` is not idempotent.** Two deliveries of the same webhook grant two
packs. Before wiring any rail, add a provider transaction id and a unique constraint
— the pattern to copy is `claim_signup_credit_grant`, which is idempotent by design
and returns `alreadyGranted`.

**2. Refunds have no path.** There is no `revokeTopUp`, and credits may already be
spent by the time a refund arrives. Decide the policy before the first sale: absorb
it, or allow a negative balance. Absorbing is defensible at $0.0003 an action.

**3. Lapsed subscriptions still have no deletion job.** Noted in the ledger since
2026-08-25 and still true: only the freeze exists, which is the subscription gate
refusing `/api/sync`. Hosted data of a lapsed subscriber is retained indefinitely.

**4. The entitlement check costs two queries per action.** `authorizeAction` runs a
`sumAiCostUsdSince` and a `countUserActionsSince` on every call. Both are indexed by
the migration, and neither is on the day's critical path — but if AI volume grows,
cache the global ceiling for a minute rather than reading it per request.

**5. Existing balances were not migrated.** An old balance is denominated in old
credits, worth roughly six times more as actions. Deliberate, costed at under a
dollar across every account (ADR-0013). Nobody needs to fix it; a support question
about "why did my credits go further" has this as its answer.

---

## Suggested order

1. Apply the migration. Nothing below works without it.
2. Set the OpenAI hard limit and the vendor alerts in
   [`docs/runbooks/cost-guards.md`](../../runbooks/cost-guards.md). Do this before
   any launch push, not after.
3. Decide #201 on paper.
4. Make `grantTopUp` idempotent, with a provider transaction id.
5. Build the rail against the two SKUs.
6. Make founding count subscriptions.
7. Fix the iPhone dead end.
8. Rewrite the landing page pricing section.
