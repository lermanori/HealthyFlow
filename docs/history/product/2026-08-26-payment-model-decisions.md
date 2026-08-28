# Payment model — every decision, and how to check it

> **Written 2026-08-26** on branch `worktree-pricing-actions`. A dated document in
> `docs/history/` — it records what was decided in one session and is not
> maintained. The living versions are [ADR-0013](../../adr/0013-a-credit-is-an-action.md)
> (the reasoning), `TARGET.md` (Money), and the code itself.
>
> **This file exists to be checked, not believed.** Every decision below carries a
> file and line, a command, or an arithmetic you can redo. Where something is
> unverified or half-built, it says so.
>
> **Amended 2026-08-26 (same day), after deciding billing starts on iOS only.**
> D11 is corrected, and D15–D16 are added. Every decision is marked:
>
> | | |
> |---|---|
> | ✅ **Built** | in the code on this branch, with a test or a line number |
> | 🟡 **Decided, not built** | the decision is made; the code still does something else, and this file says what |

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

## D1 — A credit is one action  ✅

**Decided:** the user-facing unit is an action, not a quantity of money or tokens.

**Why:** the meter was already pricing actions and pretending otherwise — every
text call floored at the same 5-credit markup regardless of real cost. Naming the
unit honestly removes a currency nobody could reason about.

**Verify:** `backend/src/credits.ts:29-33` · `CONTEXT.md` (Credit / app token) ·
`backend/tests/credits/action-pricing.test.ts` → *"prices a text action at exactly one credit"*

---

## D2 — Three prices: text 1, photo 5, premium 10  ✅

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

## D3 — A photo sent to a premium model is charged once, as a photo  ✅

**Decided:** the image wins the classification.

**Why:** charging both weights would double-bill one request. Photo is the cheaper
of the two on purpose.

**Verify:** `backend/src/credits.ts:327-332` ·
test *"charges a photo sent to a premium model once, at the photo price"*

---

## D4 — The price is known before the call and never adjusted after  ✅

**Decided:** `authorizeAction` prices the request up front; settlement records
what happened and charges nothing further.

**Why:** the reserve → adjust → settle reconciliation existed only because the
charge was derived from actual usage. With a knowable price it is dead code —
including the branch that **drained a user's balance to zero** to cover an overage.

**Verify:** `backend/src/credits.ts:640` (authorize), `:782` (settle) ·
test *"never moves the balance at settlement, however large the actual usage"* ·
`git show main:backend/src/credits.ts | sed -n '/settlement_underfunded/,+8p'` shows what was deleted

---

## D5 — Price and cost are separate columns, permanently  ✅

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

## D6 — Cloud includes text AI unmetered; caps only where cost is real  ✅

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

## D7 — The subscription grants no credits  ✅

**Decided:** `SUBSCRIPTION_MONTHLY_CREDITS` is deleted. Cloud sells the day on
every device and includes AI as a per-call entitlement, not as a monthly balance.

**Why:** it was the last place the subscription still sold credits, contradicting
ADR-0012, and 500 credits/month was ~83 actions — the exhaustion problem, aimed at
the tier that pays us.

**Verify:** `grep -rn "SUBSCRIPTION_MONTHLY_CREDITS" backend/src` returns nothing ·
test *"activates a subscription without granting any credits"*

---

## D8 — Packs, never a per-dollar rate  ✅

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

## D9 — Prices stay at $9 founding / $19 regular  ✅

**Decided:** unchanged.

**Why:** the price was never the problem — what $9 *bought* was. At $9 for the day
on every device with AI included, it is an easy yes; $19 stays defensible against
Sunsama at $20 and Motion at $25.

**Verify:** `backend/src/credits.ts:38-39`

---

## D10 — One flat welcome grant, no cohort  ✅

**Decided:** every new account gets `WELCOME_CREDITS = 50`. The
founding-250 / standard-50 split is gone.

**Why:** ADR-0012 decided in August that founding is a **Cloud price**, not a
credit tier, and that the cohort branch must not be reached. This finishes it.

**Verify:** `backend/src/credits.ts:45` ·
test *"grants the same welcome credits after the founding seats are gone"*

**Amended by D15:** "every new account" becomes "every new identity, including a
Guest". The amount is unchanged.

---

## D11 — A free account is refilled 15 actions a month  🟡

**Decided:** `MONTHLY_FREE_CREDITS = 15`, granted lazily on first use of a calendar
month, to any account without an active subscription, never blocking.

**Why:** `TARGET.md` held this in reserve as the answer *if* people churned at
exhaustion. It costs **$0.0046 per user per month** — under $5 across a thousand
free users — so it is bought now rather than after the churn is measured.

**⚠️ Correction, found 2026-08-26 while deciding D15.** The refill **silently does
nothing for anyone who has no `user_credits` row.** `claim_monthly_free_credits` is
`UPDATE`-only, so when no row exists the statement matches nothing and returns
nothing — which the caller reads as "already claimed this month" rather than as a
failure. Compare `grant_credits` in the 2026-06-24 migration, which is an
`INSERT … ON CONFLICT` upsert and therefore works from a standing start.

