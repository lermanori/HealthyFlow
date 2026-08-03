# ADR 0007 — First-class Focus blocks and atomic Work reviews

**Status**: Accepted  
**Date**: 2026-08-03

## Context

The first Work slice stored one `focus_block` JSON object on each Project. Its
`time` field was a display label such as “Next open slot,” planning another
block overwrote the earlier plan, and a standalone block could not exist. Work
sessions were inserted before a free-text review was attached, so a partial
failure could leave the plan, review, session, Tasks, and Project context in
different states.

Migration `20260803000000_add_work_module.sql` is already present in migration
history. Rewriting it would be unsafe for databases that have applied it.

## Decision

Add a follow-up migration with three durable records:

- `focus_blocks` stores the scheduled date/time, intended outcome/evidence,
  referenced canonical Task ids, optional Project or bounded standalone
  context, execution timestamps, and lifecycle.
- `work_reviews` stores the structured review answers and the exact confirmed
  Task/Project updates.
- `work_sessions` remains the record of actual Work. A reviewed Focus block
  produces exactly one Work session through `complete_work_review`.

The review RPC locks the Focus block, validates ownership and referenced Tasks,
inserts the Work review and Work session, applies only confirmed updates, and
completes the block in one PostgreSQL transaction. Any failure rolls back the
whole operation.

The old `projects.focus_block` column is deprecated and no longer read or
written. Its display-only time values cannot be converted into honest dates and
times without guessing. The column is retained so an applied migration is not
destructively rewritten; old prototype JSON can be inspected manually if any
database contains it.

Project deletion uses a separate transaction that refuses to delete a Project
with active/reviewing Work, unassigns its canonical Tasks, and converts its
historical Focus blocks and Work sessions to bounded standalone context.

## Consequences

- Planning another Focus block appends history instead of overwriting it.
- Reloading can restore an active block from `started_at`.
- A Work session cannot precede its structured review for reviewed blocks.
- Standalone Work does not require a synthetic Project.
- Task completion remains explicit and uses the existing canonical Task row.
- Later Today integration can reference stable Focus-block ids and real
  schedule fields.
