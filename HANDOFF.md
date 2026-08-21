# Handoff — 2026-08-21

Written for whoever picks this up next, in any tool. Self-contained on purpose.
**Delete this file once the work below has landed** — it is a working note with an
expiry, not documentation.

## Read these first, in this order

1. **`TARGET.md`** — what the product is for, the razor, how money works.
2. **`CONTEXT.md`** — the words. **Local day** is new today, and the **Claim**
   entry has been corrected: with a device-held day, Claim no longer "moves
   nothing".
3. **`CLAUDE.md`** — rules that override normal practice, the commit workflow,
   verification commands.
4. **`docs/architecture/the-day-on-two-sides.md`** — new today. How the same day
   is composed from Supabase and from a file on the device without two
   implementations of what a day is. Read it before touching anything under
   `src/lib/local/` or `backend/src/day-summary-core.ts`.

## Git state

| | |
|---|---|
| `main` | `83f0d05` |
| `feat/guest-mode` | ahead of `main`. **Not merged.** |

`README.md` still has an uncommitted edit and `docs/runbooks/paid-apps-setup.md`
is still untracked — both predate this session and were left alone deliberately.
`README.md` wants one more row in its Start-here table:
`| How a subsystem works | docs/architecture/ |`.

## What landed today

**Guest mode works on iPhone.** Someone installs the app, taps *Start without an
account*, and uses it: Today, the timeline, Items, the Anytime and Someday
backlogs, Habits with progress and outcomes, rollover, Capacity, attention and
settings. No account, no network, nothing asked of them. Their day is written to
one JSON document on the device and never to the server.

Four pieces, in the order they were built:

1. **The session renewal bug is fixed.** `GET /auth/verify` had been re-issuing a
   Guest's token on every open since ADR-0010, and the client threw it away — a
   fixed 365-day fuse from account creation rather than the sliding year. The
   re-issued token is now part of a typed contract (`backend/src/auth-contracts.ts`)
   and `src/lib/session.ts` owns every read and write of it.
2. **Shared day rules.** `composeDayTaskRows` (Habit synthesis, dedup, sort) and
   `isCarryForwardRow` (the rollover rule) moved out of `supabase-client.ts` and
   `rollover.ts` into the browser-safe core; `deriveHabitOutcome` and
   `resolveHabitOutcomeRequest` moved out of `habit-progress.ts` into
   `backend/src/habit-contracts.ts`. Both servers and devices now run one copy of
   each rule. No behaviour change — proved against the existing backend suite.
3. **The Local day.** `src/lib/local/` — a document, a driver, the nine day
   sources and every Item write. **ADR-0011** records the store decision.
4. **The wiring.** `onDevice(local, hosted)` in `src/services/api.ts` routes
   `taskService`, `settingsService` and `daySummaryService` per call, keyed on the
   signed-in identity: a Guest is an account with no email, and a Guest's day is
   local. Every page above that line is unchanged.

**Verification, all green:** both typechecks, 737 backend tests across 78 suites,
122 frontend tests including the Chromium startup guard, production build.

## What a Guest still does not get, and why it matters

**Health.** Nutrition, Weight, Training and Progress are not stored on the device.
The local settings baseline switches those modules off, so the day reports them
`disabled` — an honest state Today already renders, not an empty lie. But
`TARGET.md` calls food, weight and training **core, not optional**, and says no
part of the day itself is withheld.

**That contradiction is the one thing that has to close before the listing claims
guest mode gives you the whole day.** Two ways out and they are not equivalent:

- Teach the device the four record types. Roughly doubles the local store, and
  four more services need an `onDevice` branch.
- Change `TARGET.md` to say Health needs an account, and accept that the second
  axis — *one clock* — is thinner for a Guest than the pitch says.

It is written down in ADR-0011 and in `CONTEXT.md` under "things that look built
and are not". Do not let it stay unanswered by accident a second time.

## The order of what is left

1. **Claim.** A Guest cannot become an account holder. The identity half is easy —
   the same `users` row gains an email and a password, so credits keep their key —
   but the Local day has to be uploaded, and that is the half that can fail.
   Nothing exists yet.
2. **The guest credit grant.** Still does not exist, so **a Guest starts with zero
   credits and the free experience has no AI** — the hook the product is meant to
   open with. Needs the "first N devices get $1" dial from `TARGET.md`, with N in
   a database row rather than a constant, because it is a cost-control dial to be
   raised without a deploy. `Credits.grantSignupCredits` must **not** be reused:
   it awards 250 credits and consumes a founding seat.
