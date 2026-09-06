# v1 launch plan — free, without payments

> **Written 2026-09-06.** A dated document in `docs/history/` — it records the plan
> as agreed on that date and is not maintained. Where it disagrees with
> `TARGET.md`, `CONTEXT.md` or an ADR, those win.

> **The decision:** v1 ships to the App Store **free, with no purchase rail of any
> kind**. A Guest receives a one-time grant of **10 actions**; a claimed account
> receives **15 actions every calendar month**. Cloud cannot be bought and
> therefore cannot be held. Anyone who wants more actions reaches the founder
> directly through the **Founders Club**, and receives them by hand.

The same route as a map:
<https://claude.ai/code/artifact/1a1d967b-09aa-4452-904f-14d3536988f9>

---

## The route, in order

Two lanes run at once. The left is work; the right is waiting, which is why it
starts first even though it finishes last.

**Station 0 — before anything else.** Land the pricing migration. This is not a
launch task; it is a production outage today. Merge PR #227, apply
`20260906131500_credit_is_an_action.sql` to production, verify one AI action end to
end on a device. Detail in §8.

**Then, in parallel:**

| # | Build lane — your hands | Detail |
|---|---|---|
| B1 | Guest grant: second migration, `guest_grant_claimed_at` + `claim_guest_initial_credits` | §3 |
| B2 | Grant resolver by identity, and the typed `freeGrant` entitlement | §3.3, §4 |
| B3 | Running out: delete the global 402 toast, refuse inline in Talk and Settings | §5 |
| B4 | Founders Club: message kinds, `replyTo`, un-hide on native | §6 |
| B5 | Strip the storefront and sweep the copy from *credits* to *actions* | §7 |
| B6 | **Account recovery** — email verification and self-serve reset | §10 |
| B7 | Landing page: remove the invite-only beta, the waitlist and the founding tier | §7 |
| B8 | ADR-0018, ADR-0019, `TARGET.md`, `CONTEXT.md` | §9 |

| # | Apple lane — their queue | Detail |
|---|---|---|
| A1 | **DSA trader status — start today.** The only paperwork a *free* app still needs, and Apple publishes no turnaround for it | §1 |
| A2 | Paid Apps agreement, banking, W-8BEN, compliance review, Small Business Program — **not** v1 blockers; start them anyway, because they are pure wall clock for v1.1 | §1 |
| A3 | Book the accountant. A free app produces no income, so this is not a v1 blocker, but it has a lead time v1.1 cannot skip | §1 |

**Both lanes rejoin:**

1. **App Store Connect** — metadata, screenshots, age rating, review notes, privacy
   disclosures. State plainly that the day lives on the device (§2).
2. **The verification gate** — both typechecks, both suites, lint, the iOS build,
   then the simulator pass including the privacy deep link and the Today widget.
   Commands in `docs/runbooks/ios.md`.
3. **TestFlight** — archive validation, internal distribution, a fresh-account smoke
   test on a real iPhone.
4. **App Review** — a build with no in-app purchase cannot be rejected for a
   purchase problem. That is the whole reason this version goes first.
5. **HealthyFlow v1 is on the App Store.**

**B6 is the one to watch.** It is the only launch blocker on the build lane that
this plan does not design, and it is easy to lose between the two.

---

## 1. Why this exists

The product is finished and the payment rail is not. As of 2026-09-06 both
typechecks, 276 frontend tests, 857 backend tests and the production build pass,
and the backend and `healthyflow.app` are live. Every remaining blocker to a paid
launch is commercial-operational wall clock that had not been started:

| Blocker | Wall clock |
|---|---|
| Paid Apps agreement → banking → W-8BEN → compliance review | hours to **14 business days** |
| App Store Small Business Program | effective **next fiscal month** |
| DSA trader status | **no published SLA** |
| Israeli accountant, VAT and self-employed registration | before the first sale |
| #223, #224 — RevenueCat and StoreKit | not one line written |

