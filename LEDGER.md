# HealthyFlow — Project Ledger

Auto-updated on every commit. Newest entries appear first.

- GitHub Issues: https://github.com/lermanori/HealthyFlow/issues
- Kanban: https://github.com/users/lermanori/projects/1/views/1

<!-- entries -->

### 2026-06-23 19:32 — `main`

Shipped the installable PWA version to Netlify and redeployed the Railway backend. The frontend now has real manifest/icon assets, a focused service worker, Netlify SPA/PWA headers, and a stronger PWA regression test; production was verified with an active service worker and Railway-backed API URL. Railway deployment was repaired by making the backend install/build from `backend/package.json` during image build and start the compiled server directly; the live health endpoint returns 200.

---

### 2026-06-23 18:43 — `codex/calendar-sync`

Merged `main` into the Google Calendar sync branch to resolve PR #42 conflicts. Combined the regular-task update path so it both applies the ADR-0002 someday→today normalization (from main) and syncs the row to Google Calendar (from this branch); dropped the dead `/rollover` route per main's intentional removal. The calendar sync foundation remains: OAuth connection management, imported Google events in the day timeline, outbound timed-task syncing, visible sync badges, and matching wall-clock rendering for synced/imported events.

---

### 2026-06-23 18:43 — `issue-37-docs-flake-ci`

Extended `tests/e2e/README.md` with comprehensive documentation: what the 12-test suite covers (6 specs listed in a table), what it intentionally does NOT (AI correctness, performance, visual regression, parallelism), how to run headed/headless with and without the OpenAI key, how `/test/reset` works including the `page.request.post()` gotcha (SPA catch-all blocks `page.goto()` to the endpoint), how AI stubbing works + the pattern for adding new fixtures, how to view Playwright traces on failure, and the flake-quarantine policy (two flakes within a calendar week → `test.fixme()` + new tracking issue, no `test.retry(N>1)`, run-level retries stay 1 on CI / 0 locally). Added a CI-shape check section documenting the measured ~47s wall-clock (under 90s target), exit codes, and that GitHub Actions wiring is a follow-up. Updated root `README.md` with a one-line regression gate: "if `npm run test:e2e` is green, the golden paths still work" linking to the e2e README. No spec logic changed; all 12 tests still pass in serial mode; backend Jest 81/81 green; build clean.

---

### 2026-06-23 14:30 — `issue-36-ai-stubs`

Added Playwright AI network stubs so the full e2e suite (12 tests) runs green with `OPENAI_API_KEY` unset. All four `/api/ai/*` routes are intercepted by a shared `ai-stubs.ts` fixture before reaching the backend; committed JSON fixtures under `tests/e2e/fixtures/ai/` provide shape-correct stub responses. All specs now import `{ test, expect }` from the stub fixture instead of `@playwright/test` directly. Backend Jest (81 tests) and `npm run build` remain green.

---

### 2026-06-23 — `issue-35-week-view`

