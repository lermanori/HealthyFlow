# ADR 0017 — Claim unlocks the monthly free actions

**Status**: Accepted

**Decision date**: 2026-08-27

**Recorded**: 2026-09-06

**Amends**: ADR-0016

## Context

ADR-0016 changed a Credit from a unit of provider cost into one user-facing
action. It also placed two free grants: `WELCOME_CREDITS = 50` when an account was
created and `MONTHLY_FREE_CREDITS = 15` each month.

The product decision made the following day removed the welcome grant and put the
monthly allowance behind Claim. A Guest identity can be recreated, so giving a
Guest a recurring server-funded allowance would make reinstalling or creating
identities the grant mechanism. Claim supplies the durable account identity that
the allowance needs without putting an account in front of the offline day.

The app's day remains local for Guests and free accounts. There is no truthful
server-side proxy for general app activity, and adding device fingerprinting would
punish legitimate multi-device use while failing to cover the web consistently.

## Decision

### 1. Claim grants no welcome actions

Creating or Claiming an account adds zero Credits. The old
`WELCOME_CREDITS` grant is removed rather than repriced. Historical balances and
historical grant records are not clawed back or rewritten.

### 2. A claimed free account receives 15 actions per calendar month

`MONTHLY_FREE_CREDITS = 15` is granted lazily when an eligible account requests
its first AI action in a calendar month. The grant is additive and recorded in the
existing ledger as `monthly_free_refill`.

Eligibility must be enforced atomically in the database operation, not only by a
TypeScript caller:

- the HealthyFlow user is a claimed account rather than a Guest;
- the account does not hold an active Cloud subscription; and
- it has not already received that calendar month's grant.

The attempted AI action is the activity check. No scheduler grants dormant rows,
and no separate `last_seen`, DeviceCheck, Keychain identifier or fingerprint is
introduced.

### 3. Refill failure is not “nothing to grant”

An eligibility read or refill write that fails is an explicit unavailable result.
It must never be converted to the same `null` or empty result used for an account
that already received the grant. The AI request may proceed only through a typed,
deliberate outcome; it cannot silently charge a balance or refuse for insufficient
Credits after hiding a failed refill.

## Consequences

- Guest mode stays useful, offline and AI-free. Claim buys a recoverable identity,
  the ability to purchase, and a small recurring taste of AI.
- Signup and Claim copy cannot promise a one-time grant.
- The founding cohort governs the discounted Cloud price only. It never selects a
  Credit grant.
- Purchased and previously held Credits remain untouched. The monthly grant can
  accumulate because Credits in the current ledger do not expire; consuming an
  older balance is not made conditional on its source.
- The refill migration must join eligibility to the user and subscription records
  while keeping the month claim atomic.
- Abuse protection remains the account gate, the lazy grant and the global cost
  ceiling. More identity machinery is added only in response to measured abuse.
- Claim conversion before and after the day-setup finish line is the measurement
  for whether this allowance and its placement work.

Any later alteration gets a new ADR that amends this one. This record remains the
reason the welcome grant was removed and the monthly allowance was account-gated.
