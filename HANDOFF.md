# Handoff — 2026-08-21

Written for whoever picks this up next, in any tool. Self-contained on purpose.
**Delete this file once the work below has landed** — it is a working note with an
expiry, not documentation.

## Read these first, in this order

1. **`TARGET.md`** — what the product is for, the razor, how money works.
2. **`CONTEXT.md`** — the words. **Local day** is new today, and **Claim** vs
   **Sign in** is a new collision: both take a Guest to an account and they are
   opposites.
3. **`CLAUDE.md`** — rules that override normal practice, the commit workflow,
   verification commands.
4. **ADR-0012** — entry is open, scarcity belongs to the paid tier. Reverses a
   recorded consequence of ADR-0010 and rewrites what the waitlist is for. Read it
   before touching auth, pricing or the waitlist.
5. **`docs/architecture/the-day-on-two-sides.md`** — new today. How the same day
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
122 frontend tests including the Chromium startup guard, production build — **and
confirmed on a simulator**: a Guest's day survives killing and reopening the app.
See "Verified end to end" below.

## What a Guest gets

**The whole day, including Health.** Nutrition, Weight, Training and Progress live
on the device alongside Items, Habits and settings — built 2026-08-21, closing the
contradiction ADR-0011 recorded. `TARGET.md` calls food, weight and training core
rather than optional, and nothing is withheld from someone without an account.

This section previously said the opposite; it had gone stale against the work
listed below and is corrected here rather than left to mislead the next reader.

## The order of what is left

Claim was designed on 2026-08-21 and the design is approved:
`docs/history/specs/2026-08-21-claim-by-signup-design.md`. Designing it settled
four product decisions, recorded in **ADR-0012** — entry is open, the waitlist
quota moves to Cloud as a founders' discount, credits and Cloud are separate
products, and local is the source for everyone. Three of those reverse something
previously written down. Read the ADR before touching auth, pricing or the
waitlist.

The work splits into three pieces, in this order:

1. ~~**Claim by signup.**~~ **Built 2026-08-21.** `POST /auth/claim` and
   `/auth/claim/:provider` — one guarded `UPDATE`, no slot, no credits, by email,
   Google or Apple. Entry point is **Create an account** in the menu's account
   block, where Logout sits for everyone else. 12 endpoint tests; the menu and the
   screen were confirmed on a simulator.
   Spec: `docs/history/specs/2026-08-21-claim-by-signup-design.md`.
   Plan: `docs/history/plans/2026-08-21-claim-by-signup-plan.md`.
   **Nobody has submitted the form** — it writes a real account to the live
   Supabase. When someone does, the thing to watch is that **the day is still
   there afterwards**: that is what `holdsLocalDay` exists to guarantee, and it is
   the one part no test can see.
2. ~~**Health on the device.**~~ **Built 2026-08-21.** The Local day holds Calorie
   entries, Weight entries, Workout sessions and plans, and Achievements, all
   client-shaped; the four day sources answer from the document and the four health
   services route to the device. `generatePlan` stays hosted — it is an AI call.
   Closes the contradiction ADR-0011 recorded. Spec:
   `docs/history/specs/2026-08-21-health-on-the-device-design.md`.
3. ~~**Sign in to an existing account.**~~ **Built 2026-08-21.** Two halves:
   authenticate and read the account's archive without writing anything, then let
   the person choose **Keep both** or **Discard** against real counts on each side.
   Keep both is a union — safe on identity, but it can produce two of the same
   habit, and the copy says so. Kept records are re-keyed to the account.
   Forfeited guest credits are stated before the choice.

**What is left of the three:** the login screen still has no download, so someone
signing in *there* — on a device that was never a Guest — reads a hosted day. The
Guest path is the one that brings an account's day down. Closing that is the last
step of "local is the source for everyone".

Independent of all three:

- **The $1 credit grant.** Deliberately unplaced. Until it lands, anyone who
  claims has **zero credits** — the whole day, no AI. Where it goes is a growth
  lever and wants evidence rather than a default.
- **The Keychain.** The token still lives in `localStorage`, which is deleted with
  the app. `src/lib/session.ts` holds a swappable synchronous token store built for
  exactly this swap: a Keychain read is async, so hydrate once at start-up into a
  store that answers from memory and writes through. No plugin installed.
