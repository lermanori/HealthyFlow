# ADR 0025 — one challenge table verifies an address and recovers a password

**Status**: Accepted

**Decision date**: 2026-09-14

**Supersedes nothing.** Closes a gap alongside
[ADR-0010](./0010-guest-identity-and-session-lifetime.md): an account exists,
and until now there was no way back into one.

## Context

Password authentication here is homegrown — `bcrypt` into our own `users` table
and our own JWT. Supabase Auth is used only to exchange Google and Apple tokens.
That means nothing in the stack sends mail, and nothing lets a person prove an
address or recover an account. The only reset path was
`POST /users/:userId/reset-password`, guarded by `ADMIN_TOKEN`: the founder
changing someone's password by hand.

For an App Store launch that is two separate problems. A person who forgets
their password has no way back in and no one to ask at 2am. And an address
nobody ever confirmed cannot be used to let them back in later, because we have
no evidence the person who typed it can read it.

## Decision

**One table, `auth_email_challenges`, for both kinds.** Verifying an address and
resetting a password share every rule that matters: a random secret, one use, an
expiry, and invalidation by a newer challenge of the same kind. Two tables would
mean writing those rules twice and watching them drift.

**The token is never stored.** The row holds a SHA-256 of it, and lookup is by
hash — the server hashes what it was handed and matches. A database read
therefore yields no working link, which is the difference between a leak and an
account takeover.

SHA-256 rather than bcrypt deliberately. This is 256 bits of randomness, not a
human-chosen password, so there is nothing for a slow hash to defend; and lookup
must be by hash, which a slow hash would turn into a table scan.

**Single use is enforced by the UPDATE, not by a read.** `consumeEmailChallenge`
sets `consumed_at` with `.is('consumed_at', null)` in the predicate. Two
simultaneous uses of one link both pass a read-then-check; only one can win a
conditional write.

**Lifetimes differ by kind.** A reset link changes a password, so it lives an
hour. Verification only proves reachability and is often opened later in the
day, so it lives 24 hours.

**A reset request answers identically whether or not the address has an
account.** Same status, same body. Otherwise the endpoint is a membership
oracle: type an address, learn whether that person uses HealthyFlow. A Google
or Apple account gets the same answer too — there is no password to reset, and
saying so would leak how someone signed up.

**A mail-provider failure is the one thing reported.** It has to be: silence
sends a person to watch an inbox for a link that was never sent, and neither
they nor support can tell that from a link that is merely slow. This is the
no-silent-fallbacks rule applied to the one place where the fallback would look
like success.

**Google and Apple accounts are verified from creation, never asked.** Their
provider proved the address before it reached us. Existing ones were backfilled.
Signing in with a provider on an address that already had a password account
stamps it too.

**The admin reset route is untouched.** It takes `ADMIN_TOKEN` and a new
password directly, with no proof of address at all. Re-using it as the public
path would have been a password change available to anyone who could name a
user id.

**Verification gates recovery, never access.** An unverified account works
exactly as before — same day, same AI actions, same everything. What it lacks is
a way back in if the password is forgotten, and that is what the prompt in
Settings says, rather than inventing a penalty to sound urgent.

## Consequences

- `RESEND_API_KEY` and `MAIL_FROM` become production requirements, and the
  sending domain must be verified in Resend. Without them signup still succeeds
  and answers `verificationEmail: "unavailable"`.
- `SessionUser` gains `emailVerified`. A session cached by an earlier build
  predates the field and is read as "not known to be verified" rather than
  discarded — throwing it away would log a Guest out of the only key to their
  own day ([ADR-0010](./0010-guest-identity-and-session-lifetime.md)) over one boolean.
- Mail delivery is one seam, `MailSender`. Every test drives a recording fake;
  no test run reaches Resend and no test needs a credential to be meaningful.
- A person who loses their password on an unverified address still has no way
  back in. That is now a state they can leave at any time, rather than one they
  were never told about.