3. **Health on the device**, or the `TARGET.md` change. See above.
4. **The Keychain.** The token still lives in `localStorage`, which is deleted with
   the app. `src/lib/session.ts` holds a swappable synchronous token store built
   for exactly this swap: a Keychain read is async, so hydrate it once at start-up
   into a store that answers from memory and writes through. No plugin is
   installed — this session did not add one it could not build-verify.
5. **StoreKit.** Independent of everything above. The Paid Apps Agreement is
   paperwork with a real-world clock and gates all revenue.
6. **The web.** The entry point is iPhone-only. iOS Safari evicts script-writable
   storage after ~7 days without interaction, so a web Guest could lose their only
   copy inside a week. The web build needs either an account or an explicit
   warning before it offers guest mode.

## Gotchas that cost time today

- **The backend package is CommonJS; the frontend is ESM.** Named *value* imports
  across that line resolve under Vite and fail under `tsx --test`. Shared modules
  export a **default object** and callers destructure it — `TaskContracts`,
  `SettingsContracts`, `HabitContracts`, `DaySummaryCore`. Types import by name
  fine; they are erased.
- **`buildDaySummary` merges a partial dependency override onto the Supabase-backed
  defaults.** A test fixture that omits one of the nine does not get a stub — it
  reaches the real database and times out. Eleven backend tests were failing this
  way before today's work started; they are fixed and hermetic now.
- **`tests/day-summary.test.ts` and `tests/day-summary-timeline.test.ts` each had a
  helper missing exactly one source.** If you add a source to
  `DaySummaryDependencies`, add it to both helpers in the same commit.
- **`POST /test/reset — HF_TEST_MODE guard` is intermittently flaky** across
  parallel workers. It passed on every clean run today; if you see it fail alone,
  re-run before investigating.
- **`.env` lives at the repo root, not `backend/`.**
- **Signup fails closed.** If the signup-status call errors or public slots are
  exhausted, the Create-account tab does not render. **Verify the live
  `public_slots_open` value before submitting to App Review** — a reviewer hitting
  a waitlist is a rejection. Guest mode removes the need for credentials, but the
  account path is still on that screen.
- **A change to the web app is a change to the iOS app.** Same React bundle.
- **`docs/history/` is unmaintained by design.** Nothing in it describes the app
  now. `docs/history/specs/2026-08-17-local-first-guest-mode-design.md` is now
  superseded on three more counts: the store, the settings baseline, and the fact
  that the pure-core split is done.

## What was and was not verified on a device

**Verified.** The iOS app **builds** with `@capacitor/filesystem@8.1.3`
(`xcodebuild -scheme App -destination 'generic/platform=iOS Simulator'`,
BUILD SUCCEEDED), **launches** on an iPhone 16 Pro simulator, and the login
screen shows **Start without an account** with the ADR-0010 disclosure beneath it.

**Not verified, and it needs a running backend.** Tapping that button calls
`POST /auth/guest`, and the bundle built from the repo `.env` points at
**production** (`healthyflow-production.up.railway.app`). Tapping it in a test
would create a real Guest row in the live database, so nobody tapped it. What is
still unproven:

- the guest session round trip end to end;
- **the Capacitor Filesystem driver on a real device.** The Local day has 27 unit
  tests, but they all run through the in-memory driver — nothing in the five
  verification commands touches the plugin, because they all run in Node and
  Chromium.

To close both, point `VITE_API_URL` at a local backend, then:

```sh
npm run ios:run
```

On the simulator: tap *Start without an account*, add a timed Task, add a daily
Habit, log progress against it, kill the app, reopen it, and confirm the day is
still there.

**One sequencing trap.** `ios/App/App/public` holds a *copy* of `dist`, so an app
built after a stale `cap copy` renders a blank screen with no error. `npm run
build:ios` orders it correctly (`build` then `cap sync ios`); running `xcodebuild`
straight after editing web code does not.

## Open questions nobody has answered

- **Existing account holders** have server-side data today. Under the new model
  server storage *is* the paid tier. Grandfathered into cloud, or does their data
  become their Local day?
- **Does the App Store date still come first?** Guest mode now works, which was
  the largest piece of engineering in front of the listing. What is left before a
  listing is honest is the Health question above and the credit grant.
- **Nobody owns the analytics gaps.** `guest_started` was added today as the
  counterpart to `signed_up`, so the funnel out of guest mode is measurable. Still
  nothing for Capacity, attention or the daily plan, and `ai_parse_requested` still
  has no success/failure counterpart.
- **"Who it is for" in `TARGET.md` is weak** — "someone whose day spans several
  parts of life" is close to everyone.
- **A Guest cannot log out**, by design (ADR-0011): there is nothing to sign back
  in with, and their day is on the device. Account deletion is the only exit and it
  erases the document. Whether that is the right escape hatch for someone whose
  session breaks is not settled.
