# HealthyFlow

Personal productivity tracker whose unit is the day. Three things define it: what the user **plans**, what they actually **record**, and how much usable **capacity** is left.

All three resolve onto one clock for a single date — Tasks, Habits, focused Work, Calendar events, meals, training and weight alike — with plan and actual distinguished structurally rather than by convention. Items still carry forward day to day when left incomplete. Where the day cannot answer honestly it says why rather than guessing, and that refusal is a deliberate property of the contract, not a gap in it.

The canonical shape is `DaySummarySchema`; see [The day](#the-day) for its vocabulary.

## Language

### Items and their types

**Item**:
The umbrella concept for anything HealthyFlow tracks. Every item has a `type` (`task`, `habit`, `grocery`, `meal`, or `workout`).
_Avoid_: "Task" when you mean the umbrella — it's ambiguous with the type value below.

**Task**:
An item with `type: 'task'`. A one-time thing the user intends to do (e.g. "email Sarah," "renew passport"). Has `repeat: 'none'`. Disappears after completion.
_Avoid_: Todo, reminder, action item

**Habit**:
An item with `type: 'habit'`. A recurring activity the user wants to do on a cadence (e.g. "10 min meditation," "stretch"). Has `repeat: 'daily'` or `repeat: 'weekly'`. Reappears every cycle.
_Avoid_: Routine, ritual

**Grocery / Meal / Workout**:
Item types with specialised fields (quantity, store, exercise sets, etc.). Out of scope for the `parse-tasks` v1 contract; parse-tasks only emits `task` and `habit`.
_Status_: `grocery` and `meal` have **no user surface**. Both are accepted by `ItemTypeSchema` and each carries its own Daily Plan reference kind, but neither has a page, an Add target, or a renderer — nutrition is served by Calorie entries instead. Only `workout` has a real surface, through Workout plans. Do not describe either as available.

### Item lifecycle

See `docs/adr/0002-task-scheduling-and-materialization-model.md` for the full model. The one rule: **a virtual item becomes a real `tasks` row when it is placed (given a `start_time` or `position`) or completed — never on a plain read, never via a display-only field.**

**Materialize**:
Writing the real `tasks` row for an item that was being shown virtually. Triggered by placing (drag to a time slot or backlog position) or completing.

**Anytime backlog**:
Untimed tasks that belong to a specific day (`scheduled_date` set, `start_time` NULL). Manually ordered within the day by `position`.

**Someday backlog**:
Tasks with neither a date nor a time (`scheduled_date` and `start_time` both NULL, incomplete). A deliberate dateless bucket — a real row shown on every day until the user completes or places it. A `start_time` with no date normalises to today; only the absence of *both* keeps a task in someday.

**Rollover (carry-forward)**:
Surfacing an incomplete, untimed task on a later day, so "a task I left yesterday shows up today." Governed by one rule (ADR-0002): an untimed task shows on day D if it's incomplete and its `scheduled_date` is NULL or ≤ D, or it was completed on D. Rows and ids are real — nothing is faked or rewritten. Tasks carry forward; **habits do not** — a missed habit day re-synthesises fresh.
_Legacy_: `rolled_over_from_task_id` and `original_created_at` are write-dead columns from the old "create a new row per rollover" approach (see `ROLLOVER_IMPROVEMENTS.md`, historical); they survive only as negative filters hiding pre-cleanup rows.

**Habit instance**:
The per-day materialisation of a Habit. The user sees one row per day for a daily Habit, each with its own outcome (`pending`, `partial`, `completed`, or `failed`), all linking back to the original via `original_habit_id`. A target-based Habit may accumulate multiple progress chunks for that day; reaching its target automatically completes the instance. Daily only — weekly Habits (`repeat_type: 'weekly'`) are not yet synthesised (known gap, see ADR-0002).

**Habit target**:
An optional measurable goal on a Habit definition, separate from its scheduled duration. Targets use minutes, repetitions, or a generic count. Habits without a target are binary: the user explicitly records Done or Not done.

**Habit progress chunk**:
A positive amount recorded against one materialized Habit instance, with an optional note. Chunks accumulate only within that day and are progress logs, not additional scheduled timeline blocks.

### The day

The canonical shape of a day is `DaySummarySchema` in `backend/src/day-summary-schema.ts`. It is a versioned contract (`version: 1`) and the most central type in the codebase; the terms below are its vocabulary.

**Daily Plan reference**:
One entry in the day's single ordered plan (`dailyPlan.references`). Fourteen kinds span every module — Calendar events and transitions, Focus blocks, Tasks, Habits, grocery, meal plans, workout plans, Habit progress chunks, Calorie entries, Weight entries, Workout sessions, Progress targets, and Progress entries. Every reference carries `semantics`: `plan` (intended), `actual` (recorded), or `boundary` (protected time). A reference points at the record its owning module holds via `sourceId` — it never copies or mutates that record.
_Avoid_: "timeline row" when you mean a reference; the plan is the data, the timeline is one rendering of it.

**Capacity**:
Usable time left in the Planning window after known obligations and their Transition buffers. Three statuses: `complete` (an exact `availableMinutes`), `partial` (an upper bound plus reason codes), and `unavailable` (no window or basis at all). **Capacity never guesses** — twelve typed reason codes state why an answer is incomplete rather than returning a wrong number.
_Avoid_: "free time" (implies leisure), "available time" without saying whether it is exact or an upper bound.

**Planning window**:
The user's declared usable day: `startTime`, `endTime`, and `transitionBufferMinutes`. Capacity is computed against it. **It defaults to `null`**, and while it is null the Capacity strip does not render — so a new account sees no Capacity until a window is set.

**Transition buffer**:
Protected minutes reserved after each obligation. The policy is fixed (`bufferPolicy: 'after_each_obligation'`) and buffers appear on the plan as `boundary` references.

**Focus (attention)**:
The single Item that most deserves the user's attention right now, with a reason code. Six states: `selected`, `empty_day`, `completed_day`, `nothing_needs_attention`, `past_incomplete`, `future_planned`. It declines to pick rather than surfacing something arbitrary.
_Avoid_: **do not confuse with a Focus block**, which is a scheduled Work plan and a different concept — see the Work section.

**Next obligation**:
The next time-fixed commitment, resolved across both planned Items and Calendar events with an explicit tie-break (a Calendar event wins a same-time tie). Carries `conflictIds` for anything competing for the same slot.

**Module read status**:
Within the day contract each module reports its own read status, and `unavailable` (the read failed) is always distinct from an empty result (`not_logged`, `not_recorded`, `not_scheduled`). One module failing must never fail the whole day. Distinct from **Module status semantics** below, which is about how a section is presented.

### Categories

The closed set of category values the UI offers when creating items: `health`, `work`, `personal`, `fitness`, `grocery`, `nutrition`. AI-generated items must pick from this set; other values get rejected at the parser boundary.

### Module presentation

**Health**:
The presentation parent for the optional Nutrition, Workouts, and Progress sections. Health appears in global navigation when at least one section is enabled and disappears when all three are hidden. Hiding a section removes its navigation, Add targets, and summaries but never deletes its records; re-enabling restores the same data.

**Module status semantics**:
Presentation metadata declares a section as a `tracker`, `goal`, or `hybrid`. Nutrition and Workouts are trackers, so an unrecorded day is neutral rather than a failed goal. Progress is hybrid: measurements can be tracked without targets, while individual definitions may optionally include a target.

**Which modules are optional**:
Only three: `calorieIntake`, `achievementTracker`, and `workoutTracker` — that is the whole of `ModuleSettingKeySchema`. **Habits and Work have no user-facing toggle and are always on**, which is why the day contract types them as `z.literal('enabled')`. Do not describe modules as uniformly optional.

**A user setting and a release flag are different things.** A module setting is the user's choice and hides a section for that account. A release flag is the project's choice and hides a surface from everyone. Work has no user setting *and* is currently behind the `VITE_WORK_ENABLED` release flag: the server still computes Work into every day, and the flag only decides whether the client can reach it.

Today and Talk remain the primary daily destinations, and on mobile they are the *only* two entries in the bottom dock — Health and Settings are reached through the navigation drawer. Work sits at `/work` in the Plan navigation group but is **behind its release flag and hidden in production**, alongside Week at `/week`; there is no user-facing Time module. Existing Health routes remain `/calories`, `/workouts`, and `/achievements` even though their display labels are Nutrition, Workouts, and Progress.

### Calorie tracking

**Calorie entry**:
A manually logged food item for a given day: `name`, `calories`, optional macros (protein/carbs/fat in grams), an optional `quantity` (e.g. "2 eggs"), a `date`, and an optional `time` used to group entries visually in the log. Its own concern, not an `Item`/`Task`/`Habit` — lives in the `calorie_entries` table, never written into `tasks`. Managed on the dedicated `/calories` page.
_Avoid_: "food log item", "meal entry" (an Item type already named `meal` exists and is unrelated)

**Macros**:
Shorthand for protein, carbs, and fat (all in grams) on a calorie entry. All three are optional — manual entry only requires `name` and `calories` so logging stays fast.

**Weight entry**:
A kg-only body-weight measurement for a specific `date`. Users may skip days, but can record at most one weight entry per date; the UI emphasizes the latest entry, latest-vs-previous delta, and a trend graph of recent recorded entries. Its own concern, not an `Item`/`Task`/`Habit` — lives in the `weight_entries` table and is surfaced inside the `/calories` page.

The `/calories` Nutrition section is gated on the `calorieIntake` user setting. When hidden, its Health tab, Add target, and Today summary disappear while existing Calorie entries and Weight entries remain stored.

### Workout tracking

**Workout session**:
A dated training record containing an ordered list of exercises and optional metrics (sets, reps, weight in kg, duration in minutes, and distance in km). It lives in `workout_sessions` with `workout_session_exercises` and is managed on `/workouts`. It is separate from an Item with `type: 'workout'`.

**Workout plan**:
A reusable, named template containing an ordered list of exercises with optional target metrics. Starting a Workout session from a Workout plan copies its exercises into an editable session draft; it does not log or complete the plan. Plans may represent any training style, including strength, calisthenics, running, yoga, or mobility.

**Exercise history**:
The Recent / Most-used exercise picker built from previously logged Workout sessions. Choosing an exercise from history pre-fills an exercise draft; it does not create a Workout session until the user saves the session.

### Progress tracking

**Achievement definition**:
A named measurement shown to users in the Progress section. It defines the metric, unit, improvement direction, and an optional target. The internal API and `/achievements` route keep the established Achievement identity even though the presentation label is Progress.

### Work

**Project**:
A bounded Work context for a target. It records the target, definition of done, current milestone, deadline, status, summary, blockers, constraints, non-goals, decisions, links, next valuable step, related canonical Tasks, Focus-block history, and Work-session history. Archiving hides a Project from active use without deleting its records. Safely deleting one unassigns its Tasks and preserves its Work history as standalone context.

**Focus block**:
A persistent, startable plan for focused Work. It has a stable id, a real scheduled date and start time, planned focused minutes, intended outcome/evidence, optional transition/break minutes, and references canonical Tasks without copying or completing them. A Focus block belongs to a Project or carries bounded standalone title/context. Its lifecycle is `planned → active → reviewing → completed`, with `canceled` as a terminal alternative. A completed Work review, not elapsed time, produces the Work session.
_Avoid_: storing a Focus block as a Task, calling a display-only time label a schedule, or overwriting an earlier block when planning another one. **Do not confuse with Focus (attention)** — that is the day contract's choice of what deserves the user now, has no schedule and no lifecycle, and belongs to no module. The two share a word and nothing else; say "Focus block" whenever Work is meant.

**Work review**:
The structured account required to complete a Focus block: what changed, evidence, milestone impact, blockers, unnecessary work, actual focused minutes, next valuable step, and attention (`Focused`, `Mixed`, or `Drifted`). It also preserves the explicit Task and Project updates the user confirmed. The review, its Work session, those confirmed updates, and the Focus-block completion are one atomic write.

**Work session**:
The durable record of Work that actually happened. A reviewed session preserves its Project or standalone context, referenced Tasks, planned-versus-actual minutes, outcome, evidence, attention, blocker/drift information, next step, timestamps, and structured Work review. A user may also enter a standalone or Project-linked historical Work session manually. Recording Work never silently completes a Task.
_Avoid_: session when you mean the planned Focus block; treating time spent as proof that the Project advanced

### AI surfaces

**Talk workflow**:
A durable, application-owned user goal pursued inside the Talk surface, drawn from
a closed set (`plan_day`, `plan_work`, `run_focus_block`, `review_focus_block`,
`replan_day`, `log_outcome`, `review_project`, `quick_chat`). It owns its own
persisted state, its legal sequence of Talk stages, and its terminal status. The
application selects the workflow and owns every transition; the model never
changes the active workflow. One Talk conversation has at most one active Talk
workflow, and closing one lets another start in the same conversation.
_Avoid_: "agent", "session", "chat mode" — a Talk workflow is not an agent run

**Talk stage**:
The current step inside one Talk workflow (e.g. `resolve_scope`, `draft_task`,
`await_task_confirmation`). A stage is either an **application activity**
(deterministic code loading authoritative records and branching on facts) or an
**agent activity** (one bounded model run with only the instructions, tools, and
structured output contract that stage needs). A stage name states what is being
done, so a generic `clarifying` is not a stage — `clarify_direction` is. A stage
result becomes a typed event that the workflow's pure transition function may
accept or reject; the model does not pick the next stage. Terminal status
(`active`, `completed`, `declined`, `failed`) is tracked separately from the
current stage.
_Avoid_: using "stage" for the workflow itself, or for a capability

Note that a Talk workflow, a Talk stage, and a capability are three different
things: `plan_work` is a workflow, `draft_task` is one of its stages, and
`add_work_task` is a reusable confirmed capability that any workflow may invoke.
Creating a Task is therefore not its own Talk workflow. See
`docs/adr/0009-application-owned-talk-state-machine.md`.

**parse-tasks**:
The endpoint and capability that takes free-form natural-language input and emits a structured list of `Item`s (v1: `task` + `habit` only). The user types a paragraph; the parser returns drop-in items the user can confirm or edit before saving.
_Avoid_: "AI parser" (too vague), "task extractor" (loses the habit case)

**Server-keyed**:
The only AI access model. The OpenAI API key lives on the server and is never sent to, stored by, or read from the client. Every AI call is metered against the user's Credits balance server-side.
_Avoid_: **BYOK / "bring your own key"** — there is no such flow and never has been in shipped code. The term previously appeared here describing a `localStorage` key-passing pattern that does not exist anywhere in `src/`; it is retired vocabulary. Do not add client-side key handling.

### Authentication

**Google sign-in**:
The browser authenticates with Google through Supabase Auth using PKCE, then
exchanges the verified Supabase access token for the normal HealthyFlow app
session at `POST /api/auth/google`. Protected HealthyFlow APIs continue to use
the server-issued HealthyFlow JWT. A verified Google email links to an existing
password account instead of creating a duplicate; genuinely new accounts still
pass through the public-slot or Invitation gate.

**MCP OAuth connection**:
An external MCP client's user-authorized access to HealthyFlow. The client
discovers the HealthyFlow authorization server from the MCP resource, identifies
itself by dynamic client registration (RFC 7591, what ChatGPT uses) or a Client
ID Metadata Document (CIMD), and uses authorization code + PKCE. Only public
clients are accepted, so no client secret is ever issued. The durable record is
a revocable grant; plaintext authorization codes and refresh tokens are never
stored.

**Invitation**:
A time-limited signup token tied to a Waitlist entry. Invitation state is
retained through the Google OAuth redirect, expires after seven days, is
redeemed once, and bypasses the public-slot count without bypassing signup
initialization.

## Task Tracking

- **GitHub Issues**: https://github.com/lermanori/HealthyFlow/issues
- **GitHub Project (kanban)**: https://github.com/users/lermanori/projects/1/views/1
- Note: At the start of any AI session working on HealthyFlow, check the kanban board for current task state before acting. Issues are the source of truth for what's in progress and what's next.
