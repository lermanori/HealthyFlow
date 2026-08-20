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
| Uncommitted on `feat/guest-mode` | The credit-grant fix described below, plus a `README.md` edit and an untracked `docs/runbooks/paid-apps-setup.md` that came from elsewhere — check with the owner before committing those two. |

**Nothing has been pushed to `origin` all session.** `main` is many commits ahead
of `origin/main`.

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

1. **Local storage layer.** Split the pure day core out of `backend/src/day-summary.ts`
   so a server adapter and a device adapter can both call it. `buildDaySummary`
   already takes all nine data sources as injected dependencies and everything
   between them is pure, so this is an extraction plus a second adapter, not a
   rewrite. No behaviour change; provable against the existing backend suite.
   The precedent for the browser/server split is the Achievement and Workout
   contract split — a Chromium startup test guards that boundary, and it must
   keep passing.
2. **Guest identity.** Mostly done — see above.
3. **Claim** — upload local store to cloud at signup.
4. **StoreKit** — independent of 1–3, can start any time.

## Open questions nobody has answered

- **Existing account holders** have server-side data today. Under the new model
  server storage *is* the paid tier. Grandfathered into cloud, or does their data
  become their local store?
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
