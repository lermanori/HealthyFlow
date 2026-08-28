# Payment model — every decision, and how to check it

> **Written 2026-08-26** on branch `worktree-pricing-actions`. A dated document in
> `docs/history/` — it records what was decided in one session and is not
> maintained. The living versions are [ADR-0013](../../adr/0013-a-credit-is-an-action.md)
> (the reasoning), `TARGET.md` (Money), and the code itself.
>
> **This file exists to be checked, not believed.** Every decision below carries a
> file and line, a command, or an arithmetic you can redo. Where something is
> unverified or half-built, it says so.

---

## The problem being solved

A credit was designed as a cost pass-through unit: `APP_TOKENS_PER_USD = 1000`
means one credit is one milli-dollar of OpenAI spend, with a 25% markup on top.

That is not what shipped. Purchases granted fixed packs — $5 for 250 credits — so
the **sell rate was 50 credits per $1 while the meter ran at 1,000 per $1.** A
credit was sold for twenty times what it metered, and nothing could detect it
because `sellCreditsPerUsd` was derived from the pack it was meant to justify.

**Verify the old state:** `git show main:backend/src/credits.ts | grep -n "TOP_UP_CREDITS\|APP_TOKENS_PER_USD\|sellCreditsPerUsd"`

**What it cost users:** a text parse billed 6 credits (5 of them the
`MIN_MARKUP_TOKENS` floor, not the model), so $5 bought ~41 sentences and the $9
plan's 500 credits bought ~83 actions — under three a day, for a product whose
whole pitch is "say it and it lands".

---

## D1 — A credit is one action

**Decided:** the user-facing unit is an action, not a quantity of money or tokens.

**Why:** the meter was already pricing actions and pretending otherwise — every
text call floored at the same 5-credit markup regardless of real cost. Naming the
unit honestly removes a currency nobody could reason about.

**Verify:** `backend/src/credits.ts:29-33` · `CONTEXT.md` (Credit / app token) ·
`backend/tests/credits/action-pricing.test.ts` → *"prices a text action at exactly one credit"*

---

## D2 — Three prices: text 1, photo 5, premium 10

**Decided:** `ACTION_PRICE = { text: 1, photo: 5, premium: 10 }`.

**Why not cost-proportional:** a photo really costs ~13× a text call and a premium
model ~63×. Charging those ratios would make the surfaces we most want used the
most expensive. Compressed to 5× and 10×, every class still profits.

| Action | Serving cost | Sells for (at $5/300) | Margin |
|---|---|---|---|
| Text | $0.00031 | $0.017 | 98% |
| Photo | $0.0039 | $0.083 | 95% |
| Premium | $0.0195 | $0.167 | 88% |

**Verify the costs yourself** — they come from the model pricing table at
`backend/src/credits.ts:37-64`, not from an estimate:

```
text:    900 prompt + 300 completion tokens on gpt-4o-mini
         (900/1e6 × $0.15) + (300/1e6 × $0.60) = $0.00031
photo:   ~25,000 prompt tokens (a high-detail image)
         (25000/1e6 × $0.15) + (300/1e6 × $0.60) = $0.0039
premium: 3,000 + 800 on gpt-5.4
         (3000/1e6 × $2.50) + (800/1e6 × $15.00) = $0.0195
```

**Test:** *"keeps a text action worth far more than it costs, at every model we call"*

---

## D3 — A photo sent to a premium model is charged once, as a photo

**Decided:** the image wins the classification.

**Why:** charging both weights would double-bill one request. Photo is the cheaper
of the two on purpose.

**Verify:** `backend/src/credits.ts:327-332` ·
test *"charges a photo sent to a premium model once, at the photo price"*

---

## D4 — The price is known before the call and never adjusted after

**Decided:** `authorizeAction` prices the request up front; settlement records
what happened and charges nothing further.

**Why:** the reserve → adjust → settle reconciliation existed only because the
charge was derived from actual usage. With a knowable price it is dead code —
including the branch that **drained a user's balance to zero** to cover an overage.

**Verify:** `backend/src/credits.ts:640` (authorize), `:782` (settle) ·
test *"never moves the balance at settlement, however large the actual usage"* ·
`git show main:backend/src/credits.ts | sed -n '/settlement_underfunded/,+8p'` shows what was deleted

---

