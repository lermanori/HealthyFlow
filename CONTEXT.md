# HealthyFlow

Personal productivity tracker. Users capture items they want to do — one-shot tasks, recurring habits, groceries, meals, workouts — and the app helps them schedule, complete, and roll them over day to day.

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
The per-day materialisation of a habit. The user sees one row per day for a daily habit, each with its own `completed` state, all linking back to the original via `original_habit_id`. Daily only — weekly habits (`repeat_type: 'weekly'`) are not yet synthesised (known gap, see ADR-0002).

### Categories

The closed set of category values the UI offers when creating items: `health`, `work`, `personal`, `fitness`, `grocery`, `nutrition`. AI-generated items must pick from this set; other values get rejected at the parser boundary.

### Calorie tracking

**Calorie entry**:
A manually logged food item for a given day: `name`, `calories`, optional macros (protein/carbs/fat in grams), an optional `quantity` (e.g. "2 eggs"), a `date`, and an optional `time` used to group entries visually in the log. Its own concern, not an `Item`/`Task`/`Habit` — lives in the `calorie_entries` table, never written into `tasks`. Managed on the dedicated `/calories` page.
_Avoid_: "food log item", "meal entry" (an Item type already named `meal` exists and is unrelated)

**Macros**:
Shorthand for protein, carbs, and fat (all in grams) on a calorie entry. All three are optional — manual entry only requires `name` and `calories` so logging stays fast.

**Weight entry**:
A kg-only body-weight measurement for a specific `date`. Users may skip days, but can record at most one weight entry per date; the UI emphasizes the latest entry, latest-vs-previous delta, and a trend graph of recent recorded entries. Its own concern, not an `Item`/`Task`/`Habit` — lives in the `weight_entries` table and is surfaced inside the `/calories` page.

The `/calories` page and its nav entry are gated on the `calorieIntake` user setting (see #47); when off, neither the route nor the nav item appears.

### AI surfaces

**parse-tasks**:
The endpoint and capability that takes free-form natural-language input and emits a structured list of `Item`s (v1: `task` + `habit` only). The user types a paragraph; the parser returns drop-in items the user can confirm or edit before saving.
_Avoid_: "AI parser" (too vague), "task extractor" (loses the habit case)

**BYOK** (Bring Your Own Key):
Pattern where the user supplies their own OpenAI API key, stored client-side. The frontend reads it from `localStorage` and sends it to the backend per request, which uses it instead of any server-side default.

## Task Tracking

- **GitHub Issues**: https://github.com/lermanori/HealthyFlow/issues
- **GitHub Project (kanban)**: https://github.com/users/lermanori/projects/1/views/1
- Note: At the start of any AI session working on HealthyFlow, check the kanban board for current task state before acting. Issues are the source of truth for what's in progress and what's next.
