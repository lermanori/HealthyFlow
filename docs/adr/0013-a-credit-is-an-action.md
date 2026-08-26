# ADR 0013 — A credit is an action, not a unit of cost

**Status**: Accepted
**Date**: 2026-08-26
**Amends**: ADR-0012, which established credits and Cloud as separate products. That
split stands. What changes is the **denomination** of the credit and what the Cloud
subscription includes.

## Context

The credit was designed as a cost pass-through unit: `APP_TOKENS_PER_USD = 1000`
means one credit is one milli-dollar of OpenAI spend, and `MARKUP_RATE = 0.25` is
the margin taken on top. Under that design the balance means "what you have spent",
which needs no explanation to anyone.

That is not what shipped. Purchases grant fixed packs — `TOP_UP_PRICE_USD = 5`
grants `TOP_UP_CREDITS = 250` — so the sell rate is **50 credits per $1** while the
meter still runs at 1,000 per $1. A credit is sold for twenty times what it meters,
and nothing in the code can notice, because `sellCreditsPerUsd` is derived from the
pack it is supposed to justify rather than from the meter.

Measured against the model pricing table, the consequences are:

| | |
|---|---|
| A text parse costs | **$0.00031** of OpenAI spend |
| A text parse bills | **6 credits** — five of them the `MIN_MARKUP_TOKENS` floor |
| $5 buys | ~41 text actions |
| The $9 subscription's 500 credits buy | ~83 actions — under three per day |

`MIN_MARKUP_TOKENS = 5` dominates every call cheaper than about two cents, which is
every text call. The meter is therefore already pricing **actions** while claiming to
price cost, and it prices them badly: the paid tier runs out for exactly the daily
user the product is built for.

Behind this sits a premise in `TARGET.md` that measurement disproves:

> Effortless input is the thing people value most and the thing that costs us money,
> so it is the thing that costs them money.

At the models this product actually calls, effortless input does not cost us money.
A user making fifty text actions a day costs **$0.45 a month**. Only images and the
gpt-5 tier meter meaningfully, at roughly 13× and 63× a text call.

## Decision

**A credit is one action. The cost ledger keeps its own units and never sets a price.**

Four parts:

### 1. The sale unit is an action

| Action | Credits |
|---|---|
| Text — parse a day, a Talk turn, a question | **1** |
| Photo — a meal, a list, a whiteboard | **5** |
| Premium model — gpt-5.4 / gpt-5.5 by user selection | **10** |

The weights are deliberately **not** cost-proportional. Compressing them keeps the
expensive surfaces affordable while every class still carries positive margin — 98%,
95% and 88% respectively at the pack price.

### 2. Price is known before the call, not after

`estimateReserve` returns the action's price rather than an estimate of its cost, and
settlement charges exactly what was reserved. The reserve → adjust → settle
reconciliation exists only because the charge was usage-derived; with a knowable
price it is dead code, including the underfunded branch that drained a balance to
zero to cover an overage.

### 3. Price and cost are separate columns, forever

`ai_usage_log.credits_delta` records **what the user paid**. New columns
`action_class` and `cost_usd` record **what it cost us**. They are different units in
the same row, and the schema now says so. The old `base_tokens` / `markup_tokens`
fields keep their historical meaning and are still written for cost reporting.

### 4. The subscription sells Cloud and includes AI

Cloud is the day on every device (ADR-0012). It now also includes text AI without a
balance — metering a $0.0003 call costs more in lost conversions than it saves — with
caps only where cost is real: 100 photo and 50 premium actions a month, and a
fair-use ceiling of 100 text actions a day. A subscriber past a cap falls through to
their credit balance rather than being refused.

`SUBSCRIPTION_MONTHLY_CREDITS` is deleted. A subscriber holds no monthly credit
allowance, because the subscription no longer sells credits.

## Why not the alternatives

| Option | Why not |
|---|---|
| Restore the original 1,000-per-$1 sell rate | Arithmetically pure and not a business. Cost-plus-25% on a heavy user earns **$0.007 a month**. The premise it was built on — that AI is the dominant cost — is false at these models. |
| Keep the credit as a cost unit, raise the pack size | Leaves a unit nobody can reason about. "You have 1,400 credits" answers no question a person is asking. |
| Meter everything, including text on the paid tier | Recreates the exhaustion moment on the tier that pays us, to protect three hundredths of a cent. |
| Flat subscription, no credits at all | Removes the only path for someone who will not subscribe, and the only lever on image and premium-model cost. |

## Consequences

- **`TARGET.md`'s Money section is rewritten.** "We sell the hook" survives as a
  positioning statement; the claim that input is what costs us money does not.
- **`sellCreditsPerUsd` is deleted.** There is no dollar↔credit rate any more, only
  packs. `grantTopUp` grants `TOP_UP_CREDITS` and takes the dollar figure only as an
  audit label.
- **Existing balances are not migrated.** A balance denominated in old credits is
  worth roughly six times more in actions. Across every account in existence that
  generosity costs under a dollar, and correcting it downward would cost more in code
  and goodwill than it saves.
- **The founding cohort finally gates the price.** `FOUNDING_MEMBER_LIMIT` stops
  counting credit grants and starts counting the discounted Cloud price, which is
  what ADR-0012 decided and never implemented. Signup grants a flat
  `WELCOME_CREDITS`, with no cohort branch.
- **A free account receives `MONTHLY_FREE_CREDITS` each month.** `TARGET.md` held this
  in reserve as the answer *if* people churned at exhaustion. At $0.0046 per user per
  month it is bought now rather than after the churn is measured.
- **Nothing here makes anyone able to pay.** The rails — StoreKit or a merchant of
  record — remain unbuilt and unchosen (issue #201). This ADR decides what is sold
  and for how much; it does not open the till.
