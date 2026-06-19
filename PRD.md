# HealthyFlow — Product Requirements Document

**Owner:** Ori Lerman
**Audience:** Scrum Master, Engineering
**Last updated:** 2026-06-19
**Status:** v1 sprint-ready

---

## Product Vision

HealthyFlow is an AI-powered personal productivity app. Users capture what they want to do — tasks and recurring habits — in plain language, and the app schedules, tracks, and rolls them forward day to day. The core differentiator is the AI parse-tasks feature: type a paragraph, get a structured daily plan.

---

## Guiding Principles

- **Ship the loop, not the platform.** v1 is the core habit + task + AI loop working end-to-end for real users. Everything else is v2.
- **No broken features in prod.** If a feature isn't backed by working code, it doesn't appear in the UI. "Coming soon" is better than a broken click.
- **Strangers must be able to use it.** Every v1 requirement is evaluated from the perspective of a user who found the app cold with no help from the founder.

---

## v1 — Public Launch MVP

**Goal:** A stranger can land on HealthyFlow, create an account, use AI to add their day's tasks and habits, complete them, and come back tomorrow to see their streak. Nothing broken. Nothing embarrassing.

**Target timeline:** One sprint (~1 week)

---

### P0 — Launch Blockers (must ship before anything else)

These are not features. They are the reason the app is currently broken for real users.

---

#### P0.1 — Wire backend to production frontend

**Context:** `VITE_API_URL` in the deployed Netlify build is set to `http://localhost:3001/api`. The Railway URL (`https://healthyflow-production.up.railway.app/api`) is commented out. Every API call from the live site silently fails.

**Work:**
1. Confirm Railway backend is running — hit `GET /api/health` and verify a 200 response.
2. If Railway is not running: redeploy from `main` with correct env vars (`PORT`, `JWT_SECRET`, `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ADMIN_TOKEN`).
3. Set `VITE_API_URL=https://healthyflow-production.up.railway.app/api` as a Netlify environment variable.
4. Trigger a Netlify redeploy.

**Acceptance criteria:**
- `GET https://healthyflow-production.up.railway.app/api/health` returns `{ status: "OK" }`.
- Logging in with the demo account on the Netlify URL returns real data from Supabase (not a network error).
- The browser network tab shows API calls going to Railway, not localhost.

---

#### P0.2 — Self-signup (open registration)

**Context:** `POST /api/auth/register` exists but is admin-gated (requires `ADMIN_TOKEN`). There is no way for a stranger to create an account. The current login page has no "Create account" option.

**Backend work:**
1. Add a new public route `POST /api/auth/signup` (keep the existing admin `/register` route untouched).
2. The public route accepts `{ email, password, name }`, validates input (email format, password min 8 chars), hashes the password, creates the user in Supabase, and returns a JWT token — identical flow to login.
3. Add basic rate limiting on this route (e.g. 5 requests per IP per 15 minutes using `express-rate-limit`).

**Frontend work:**
1. On `LoginPage.tsx`, add a toggle between "Sign in" and "Create account" modes.
2. "Create account" form: name, email, password, confirm password.
3. On success, store the JWT token and redirect to the dashboard — same as login.
4. Show a friendly inline error if the email is already taken.

**Acceptance criteria:**
- A user with no prior account can sign up with a new email, land on the dashboard, and see an empty state (no tasks).
- Attempting to sign up with a duplicate email shows a clear error message.
- The original demo account login still works.
- The admin `/register` endpoint still requires `ADMIN_TOKEN`.

---

### P1 — Critical UX Bugs (known from QA, must fix for launch)

These were identified in the July QA review. They affect the core experience.

---

#### P1.1 — Habit tracker bar not visible on dashboard

**Context:** The `HabitTrackerBar` component exists but isn't displayed on the main dashboard view. Habits are the second core feature of the product — if they're invisible, the product looks broken.

**Work:**
1. Render `HabitTrackerBar` prominently on `DashboardPage.tsx` — above or alongside the task list, not buried.
2. Each habit row must show: habit name, a tap-to-complete button, and completion state (checked / unchecked).
3. A summary line at the top: "3 of 5 habits done today."

**Acceptance criteria:**
- Opening the dashboard shows today's habits with completion buttons.
- Tapping complete on a habit marks it done (persists on refresh).
- Habit completion state resets the next day (virtual instance logic already handles this).

---

#### P1.2 — AI Analyzer "Analyze" button hidden on scroll

**Context:** The "Analyze & Generate Tasks" button is positioned inside the scrollable content area of the modal. When the user types a long paragraph, the button scrolls out of view and the user cannot submit.

**Work:**
1. Refactor `AITextAnalyzer.tsx` modal layout: fixed header, scrollable content area (`flex-1 overflow-y-auto`), fixed footer with the action button.
2. The "Analyze & Generate Tasks" button must always be visible at the bottom of the modal, regardless of content height.

