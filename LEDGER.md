# HealthyFlow — Project Ledger

Auto-updated on every commit. Newest entries appear first.

- GitHub Issues: https://github.com/lermanori/HealthyFlow/issues
- Kanban: https://github.com/users/lermanori/projects/1/views/1

<!-- entries -->

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

