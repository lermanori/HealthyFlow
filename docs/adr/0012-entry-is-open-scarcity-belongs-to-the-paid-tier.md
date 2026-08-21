# ADR 0012 — Entry is open; scarcity belongs to the paid tier

**Status**: Accepted
**Date**: 2026-08-21
**Supersedes**: the consequence in ADR-0010 that a path turning a Guest into an
account holder must consume a public signup slot. ADR-0010 is otherwise unchanged
and is not edited — it was right about what it decided.

## Context

Guest mode shipped on 2026-08-21. Someone can install the iPhone app, open it, and
use their whole day without an account, a network, or being asked for anything.
That removed the wall at the front door.

Designing Claim — the path from Guest to account holder — put a wall back at the
till. Account creation "fails closed": `Waitlist.authorizeSignup` gates it on
`public_slots_open`, and when slots are exhausted the create-account tab does not
render at all. Applied to Claim, a Guest who has been using the app for a month
and now wants to **pay us** is shown a waitlist.

Two other things were unresolved at the same moment, and all three turned out to
be one question:

- Whether existing account holders keep server-hosted day data, now that server
  storage *is* the paid tier (open question in `HANDOFF.md`).
- What "founding" means. `claim_signup_credit_grant` awards 250 credits and burns
  one of 100 founding seats, so founding is currently a **credit** cohort, while
  `TARGET.md` sells Cloud as the subscription.

## Decision

**Entry is open. Scarcity attaches to the thing being sold, not to the door.**

Four parts:

### 1. Local is the source for everyone

An account holder's day lives on their device exactly as a Guest's does. Cloud
replicates on top of it; it is never the source. One storage architecture, not
two, and `TARGET.md`'s second refusal — *never require a network* — becomes true
for everybody rather than for Guests only.

This answers the grandfathering question by dissolving it: an existing account
holder's hosted day comes **down** to the device the first time they sign in on
one. Nothing is grandfathered because there are no longer two classes of storage.

### 2. Claim consumes no signup slot and hits no waitlist

Someone already using the product is not a cold signup. Claim is an `UPDATE` on a
row that already exists; it creates no account and takes no seat.

### 3. The quota moves to Cloud

`public_slots_open` and the founding cohort stop meaning "who may create an
account" and start meaning **"who gets the founders' discount on Cloud."** The
counter, the copy and the scarcity survive; what they gate changes.

### 4. Credits and Cloud are separate products

| | Type | Quota |
|---|---|---|
| **AI credits** | Consumable — buys effortless input | None. Anyone may buy any amount |
| **Cloud** | Subscription — buys the day on every device | The founders' discount is capped |

"Founding" is therefore no longer a credit concept. `claim_signup_credit_grant`'s
founding branch describes the wrong product and must not be reached from Claim.

## Why not the alternatives

| Option | Why not |
|---|---|
| Keep the slot gate on Claim | A Guest who wants to pay meets a waitlist, and their day is stuck on one device until a stranger's slot frees. Scarcity aimed at the wrong person. |
| Exempt Claim but keep gating cold signup | Coherent, and it was the narrower fix. But it leaves the founding cohort attached to credits, so the more valuable question — what scarcity is *for* — stays unasked. |
| Drop the waitlist entirely | Throws away a working cost-control dial and the only lever on early-adopter pricing. The mechanism is good; it was pointed at the wrong product. |
| Host account holders' data, keep local for Guests | Two storage architectures forever, and the offline refusal stays false for anyone with an account. |

## Consequences

- **`TARGET.md`'s Money section changes.** Founding is a Cloud discount, not a
  credit cohort. The two products are stated separately.
- **The signup path stops calling `Waitlist.authorizeSignup`**, and
  `claimed_public_signup_slot` stops being written on that path. The column and the
  counter stay — Cloud needs them.
- **The login page's "N spots left" copy is now false** and must move to wherever
  Cloud is sold.
- **Claim grants no credits**, and the "first N devices receive $1 on first open"
  dial in `TARGET.md` remains unplaced. It is a growth lever and wants evidence
  rather than a default. Until it lands, **a claiming Guest has zero credits**:
  the whole day, no AI.
- **Signing in to an existing account moves data downward** and is a different
  operation from Claim. It needs the device to hold every record type first,
  including Health, which ADR-0011 left out.
- **A Guest who signs in to an existing account forfeits their guest row's credit
  balance**, stated plainly before they do it. Credits are keyed to a row, and
  that row is being abandoned.
