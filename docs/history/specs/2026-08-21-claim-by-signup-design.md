# Claim by signup

**Date:** 2026-08-21
**Status:** Approved design, not yet implemented
**Scope:** Piece 1 of 3. See "What this does not cover".

## The problem

A Guest cannot become an account holder. There is no endpoint, no entry point, and
no way out of guest identity — which means a Guest cannot buy credits, so **the
paid product is unreachable from the free one.** Guest mode shipped on
2026-08-21 and closed the front door; this closes the till.

## The invariant

**The `userId` never changes.** Claim is a single `UPDATE` on the row the Guest
already holds. The Local day is keyed on that id, so it is still keyed correctly
the instant the statement commits.

There is no state in which the day is half-moved, because the day never moves.
Every failure leaves the Guest a Guest, with their day intact and their session
still valid. This is the property the whole design exists to preserve, and any
change that breaks it — an upload, a new row, a re-key — is a different design.

`CONTEXT.md`'s original Claim wording, *"it happens in place, so nothing moves and
nothing can be lost"*, is true again for this path and should be restored.

## Decisions this records

Three of these reverse something previously written down.

| Decision | Reverses |
|---|---|
| **Local is the source for everyone; Cloud replicates on top.** An account holder's day lives on the device exactly as a Guest's does. | The open question in `HANDOFF.md` about grandfathering existing account holders |
| **Entry is open. Claim consumes no public signup slot and hits no waitlist.** | ADR-0010's consequence that "any path that turns a Guest into an account holder must" consume a slot |
| **The quota moves to Cloud.** `public_slots_open` and the founding cohort stop gating account creation and become the founders' discount on the Cloud subscription. | `TARGET.md`'s Money section, which describes founding as a credit cohort |
| **Credits and Cloud are separate products.** Credits buy AI and have no quota; Cloud buys backup and multi-device and carries the quota. | The single "signup credits" cohort concept |
| **Claim grants no credits.** | Nothing — this is new, and deliberate |

**Why entry is open.** Guest mode removed the account wall at the front door.
Making Claim consume a scarce slot puts one at the till: a Guest who wants to pay
gets a waitlist. Scarcity belongs on the thing being sold, not on entry.

**Why Claim grants no credits.** Under the split above, credits are a purchase.
`TARGET.md`'s "first N devices receive $1 of credits on first open" is a growth
lever whose placement is undecided — first open, signup, or elsewhere — and wiring
it into Claim would settle that question by accident. It stays out until it is
chosen deliberately. **Consequence: until that grant exists, a claiming Guest has
zero credits and therefore no AI.** They get the whole day, which is the free tier
`TARGET.md` describes, without the taster.

## The endpoint

`POST /auth/claim`, authenticated. The token *is* the identity — no user id in the
body, so a caller can only ever claim their own row.

The write is one guarded statement:

```sql
UPDATE users
   SET email = $1, password_hash = $2, name = $3, signup_method = $4,
       google_auth_subject = $5, apple_auth_subject = $6
 WHERE id = $7 AND email IS NULL
```

Two things about that `WHERE`:

- **`AND email IS NULL` makes "you must still be a Guest" atomic.** A check-then-act
  would let two concurrent claims both pass the check. Here the second matches no
  rows and the route answers `403`.
- **`email` and `signup_method` must be set in the same statement.** The
  `users_guest_has_no_email` CHECK is `signup_method <> 'guest' OR email IS NULL`,
  so writing either alone fails.

Zero rows updated is a real outcome, not an error to swallow: it means the row was
claimed already or was never a Guest.

The route stays thin — validate with Zod, call `Auth.claimGuestAccount`, return.
The service owns identity resolution; `db.claimGuestAccount` owns the statement.

The response is the standard `{ user, token }` session, with the **account
lifetime of `'7d'`** rather than the guest `'365d'`. Expiry is affordable again
the moment there is a password to sign back in with (ADR-0010).

## Three ways in, one conversion

### Email and password

Validate shape, confirm the address is free, hash, update.

### Google and Apple

Verify the provider token through Supabase exactly as `exchangeProviderSession`
does — the same `isVerifiedProviderUser` check, the same refusal when no verified
email comes back. Then resolve in this order:

| Lookup | Meaning | Result |
|---|---|---|
| A row already holds this **subject** | The provider identity belongs to an account | Refuse `409` |
| A row already holds this **email** | The address belongs to an account | Refuse `409` |
| Neither | Free to attach | Attach subject + email to the guest row |

Both refusals point the user at signing in instead, which is piece 3. **Claim
never creates a row and never deletes one.** It converts the one row it was given,
or it refuses.

The guest row already carries an unguessable random `password_hash` from
`startGuestSession`, so the provider paths leave it untouched — the same thing
provider signup does today.