- **StoreKit.** The Paid Apps Agreement is paperwork with a real-world clock and
  gates all revenue.
- **The web.** The guest entry point is iPhone-only. iOS Safari evicts
  script-writable storage after ~7 days without interaction, so a web Guest could
  lose their only copy inside a week. The web build needs either an account or an
  explicit warning before it offers guest mode.

**Code that now contradicts ADR-0012.** None of it is broken, but all of it says
the wrong thing:

- `POST /auth/signup` and the provider paths still call `Waitlist.authorizeSignup`
  and write `claimed_public_signup_slot`.
- The login page's "N spots left" copy describes account scarcity that no longer
  exists. It belongs wherever Cloud is sold.
- `claim_signup_credit_grant` ties "founding" to credits. Founding is now a Cloud
  price.

## Cloud sync, and what it still leaves

**Built 2026-08-25.** A Cloud subscriber's day now syncs both ways: the device
sends rows changed since its **Sync watermark**, the server returns rows changed
since the same watermark, and both sides merge with most-recently-changed-wins
through one `mergeRows` in `backend/src/sync-contracts.ts`. Offline is not a
special case — the watermark does not advance and the next exchange carries
whatever accumulated. `POST /api/sync`, gated on an active subscription.

`src/lib/local/adopt.ts` no longer carries its own copy of that rule; the sign-in
merge and the sync merge are now the same function, with the same per-collection
identity.

### The two sync migrations were applied on 2026-08-25

The owner applied both with `supabase db push`. The deployed backend now depends
on these columns being present:

- `supabase/migrations/20260823120000_add_tasks_updated_at.sql` — the column, a
  backfill from `created_at`, a `BEFORE UPDATE` trigger and an index.
- `supabase/migrations/20260823120001_add_health_deleted_at.sql` — `deleted_at`
  on the eight health tables, plus a `(user_id, updated_at)` index on each.

```sh
supabase db push
```

If Postgres ports hang, check `route -n get default` for a `utun*` interface — a
VPN is the usual cause. Otherwise paste both into the dashboard SQL editor and
record them in `supabase_migrations.schema_migrations`.

### What had to be built that the plan did not anticipate

The plan assumed rows could be upserted straight through. Three reasons they
could not, all now handled:

1. **Health is stored client-shaped on the device and relationally on the
   server** — `userId` vs `user_id`, and a session's exercises live *inside* the
   session on one side and in `workout_session_exercises` on the other. The
   translation runs at the server boundary, in `health-contracts.ts` and beside
   the existing `*ToClient` twins in `workout-contracts.ts` and
   `achievement-contracts.ts`.
2. **No health table had `deleted_at`**, so a device-side deletion had nowhere to
   go. Hence the second migration.
3. **Four tables carry a unique constraint on a natural key** —
   `weight_entries (user_id, date)`, `achievement_entries (user_id,
   achievement_id, date)`, `calorie_items (user_id, normalized_name,
   normalized_quantity)`, `workout_exercise_items (user_id, normalized_name)`.
   Two devices that each log today's weight produce two ids for one row, and an
   upsert on the id would violate the constraint and fail the *whole* exchange.
   `SYNC_IDENTITY` names the natural key per collection and both the merge and
   the `ON CONFLICT` use it.

### Not verified on a device

Every test passes — 223 frontend, 808 backend, both typechecks, the production
build. The migrations are live and simulator testing has started, but a complete
first exchange on a real account has not yet been confirmed. Green tests have not
been sufficient in this codebase: five bugs were found on a device this week after
the tests were green. The first exchange is still the thing to watch.

An audit on 2026-08-25 closed four gaps before that first exchange: a successful
sync no longer schedules another sync from its own watermark write; the server
now applies the shared most-recent-change rule instead of blindly upserting the
device; hosted Health deletes leave tombstones and Workout exercise changes bump
their parent; and an id already owned by another account is refused.

### What this deliberately leaves

- **A free registered account still has no backup**, deliberately: hosting is
  what Cloud sells. Whoever ships the paywall copy should say so plainly, because
  people otherwise discover it by losing a phone.
