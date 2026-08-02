# ADR 0006 — Native Google sign-in on iOS

**Status**: Accepted
**Date**: 2026-08-02
**Builds on**: ADR-0005 (Supabase Google identity with a HealthyFlow app session)

---

## Context

ADR-0005 established Google sign-in as authorization code with PKCE through
Supabase Auth's hosted redirect. That design assumes the callback arrives as a
**fresh page load**: the browser leaves for Supabase, comes back to
`/app?oauth=callback&code=…`, the whole app boots, and `LoginPage` reads the
code from the URL during its first mount.

The iOS shell breaks that assumption. Capacitor's WebView never unloads. The
provider redirect returns through a `healthyflow://oauth/callback` deep link,
which `initializeNativeApp` turns into a `history.pushState` plus a synthetic
`popstate` — a client-side route change into an **already mounted** React tree.
Every mount-time trigger the web flow depends on has therefore already run:

- `googleLoading` was seeded from `isGoogleOAuthCallback()` at the original
  mount, before any code existed.
- The callback effect's dependencies (`inviteToken`, frozen by `useState`, and
  `loginWithProvider`) cannot change on a route change, so it never re-fires.

The observable result on device was a permanent "Finishing…" spinner with **no
network request at all** — the token exchange was never reached. The spinner was
left over from starting the flow, not evidence of work in progress.

Two further conditions had to be fixed before the deep link even arrived, and
both are prerequisites rather than alternatives to this decision: the native
redirect URL was missing from Supabase's allowlist, and `.env.production` was
missing the Supabase public vars so the client was unconfigured in iOS builds.

## Decision

On iOS, obtain the Google ID token **natively and in-process**, then exchange it
with `supabase.auth.signInWithIdToken({ provider: 'google' })`. Do not use the
hosted redirect on this platform.

This mirrors the Apple flow, which has always worked this way
(`ASAuthorizationController` → `signInWithIdToken`) and is unaffected by the
callback-routing problem because it never leaves the WebView.

- `GoogleSignInPlugin` (Swift) runs an RFC 8252 native-app authorization code
  flow with PKCE against Google directly, using `ASWebAuthenticationSession`.
  Google treats iOS apps as public clients, so there is no client secret; PKCE
  binds the redirect to the request.
- The plugin is built on `AuthenticationServices`, the same system framework the
  Apple plugin uses. No third-party SDK and no new package dependency: the
  Capacitor SPM manifest is CLI-managed and must not be hand-edited, and the
  community Google plugin peer-depends on Capacitor 6 while this app is on 8.
- The web flow is untouched and remains exactly as ADR-0005 specifies.

The **backend contract does not change**. The app still sends a Supabase access
token to `POST /api/auth/google`, and every rule in ADR-0005 — signup gate,
Invitations, first-100 credit grant, account linking, orphan cleanup — continues
to apply unmodified. Only the means by which the client acquires that Supabase
session differs per platform.

## Consequences

- Google sign-in on iOS has no redirect to route and no callback to resume, so
  the entire class of "app was already mounted" failures disappears. There is no
  PKCE verifier to persist across an app handoff and no code exchange that can
  strand the UI.
- Configuration gains one public build var, `VITE_GOOGLE_IOS_CLIENT_ID`, and one
  operational requirement: the iOS OAuth client ID must also be listed in
  Supabase Auth's Google **Client IDs**, because `signInWithIdToken` validates
  the token's `aud` against that list. A token minted for an unlisted client is
  rejected.
- Google sign-in is now configured in two places for two platforms — the Web
  client (via Supabase's hosted redirect) and the iOS client (native). Rotating
  or replacing either must account for the Supabase Client IDs list.
- `beginGoogleOAuth` and the `completeGoogleOAuthCallback` path remain for web.
  They are now dead code on iOS; the deep-link route is still registered because
  it is shared with other native links.
- `ASWebAuthenticationSession` shows a system consent sheet the first time,
  naming the domain being signed in to. This is expected and required.