**Acceptance criteria:**
- Type 10+ lines of text into the AI Analyzer. The "Analyze" button is always visible without scrolling.
- Clicking it from the fixed footer triggers analysis correctly.

---

#### P1.3 — Timeline task ordering bug

**Context:** Tasks scheduled after noon appear in the wrong time slots (e.g., an 18:30 task shows in the 3 PM row). The time column is decorative — it doesn't drive positioning.

**Work:**
1. In `DayTimeline.tsx`, implement time-based absolute positioning for tasks using `startTime`.
2. Tasks without a `startTime` fall into an "Unscheduled" section at the bottom.

**Acceptance criteria:**
- A task scheduled at 9:00 AM appears in the 9 AM row.
- A task scheduled at 18:30 appears in the 6:30 PM row.
- Tasks without a time appear in an "Unscheduled" section, not in a time slot.

---

#### P1.4 — Ask AI input collapses after sending

**Context:** The input field in `AskAIModal.tsx` collapses or becomes inaccessible after sending a question, preventing follow-up questions.

**Work:**
1. After sending, clear the input value but keep the field rendered and focused.
2. Display the question + answer as a conversation thread above the input (question → answer → question → answer).

**Acceptance criteria:**
- Send a question. The input field remains visible and focused.
- Type and send a follow-up question. Both exchanges appear in the thread.

---

### P2 — Hide Unbuilt Features

**Context:** The UI surfaces grocery, meal, and workout item types. The backend for these does not exist. Clicking them creates a broken experience for real users.

**Work:**
1. Audit every surface where grocery, meal, and workout types appear (add item form, item type selector, category filters, navigation).
2. For each: either remove the option entirely OR replace it with a disabled state labeled "Coming soon."
3. Do not build the backend. This is a hide, not a build.

**Acceptance criteria:**
- A user cannot successfully submit a grocery, meal, or workout item.
- The UI does not show error states or empty results for these types — they simply don't appear as active options.

---

### P3 — Launch Polish

These are not optional for a public launch.

---

#### P3.1 — Custom domain

**Context:** `keen-monstera-82e39e.netlify.app` is not a product. It signals "side project in progress" to any visitor.

**Work:**
1. Connect a real domain in Netlify (e.g. `healthyflow.app` or similar).
2. Update CORS config on the Railway backend to allow the new domain.

**Acceptance criteria:**
- The app is accessible at a real domain, not the Netlify-generated URL.
- No CORS errors after the domain switch.

---

#### P3.2 — Stranger smoke test

Before launch, run the full new-user flow end-to-end with a fresh incognito window:

1. Land on the homepage.
2. Create a new account.
3. Use AI parse-tasks to add items from a plain-language paragraph.
4. Complete a task. Complete a habit.
5. Return the next day (or simulate date change) — verify rollover works and habits reset.

**Acceptance criteria:**
- All five steps complete without errors.
- No console errors visible to the user.
- The experience would not embarrass the founder if shared on social media.

---

## v1 Scope Boundary — Explicit Exclusions

The following are **not in v1**. Do not build them, do not surface them.

| Feature | Status | Reason excluded |
|---|---|---|
| Grocery list management | UI exists, no backend | Backend not built |
| Meal planning & nutrition | UI exists, no backend | Backend not built |
| Workout tracking | UI exists, no backend | Backend not built |
| Projects dashboard & analytics | Frontend partial, no backend | Backend not built |
| Drag & drop persistence | UI exists, no backend | Nice-to-have, not core |
| Cross-feature AI intelligence | Not built | Phase 3 in roadmap |
| Calendar sync | Not built | Phase 5 in roadmap |
| Native mobile app | Not built | Long-term |
| Team / shared projects | Not built | Long-term |

---

## v2 — Post-Launch Sprint

**Goal:** Once v1 is live and the core loop is stable, expand the product into the full platform vision. v2 is scoped after v1 ships and real user feedback is collected.

---

### v2.1 — Projects (backend completion)

**Context:** The frontend project selector (`ProjectSelector.tsx`) exists and the UI for assigning items to projects is built. The backend has no projects table and no project routes.

**Work:**
1. Create `projects` table in Supabase (id, user\_id, name, description, color, is\_archived, created\_at).
2. Add `project_id` FK column to `tasks` table.
3. Implement `backend/src/routes/projects.ts`: CRUD + archive.
4. Build `ProjectsPage.tsx` — a dedicated project view showing items grouped by project, with per-project completion progress.
5. `ProjectCard.tsx` component: name, color, task count, completion bar.

**Acceptance criteria:**
- User can create a project, assign tasks/habits to it, and view all project items in one place.
- Archiving a project hides it from the main list but data is preserved.

---

### v2.2 — Unified item types (grocery, meal, workout)

**Context:** The three item types are visible in the UI but have no backend support. This is the Phase 1 platform expansion.

**Work (per type — do as separate sub-tasks):**

