# Handoff — 2026-08-20

Written for whoever picks this up next, in any tool. Self-contained on purpose.
**Delete this file once the work below has landed** — it is a working note with an
expiry, not documentation.

## Read these first, in this order

1. **`TARGET.md`** — what the product is for, the razor, how money works. Everything
   else derives from it. New today.
2. **`CONTEXT.md`** — the words. Organised by failure mode: collisions, false
   friends, refused terms, things that look built and are not.
3. **`CLAUDE.md`** — rules that override normal practice, where things live, the
   commit workflow, verification commands.

All three were rebuilt today and are on `main`. They replaced eleven root
documents; `FEATURES.md` and `MARKETING.md` are archived under `docs/history/`
and are **not** descriptions of the app now.

## Git state, exactly

| | |
|---|---|
| `main` | `83f0d05` — has all rebuilt docs and the `docs/history` restructure |
| `feat/guest-mode` | `e79189d` — 2 commits ahead of `main`. **Not merged, not pushed.** |
| Pushed | **Both branches are on `origin`.** Nothing exists only locally. |

`README.md` has an uncommitted edit and `docs/runbooks/paid-apps-setup.md` is
untracked — neither came from the doc work; check with the owner before touching
them.

## The credit-grant bug, fixed today

`backend/src/auth.ts` (`startGuestSession`) and `backend/tests/auth/guest.test.ts`.

**The bug:** the guest endpoint granted credits via `Credits.grantSignupCredits`,
which routes through the `claim_signup_credit_grant` RPC. That awards
`FOUNDING_SIGNUP_CREDITS` (250) and consumes one of `FOUNDING_MEMBER_LIMIT` (100)
seats while any remain. So every Guest would take a founding seat and five dollars
of credits instead of the one dollar `TARGET.md` specifies, and would drain the
founding count shown on the login page. The RPC raises on a zero founding limit,
so it cannot be neutralised by argument.

**The fix as it stands:** the grant is removed from the guest path entirely, with
a comment explaining why, and the test that asserted the founding grant is
inverted into a regression guard (`claimSignupCreditGrant` must not be called).
A Guest currently starts with **zero credits**.

**Verification — all green, and this change is committed.** Both typechecks clean,
735 backend tests across 78 suites, 93 frontend tests, production build clean.

## What was decided today, and why

**The product target.** Three things that felt like competing identities — *say it
and it's handled*, *everything on one clock*, *an honest number* — are not
competitors. They are the **input, scope and payoff** of one product. Input is the
hook, scope is the reason to stay, truth is the differentiator. The razor follows:
*a part earns its place if it makes input easier, the picture more complete, or the
truth clearer.*

**Local storage is the base layer for everyone; cloud syncs on top.** Free users'
data is never hosted. Two reasons: the owner will not carry the cost, and more
importantly, if free users' data is already on the server then the paid "cloud"
tier has nothing to sell. One code path, so offline works for free and paid alike.

**Guest mode is in v1.** It makes the App Store listing honest and removes review
risk, since a reviewer never needs credentials.

**Work is parked, not cut.** Complete, behind `VITE_WORK_ENABLED`, deliberately
absent from the story. **The code stays. Do not delete it.**

## The order of work

**Local storage is the gate, not a step.** A Guest has to put their day somewhere,
and free users' data is never hosted — for cost, and because if it were, the cloud
subscription would have nothing to sell. So:

> **local storage → guest mode → App Store listing**

1. **Local storage layer.** Split the pure day core out of
   `backend/src/day-summary.ts` so a server adapter and a device adapter can both
   call it. `buildDaySummary` already takes all nine of its data sources as
   injected dependencies (`getSettings`, `itemsForDay`, `getCalendarStatus`,
   `getCalendarEvents`, `getCalorieEntries`, `getWeightEntry`,
   `getWorkoutSessions`, `getAchievements`, `listDayFocusBlocks`) and everything
   between them is pure — so this is an extraction plus a second adapter, not a
   rewrite. No behaviour change; provable against the existing backend suite.
   Design detail in `docs/history/specs/2026-08-17-local-first-guest-mode-design.md`
   — read it for the reasoning, but note its guest-token and claim sections are
   superseded.
   **iPhone only** (see `TARGET.md`), so the store can be SQLite through a
   Capacitor plugin rather than browser storage. None is installed yet.
   The browser/server boundary is guarded by a Chromium startup test — it must
   keep passing.
2. **Guest identity.** Endpoint done; see the known bug below.
3. **Guest credit grant.** Does not exist. Needs the "first N devices get $1"
   dial from `TARGET.md`, with N in a database row rather than a constant.
   **Until this lands a Guest has no credits, so the free experience has no AI —
   which is the hook the product is supposed to open with.**
