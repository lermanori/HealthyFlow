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

**Rollover**:
Carrying an incomplete item from one day to the next. The next day's instance is a new row pointing back at the original via `rolled_over_from_task_id`. See `ROLLOVER_IMPROVEMENTS.md` and `original_created_at`.

**Habit instance**:
The per-day materialisation of a habit. The user sees one row per day for a daily habit, each with its own `completed` state, all linking back to the original via `original_habit_id`.

### Categories

The closed set of category values the UI offers when creating items: `health`, `work`, `personal`, `fitness`, `grocery`, `nutrition`. AI-generated items must pick from this set; other values get rejected at the parser boundary.

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
