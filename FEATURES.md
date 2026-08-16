# HealthyFlow — What the app actually does

**Last verified against the code:** 2026-08-16

This is an inventory, not a pitch. Everything under "Shipped" is reachable by a
signed-in user today. Anything not built is in the last section, named as such.
If you find a claim here the app does not honour, that is a bug in this file —
fix it here rather than working around it.

Vocabulary (Item, Task, Habit, Rollover, Habit instance, Calorie entry, Workout
session…) is defined once in [`CONTEXT.md`](./CONTEXT.md). This file does not
redefine it.

---

## The shape of the product

The unit is **the day**. There is one timeline, and everything that belongs to a
day earns a place on it — planned or already done. Navigation is deliberately
small:

| Nav group | Destination | Route |
|---|---|---|
| Today | Today | `/` |
| Today | Talk | `/talk` |
| Plan | Work | `/work` — live, no flag |
| Plan | Week | `/week` — **behind a release flag, off in production** |
| Health tools | Health | `/health` → Nutrition `/calories`, Workouts `/workouts`, Progress `/achievements` |
| Utility | Settings | `/settings` |
| Utility | OCR Lab, Token Manager | `/meal-ocr-lab`, `/token-manager` — **admin role only** |

**On mobile the bottom dock is only Today and Talk.** Every other destination —
Work, Health, Settings — is reached through the navigation drawer. Desktop shows
the full sidebar. Both are rendered from the same navigation groups in
`src/components/Layout.tsx`.

The React app is served under `/app`; `/` serves the marketing page
(`public/landing.html`). See `netlify.toml`.

---

## Shipped

### Today — the timeline is the day's record

- One clock per day holding both plans and records.
- **Placement is one rule:** an explicit start time wins; otherwise a settled
  item is stamped at the hour it was resolved; otherwise it stays in the Anytime
  backlog. Wall-clock times resolve against the user's timezone on the server,
  never the viewing device's clock.
- Records that land on the clock: Calorie entries, weight, Workout sessions, and
  each Habit progress chunk — stamped at the hour they were logged.
- A **partial Habit is deliberately not settled**: at 1/2 it is the most open
  thing on the board, so it stays in the backlog while its chunks show on the
  clock as the past facts they are.
- **Anytime backlog** holds only what still needs a decision. Drag an item onto
  an hour to place it; dragging materialises a real row (ADR-0001).
- Date navigation across days, with per-day counts for the surrounding week.
- Morning planning prompt.

**The day is a typed contract, not a list.** `DaySummarySchema`
(`backend/src/day-summary-schema.ts`) is versioned (`version: 1`) and carries a
single ordered **daily plan** of fourteen reference kinds — Calendar events and
transitions, Focus blocks, Tasks, Habits, meal and workout plans, plus recorded
Calorie entries, weight, Workout sessions, Habit progress chunks and Progress
entries. Every reference is tagged `plan`, `actual`, or `boundary`, so intent and
record are distinguished structurally rather than by convention. References point
at the records their modules own; nothing is copied or cross-mutated.

**Focus Now / Next Obligation / Capacity summary strip.** Three separate reads:

- **Focus** — the one Item that most deserves attention, with a reason code. Six
  states, including `nothing_needs_attention`: it declines to pick rather than
  surfacing something arbitrary.
- **Next Obligation** — the next time-fixed commitment across both planned Items
  and Calendar events, with an explicit tie-break (Calendar wins a same-time tie)
  and the ids of anything competing for the slot.
- **Capacity** — usable minutes left in the planning window after known
  obligations and their transition buffers. Reports `complete` (an exact number),
  `partial` (an upper bound), or `unavailable`, with twelve typed reason codes
  saying *why* an answer is incomplete. It never returns a guessed number.

> **Capacity is off for a new account.** `planningWindow` defaults to `null`
> (`backend/src/settings-schema.ts`), and the whole Capacity panel is wrapped in
> `{capacityEnabled && …}` in `TodayPage.tsx`. Until the user sets a planning
> window in Settings, Focus and Next Obligation still render but Capacity is
> absent entirely. This is current behaviour, not a bug report — but it means the
> feature is invisible by default.

### Rollover

- An incomplete, untimed Task carries forward: it shows on day D if its
  `scheduled_date` is NULL or ≤ D, or it was completed on D. Real rows, real ids
  — nothing is faked or rewritten (ADR-0002).
- **Habits do not roll over.** A missed habit day re-synthesises fresh.

### Habits

- Daily habits, synthesised per day rather than pre-written to the database.
- Per-day outcome: pending, partial, completed, or failed. Binary habits record
  an explicit Done / Not done.
- Optional **targets** in minutes, repetitions, or a generic count; **progress
  chunks** accumulate within the day and auto-complete the instance on reaching
  the target.