- **The deletion job.** On lapse the hosted copy freezes, and the plan was to
  delete it after a grace period. **Only the freeze is built** — and the freeze is
  simply the subscription gate refusing the exchange. The deletion needs a
  scheduler, warning emails and a clock, and it is what bounds the storage cost
  that made a grace period preferable to keeping data forever. Do not let this be
  quietly forgotten.
- **Realtime.** A Supabase subscription becomes a nudge to run the same exchange,
  not a second code path. The pull was shaped as "everything since a watermark"
  specifically so this stays cheap.
- **A failed sync is visible.** One persistent, deduplicated toast says Cloud sync
  is paused and that changes remain safe on the iPhone. It clears only after a
  successful exchange or when the Local day closes.
- **The web app syncing.** It has no local day.
- **Field-level conflict resolution.** Row-level, most-recent-wins, tie to the
  device.

## Logging out, and who a day belongs to

**Fixed 2026-08-25.** Logging out of a registered account left its day openable
on the next launch: `adoptLocalDayOwner` had only an id to go on, so it invented
the rest — and `email: null` is what this app means by Guest. The account's whole
day reopened with no token and no password, labelled *Guest*, with the Logout
button gone (it is hidden for Guests) and Claim pointed at a row already claimed.
The same path fires when the server *refuses* a token, so it was reachable
without anyone tapping Logout.

Three changes, in the order they landed:

1. **The document records whether its owner is a Guest** (`ownerEmail`, absent
   means Guest — correct for every document written before the field existed).
   `opensWithoutSession` is the rule, in one place. Carried on the existing
   funnel: `setLocalDayUser(userId, email)` from `adoptUser`, stamped by
   `mutateLocalDatabase` on every write, and set by `localDayFromExport` for a
   day downloaded at sign-in.
2. **The login screen and the stranded-day screen say whose day this is.**
   Neither did, so starting a guest session sat one tap from an account's day,
   and the stranded screen offered permanent erasure as the only way out of a
   state signing in would have resolved. `heldDayRecovery` decides; both screens
   render it.
3. **One document per person** — `healthyflow-day-<userId>.json`. The single
   fixed name with the owner stamped inside is what made every identity change a
   collision to defend against.

**Nothing is deleted on logout.** The day stays on the device and signing back in
opens it. That is deliberate while a free registered account has no server copy
(sync is subscriber-only) and no export — `/account/export` reads Supabase, so it
comes back empty for them.

### The migration runs on the device, and has not

A document written under the old shared name is moved onto its owner's name on
first read: written, read back, and only then is the original removed. That
ordering is the point — a write that succeeds and cannot be read back destroys a
day while reporting that it saved one. It is covered by tests through the memory
driver, but **no real device has performed it**. It is the riskiest thing in this
change.

### Left deliberately

- **The keep-or-delete dialog at logout.** UpNote's model is the right one — ask,
  with *Delete* offered only when the server provably has everything (`collectDelta`
  empty plus an active subscription). It needs a **local export** first, or the
  answer for a free account is destruction with no recourse.
- **`holdsLocalDay` still reads a `localStorage` key.** With a document per person
  it could ask the filesystem instead, which nothing can overwrite. Signing in at
  the login screen still has no download, so whether an account's day comes back
  depends on that key surviving.
- **An ADR.** "One document per person, and a day opens without a session only for
  a Guest" is a real decision that amends the model in ADR-0011. It is recorded
  here and in `CONTEXT.md`, not yet in `docs/adr/`.

## Corrections to what is already written down

**ADR-0011 is wrong about where the day is stored.** It says `Directory.Data` is
`Library/NoCloud` on iOS and therefore excluded from iCloud backup. It is not: on
iOS Capacitor maps `Directory.Data` to **`Documents`**, which *is* backed up.
Verified on 2026-08-23 — the document sits at
`<container>/Documents/healthyflow-day.json`.

The decision (a JSON document through `@capacitor/filesystem`) stands and works.
What is false is the reasoning attached to it, and that reasoning was load-bearing:
the point of excluding it from backup was that cross-device is what Cloud sells, so
a free day should not travel to a new phone by itself. Today it would, through an
iCloud restore.

Two ways to settle it, and it is a product call, not a cleanup:

- **Accept it.** A device backup is migration, not sync — it does not put the same
  day on two phones at once. Then ADR-0011's reasoning needs an erratum.