Shipping free removes all of it from the critical path and starts the App Review
relationship on a build that cannot be rejected for purchase problems.

**Deferred, not cut.** #222, #223 and #224 stay on the board. ADR-0015's choice of
Apple IAP through RevenueCat is unchanged; it is simply not v1.

**The one item that does not drop off** is DSA trader status. `docs/runbooks/paid-apps-setup.md`
records that every developer must declare it, and that without it the app cannot be
distributed in EU territories — free or paid.

---

## 2. What each identity gets

| | Actions | Recurs? | Cloud | Can buy |
|---|---|---|---|---|
| **Guest** | 10, once | No | No | Nothing |
| **Claimed account** | 15 per calendar month | Yes | No | Nothing |

`GUEST_INITIAL_CREDITS = 10`, `MONTHLY_FREE_CREDITS = 15` (unchanged).

**10 against 15 is deliberate.** The Guest grant has to be big enough that Talk
proves itself — Talk is the hook and the reason anyone stays — and small enough
that signing up is a visible upgrade. Two-thirds of a month is that line.

**Claim converts the user row in place** (`backend/src/auth.ts:311`), so a Guest's
unspent balance survives signup. Someone with 3 left who claims lands on 3 + 15,
not 15. This is existing behaviour and is correct.

### What a free account does *not* get

`backend/src/routes/sync.ts:21` hard-gates sync on an active Cloud subscription.
No subscription can exist in v1, so **v1 ships local-only, with no backup.** A
reinstall or a new phone loses the day. This is consistent with ADR-0011 and with
`TARGET.md`'s promise that the app works offline and needs no account, but it must
be said plainly in the App Store description and in the app rather than discovered.

---

## 3. The grant mechanism

### 3.1 The trap this avoids

`claim_monthly_free_credits` gates on two things: `users.email IS NOT NULL`, which
is how "claimed account" is expressed, and `last_free_refill_month < refill_month`
(`supabase/migrations/20260906131500_credit_is_an_action.sql:87`).

If the Guest grant were to write `last_free_refill_month`, a Guest who installs on
the 3rd and signs up on the 10th would receive **nothing** until the 1st of the
following month — precisely inverting the incentive this design exists to create.

**The Guest grant must never touch `last_free_refill_month`.**

### 3.2 The RPC

A new column `user_credits.guest_grant_claimed_at TIMESTAMPTZ`, and a new function
mirroring the monthly one:

```
claim_guest_initial_credits(p_user_id UUID, p_credits INT)
  RETURNS TABLE (status TEXT, balance INTEGER)
```

- **Eligible when** `users.email IS NULL` *and* `guest_grant_claimed_at IS NULL`
- Adds `p_credits` to `balance` and `topup_balance`, stamps `guest_grant_claimed_at`
- Writes `ai_usage_log` with `reason: 'guest_initial_grant'`
- Returns `granted` or `already_claimed`; raises on a failed write

**A separate function rather than a branch inside the monthly one**, because the
two differ on every predicate: `email IS NULL` against `email IS NOT NULL`,
once-ever against once-per-month, and a different marker column. One function
serving both would carry every condition twice.

**Not `signup_credit_grants`.** That table is deliberately retired — the migration
drops its function and comments it as historical with no executable path. Reviving
it would contradict ADR-0017.

### 3.3 Where it fires

The same place the monthly refill fires: the first AI action of the period, in
`backend/src/credits.ts`. One resolver chooses by identity — Guest to the initial
grant, claimed account to the monthly grant.

Lazy, following ADR-0017's reasoning that the attempted action *is* the activity
check. Consequences that fall out of it:

- Someone who never opens Talk costs nothing.
- **Guests already in production pick the grant up on their next AI action.** No
  backfill, no migration of existing rows.
- A bot hitting `POST /auth/guest` writes no credit row.

ADR-0017 §3 carries over unchanged: a failed eligibility read or grant write is an
explicit `unavailable`, never converted into the `already_claimed` result. A failed
read is not an empty result.