- Weekly habits (`repeat_type: 'weekly'`) are **not yet synthesised** — a known
  gap recorded in ADR-0002.

### Work

Live at `/work`, no feature flag. Habits and Work are the two modules with **no
user-facing toggle** — `ModuleSettingKeySchema` covers only `calorieIntake`,
`achievementTracker` and `workoutTracker`, so the day contract types Work as
always enabled.

- **Projects** — a bounded work context recording target, definition of done,
  current milestone, deadline, status, summary, blockers, constraints, non-goals,
  decisions, links, and next valuable step. Archive hides without deleting;
  delete unassigns Tasks and preserves Work history as standalone context.
- **Focus blocks** — schedulable, startable plans with a real date and start
  time, planned focused minutes, intended outcome and evidence, referencing
  canonical Tasks without copying or completing them. Lifecycle
  `planned → active → reviewing → completed`, with `canceled` terminal. They are
  primary rows on Today, peers of Items and Calendar events.
- **Work review** — the structured account required to finish a Focus block
  (what changed, evidence, milestone impact, blockers, actual minutes, next step,
  attention). The review, its Work session, confirmed Task/Project updates and
  the block completion are one atomic write. Elapsed time alone never produces a
  Work session.
- **Work sessions** — the durable record of work that happened, including
  manually entered historical sessions.
- Standalone mode: bounded title and context for focused work with no Project. No
  synthetic Project is created.

### Talk (AI)

- **parse-tasks** — free-form text or dictation in, structured `Item`s out
  (v1 emits `task` and `habit` only), reviewed before saving.
- **parse-meals** — plain-language food in, Calorie entries with macros out.
- Conversational chat over the user's own day, with saved conversations
  (list / rename / delete) and a confirm/cancel step before anything is written.
- Work's **Plan in Talk** handoff starts a durable focused-work workflow. A
  bounded single agent reads only Daily Plan and Work capabilities, asks one
  useful clarification when needed, and drafts one editable Focus block. If the
  selected Project has no open Tasks but has enough target context, Talk first
  previews one aligned Task; confirming it creates the Task exactly once and
  automatically continues to the Focus block proposal. Workflow stage and
  proposal state persist separately from chat messages; confirmation revalidates
  current records before writing.
- Voice input (speech-to-text) and text-to-speech playback.
- Server-keyed only. There is no BYOK flow.
- AI runs on **credits**; the core app works without them.

### Health

One workspace, three sections, each independently switchable in Settings. Hiding
a section removes its navigation, Add targets and summaries but never deletes its
records; re-enabling restores the same data. Health leaves the navigation only
when all three are hidden.

- **Nutrition** (`/calories`) — Calorie entries with optional macros, quantity
  and time; a day view with totals; **weight** entries in kg with a
  latest-vs-previous delta and a trend chart. Trackers, not goals: an unrecorded
  day is neutral, never a failure.
- **Workouts** (`/workouts`) — Workout sessions with ordered exercises and
  optional sets, reps, weight (kg), duration, distance. Reusable **Workout
  plans** to start a session from. Quick-insert from recent / most-used exercise
  history. Session history by date.
- **Progress** (`/achievements`) — named measurements with a unit, an improvement
  direction and an optional target. Hybrid: a measurement can be tracked with no
  target at all.

### Google Calendar

- OAuth connect / disconnect from Settings.
- Two-way sync for a date: timed Tasks push out, external events come in.
- Completion and schedule changes propagate to the external event.

### Accounts & access

- Email + password auth with JWT.
- **Google sign-in** through Supabase Auth with PKCE, exchanged for the normal
  HealthyFlow session at `POST /api/auth/google`. A verified Google email links
  to an existing password account rather than creating a duplicate. On iOS this
  runs natively in-process (`GoogleSignInPlugin`, ADR-0006) rather than through
  the web redirect.
- **Sign in with Apple**, native on iOS (`AppleSignInPlugin`).
- **Signup is gated.** Public slots are a counter whose schema default is **10**
  (`public_slots_open` in `20260726120000_add_waitlist_access.sql`); the live
  value is whatever the row currently holds. When slots are exhausted the
  Create-account tab does not render and the login page offers the waitlist
  instead. An `?invite=` token always opens the form. The check **fails closed**:
  if the signup-status call errors, the Create-account tab is hidden rather than
  showing a form that cannot be honoured.
- Waitlist capture (landing page and login page) with UTM attribution.
- Guided **persona demos** at `/app/demo` — four seeded workspaces (Maya, Noam,
  Lina, Amir) walking through the real surfaces with stable demo data, narrated
  with subtitles and voiceover.
- Account deletion.
- A remote **MCP endpoint** with OAuth 2.1 authorization-code + PKCE for ChatGPT,
  short-lived access tokens, rotating refresh tokens, and user-revocable grants.