## D5 — Price and cost are separate columns, permanently

**Decided:** `ai_usage_log.credits_delta` is what the user paid, in actions.
New `cost_usd` is what we paid, in dollars. New `action_class` says which price
applied. **They must never be summed together.**

**Why:** the two quantities were the same number, drifted twenty-fold apart, and
nothing noticed. Different units in different columns makes the drift impossible
to hide.

**Verify:** `supabase/migrations/20260826120000_credit_is_an_action.sql` — the
`COMMENT ON COLUMN` statements say this in the database itself ·
test *"records the price the user paid and the cost we incurred, in their own units"*

---

## D6 — Cloud includes text AI unmetered; caps only where cost is real

**Decided:** an active subscription covers text actions without touching the
balance, under a fair-use ceiling of 100/day. Photo is capped at 100/month and
premium at 50/month. **Past a cap a subscriber falls through to their balance —
never refused for being over.**

**Why:** metering a $0.0003 call costs more in lost conversions than it saves.

**Verify the worst case is affordable:**

```
100 text/day × 30 × $0.00031  = $0.93
100 photo/month × $0.0039     = $0.39
 50 premium/month × $0.0195   = $0.98
                        total = $2.30  →  74% margin on $9
```

`backend/src/credits.ts:56-58`, `:690` (entitlementCovers) ·
test *"costs us less than the subscription price even when every cap is reached"*

---

## D7 — The subscription grants no credits

**Decided:** `SUBSCRIPTION_MONTHLY_CREDITS` is deleted. Cloud sells the day on
every device and includes AI as a per-call entitlement, not as a monthly balance.

**Why:** it was the last place the subscription still sold credits, contradicting
ADR-0012, and 500 credits/month was ~83 actions — the exhaustion problem, aimed at
the tier that pays us.

**Verify:** `grep -rn "SUBSCRIPTION_MONTHLY_CREDITS" backend/src` returns nothing ·
test *"activates a subscription without granting any credits"*

---

## D8 — Packs, never a per-dollar rate

**Decided:** $5 buys 300 actions. `sellCreditsPerUsd` is deleted. `grantTopUp`
grants whole packs and treats the dollar figure as an audit label only.

**Why:** a dollars × rate multiplication with nothing asserting the rate is exactly
how the drift happened.

**Verify:** `backend/src/credits.ts:40-41`, `:890` ·
`grep -rn "sellCreditsPerUsd" backend/src src` returns exactly one hit, the
comment at `credits.ts:404` explaining its absence ·
tests *"grants whole packs, never a per-dollar rate"*, *"keeps the pack worth a real number of actions"*

**What changed for the user:** the same $5 goes from ~41 sentences to 300.

---

## D9 — Prices stay at $9 founding / $19 regular

**Decided:** unchanged.

**Why:** the price was never the problem — what $9 *bought* was. At $9 for the day
on every device with AI included, it is an easy yes; $19 stays defensible against
Sunsama at $20 and Motion at $25.

**Verify:** `backend/src/credits.ts:38-39`

---

## D10 — One flat welcome grant, no cohort

**Decided:** every new account gets `WELCOME_CREDITS = 50`. The
founding-250 / standard-50 split is gone.

**Why:** ADR-0012 decided in August that founding is a **Cloud price**, not a
credit tier, and that the cohort branch must not be reached. This finishes it.

**Verify:** `backend/src/credits.ts:45` ·
test *"grants the same welcome credits after the founding seats are gone"*

---

## D11 — A free account is refilled 15 actions a month

**Decided:** `MONTHLY_FREE_CREDITS = 15`, granted lazily on first use of a calendar
month, free accounts only, never blocking.

**Why:** `TARGET.md` held this in reserve as the answer *if* people churned at
exhaustion. It costs **$0.0046 per user per month** — under $5 across a thousand
free users — so it is bought now rather than after the churn is measured.

**Verify:** `backend/src/credits.ts:47`, `:596` · the atomic claim is
`claim_monthly_free_credits` in the migration — the `WHERE` clause is the lock, so
two devices at midnight cannot both be granted

---

## D12 — Existing balances are not migrated

**Decided:** nothing is converted. An old balance is worth roughly six times more
as actions.

**Why:** across every account in existence that generosity costs under a dollar,
and correcting it downward would cost more in code and goodwill than it saves.

