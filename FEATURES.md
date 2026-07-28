# HealthyFlow — What the app actually does

**Last verified against the code:** 2026-07-28

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
| Plan | Week | `/week` — **behind a release flag, off in production** |
| Health tools | Health | `/health` → Nutrition `/calories`, Workouts `/workouts`, Progress `/achievements` |
| Utility | Settings | `/settings` |

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
- Focus Now / Next Obligation / Capacity summary strip.
- Morning planning prompt.

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

### Talk (AI)

- **parse-tasks** — free-form text or dictation in, structured `Item`s out
  (v1 emits `task` and `habit` only), reviewed before saving.
- **parse-meals** — plain-language food in, Calorie entries with macros out.
- Conversational chat over the user's own day, with saved conversations
  (list / rename / delete) and a confirm/cancel step before anything is written.
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
- **Signup is gated.** Public slots are a counter that defaults to 0; when it is
  exhausted the Create-account tab does not render and the login page offers the
  waitlist instead. An `?invite=` token always opens the form.
- Waitlist capture (landing page and login page) with UTM attribution.
- Guided **persona demos** at `/app/demo` — four seeded workspaces (Maya, Noam,
  Lina, Amir) walking through the real surfaces with stable demo data, narrated
  with subtitles and voiceover.
- Account deletion.
- Scoped **API tokens** (`hf:read`, `hf:write:add|update|complete|delete`) and an
  MCP endpoint, so an external agent can work against a user's day.
- Admin-only surfaces: Token Manager, OCR Lab.

### Notifications & rhythm

- Web push subscribe / unsubscribe, plus a test-notification trigger.
- A configurable daily / weekly touchpoint **rhythm**.
- Toggles for notifications, daily reminders, weekly reports, AI suggestions,
  smart reminders and completion sounds.

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
| Grocery list management | `grocery` exists as a category and an Item type; there is no list UI or backend |
| Meal planning (as Items) | `meal` is an Item type; nutrition is served by Calorie entries instead |
| Weekly Habit instances | `repeat_type: 'weekly'` is accepted but not synthesised per day (ADR-0002) |
| Projects | Backend routes and a selector on Add Item exist; there is no projects view |
| Real-time cross-device sync | No Supabase realtime channels anywhere. Data refreshes on query invalidation, not push |
| Offline data entry | The shell caches; API calls do not. See PWA above |
| Location-based reminders | Items carry a location field; nothing triggers on it |
| Payments | Manual fulfilment only. See Billing above |
| Native mobile app | PWA only |
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