- Scoped **API tokens** (`hf:read`, `hf:write:add|update|complete|delete`) remain
  available for developer clients that accept a custom Authorization header.
- Admin-only surfaces: Token Manager, OCR Lab.

### Notifications & rhythm

- Web push subscribe / unsubscribe, plus a test-notification trigger.
- A configurable daily / weekly touchpoint **rhythm**.
- Toggles for notifications, daily reminders, weekly reports, AI suggestions,
  smart reminders and completion sounds.

### iOS app

The same React app runs inside a **Capacitor iOS shell** (`ios/`, app id
`app.healthyflow.mobile`, deployment target iOS 17). It is a real native target,
not a wrapped web page:

- Marketing version **1.0.1**, build 2 — uploaded to App Store Connect and
  distributed through **TestFlight**. Not publicly listed on the App Store.
- Native **Sign in with Apple** and native **Google sign-in** plugins, both
  confirmed on a physical device.
- A **WidgetKit Today widget** (`HealthyFlowWidget`) backed by the canonical
  DaySummary, sharing data through App Group `group.app.healthyflow.mobile`.
- **Server-controlled version gate** (`backend/src/mobile-version.ts`): three
  outcomes rather than two. Below `IOS_MINIMUM_VERSION` blocks; at or above the
  minimum but below `IOS_LATEST_VERSION` shows a dismissible update banner;
  dismissal is keyed per released version. Setting the two equal disables the
  nudge without disabling the gate.
- Native surface also covers deep links, APNs push, notification permissions,
  haptics, sharing, safe-area handling and a native-style bottom navigation.
- **No StoreKit / in-app purchase.** There is no purchase code anywhere in
  `ios/App`, `src`, or `backend/src`.

### PWA

- Installable, with a service worker that caches the app shell and static assets,
  so the app **loads** without a connection.
- **Not offline-capable for data**: API requests are network-only and return a
  503 when offline. There is no local write queue and no background sync.

### Settings

Health-tool switches, week start day, planning window, theme (Midnight / White),
notification and rhythm controls, Google Calendar connection, credits and the
subscribe / top-up contact flow, API tokens, account deletion.

### Billing

Credits are metered server-side and the balance is visible in Settings. There is
**no payment integration** — "Subscribe" and "Buy More" open a message to the
founder, and fulfilment is manual by design at this stage.

---

## Behind a flag

Both flags live in `src/featureFlags.ts` and are set in neither `.env.production`
nor `netlify.toml`, so both features are invisible to every production user.
Do not market either until its flag is on.

- **Week** (`/week`) — a weekly plan with per-day completion and habit
  consistency. `VITE_WEEK_VIEW_ENABLED`. The route redirects to Today and the nav
  entry is hidden. Tracked by
  [#148](https://github.com/lermanori/HealthyFlow/issues/148).
- **Daily Signals** — reviewable observations about the day (e.g. a habit missed
  several recent days and due today). `VITE_DAILY_SIGNALS_ENABLED`. Hidden from
  Today by default while the behaviour matures; the implementation is intact and
  the e2e suite forces the flag on so its coverage stays live.

---

## Not built

Listed because the vocabulary, or an older doc, might suggest otherwise.

| Thing | Status |
|---|---|
| Grocery list management | `grocery` exists as a category, an Item type and a daily-plan reference kind; there is no list UI or backend |
| Meal planning (as Items) | `meal` is an Item type and a daily-plan reference kind; nutrition is served by Calorie entries instead |
| Weekly Habit instances | `repeat_type: 'weekly'` is accepted but not synthesised per day (ADR-0002) |
| Real-time cross-device sync | No Supabase realtime channels anywhere. Data refreshes on query invalidation, not push |
| Offline data entry | The shell caches; API calls do not. See PWA above |
| Location-based reminders | Items carry a location field; nothing triggers on it |
| Payments | Manual fulfilment only, on every platform. No Stripe, no StoreKit. See Billing above |
| Public App Store listing | The iOS app is in TestFlight only; it has not been through full App Review |
| Android | No Capacitor Android target, no Play Store presence |
| Team / shared workspaces | Not built |

---

## Where the rest of the truth lives

- [`CONTEXT.md`](./CONTEXT.md) — domain vocabulary, the canonical definitions.
- [`docs/adr/`](./docs/adr/) — the decisions behind materialisation, scheduling,
  the LLM data-access interface, and habit outcomes.
- [`MARKETING.md`](./MARKETING.md) — positioning, pricing, and the go-to-market
  fix list.
- [GitHub Issues](https://github.com/lermanori/HealthyFlow/issues) and
  [Project 1](https://github.com/users/lermanori/projects/1/views/1) — the source
  of truth for what is in progress and what is next.
- `docs/archive/2026-06-19-v1-launch-prd.md` — the shipped v1 PRD, historical.