### 3.4 Why farming is not a threat

ADR-0017 gated the allowance on an account because a *recurring* server-funded
grant is farmable by reinstalling. A one-time grant is a different object, and
three existing controls already bound it:

| Control | Where |
|---|---|
| Guest creation limited to 5 per 15 minutes per IP | `backend/src/routes/auth.ts:68` |
| A text action costs $0.0003 — 10 actions is **$0.003 per install** | ADR-0016 |
| `GLOBAL_DAILY_COST_CEILING_USD = 25` refuses rather than absorbing | `backend/src/credits.ts:69` |

**Build nothing else.** No DeviceCheck, no Keychain identifier, no fingerprinting —
per-device is the wrong unit for the same reasons ADR-0017 gave.

---

## 4. Showing the entitlement before it exists

The grant is lazy, so a fresh Guest's stored balance is 0 until their first AI
action. Rendering that as "0 actions" would be a lie about what they have.

`getCreditSummary` gains a typed field. Not a number folded into the balance —
that would claim a grant had happened before it had:

```ts
freeGrant:
  | { state: 'available'; credits: number; kind: 'guest_initial' | 'monthly' }
  | { state: 'claimed' }
  | { state: 'unavailable'; reason: string }
```

The UI renders `balance + freeGrant.credits` as **actions available** when the
state is `available`. When it is `unavailable` the surface says the balance could
not be read. **It never renders 0 and never renders a guess** — Capacity never
guesses, and a failed read is never an empty result.

---

## 5. Running out

`src/services/api.ts:118` currently fires a global toast on any 402 —
*"Out of AI credits. Open Settings to subscribe or buy more."* — on native
included. It points at a purchase path that will not exist. **It is deleted.**

The refusal is rendered inline, against the turn that failed, in Talk and in
Settings' AI panel. Nothing else in the app is interrupted; the rest of the day
keeps working exactly as before.

| Who | What it says | Actions |
|---|---|---|
| **Guest, out** | Create a free account — 15 actions every month | Primary: `/claim`. Secondary: Founders Club |
| **Claimed, out** | You've used this month's 15 actions. They renew on ‹date›. | Founders Club only — there is nothing to sell |

---

## 6. The Founders Club

The direct line to the founder: the request channel for more actions, the feedback
channel, and the research channel `TARGET.md` admits the product does not have.

**Nothing here is new.** `POST /api/contact-messages` stores the message
(`backend/src/routes/contact-messages.ts:13`), the Token Manager reads and filters
the queue (`src/pages/TokenManagerPage.tsx:78`), and `Credits.grantTopUp` and
`Credits.setBalance` already grant by hand (`backend/src/routes/admin.ts:161`).
The loop exists and is hidden. This re-frames and un-hides it.

### 6.1 Changes

**Message kinds.** `z.enum(['subscribe', 'topup'])` becomes
`z.enum(['feedback', 'more_actions'])` — the two things actually triaged in Token
Manager: read it, or grant them. *Founders Club* names the surface, not a kind.

**Reply-to.** `replyTo` is added to the schema, optional in general and **required
when the sender's user row has no email**. Without it a Guest writes to the founder
and is unreachable. Enforced server-side, not by a client check.

**Un-hide on native.** The `!isNativeApp` condition comes off the contact flow at
`src/pages/SettingsPage.tsx:823`. The `mailto:` link is removed — the server-side
POST needs no configured mail client and lands where it can be acted on.

**Entry points.** Settings, and the secondary action on the out-of-actions refusal.

### 6.2 Copy, and the Apple boundary

**In the iOS build there is no price, and none of the words *buy*, *subscribe*,
*top up*, *purchase* or *pay*.** Actions are granted free at the founder's
discretion, so no purchase occurs and App Review Guideline 3.1.1 has nothing to
attach to. A price adjacent to a contact path is exactly what a reviewer looks for.