4. **Claim** — upload the local store to cloud at signup.
5. **StoreKit** — independent of 1–4, can start any time. The Paid Apps
   Agreement is paperwork with a real-world clock and gates all revenue.

## Known bug on `feat/guest-mode` — not yet fixed

**The guest session renewal is inert.** `GET /api/auth/verify` mints a fresh
365-day token whenever `user.email` is null, but the client never reads it:
`authService.verifyToken` returns `response.data` and `AuthContext` uses it only
as identity. Nothing writes `userData.token` to `localStorage`.

So what ships is a **fixed 365-day fuse from account creation**, not the sliding
window ADR-0010 describes. On day 366 any call 401s, the `api.ts` interceptor
clears the token and reloads, and the Guest lands on a login screen they cannot
pass — no email, no password, row orphaned. That is a silent fallback, which
`CLAUDE.md` forbids.

Two-line fix: surface the token from `verifyToken`, persist it in `AuthContext`
when present. No backend test can catch this — supertest's world ends at
`res.body`. Add a client-level assertion instead.

**Better option now that v1 is iPhone-only:** store the token in the **Keychain**
rather than `localStorage`. The Keychain survives app deletion, so a Guest could
delete and reinstall and still be themselves. Device-binding the JWT was
considered and rejected — it adds a second fragile thing that must survive, which
increases the orphaning risk it is meant to reduce.

## Open questions nobody has answered

- **Existing account holders** have server-side data today. Under the new model
  server storage *is* the paid tier. Grandfathered into cloud, or does their data
  become their local store?
- **Does the App Store date still come first?** The stated priority was reaching
  the store with monetization. The decisions since — local-first, no hosted free
  data, guest mode in v1 — put the largest piece of engineering in front of the
  listing. That trade happened by accumulation, not by being chosen. There is a
  version where the account-required app ships to the store first and guest mode
  follows; it contradicts `TARGET.md` as written, which is why it needs a
  deliberate answer rather than a default.
- **Nobody owns the analytics gaps.** No task exists for them.
- **"Who it is for" in `TARGET.md` is weak** — "someone whose day spans several
  parts of life" is close to everyone. Every other section is sharp; that one
  was flagged and never fixed.
- **The guest credit grant** needs its own path and its own cap — the "first N
  devices get $1" dial in `TARGET.md`, which does not exist. `N` must live in a
  database row, not a constant: it is a cost-control dial to be raised when the
  economics are trusted.
- **Web storage durability.** iOS Safari evicts script-writable storage after
  ~7 days without interaction. Durable inside the Capacitor container, not on the
  web. With local as the base layer, a web Guest can lose their only copy inside a
  week. The web build needs either a cloud account or an explicit warning.
- **Vocabulary gap:** there is no defined word for the row a Guest holds when
  their day is not on the server. `CONTEXT.md`'s **Guest** entry presumes their
  data. Real gap, opened by the local-first decision.
- **`CONTEXT.md`'s Claim entry is knowingly stale.** It says the upgrade happens
  in place with nothing moving. That was true for half an hour under a different
  architecture. With local storage, data does move. It was deliberately not
  re-edited a third time in one day — fix it once the architecture settles.

## Gotchas that cost time today

- **`npm run typecheck` (backend) covers `src` and `tests`.** It did not until
  today — `tsconfig.typecheck.json` was added because a test fixture had drifted
  from a contract for weeks and only jest ever noticed.
- **`.env` lives at the repo root, not `backend/`.** A worktree gets none, so the
  loader now falls back to the main checkout via `git rev-parse --git-common-dir`.
  Missing Supabase config surfaces as `TypeError: fetch failed`, which names
  nothing — there is now a startup guard.
- **Signup fails closed.** If the signup-status call errors or public slots are
  exhausted, the Create-account tab does not render and the user sees a waitlist.
  **Verify the live `public_slots_open` value before submitting to App Review** —
  a reviewer hitting a waitlist is a rejection.
- **A change to the web app is a change to the iOS app.** Same React bundle in a
  Capacitor shell.
- **`docs/history/` is unmaintained by design.** Nothing in it describes the app
  now. Do not cite it as current, and do not add to it.

## Analytics gaps worth knowing

32 PostHog events exist and **not one mentions Capacity, attention or the daily
plan** — the differentiator reports nothing about itself. `ai_parse_requested`
fires with no success/failure counterpart, so the P0 Talk reliability issue (#199)
would be fixed blind. Parse **edit rate** — how much of a result gets corrected
before saving — is the clearest signal of whether the hook works, and is not
captured.

`item_created` and `calorie_entry_logged` do carry `source: 'manual' | 'ai_parse'`,
which makes the pricing bet in `TARGET.md` falsifiable: `credits_exhausted`,
then whether manual creation continues.