**Verify:** the migration's only `UPDATE user_credits` is inside
`claim_monthly_free_credits` (the D11 refill) — no statement converts an existing
balance ·  stated in ADR-0013 → Consequences

---

## D13 — Cost guards, so a bug cannot become a bill

**Decided:** five guards, all enforced before any tokens are spent, each returning
its own refusal code and HTTP status.

| Guard | Value | HTTP |
|---|---|---|
| Global daily spend ceiling (all users) | **$25**/day, env-tunable | 503 |
| Per-account daily action cap | **200**/day | 429 |
| Prompt size (system + user) | **24,000** chars | 413 |
| Images per request | **4** | 413 |
| Model allowlist — a model we cannot cost, we refuse to call | — | 500 |

**Why these numbers:** one account at its cap spending entirely on premium actions
is 200 × $0.0195 = **$3.90**, well under the ceiling — so no single account can
spend the day's budget. A thousand subscribers on a typical day is ~$6.70, so
honest use never trips it.

**Verify:** `backend/src/credits.ts:69-77`, `:640` · `backend/src/routes/ai.ts:64` ·
tests *"bounds a single account below the global ceiling"*,
*"sets the global ceiling far above honest use and far below a disaster"*

**Not guarded, and named on purpose:** a leaked OpenAI key. Code guards cannot see
traffic that never reaches our server. **Only the vendor hard limit stops that, and
it is not set by this repository** — see `docs/runbooks/cost-guards.md`.

---

## D14 — Every refusal gets its own status and message

**Decided:** `insufficient_credits` 402, `account_daily_cap` 429,
`global_ceiling` 503, size limits 413. The message comes from the refusal itself.

**Why:** a client that cannot tell "you are out of credits" from "we paused AI for
everyone today" cannot tell the user what to do. This was a real gap found while
building — the new codes would have fallen through to a 500.

**Verify:** `backend/src/routes/ai.ts:64` and `backend/src/routes/workouts.ts`

---

## What was rejected, and why

| Option | Why not |
|---|---|
| Restore the original 1,000-per-$1 sell rate | Pure, and not a business: cost-plus-25% on a heavy user earns **$0.007/month**. Its premise — that AI is the dominant cost — is false at these models. |
| Keep credits as a cost unit, just enlarge the pack | Leaves a unit nobody can reason about. "You have 1,400 credits" answers no question a person is asking. |
| Meter text on the paid tier too | Recreates the exhaustion moment on the tier that pays us, to protect $0.0003. |
| Flat subscription, no credits at all | Removes the path for someone who will not subscribe, and the only lever on image and premium cost. |

---

## What was NOT decided

- **The payment rail.** StoreKit, a merchant of record, or manual fulfilment —
  still open, still [#201](https://github.com/lermanori/HealthyFlow/issues/201),
  P0 since 2026-07-30. **Nobody can pay today.**
- **Refund policy.** No `revokeTopUp` exists, and credits may be spent before a
  refund arrives.
- **Lapsed-subscription data deletion.** Only the freeze exists.

---

## Known gaps in what was built

Stated here rather than left to be discovered:

1. **`grantTopUp` is not idempotent.** Two deliveries of one webhook grant two
   packs. Must be fixed before any rail is wired.
2. **The founding counter is wrong.** `getSubscriptionPricing` decides the founding
   price from how many accounts have *signed up*, not how many have *subscribed*,
   because the welcome grant is now identical for everyone. Wrong only in the
   customer's favour.
3. **The migration is unapplied.** The global ceiling reads `cost_usd`, so **it
   does not work until the migration runs.**
4. **The landing page still sells the old model**, in both the static HTML and the
   JS branch that rewrites it at runtime.

---

## Verify the whole thing yourself

```sh
git checkout worktree-pricing-actions
npm install && npm --prefix backend install

npm --prefix backend run typecheck   # src and tests
npm --prefix backend test            # 828 pass, 84 suites
npm run typecheck
npm run test:unit                    # 222/223 — the one failure is the
                                     # container's missing Playwright binary
npm run build
```

The guard tests alone are the fastest way to check the numbers in this document:

```sh
cd backend && npx jest tests/credits/action-pricing.test.ts
# 18 passed
```

If any of those fail, a price or a guard moved. The question is not how to update
the expectation — it is whether the move was intended.