> **Founders Club** — you're one of the first people using this. Tell us what's
> working and what isn't. Need more actions? Ask.

**The web build ships the same copy in v1.** It is not *required* to — Apple does
not govern the web app, so it is the one surface free to discuss arranging payment
if that later becomes useful. v1 does not, because two copies of one message is a
drift risk for no gain while nothing can be bought anywhere.

### 6.3 The vocabulary collision

`TARGET.md` states that *"'Founding' is a price, not a credit cohort."* A Founders
Club whose members receive extra actions is a credit cohort. In v1 the collision is
dormant — there is no Cloud price anywhere in the app — but it wakes the moment
payments land.

**`CONTEXT.md` gains a row in "Words that collide":** *Founders Club* is the group
of early users with a direct line to the founder. *Founding price* is the capped
discount on Cloud. Membership grants no price and a price grants no membership.

---

## 7. What is removed for v1

| Removed | Where | Why |
|---|---|---|
| The `$9/month` card, Subscribe and Buy buttons | `src/pages/SettingsPage.tsx:793` | The only block in the panel **not** gated on `!isNativeApp`. Renders a price on iOS behind buttons whose modal is native-gated, so they do nothing. 3.1.1 risk and a dead control |
| The global 402 toast | `src/services/api.ts:118` | Points at a purchase path that will not exist |
| The `mailto:` fulfilment link | `src/pages/SettingsPage.tsx` contact modal | Superseded by the server-side POST |
| Founding tier and waitlist | `public/landing.html:692`, `:906` | Sells an invite-only beta that product decisions abolished |
| *"Most quick text analyses use about 5-15 credits"* | `src/pages/SettingsPage.tsx:786` | The pre-ADR-0016 cost model. Text is **1** action |
| *"what lets you buy AI credits"* | `src/pages/ClaimAccountPage.tsx:66` | Claim's pitch is now 15 actions every month |

Throughout: **credits → actions** in user-facing copy, per `TARGET.md`.

---

## 8. Dependencies

This design sits on top of two things that must land first:

1. **PR #227 merges** — `main` carries two migration files at version
   `20260826120000` (`add_goals`, already applied remotely, and
   `credit_is_an_action`). Supabase cannot distinguish them.
2. **`20260906131500_credit_is_an_action.sql` is applied to production.** Until it
   is, `main` cannot serve AI at all: `insertUsageLog` writes `cost_usd` and
   `action_class`, `sumAiCostUsdSince` reads `cost_usd` on every request, and
   `claim_monthly_free_credits` does not exist in production.

The RPC in §3.2 is a **second migration on that base**, not an edit to it.

---

## 9. Documents this rewrites

| Document | Change |
|---|---|
| **ADR-0018** (new) | Amends ADR-0017: a Guest receives a one-time initial grant. §2's reasoning survives intact — it was about a *recurring* allowance |
| **ADR-0019** (new) | v1 ships with no purchase rail. ADR-0015 is deferred, not reversed |
| `TARGET.md` — Money | Describes a rail v1 does not have, and a Cloud tier nobody can hold |
| `CONTEXT.md` | The Founders Club / Founding price collision (§6.3) |
| `backend/src/auth.ts:292` | The comment asserts a Guest is AI-free and cites ADR-0017 |
| `backend/src/auth.ts:307` | The Claim comment says credits are a purchase |
| `docs/runbooks/paid-apps-setup.md` | Record that v1 ships free and which steps still apply (DSA does) |

---

## 10. Out of scope

- Anything in #222, #223 or #224 beyond DSA trader status.
- Making Cloud obtainable, by purchase or by grant. Sync stays subscription-gated
  and therefore unreachable in v1.
- Account recovery — no email verification and no self-serve password reset exist
  (`backend/src/routes/auth.ts:468` is `ADMIN_TOKEN`-gated). **This is a separate
  launch blocker and is not solved here.**
- App Store Connect metadata, screenshots, age rating and review notes.
