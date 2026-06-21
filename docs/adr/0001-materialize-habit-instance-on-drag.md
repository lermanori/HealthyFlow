# ADR 0001 — Materialize Habit Instance on Drag

**Status**: Accepted  
**Date**: 2026-06-21  
**Issue**: #28

---

## Context

HealthyFlow uses a **virtual-first** strategy for habit instances: a daily habit
has no `tasks` row until the user interacts with it. The backend synthesises a
virtual row on each GET by combining the parent habit record with the requested
date, assigning a synthetic id `${habitId}-${date}`. This avoids pre-populating
rows for every future day and keeps the database lean.

When `#26` (backlog reorder) and `#27` (drag-to-schedule) landed, a gap
appeared: the frontend `DayTimeline` sends `PUT /tasks/:id` on drag-drop. For a
real task this hits the DB update path. For a **virtual** habit instance the id
has no database row, so `db.getTaskById` returns null and the route responds
403. The user cannot drag an untimed habit (e.g. "Workout") into an hour slot
to set a per-day time for it.

Two options were considered:

| | Option A | Option B |
|---|---|---|
| **What** | Disable drag for virtual habit instances | Materialize a real row on drag |
| **Pros** | Zero new code | Persists the user's per-day override across reloads |
| **Cons** | User loses ability to time habits per-day | Creates a DB row; more code |

## Decision

**Option B — materialize on drag** was chosen.

The user's motivation: dragging an untimed habit instance (e.g. "Workout") into
an hour slot should give that habit a time *for that day only*. That per-day
override has nowhere to live if no row exists. The only way to honour it across
a page reload is to write a real `tasks` row.

Concretely:
- Dragging a virtual habit instance onto an **hour slot** materializes a
  non-completed row (`completed: false`) with `start_time = slot`.
- Dragging it into the **Anytime backlog** materializes a non-completed row
  with `position = drop index`.
- The server returns the new real id; the frontend swaps it in so a second drag
  operates on the real row (not the stale synthetic id).
- Ownership is verified against the original habit record before materializing.
- The virtual synthesis query already excludes habits that have a real instance
  row for the date — so no double-render occurs.

### Implementation notes

- `parseHabitInstanceId(id)` — a single pure helper in
  `backend/src/utils/parseHabitInstanceId.ts` — detects the synthetic id
  pattern. All three call sites (GET formatter, POST /complete/:id, PUT /:id
  drag path) import this helper instead of inlining the regex.
- `db.createHabitInstance` gained an optional `overrides` argument
  `{ completed?, start_time?, position? }`. The default (`completed: true`)
  preserves the existing completion flow unchanged.
- The ADR directory (`docs/adr/`) is created lazily here; this is the first
  recorded decision.

## Consequences

- **Positive**: Users can drag untimed habits into time slots and the override
  persists across reloads. The workout-timing use case is covered.
- **Positive**: The synthetic-id regex is now centralised; no more three-way
  duplication.
- **Neutral**: Materializing a habit creates a DB row earlier than it would
  from completion alone. The row is `completed: false`, so rollover logic still
  applies if the user hasn't checked it off by end of day.
- **Negative** (accepted): Slightly more DB rows than the pure virtual-first
  ideal when users drag but never complete. Acceptable given the use case.
- **Out of scope**: Time granularity finer than the existing hour slots,
  changing how completion works, bulk-materializing future instances.