Today this is **latent**: an account always has a row, because the D10 welcome grant
creates one. It becomes **live the moment a Guest is granted anything** (D15), since
a Guest has no row at all. It is also a silent fallback, which `CLAUDE.md` forbids.

**Fix:** make `claim_monthly_free_credits` an upsert, matching `grant_credits`.
Correct under either policy — this is not waiting on D15.

**Verify the decision:** `backend/src/credits.ts:47`, `:596`
**Verify the defect:** `grep -n -A6 "FUNCTION claim_monthly_free_credits" supabase/migrations/20260826120000_credit_is_an_action.sql`
— it is an `UPDATE`, not an upsert.

---

## D12 — Existing balances are not migrated  ✅

**Decided:** nothing is converted. An old balance is worth roughly six times more
as actions.

**Why:** across every account in existence that generosity costs under a dollar,
and correcting it downward would cost more in code and goodwill than it saves.

**Verify:** the migration's only `UPDATE user_credits` is inside
`claim_monthly_free_credits` (the D11 refill, and the defect noted there) — no
statement converts an existing balance ·  stated in ADR-0013 → Consequences

---

## D13 — Cost guards, so a bug cannot become a bill  ✅

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

## D14 — Every refusal gets its own status and message  ✅

**Decided:** `insufficient_credits` 402, `account_daily_cap` 429,
`global_ceiling` 503, size limits 413. The message comes from the refusal itself.

**Why:** a client that cannot tell "you are out of credits" from "we paused AI for
everyone today" cannot tell the user what to do. This was a real gap found while
building — the new codes would have fallen through to a 500.

**Verify:** `backend/src/routes/ai.ts:64` and `backend/src/routes/workouts.ts`

---

## D15 — A Guest receives both grants  🟡

**Decided:** a Guest gets the D10 welcome grant (50) and the D11 monthly refill
(15), exactly as an account holder does. Guest mode stops being dry.

**Why the old reason expired:** `startGuestSession` refuses the grant today because
`claim_signup_credit_grant` would have burned a **founding seat** and awarded 250
credits. That branch is gone — founding is a Cloud price (ADR-0012) and the welcome
grant is a flat 50 (D10). Nobody ever decided a Guest must have no AI; it fell out
of a pricing concern that no longer exists.

**Why it has to change:** guest mode is **iOS-only**, and iOS is the launch surface.
"A Guest gets no AI" therefore means the launch surface has **no hook** — and the
hook is the reason `TARGET.md` says anyone starts.

**Why farming is not the risk it looks like:**

| Grant | Our cost | Reinstalls to do $1 of damage |
|---|---|---|
| Welcome, 50 actions | $0.01550 | 64 |
| Monthly, 15 actions | $0.00465 | 215 |

Re-minting a guest identity means reinstalling, which **destroys the Local day** —
one document per person, inside the app container (ADR-0011). The `FREE_DAILY_ACTION_CAP`
of 200 and the $25 global ceiling (D13) bound the rest.

**The inversion worth keeping:** the *monthly* grant is the safer of the two, not
the riskier one. A day-one user loses nothing by reinstalling, so the one-time
welcome grant is the farmable one; the monthly refill only ever reaches someone who
kept the same install for a month, and by then they have a day they will not delete
to harvest 15 actions.

**What the code already says.** The refusal at `backend/src/auth.ts:297-308` does not
merely say no — it names its own successor: *"The guest grant needs its own path and
its own cap — the 'first N devices' dial in TARGET.md, which does not exist yet.
Until it does a Guest starts with no credits."* D15 is that dial, resolved: the path
is the ordinary welcome grant, and the cap is that re-minting a guest identity costs
the farmer their day. Both halves of the original objection — the founding seat and
the $5-instead-of-$1 amount — died with the cohort split (D10).

**Not built.** Two changes, neither made:
1. `backend/src/auth.ts:297-308` — replace the refusal and its now-expired rationale
   with the grant.
2. `claim_monthly_free_credits` must become an upsert first, or the monthly half of
   this silently does nothing (see the D11 correction).

**Verify the current state:** `grep -n -A8 "No credit grant here, deliberately" backend/src/auth.ts`

---

## D16 — A Guest may buy credits; Cloud requires an account  🟡

**Decided:** a Guest can buy the $5 / 300-action pack. A Guest cannot subscribe to
Cloud. Billing is **iOS-only** at launch.

**Why Cloud is different:** not identity — product. Cloud sells "your day on every
device". A Guest has one device and no server copy, so there is nothing for the
subscription to deliver. (Mechanically it is the *safe* one: auto-renewable
subscriptions are restorable through the Apple ID. It is the product that does not
apply, not the plumbing.)

**Why a Guest buying credits is coherent:** credits are keyed to their `users` row
and spent server-side, so they are real and usable without an account. ADR-0012
refuses a wall at the till, aimed at the person who already decided.

**The one real constraint — consumables are not restorable.** Apple does not restore
consumable purchases; the developer must keep the server-side record. So a Guest who
buys credits and later reinstalls loses **money they paid**, not merely a free grant.
That, and nothing else, is what makes this decision hard.