## What Claim deliberately does not do

- **No `Waitlist.authorizeSignup`, no public slot.** Entry is open.
- **No founding seat, no `claim_signup_credit_grant`.** Credits and Cloud are
  separate products and the founding cohort now belongs to Cloud.
- **No `Onboarding.seedNewUser`.** It writes user settings, which are day data and
  live on the device. Same reasoning as the guest path.
- **No upload.** Nothing moves.

## The client

### Entry point

The account block at the foot of the menu — the slot Logout occupies, which is
empty for a Guest because a Guest cannot log out (ADR-0011). The symmetry is exact:

| | That slot holds |
|---|---|
| Account holder | Logout |
| Guest | **Create an account** |

The identity line directly above already reads *"On this iPhone only"*, which is
what makes the button legible. The same treatment applies in the desktop header
menu, which has the same `canExitSession` slot.

**Sign in is not in this piece.** It needs the download, which needs Health on the
device. A second button that does nothing for two pieces of work is worse than an
absent one; it joins the slot in piece 3.

### The screen

Email, password, name, plus Continue with Google and Continue with Apple — the
same three the login screen offers.

The copy says what changes, and it is short: **your day stays exactly where it is;
an email is what makes it recoverable.** That mirrors the disclosure already on the
guest entry point, and it is true rather than reassuring.

### On success

`writeSessionToken(newToken)` then `adoptUser(user)`. `localDayUser` resolves to
the same id it already held, so the Local day is untouched and Today does not need
to refetch. The user's day does not flicker, because nothing about it changed.

## Errors

Every one leaves the Guest a Guest with their day, and every one gets its own
message. No "something went wrong".

| Status | Reason | Message |
|---|---|---|
| `409` | `email_taken` | That address already has a HealthyFlow account. Sign in instead. |
| `409` | `identity_conflict` | That Google/Apple account is already linked to a HealthyFlow account. |
| `401` | `provider_session_invalid` | Google/Apple sign-in expired. Please try again. |
| `401` | `provider_identity_invalid` | Google/Apple did not provide a verified email address. |
| `403` | `not_a_guest` | This session already has an account. |
| `503` | `provider_unavailable` | Google/Apple sign-in is temporarily unavailable. |

## Testing

**Backend.** The guard rejects a second claim on the same row. The CHECK is
satisfied by the combined write. `userId` and credit balance survive. A taken email
changes nothing about the row. Each provider conflict case refuses without
mutating. No public slot is consumed and no founding seat is taken — asserted, not
assumed, because both were previously true.

**Frontend.** A client-level assertion that the Local day is readable under the
same `userId` after claiming. No backend test can see this; it is the same class of
gap as the session-renewal bug, where supertest's world ended at `res.body`.

## Documentation consequences

- `CONTEXT.md` — restore the Claim entry's "nothing moves"; remove Claim from
  "things that look built and are not".
- `TARGET.md` — Money section: the credits/Cloud split, and the quota moving to
  Cloud as a founders' discount.
- **A new ADR** — entry is open, scarcity attaches to the paid tier. This reverses
  a recorded consequence of ADR-0010 and must be written down as its own decision
  rather than edited into it, because ADRs are immutable.
- ADR-0011's "consequence that is not resolved" is superseded by piece 2, not this
  one.

## What this does not cover

| Piece | Why it is separate |
|---|---|
| **2 — Health on the device** | The Local day learns calorie entries, weight, workout sessions and achievements, and four more services get `onDevice` branches. Independent of Claim. Closes ADR-0011's open contradiction. |
| **3 — Sign in to an existing account** | Authenticate, pull the account's day down via `buildAccountExport`, offer Keep both or Discard, rewrite `user_id`, switch identity, forfeit the guest row's credits. Depends on piece 2: until Health is local, the download has nowhere to put it. |

Decisions already taken for piece 3, recorded here so they are not re-litigated:
the user **chooses** Keep both or Discard, shown in real numbers; Keep both is a
union, safe because every id is a client-generated UUID and cannot collide, though
semantic duplicates can result and the copy must say so; the guest row's credits
are **forfeit**, stated plainly before they sign in.

## Open questions

- **Where the $1 grant goes.** Deliberately unanswered. It is a growth lever and
  wants evidence, not a default.
- **What happens to an existing account's hosted day** once it has come down to a
  device in piece 3. Leaving it hosted contradicts "free users' data is never
  hosted"; deleting it is irreversible. Not this piece's problem, but it is
  nobody's yet.
- **Whether a claimed account keeps the guest row's credit balance.** Trivially yes
  today — the balance is on the row and the row is the account — but it becomes a
  real question the moment the $1 grant exists.
