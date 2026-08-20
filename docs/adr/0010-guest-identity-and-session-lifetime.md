# ADR 0010 — Guest identity is a user row, and its session must not expire quietly

**Status**: Accepted (partially implemented — see Scope)
**Date**: 2026-08-20

## Context

Someone must be able to open HealthyFlow and use it without creating an account.
The AI is server-keyed and metered, so even a person with no account has to be a
principal the server can meter and bill credits against: `Credits.getBalance`,
`Credits.grantSignupCredits`, every AI route and the day contract are all keyed
on `userId`, and `POST /auth/demo-session` already proves that an existing row
can be handed a normal `{ userId }` JWT.

Two constraints were fixed while this was being built:

1. **A Guest is a `users` row with no email.** Not a new token type, not a
   separate credit ledger, not a device-keyed grant table. An earlier design
   called for all three; it is superseded.
2. **A free user's day data is not hosted on the server.** Items, Habits and
   settings for someone who has not paid stay on their device. The local store
   that would hold them does not exist yet.

Together those say what the row is for: **identity and a credit balance, and
nothing else.**

That creates the problem this ADR exists to answer. A Guest has no email and no
password, so there is no way to prove who they are a second time. The session
token is the *only* key to the row. A normal session is `expiresIn: '7d'` and a
demo session is `'2h'`; copying either one means that a Guest who does not open
the app for a week comes back to an app that cannot find their credits — or,
once local data can be claimed, their day. Nothing warns them, nothing fails
loudly, and nothing can be recovered. That is exactly the silent failure this
project refuses.

## Decision

**A Guest session is issued for one year and re-issued on every verified open.**

- `POST /auth/guest` creates the row and returns a normal `{ userId }` JWT with
  `expiresIn: '365d'`.
- `GET /auth/verify` — which the app already calls on every open — returns a
  freshly signed token when, and only when, the account has no email. The
  session slides forward: anyone who opens the app at least once a year never
  expires out of their own row.
- After an account gains an email and a password, sessions go back to `'7d'`.
  Expiry is only affordable once there is a way to sign in again.

**Why not the alternatives:**

| Option | Why not |
|---|---|
| Copy `'7d'` | Guarantees silent orphaning for anyone who takes a week off. Buys no security a Guest can act on: there is no second credential to fall back to. |
| No expiry at all | A token that is valid forever cannot be aged out at all. A year of inactivity is a defensible bound; unbounded is not a decision, it is an omission. |
| A refresh-token mechanism | A second token type, a rotation store and a new endpoint, to buy exactly what re-signing on verify already buys. |
| A device-stored secret that re-mints sessions | That secret *is* a password stored on the device, with the same loss profile as the token, plus a new endpoint and a new credential to leak. |

The security cost is stated plainly: **for a Guest, expiry protects nothing.**
The token is the only credential, so a leaked token is a lost row whether it
lasts two hours or a year. What expiry does buy against a *stolen* token is a
ceiling, and one year is that ceiling.

## The risk being accepted, and how it must be surfaced

The token lives in device storage. That storage is the single point of failure:

- **Native iOS (Capacitor).** The WKWebView's storage is app-container data. It
  survives restarts and reboots and is deleted when the app is deleted.
- **The web app.** Safari on iOS caps script-writable storage for a site at
  roughly seven days of no interaction, and every browser clears it on "clear
  browsing data". A Guest on the web can lose their row **inside the first
  week**, no matter how long the token itself is valid.

So the durability of a Guest session is a property of the *shell*, not of the
token, and the web shell is materially weaker than the native one. The session
lifetime removes server-side expiry as a cause of loss; it cannot remove this
one.

Two things therefore bind whatever ships the entry point:

1. **Say it before they start.** The surface that starts a Guest session states
   that the session lives on this device, and that adding an email is what makes
   it recoverable. Nothing about guest mode may imply the row is safe elsewhere.
2. **Say it when it breaks.** If a session cannot be restored while the device
   still shows a Guest was here, the app says so — the existing
   `healthyflow-auth-notice` path already carries this kind of message to the
   login screen. A bounce back to a blank sign-in screen is the silent failure,
   not the fix.

## Scope of this ADR

Implemented: the `users` row with no email, `POST /auth/guest`, the signup-shaped
rate limit, test-mode account-creation blocking, and the session rule above.

Deliberately not implemented, and not decided here:

- **Where a Guest's day lives.** The device-local store is separate, larger work
  and comes first. Until it exists there is no entry point into the app for a
  signed-out person, and `src/App.tsx` is unchanged.
- **Claim** — how a Guest becomes an account holder. With local day data it is
  no longer only "add an email to the row", so the shape is open.

## Consequences

- Guests do not pass the signup access gate and do not consume public signup
  slots, because a Guest is not a signup. Any path that turns one into an account
  holder must.
- A Guest **does** consume the existing signup credit grant, including a founding
  cohort seat when one is available. That is the existing grant path used
  unchanged, and it is a live tension with the "$1 of credits on first open" cost
  dial described in the product target: it should be revisited before guest
  sessions are reachable by strangers.
- `users.email` is now nullable, guarded by a `CHECK` that a row whose
  `signup_method` is `guest` has no email. Every read of an account email is now
  a `string | null` — the administration surfaces show "No email — Guest" rather
  than inventing one, and `admin_user_audit_log.target_email` is nullable for the
  same reason.
- Nothing about existing sessions, routes or middleware changes: a Guest is the
  same `{ userId }` principal every protected route already takes.