Week view golden path (#35) — feature + e2e. The week view was a stub (only today's tasks fetched; other days rendered `Math.random()` placeholders), so the golden path needed the feature made real first: `WeekViewPage` now fetches all 7 days in parallel via `useQueries`, removes the random data, and renders each day's real tasks + completed/total counts (day cards tagged `data-date` for stable targeting). New `tests/e2e/week-view.spec.ts` adds a task for today and a timed task for another in-week day, then asserts each lands under its correct day column (timed so ADR-0002 carry-forward doesn't leak it into today). Also hardened the suite: replaced the no-op `page.goto('/test/reset')` (swallowed by the SPA catch-all) with `page.request.post('/test/reset')` in the habit + lifecycle specs, and set Playwright `workers: 1` — every spec resets the one shared Supabase test user, so parallel workers were clobbering each other (flake policy item for #37: per-worker test users would re-enable parallelism). Suite 12 green across two consecutive runs; backend 81 green; build clean.

---

### 2026-06-23 18:00 — `issue-34-rollover`

Added `tests/e2e/rollover.spec.ts`, the ADR-0002 golden-path E2E test. The spec uses the Add Item form's date field to create a real untimed task dated yesterday (no Date mocking, no API seeding), then asserts it surfaces on today's Dashboard via carry-forward. Key finding: AddItemPage does not inherit the Dashboard's selected date — it always defaults to today, but exposes a `<input type="date">` that the test fills directly with yesterday's date. Full E2E suite now 11/11 passing; backend Jest 81/81 green.

---

### 2026-06-23 — `issue-33-habit`

Added the habit golden path E2E spec (issue #33), guarding the per-day isolation invariant: completing today's habit instance must not bleed into tomorrow's. The test uses the real UI — Item Type toggle to select Habit, the "Next day" arrow for date navigation — no URL hacking. All 10 Playwright tests pass (plus backend Jest 81/81 and frontend build green). Confirmed the server-side fix already in place; the spec found no bug.

---

### 2026-06-23 — `issue-32-task-lifecycle`

Completed issue #32: task lifecycle (complete/edit/delete) golden-path E2E tests. Created `tests/e2e/items-lifecycle.spec.ts` with three fully independent tests: **Complete** (mark complete via checkbox, assert strikethrough, reload, assert persisted), **Edit** (open menu, click Edit, change title via modal input, click "Save Changes", assert new title on Dashboard), and **Delete** (open menu, click Delete, accept confirm dialog, assert task vanishes). All tests start from `POST /test/reset` for isolation, create the task via the real UI (no API shortcuts), and drive completion through actual UI interactions. Selectors confirmed against source: checkbox is first button in TaskCard flex container; MoreVertical menu button is second button (revealed on hover); Edit/Delete are dropdown menu items; TaskEditModal input has placeholder "Enter task title..."; save button is "Save Changes" (not type="submit"). All 9 e2e specs green (6 prior + 3 new); backend Jest 81/81; build passes.

---

### 2026-06-23 15:45 — `issue-31-auth-session`

Completed issue #31: added logout + session-persistence E2E tests. Restructured `tests/e2e/auth.spec.ts` into two `test.describe` blocks with independent `test.use({ storageState })` — one for unauthenticated flows, one for authenticated flows — so tests are order-independent and can mix storage states cleanly. Added "logout" test: logs in, finds and clicks the logout button in the Layout header (selector: `button:has-text("Logout")`), asserts LoginPage is visible afterward, and navigates to `/` to confirm it does NOT redirect back to the authenticated Dashboard. Added "persist-across-reload" test: uses the shared `storageState` from `auth.setup.ts`, navigates to `/`, reloads the page, and asserts the Dashboard is still visible. All 6 e2e tests green (setup + 5 specs); backend Jest 81/81 green; build passes. Logout affordance confirmed: `button:has-text("Logout")` in both desktop header and mobile menu in `Layout.tsx`.

---

### 2026-06-23 — `issue-30-add-task`

Completed issue #30: reusable Playwright auth fixture + items-add E2E golden path. Added `tests/e2e/auth.setup.ts` (setup project that logs in via real UI, waits for authenticated nav to appear, saves `storageState` to `.auth/user.json`). Updated `playwright.config.ts` to add a `setup` project and a `chromium` project that depends on it with shared `storageState`. Fixed `auth.spec.ts` to opt out via `test.use({ storageState: { cookies: [], origins: [] } })` so the login-flow test starts unauthenticated. Rewrote `items-add.spec.ts` to rely on shared auth (no manual login per test): tests navigate directly to `/add`, fill the form, submit, and assert the task appears on the Dashboard. Root cause of previous agent's blocker: a stray Vite dev server from another project (named "Adama") was occupying port 5173 via `reuseExistingServer: true`; additionally the `h1` locator prematurely matched the LoginPage heading before login completed. All 5 e2e tests green; backend Jest 81/81; build passes.

---

### 2026-06-23 14:30 — `issue-29-e2e-spine`

Laid the Playwright E2E spine (issue #29). Added `@playwright/test` as a devDependency, `playwright.config.ts` with two webServer entries (Vite + Express in HF_TEST_MODE), and `tests/e2e/` containing globalSetup (idempotent Supabase test-user seed + task reset), `auth.spec.ts` (one login→Dashboard golden-path test), and a README. Backend gained `db.resetTestUser` in `supabase-client.ts` and a `POST /test/reset` route in `index.ts` that mounts only when `HF_TEST_MODE=1`. TDD'd the 404 guard (red→green before wiring the route). Full backend suite 81 green; `npm run test:e2e` passes in ~3s locally.

---

### 2026-06-23 — `main`

Closed out the habit/rollover scheduling work and fixed the last "drag doesn't persist" bug. Root cause was not the write path but GET assembly: the `dailyHabits` query matched instance rows (not just templates), so another day's instance leaked into the viewed day, and habit templates carried a stray `scheduled_date` that made them double as a dated day-0 row colliding with materialized instances. Fix: `dailyHabits` now selects templates only (`original_habit_id IS NULL`), the `originalHabitsForDate` query/branch is gone, and read-time dedup is deterministic (real beats virtual, oldest wins). Ran a one-off cleanup (`backend/scripts/cleanup-habit-model.js`) nulling templates' stray dates and collapsing duplicate instances. Landed ADR-0002 (one rule for untimed tasks) and the slimmed `rollover.ts`/`tasks.ts`. Backend suite 79 green (added `habit-instance-dedup` + `rollover-carry-forward` specs); issue #9 moved to Done.

---

### 2026-06-22 — `fix/habit-drag-edit-scheduling`

Fixed a cluster of habit drag/edit scheduling bugs and added per-day vs whole-habit edit scope. Swapped the abandoned `react-beautiful-dnd` for the maintained `@hello-pangea/dnd` so drops actually register under React 18 StrictMode. Stopped habit drags/edits from leaking a per-day time into the parent (and thus all future virtual instances): drags on a recurring-habit parent now materialize a dated instance, and the edit modal offers "This day only" (per-day override) vs "The whole habit" (parent, today-forward; past real history stays frozen). Made `createHabitInstance` idempotent (one row per habit/day) with explicit `completed` semantics, fixing completed habits flipping incomplete on drag and teleporting to untimed on complete. Backend suite now 69 green (added `isPureDragUpdate` + override-shape specs).

---

### 2026-06-21 17:40 — `main`

Applied the #40 projects migration to the live Supabase (`healthflow`) via `supabase db push`. The first push failed because the spec-derived migration declared `user_id text` while the production `users.id` is `uuid` — corrected the migration to match the existing tasks/users style (UUID PK with `gen_random_uuid()`, `user_id UUID ... ON DELETE CASCADE`, plus an `idx_projects_user_id` index). Re-pushed clean; remote and local migrations are now in sync. Route code needed no change — it passes `uuidv4()` strings which a UUID column accepts, same as tasks.

---

### 2026-06-21 17:15 — `issue-40-projects-backend`

Added the missing backend for the projects feature (issue #40): a Supabase migration (`projects` table), five `db.*` project methods in the deep-module `supabase-client.ts`, and a thin `/api/projects` route covering GET, POST, PUT, DELETE, and PATCH /archive — all scoped to the authenticated user. Frontend `ProjectSelector.tsx` now shows a visible toast on failure and auto-selects + invalidates the projects query on success. All 48 prior tests remain green; 13 new TDD-driven tests bring the total to 61.

---

### 2026-06-21 16:45 — `main`

Committed a standalone Rollover dedupe fix that had been sitting uncommitted in the worktree. `Rollover.listForDay` and the count query now guard on `scheduled_date IS NULL`, so dated "Anytime backlog" tasks (which carry a real `scheduled_date` since #26/#27) are no longer returned both as a regular task for their day and as a rollover. The completed-rollover query gained the same guard plus `start_time`/`rolled_over_from_task_id`/`type` filters so a dated task completed today can't surface as a phantom "completed rollover." All 48 backend Jest tests pass. Also gitignored `.claude/`.

---

### 2026-06-21 16:30 — `main`

Reconciled the contradictory issue-tracker docs: CLAUDE.md previously named GitHub Issues + Project 1 as the source of truth at the top but instructed agents to use local `.scratch/` markdown in the Agent-skills section. Made GitHub Issues + the Project 1 kanban the single source of truth across CLAUDE.md, `docs/agents/issue-tracker.md`, and `docs/agents/triage-labels.md` (triage roles now map onto the board's `Status` field). Removed the `.scratch` ignore line, deleted the stray `.scratch` reading guide, and dropped a stale `.scratch` PRD reference from a comment in `routes/ai.ts`. Surfaced while filing #40 (project creation in the task form has no backend `/projects` route — still unimplemented).

---

### 2026-06-21 16:00 — `issue-28-materialize-habit-on-drag`

Implemented Option B for #28: dragging a virtual habit instance (untimed or timed) into an hour slot or the Anytime backlog now materialises a real `tasks` row (`completed: false`) carrying the per-day start_time or position override, so the change survives a page reload. A new `parseHabitInstanceId` helper centralises synthetic-id detection (was three copies of the same regex); `PUT /tasks/:id` detects the virtual id, verifies ownership against the original habit, and calls the extended `db.createHabitInstance` with overrides. The frontend swaps the returned real id in place of the stale synthetic id so a second drag operates on the real row. ADR 0001 records the Option A vs B tradeoff. All 48 backend Jest tests pass; backend and frontend builds clean.

---

### 2026-06-21 14:45 — `issue-27-drag-set-time`

Orchestrator review fix for #27: the new hour-slot bucketing matched tasks with `startTime === "HH:00"` exactly, so any timed task on a non-:00 minute (e.g. "09:30", common from the `type="time"` inputs and the AI parser) — or outside 6am–11pm — matched no slot and, having a startTime, also couldn't fall into the Anytime backlog, vanishing from the timeline entirely. Re-bucketed scheduled tasks by their floored hour, clamped into the 6–23 range, so every timed task stays visible; drops still snap to ":00". Frontend build green; backend 37 Jest tests green.

---

### 2026-06-21 14:30 — `issue-27-drag-set-time`

Implemented drag-to-schedule: the Scheduled section now renders one Droppable per hour slot (6am–11pm, droppableId="HH:00"), and the drop handler branches on destination zone — hour slot sets startTime and clears position, anytime clears startTime and assigns position. Two new pure backend utils (hourSlots, zoneToUpdate) with 7 Jest tests cover the decision logic. Both sections now live inside a single DragDropContext, making timed↔untimed drag fully functional. Backend PUT /tasks/:id already accepted null for startTime; no route changes were needed.

---

### 2026-06-21 12:50 — `issue-26-untimed-backlog-reorder`

Orchestrator review fix for #26: the new PATCH /tasks/reorder route wrote positions via `db.updateTask(id, …)`, which filters by id only — letting a user reorder another user's tasks (IDOR). Added an owner-scoped `db.reorderTasks(userId, pairs)` that filters each update by `user_id`, mirroring the ownership guard already on PUT /:id, and pointed the route at it. Backend build + 30 Jest tests green; frontend build green.

---

### 2026-06-21 09:00 — `issue-26-untimed-backlog-reorder`

Added end-to-end persistence for manual reordering of untimed (Anytime) tasks. A new `position INTEGER` column lands via Supabase migration; GET /tasks returns it; PUT /tasks/:id accepts it; a new PATCH /tasks/reorder batch-writes positions from an ordered id list using the `positionsFromIds` utility. The frontend DayTimeline is restructured into two sections — Scheduled (non-draggable, sorted by start_time) and Anytime (draggable, persisted via the single batch call) — replacing the old per-task update loop. New untimed tasks append to the end of the Anytime backlog via `getNextPosition`.

---

### 2026-06-20 — `fix/ai-analyzer-duplicate-keys`

Closed out bug #22 (duplicate React keys in AITextAnalyzer). The original quickDates `key={date.value}` fix was already preserved through the recent AITextAnalyzer refactor. Additionally hardened suggestion id generation in `parseTasksApi.ts` from index-based `ai-${idx}` to `crypto.randomUUID()`, making each parsed item carry a truly unique stable id as React key — eliminating any future risk of cross-render key collisions. Build passes clean.

---

### 2026-06-20 — `fix/overdue-notifications-date-blind`

Patched a remaining timezone bug in SmartReminders' overdue detection. The previous fix added a `scheduledDate <= todayStr` guard but computed `todayStr` via `toISOString()`, which returns the UTC date — in UTC-N timezones this is one day ahead of the local date, making tomorrow's tasks compare as "today" and fire false overdue toasts. Fixed by computing `todayStr` from local date components (`getFullYear/getMonth/getDate`) so the date boundary always matches what the user sees. Build passes clean.

---

### 2026-06-19 — `refactor/split-ai-text-analyzer`

Completed both architecture refactors (#6 and #7). For #7: replaced the flat 60-field Task interface in `src/services/api.ts` with a discriminated union `Item = TaskItem | HabitItem | GroceryItem | MealItem | WorkoutItem`; `Task` kept as a re-export alias for backward compat. For #6: split the 627-line AITextAnalyzer monolith — business logic now lives in `src/lib/ai/parseTasksSchema.ts` (types), `src/lib/ai/parseTasksApi.ts` (HTTP + mapping), `src/hooks/useParsedItems.ts` (parse-tasks state), and `src/hooks/useAddItems.ts` (mutation + cache invalidation); UI reduced to `src/components/AITextAnalyzer/` with `SuggestionCard.tsx` sub-component and `utils.ts` display helpers. No behaviour changes; build passes clean.

---

### 2026-06-19 21:00 — `issue-20-overdue-date-blind`

Fixed a P1 bug where overdue toast notifications fired immediately for tasks scheduled on future dates. The overdue check in SmartReminders was comparing time-of-day only, ignoring `scheduledDate`; a task at 08:00 tomorrow would trigger "Overdue" as soon as it was added if the current time was past 08:30. The fix adds a `scheduledDate <= today` guard to both the overdue and upcoming checks. A new `isTaskOverdue` utility in `backend/src/utils/isOverdue.ts` documents the contract with 7 unit tests covering future dates, past dates, and the 30-minute boundary.

---

### 2026-06-19 — `issue-21-smartreminders-render-loop`

Fixed a "Maximum update depth exceeded" render loop in SmartReminders.tsx. The root cause was `dismissedIds` being included in the `useEffect` dependency array while `setReminders` was called unconditionally with a new array each run — any dismiss action would trigger an infinite setState cycle. Removed `dismissedIds` from both the `setReminders` call and the dep array; the existing `visibleReminders` filter on line 86 already handles dismissed-item exclusion from the UI, so no behavior changes.

---

### 2026-06-19 20:30 — `issue-22-aitextanalyzer-dup-keys`

Fixed issue #22 (P2 cosmetic): AITextAnalyzer emitted React's duplicate-key warning with a date-string value. Root cause was the two `quickDates` button maps keyed on `date.value` (the YYYY-MM-DD string); on certain weekdays "This Weekend" (`addDays(now, 6 - getDay())`) resolves to the same date as "Tomorrow" (`addDays(now, 1)`), producing two sibling buttons with an identical key. Switched both maps to key on the unique `date.label`. (The suggestion-id map was already sibling-unique and was not the cause.) TypeScript typecheck passes.

---

### 2026-06-19 — `issue-23-recommend-404`

Stopped `POST /api/ai/recommend` 404s that fired on every dashboard load (issue #23). The `/api/ai/recommend` route does not exist server-side; the fix stubs `aiService.getRecommendations` to return `[]` immediately, so the existing graceful-degradation UI ("Complete more tasks to unlock personalized AI recommendations") shows without any network request. Also removed the 5-minute polling interval from the query to avoid repeated no-op calls. No backend changes needed.

---

### 2026-06-19 20:00 — `main`

Verified issue #2 (AI parser canonical fields) end-to-end: `OPENAI_API_KEY` was added to `.env` and all three test phrases ("30 minute run tomorrow morning", "Weekly meal prep every Sunday 2 hours", "Take vitamins daily") returned correct `duration`, `repeat`, and `category` fields from GPT with no hardcoding. Diagnosed and fixed the UI not working: `VITE_API_URL` was pinned to the production Railway URL, so the browser was calling Railway (which has no API key) instead of localhost. Swapped it to `http://localhost:3001/api` for local dev. Production Railway still needs `OPENAI_API_KEY` added via the Railway dashboard before the AI analyzer works in prod.

---

### 2026-06-19 13:30 — `main`

Fixed the self-signup rate limiter crashing the backend on boot (`ERR_ERL_KEY_GEN_IPV6`): removed the unsafe custom `keyGenerator` in `auth.ts` and now rely on express-rate-limit's IPv6-safe default, with `app.set('trust proxy', 1)` in `index.ts` so `req.ip` resolves to the real client behind Railway's proxy (one bucket per client, not per proxy). Added `backend/scripts/seed-demo.ts`, an idempotent seed that upserts `demo@healthyflow.com` with a fresh `demo123` hash so the advertised demo credentials actually log in. All 17 backend tests still pass.

---

### 2026-06-19 12:00 — `issue-8-timeline-ordering`

Fixed a critical bug (#8) where tasks with a `start_time` earlier in the day sorted after afternoon tasks when the afternoon task had an earlier `created_at`. The root cause was a broken comparator in `getTasksWithRecurringHabits`: when only one of the two tasks had a `start_time`, the sort fell through to `created_at` order, completely ignoring the timed task's time value. Extracted a pure `sortTasksForTimeline` helper (with 4 unit tests that reproduce the bug) and wired it into `supabase-client.ts`, replacing the broken inline sort. All 17 backend tests pass; frontend typechecks clean.

---

### 2026-06-19 11:59 — `issue-13-prod-api-wiring`

Fixed production API wiring: changed `.env` to pin Railway URL (https://healthyflow-production.up.railway.app/api) instead of localhost:3001, so the Netlify build reads the correct backend. Dev fallback is preserved in src/services/api.ts for local development. Vite build passes.

---

### 2026-06-19 00:00 — `issue-14-self-signup`

Implemented P0.2 self-signup (issue #14): added a public POST /api/auth/signup route with Zod validation, bcrypt hashing, and JWT response — reusing every existing auth helper. Rate limiting (5 req/IP/15 min via express-rate-limit) is scoped to that route only; admin /register is untouched and regression-tested. All 7 new TDD tests (new email, duplicate email, short password, bad email, rate limit, admin regression x2) pass alongside the 6 existing backend tests (13 total). Frontend LoginPage.tsx now toggles between "Sign in" and "Create account" with inline error surfacing for duplicate email.

---

### 2026-06-19 17:24 — `issue-17-hide-item-types`

Hidden unbuilt item types (grocery, meal, workout) from the UI selector on AddItemPage. Filtered the itemTypes array to show only task and habit options, removing the user-facing selector buttons for the three types whose backends don't exist yet. Zod type definitions and TypeScript interfaces left untouched — the full types remain in the schema for v2.2 implementation. Frontend build and typecheck passed with no errors.

---

### 2026-06-19 09:19 — `issue-10-habit-bar`

Fixed the habit tracker progress bar not rendering on the dashboard. Root cause: the sidebar motion.div animation was not completing, leaving the sidebar element invisible (animating off-screen or stuck in initial state). Converted the sidebar from motion.div to a regular div, removing the Framer Motion animation that was preventing the card from rendering. Also corrected the backend's virtual habit instance detection to properly set isHabitInstance based on ID pattern matching instead of relying on a non-existent database field. Frontend build passed with no errors.

---

### 2026-06-19 16:32 — `issue-16-ask-ai-input`

Fixed the AskAI input collapsing after sending by converting single-answer state to a conversation thread array. Input now clears after each send but remains visible and focused, letting users ask follow-up questions immediately. Each exchange renders as question+answer pair in the thread, and quick-question buttons hide once conversation starts. Frontend build passed with no type errors.

---

### 2026-06-19 15:47 — `issue-15-sticky-footer`

Fixed the Analyze button hiding on scroll in the AITextAnalyzer modal. Restructured the modal into three flex zones: fixed header, scrollable content area, and fixed footer. Moved the "Analyze & Generate Tasks" button to the sticky footer so it remains visible and clickable regardless of content height. Both the analyze and add-tasks buttons now live in the footer, ensuring users can always trigger analysis. Build confirmed clean.

---

### 2026-06-18 12:15 — `main`

Simplified the commit workflow: the post-commit hook has been stripped down to a no-op, and the agent now owns the ledger directly — writing a narrative entry to LEDGER.md before each commit so it lands in the same commit as the code. CLAUDE.md documents the new workflow clearly. The GitHub Wiki Home page is live and a sync Action is in place to keep the Ledger wiki page up to date on every push.

---

### 2026-06-18 11:49 — docs: add task tracking refs, ledger hook, and architecture rules to CLAUDE.md

- **Commit**: `5a34114` · branch `main`
- **Author**: Ori Lerman
- **Files changed** (4):
  - .githooks/post-commit
  - CLAUDE.md
  - CONTEXT.md
  - LEDGER.md

---