The split that resolves it:

> **Grants follow the identity. Purchases follow the receipt.**

**Three ways to honour the receipt, and the recommendation:**

| | Approach | Cost | Verdict |
|---|---|---|---|
| **A** | Record the purchase against the RevenueCat `app_user_id` + transaction id, and re-attach the remaining balance on restore | a table and a restore endpoint | **Do this when there is revenue worth protecting** |
| **B** | Offer Claim at the purchase moment — "add an email so this survives a reinstall" — once, skippable | one screen | **Do this now** |
| **C** | Require an account to buy | none | **Rejected** — the wall at the till ADR-0012 refuses, aimed at someone who already decided |

**Not built.** No purchase path exists on any surface, and the iOS purchase CTAs are
still hidden behind `!isNativeApp` in `src/pages/SettingsPage.tsx`.

**Verify the current state:** `grep -n "isNativeApp" src/pages/SettingsPage.tsx`

---

## D17 — RevenueCat is the intended iOS rail  🟡

**Decided:** when billing is built, it is App Store billing **through RevenueCat**
rather than raw StoreKit. This does not reopen #201 so much as answer its first
branch.

**Why:** its core abstraction is an entitlement, which is the shape
`activateSubscription` already has; there is an official Capacitor plugin, which
matters given the shell; and it hands back a stable transaction id, which is exactly
the key the `grantTopUp` idempotency gap needs.

**What it costs:** free to **$2,500 monthly tracked revenue**, then ~1%. At $9 that
is free until roughly **275 subscribers**. It sits *on top of* Apple's 15%, not
instead of it.

| | 10 subs | 1,000 subs (~$15k MTR) |
|---|---|---|
| Apple 15% | −$14 | −$2,250 |
| RevenueCat | $0 | ~$125–150 |
| Net margin | 68% | ~82% |

**The architectural rule:** gate `/api/sync` on our own `user_credit_subscriptions`
row, updated by webhook — **never** on the client's RevenueCat entitlement. A
client-asserted entitlement is a client-asserted entitlement.

**Webhook mapping:**

| Event | Call |
|---|---|
| `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION` | `activateSubscription(userId, { active: true })` |
| `CANCELLATION` | no-op — the entitlement runs to expiry |
| `EXPIRATION`, `BILLING_ISSUE` past grace | `activateSubscription(userId, { active: false })` |
| `NON_RENEWING_PURCHASE` | `grantTopUp(userId, 5)` — **after** the idempotency fix |
| `TRANSFER` | the identity case in D16 |

**Not built, and not urgent.** The standing advice is unchanged: do not build
billing before customer #10. This decides *how*, not *when*.

**Unverified:** whether RevenueCat's 1% applies to gross MTR or only to the excess
above $2,500 was inconsistent across sources. It changes nothing material — confirm
at signup.

---

## What was rejected, and why

| Option | Why not |
|---|---|
| Restore the original 1,000-per-$1 sell rate | Pure, and not a business: cost-plus-25% on a heavy user earns **$0.007/month**. Its premise — that AI is the dominant cost — is false at these models. |
| Keep credits as a cost unit, just enlarge the pack | Leaves a unit nobody can reason about. "You have 1,400 credits" answers no question a person is asking. |
| Meter text on the paid tier too | Recreates the exhaustion moment on the tier that pays us, to protect $0.0003. |
| Flat subscription, no credits at all | Removes the path for someone who will not subscribe, and the only lever on image and premium cost. |
| Keep Guests dry, so nothing can be farmed | The launch surface is iOS, guest mode is iOS-only, so this leaves the entry experience with no hook. Farming costs the farmer their day; it costs us under two cents. (D15) |
| Require an account before buying | A wall at the till, aimed at the person who already decided — the thing ADR-0012 exists to refuse. (D16) |
| Let a Guest subscribe to Cloud | Cloud sells the day on every device. A Guest has one device and no server copy, so it would sell them nothing. (D16) |

---

## What was NOT decided

- **When billing ships.** D17 decides the rail; nothing decides the date, and
  [#201](https://github.com/lermanori/HealthyFlow/issues/201) is still open.
  **Nobody can pay today**, on any surface.
- **The web rail.** Billing is iOS-only at launch (D16). Whether the web ever sells
  anything — RevenueCat Web Billing, Stripe, or nothing — is untouched.
- **Which purchase-recovery option ships** — A or B in D16. B is recommended now,
  A when there is revenue to protect.
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
5. **`claim_monthly_free_credits` is `UPDATE`-only**, so the monthly refill silently
   no-ops for anyone without a `user_credits` row — every Guest. Latent today,
   live the moment D15 ships. See the D11 correction.
6. **D15, D16 and D17 are decided and not built.** The code still refuses a Guest
   any credits, hides every purchase CTA on iOS, and has no rail.

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

**What these commands cannot tell you:** nothing here verifies D15, D16 or D17,
because none of them is built. They are decisions recorded ahead of the code, marked
🟡 throughout, and the "Verify the current state" line under each one shows the code
still doing the old thing. When they ship, those lines are what should change first.