- **Move to `Directory.LibraryNoCloud`**, which is what the ADR describes. **This
  cannot be a one-line change**: every existing document would be stranded exactly
  the way one just was, so it needs a read-old-write-new migration first.

ADRs are immutable in this project, so the correction is recorded here rather than
edited into ADR-0011.

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
- **A Guest opening the app offline used to be signed out**, which stranded their
  day permanently: starting again mints a new identity, and the document belongs to
  the old one. Fixed 2026-08-23 — only a server that *answers* ends a session. If
  you touch the verify path, keep that distinction.
- **A test that freezes the date will pass on the day it is written and fail
  later** if the code under it stamps the real clock. One did.
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

## Verified end to end, 2026-08-21

**Claim is built but not yet exercised end to end.** The endpoint has 12 tests,
and the menu entry and the account screen were confirmed on a simulator — but
submitting the form creates a real account in the live database, so nobody has.

**Guest mode works.** On an iPhone 16 Pro simulator, against this branch's backend
with the guest migration applied: *Start without an account* creates the session,
a timed Task and a daily Habit with logged progress are written to the device, and
**the day is still there after killing and reopening the app**. That is the one
thing no automated test in this repo can prove — the 27 Local-day tests all run
through the in-memory driver, and the five verification commands run in Node and
Chromium, so nothing else touches `@capacitor/filesystem` at all.

Caveat worth keeping honest: this was the **simulator**, not a physical device.
The plugin path is identical, but a real iPhone has not run it.

Three things had to be true at once, and each was a separate false start:

1. **The guest migration must be applied.** `20260820120000_add_guest_accounts.sql`
   exists only on this branch. Without it `users.email` is `NOT NULL` and creating
   a Guest fails with a 500.
2. **`VITE_API_URL` must be a real environment variable.** `vite build` runs in
   production mode, so the value comes from `.env.production` — the Railway URL —
   no matter what `.env` says. Getting this wrong makes the app ask production for
   `POST /auth/guest`, which only exists here, and the screen reads *"This build is
   pointed at a server that cannot start a guest session yet."*
3. **A backend running this branch.** The root `.env` already carries
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` — the three
   lines are **indented**, so `grep '^SUPABASE'` finds nothing and they look
   missing. They are not.

To repeat it:

```sh
npm run server
```

Then, in a second terminal:

```sh
VITE_API_URL=http://localhost:3001/api npm run ios:run
```

**Rebuild without that env var before shipping anything.** A bundle carrying
`http://localhost:3001/api` reaches no server on anyone else's phone, and a plain
`npm run build:ios` picks production back up from `.env.production`.

### Answered along the way

- **App Transport Security is not an issue for loopback.** `Info.plist` has no
  `NSAppTransportSecurity` block and `capacitor.config.ts` has no
  `server.cleartext`, and `http://localhost:3001` still reaches the backend from
  the WKWebView. No dev-only ATS exception is needed; do not add one.
- **`ios/App/App/public` holds a *copy* of `dist`**, so an app built after a stale
  `cap copy` renders a blank screen with no error at all. `npm run build:ios`
  orders it correctly (`build` then `cap sync ios`); running `xcodebuild` straight
  after editing web code does not.
- **`supabase db push` timing out is usually not the network.** A connected VPN
  takes the default route (`route -n get default` → a `utun*` interface) and free
  VPNs commonly carry only HTTPS, so Postgres ports 5432/6543 hang while 443 works.
  Disconnect it before blaming Supabase — and before pushing a service-role
  credential through it.

**The local `.env` points at the live Supabase project**, so a guest session
started against a local backend writes a real row to production.

## Open questions nobody has answered

- ~~**Existing account holders** and their server-side data.~~ **Answered
  2026-08-21 (ADR-0012):** local is the source for everyone, so an existing
  account's hosted day comes *down* to the device the first time they sign in on
  one. Nothing is grandfathered because there stop being two classes of storage.
  What happens to the hosted copy afterwards is still open — leaving it
  contradicts "free users' data is never hosted", deleting it is irreversible.
- **Does the App Store date still come first?** Guest mode works. What stands
  between here and a listing that is honest about itself: Health on the device
  (piece 2), and a way to pay (piece 1). Claim is the smaller of the two and
  unblocks revenue.
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
