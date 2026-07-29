# ADR 0005 — Supabase Google identity with a HealthyFlow app session

**Status**: Accepted
**Date**: 2026-07-29

## Context

HealthyFlow already has application users in `public.users`, server-issued JWTs,
and authorization middleware built around the application user id. Supabase was
used as Postgres and as the trusted server client, but Supabase Auth was not part
of login. Replacing the app session model would affect every protected route and
risk splitting existing password users from their data.

Google sign-in also has to preserve HealthyFlow's own signup gate, Invitations,
first-100 onboarding-credit grant, and onboarding state. Supabase Auth's global
"allow new users" switch cannot express those per-request rules.

## Decision

Google authenticates the browser through Supabase Auth using authorization code
with PKCE. The browser sends the resulting short-lived Supabase access token to
`POST /api/auth/google`; the backend verifies it with Supabase, requires a
verified Google email, resolves the corresponding `public.users` row, and issues
the existing HealthyFlow JWT.

- An existing Google subject signs in to its linked application user.
- An existing password user with the same normalized, verified email is linked
  to the Google subject; no second application account is created.
- A genuinely new user is created only after the existing public-slot or
  Invitation gate authorizes the signup.
- Invitation state is retained in expiring browser storage across the OAuth
  redirect, then persisted on the new user only until atomic redemption
  completes. This makes callback retries safe without leaving a reusable token.
  Invitations themselves expire after seven days.
- The existing atomic signup-credit claim grants the first-100 offer exactly
  once. Onboarding seeding is idempotent so an interrupted callback can retry
  without reopening completed or skipped onboarding.
- OAuth users still receive a normal HealthyFlow JWT. Protected APIs do not
  accept Supabase access tokens directly.
- Rejected new signups have their orphaned Supabase Auth user removed.

## Consequences

- Existing password login and every protected route keep their current contract.
- The Supabase project URL and publishable key are public frontend build
  configuration. Google client secrets remain only in Google Cloud and Supabase
  Auth; the Supabase service-role key remains server-side on Railway.
- `public.users.google_auth_subject` is unique, and email storage is normalized
  to lower case with a case-insensitive unique index.
- New Google-created accounts can delete themselves by confirming `DELETE`
  without a password they never chose; the server also removes their Supabase
  Auth identity.
- Google Cloud, Supabase Auth URL configuration, and Netlify build variables
  must all be configured before the button can complete a production login.
