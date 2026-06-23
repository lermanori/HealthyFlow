# ADR 0002 — Task scheduling: one rule for untimed tasks

**Status**: Accepted
**Date**: 2026-06-22
**Supersedes**: `ROLLOVER_IMPROVEMENTS.md` (historical)
**Builds on**: ADR-0001 (materialize habit instance on drag)

---

## Context

How untimed tasks move day to day had grown into three overlapping notions —
**someday** (no date), **dated Anytime backlog** (#26/#27), and **carry-forward**
(past untimed incompletes re-surfaced today) — implemented by a four-query
`Rollover` engine that synthesised fake ids (`rollover-${uuid}-${date}`) and
overrode `scheduled_date` in the response.

An audit traced two real bugs to that machinery:

- **P1** — carry-forward rows have their `scheduled_date` faked to the viewed
  day *in the response*. `TaskEditModal` always re-sends `scheduledDate`, so
  saving any edit writes the fake date back to the real row, silently moving the
  task's true date. Data corruption.
- **P2** — someday tasks carry a synthetic `rollover-` id that `PUT /tasks/:id`
  doesn't recognise, so editing or dragging them 403s.

The key realisation: **a someday task is already a real `tasks` row** (written
on creation, `scheduled_date NULL`). The synthetic id and the date override were
solving a "virtual, no row yet" problem that does not exist for tasks. Removing
them deletes the cause of P1 and P2 rather than patching them.

## Decision

Replace the three notions and the four-query engine with **one rule**:

> An untimed task (`start_time NULL`) shows on day **D** if it is incomplete and
> its `scheduled_date` is **NULL or ≤ D**, or if it was completed on **D**.
> Rows are real, ids are real, nothing is faked or rewritten.

This single rule subsumes all three notions:

| Want | Falls out of the rule |
|---|---|
| Someday (no date) shows every day | `NULL ≤ D` is always true |
| Past untimed incomplete carries forward | `scheduled_date ≤ D` |
| Future untimed stays in the future | `scheduled_date > D` excluded |
| Completed shows only on its day | `completed_at` within D |
| Drag someday → a slot | normal `updateTask`: sets `start_time` (+ date = today) |

### Materialization rule (unchanged from ADR-0001, now uniform)

A *habit* still materializes a row when placed or completed (it has no row until
then). A *task* already has its row from creation, so for tasks there is nothing
to materialize — placing or completing is a plain `updateTask` on the real id.
One mental model: **interact via the real id; the DB row is the source of
truth.**

### Normalization (write boundary)

- A write with `start_time` but no `scheduled_date` → `scheduled_date = today`
  (a time implies a day). Applies in `POST /tasks` and the edit path.
- No date **and** no time keeps a task in the someday bucket.

### Deliberate asymmetry

Tasks carry forward; **habits do not**. A missed habit day re-synthesises fresh
(you don't "owe" yesterday's meditation). Intentional, now documented.

### Out of scope (named, not solved)

- **Weekly habits** (`repeat_type: 'weekly'`) — virtual synthesis is daily-only;
  left parent-only. Known gap.
- **grocery / meal / workout** types — defined in `CONTEXT.md`, not on the
  scheduling path; untested here.
- **Cross-day `position` ordering** in a mixed Anytime list — cosmetic; current
  `sortTasksForTimeline` (position nulls-last, then `created_at`) is good enough.
  Renormalize only if it actually bothers someone.

## Consequences

What this **deletes** (the cleanup this ADR authorises):

- The `rollover-${uuid}-${date}` synthetic id → real ids everywhere → **P2 gone**.
- The response-side `scheduled_date` override → the edit modal sees the true
  date → **P1 gone** (nothing false to write back).
- `Rollover.complete` / `Rollover.isRolloverRef` and the rollover branch in
  `POST /complete/:id` → real rows complete via the normal path.
- The no-op `POST /tasks/rollover` endpoint + `taskService.rolloverTasks`.
- `Rollover.listForDay` shrinks from four queries to two (incomplete-due +
  completed-today), no `.map()`, no overrides.

What stays:

- `rolled_over_from_task_id` / `original_created_at` columns remain as negative
  filters until a migration confirms no pre-cleanup rows depend on them.

Required check on implementation: one test asserting an incomplete untimed task
dated yesterday appears today, a future-dated one does not, and editing the
title does not move its date.
