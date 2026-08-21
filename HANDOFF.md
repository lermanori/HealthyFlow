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

Claim was designed on 2026-08-21 and the design is approved:
`docs/history/specs/2026-08-21-claim-by-signup-design.md`. Designing it settled
four product decisions, recorded in **ADR-0012** — entry is open, the waitlist
quota moves to Cloud as a founders' discount, credits and Cloud are separate
products, and local is the source for everyone. Three of those reverse something
previously written down. Read the ADR before touching auth, pricing or the
waitlist.

The work splits into three pieces, in this order:

1. **Claim by signup.** `POST /auth/claim` — one guarded `UPDATE`, no slot, no
   credits. Entry point in the menu's account block, where Logout sits for
   everyone else. Designed and specced; next step is an implementation plan.
   **This is the sharpest gap in what shipped:** a Guest cannot become an account
   holder, so they cannot buy credits, so the paid product is unreachable from the
   free one.
2. **Health on the device.** The Local day learns calorie entries, weight, workout
   sessions and achievements; four more services get `onDevice` branches. Closes
   the contradiction ADR-0011 records and `TARGET.md` names. Not designed.
3. **Sign in to an existing account.** Authenticate, pull the account's day down
   via the existing `buildAccountExport`, offer Keep both or Discard in real
   numbers, rewrite `user_id`, switch identity, forfeit the guest row's credits.
   **Depends on piece 2** — until Health is local, the download has nowhere to put
   it. Not designed; its decisions are recorded in the Claim spec so they are not
   re-litigated.

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

## Verified end to end, 2026-08-21

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