**Grocery:**
1. DB: `grocery_lists` + `grocery_items` tables (see FEATURES.md schema).
2. Backend routes: `GET/POST /api/grocery/lists`, `POST /api/grocery/lists/:id/items`, `PUT/DELETE /api/grocery/items/:id`.
3. Frontend: activate the grocery item type in add forms, build a shopping list view.

**Meal:**
1. DB: `diet_plans` + `meals` tables.
2. Backend routes: CRUD for meals and diet plans.
3. Frontend: meal creation form with calories/macros, daily nutrition summary.

**Workout:**
1. DB: `workout_plans` + `workouts` tables, `exercise_library`.
2. Backend routes: CRUD for workouts and plans.
3. Frontend: workout creation with exercise/set/rep tracking.

**Acceptance criteria (per type):**
- User can create an item of that type, see it on their dashboard for the scheduled day, and mark it complete.
- Data persists across sessions.

---

### v2.3 — Enhanced analytics

**Context:** The analytics foundation (weekly charts, category breakdown) exists. Add habit streaks and cross-feature insights.

**Work:**
1. `HabitStreakChart.tsx` — current streak, longest streak, completion rate per habit.
2. `WeeklySummary.tsx` — enhanced summary combining tasks + habits + (eventually) meals/workouts.
3. Backend: `GET /api/analytics/streaks` endpoint calculating streak data from habit completion history.
4. AI weekly summary — use `callStructured` to generate a plain-language productivity recap from the week's data.

**Acceptance criteria:**
- Weekly view shows each habit's current streak alongside its completion bar.
- The AI weekly summary generates a readable 3-5 sentence recap of the user's week.

---

### v2.4 — Drag & drop persistence

**Context:** `react-beautiful-dnd` is wired up in `DayTimeline.tsx` but the reorder callback doesn't persist to the backend.

**Work:**
1. Add `display_order` integer column to `tasks` table.
2. Add `PATCH /api/tasks/reorder` endpoint — accepts an ordered array of task IDs and updates their `display_order`.
3. Fix `handleDragEnd` in `DayTimeline.tsx` to call the reorder endpoint optimistically.

**Acceptance criteria:**
- Drag a task to a new position. Refresh the page. The task is in the new position.

---

### v2.5 — Cross-feature AI intelligence

**Context:** Phase 3 in FEATURES.md. The AI currently only understands tasks and habits. v2 expands its context to include meals, workouts, and projects.

**Work:**
1. Extend `parse-tasks` prompt to emit grocery, meal, and workout item types (once their backends exist).
2. "Ask AI" modal gains access to nutrition and fitness data for contextual answers.
3. AI-generated weekly meal plan from diet goals.
4. AI-generated grocery list from a meal plan.

**Acceptance criteria:**
- Typing "I want to meal prep on Sunday and need chicken, rice, and broccoli" via AI parse-tasks creates a meal item and a grocery list.
- Asking "how was my week?" returns a summary that references task completion, habit streaks, and (if tracked) workout sessions.

---

### v2.6 — Accessibility & performance

**Context:** Flagged in the July QA review but not launch-critical for v1.

**Work:**
1. Add keyboard navigation and focus management across all interactive components.
2. Add ARIA labels to all buttons, inputs, and status indicators.
3. Implement `ErrorBoundary.tsx` — catch React errors and show a friendly reload prompt instead of a blank screen.
4. Code split heavy components (`AITextAnalyzer`, `WeekViewPage`) with `React.lazy` + `Suspense`.
5. Vite bundle optimization: separate `vendor`, `ui`, `charts`, `ai` chunks.

**Acceptance criteria:**
- Lighthouse accessibility score ≥ 90.
- Page load time on a simulated 4G connection < 3 seconds (Lighthouse performance).
- Any unhandled React error shows an error boundary UI, not a blank screen.

---

## Priority Summary for Sprint Planning

| Priority | Item | Effort (rough) |
|---|---|---|
| P0 | Wire backend to production frontend | 2–4 hours |
| P0 | Self-signup (backend + frontend) | 1 day |
| P1 | Habit tracker visible on dashboard | 4 hours |
| P1 | AI Analyzer sticky footer | 2 hours |
| P1 | Timeline ordering fix | 4 hours |
| P1 | Ask AI input persistence | 2 hours |
| P2 | Hide unbuilt item types | 2 hours |
| P3 | Custom domain + CORS update | 2 hours |
| P3 | Stranger smoke test | 2 hours |

**Total v1 estimate: ~5–6 focused engineering days.**

---

## Open Questions (resolve before sprint starts)

1. **Is `https://healthyflow-production.up.railway.app` currently running?** Hit `/api/health` to confirm. If not, redeploy is the first task.
2. **What domain will v1 launch on?** Needs to be purchased and configured before P3.1.
3. **Should the grocery/meal/workout types be hidden or removed?** Recommendation: hidden with "Coming soon" label — easier to re-enable than to rebuild removed UI.
4. **Rate limiting on signup:** Is `express-rate-limit` already installed? If not, add it as part of P0.2.
