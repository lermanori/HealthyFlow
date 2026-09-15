# ADR 0026 — the monthly grant requires a proven address

**Status**: Accepted

**Decision date**: 2026-09-15

**Narrows** [ADR-0025](./0025-email-verification-and-self-serve-recovery.md),
which said verification "gates recovery, never access". That is no longer true
of one thing: the recurring monthly free grant. It remains true of everything
else — the day, sync, and credits already held are untouched.

**Does not change** [ADR-0018](./0018-a-guest-receives-ten-actions-once.md) or
[ADR-0023](./0023-the-guest-grant-is-reserved-per-network.md).

## Context

ADR-0023 closed reinstall farming of the Guest grant by reserving it per network
per day. It did not touch the other grant. A claimed account receives
`MONTHLY_FREE_CREDITS` every calendar month, forever, and the only thing needed
to mint one is an email address that is typed, never read.

That makes the monthly grant the more valuable thing to farm and the cheaper one
to reach. Ten actions once is worth little; fifteen a month in perpetuity, times
as many addresses as someone cares to invent, is worth real money — and every
action is paid for by the founder against a global daily ceiling shared with
everyone honest.

Verification was already built for recovery (ADR-0025). Requiring it here costs
a farmer an inbox per account, which is the expensive half of the exercise, and
costs an honest person one click they were being asked for anyway.

## Decision

**The recurring monthly grant requires a verified address. Nothing else does.**

**A Guest is untouched.** Their ten are already held to one per network per day
(ADR-0023), and they are how someone tries the app before deciding whether to
sign up at all. Putting a verification wall in front of that would gate the
trial on an account the person has not chosen to create.

**Credits already held stay spendable.** Someone who claims a Guest account
keeps whatever remained of their ten. `ensureCanSpend` reserves before it
refuses, so the gate withholds the next grant and never confiscates the last
one. A refusal only fires when there is genuinely nothing left.

**Accounts created before this date are eligible regardless**, keyed to
`created_at` against `VERIFICATION_REQUIRED_FROM`. They were given an allowance
under the old rule, and interrupting them for a condition that did not exist
when they signed up punishes the wrong people. Farming is prospective, so
nothing is lost.

**Grandfathering is deliberately *not* done by backfilling
`email_verified_at`.** That column is also what permits a password reset. Marking
old addresses proven to protect their credits would hand out account recovery on
addresses nobody ever proved — trading a credits problem for an account-takeover
one. The two meanings must not be conflated, which is why the exemption is a
date and not a stamp.

**The refusal is its own state and its own message.** `email_unverified` sits
beside `network_limited` in the free-grant contract for the same reason that one
exists: telling someone they used fifteen actions they were never given is a
lie, and it hides the one thing they can actually do about it.

**The rule lives in one function.** `Credits.monthlyGrantEligibility` is called
by both the grant path and the summary read, because a screen that explains one
rule while the server enforces another is worse than either rule alone.

## Consequences

- A client reads the summary through `ReadableCreditSummarySchema`, which
  degrades an unrecognised grant state to `unavailable` rather than failing the
  whole summary. Shipping `network_limited` broke every client that predated it;
  an iOS build can be weeks old with no way to force an update, so the reader
  bends instead of the server waiting.
- An unverified account can still use the app fully, sync, and spend credits it
  holds. What it cannot do is receive next month's fifteen.
- Someone who never verifies keeps a working account with no free AI. That is a
  state they can leave at any time, from the prompt already in Settings.
- The gate is applied in TypeScript rather than inside the grant RPC. The race —
  verifying between the check and the grant — costs a retry and never an
  allowance, which is cheaper than two copies of the rule.
