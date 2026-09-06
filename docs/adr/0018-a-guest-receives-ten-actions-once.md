# ADR 0018 — A Guest receives ten actions once

**Status**: Accepted

**Decision date**: 2026-09-06

**Amends**: ADR-0017

## Context

ADR-0017 removed the welcome grant and required a claimed account for the
recurring monthly allowance. Its concern was a renewable server-funded grant: a
Guest identity can be recreated, so a recurring Guest allowance would make new
identities the refill mechanism.

That decision left Talk—the product's input hook—unavailable until Claim. The
founder chose a bounded way for someone to prove Talk before creating an account:
ten actions once for each Guest row. This is not a recurring allowance and does
not weaken the account gate on the monthly grant.

## Decision

### 1. A Guest receives ten actions once

`GUEST_INITIAL_CREDITS = 10` is granted lazily when a Guest requests their first
AI action. Starting a Guest session does not write a credit row or grant anything;
someone who never tries AI costs nothing.

The grant is additive. It does not replace an existing balance, expire, or depend
on when the Guest row was created. Guests already in production become eligible
on their next AI action without a backfill.

### 2. The Guest grant has its own atomic marker and operation

The Guest grant is claimed by an atomic database operation using a dedicated
`guest_grant_claimed_at` marker. It is eligible only when the user still has no
email and the marker is unset. The operation writes `guest_initial_grant` to the
AI usage ledger and cannot grant twice under retries or concurrency.

It never reads or writes `last_free_refill_month`. The monthly operation never
reads or writes `guest_grant_claimed_at`. One function does not serve both grants,
because their identity predicates and recurrence rules are opposites.

### 3. Entitlement is distinct from stored balance

Before the lazy write, a fresh Guest has a stored balance of zero and an available
grant of ten. The credit summary represents that truth as a typed entitlement—
available, claimed, or unavailable—rather than pretending the balance already
contains the grant.

A failed identity read, eligibility read, or grant write is unavailable. It is
never converted into already claimed, zero actions, or an empty result.

### 4. Claim preserves both value and independent eligibility

Claim converts the Guest row in place, so unused Guest actions remain on the same
balance. The Guest marker does not consume the account's monthly eligibility: the
first eligible claimed-account AI action in that calendar month may still add the
fifteen actions defined by ADR-0017.

## Consequences

- A Guest can try Talk without an account and can exhaust only the AI allowance,
  never the Local day or Guest mode.
- The recurring allowance remains account-gated at fifteen actions per calendar
  month. There is still no welcome grant for creating or Claiming an account.
- Abuse controls remain the existing Guest-creation rate limit, lazy grant, and
  global daily cost ceiling. No DeviceCheck, fingerprint, Keychain id, or client
  secret is introduced without evidence and a later decision.
- User-facing availability may include an unclaimed free entitlement, but stored
  balances and ledger rows remain facts about writes that actually occurred.

Any later alteration gets a new ADR that amends this one. ADR-0017 remains the
reason the recurring allowance requires a claimed account.
