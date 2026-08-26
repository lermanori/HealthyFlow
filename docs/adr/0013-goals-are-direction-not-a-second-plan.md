# ADR 0013 — Goals are direction, not a second plan

**Status**: Accepted
**Date**: 2026-08-26

## Context

Talk needs to know who it works for and to plan from a larger intention down to
one useful move. The Personal assistant prototype put current priorities and
standing constraints in Settings, but those are not settings: they are
user-owned direction, they apply to different modules, and they should be
editable in ordinary language or through Talk.

Making Goals a full planning system would violate the product's strongest
refusal. Items, Habits, Projects, the Daily Plan, Workout sessions, Calorie
entries and Achievements already own planning and evidence. Adding deadlines,
status, progress or child Tasks to Goals would give the same day a second set of
records that can disagree with them.

## Decision

HealthyFlow has a first-class **Goal** record with exactly:

- an existing module owner: `whole_day`, `work`, `tasks`, `habits`, `nutrition`,
  `workouts` or `progress`;
- one free-speech statement;
- created, updated and archived timestamps.

A Goal has no due date, completion state, progress percentage or child records.
Archiving is the only lifecycle transition, and it is reversible. Work Goals
may express direction shared across Projects; each Project still owns its own
target. Progress Goals are narrative direction; each Achievement still owns its
numeric target and entries.

Goals live in the Local day and travel through the same account export and sync
contract as its other records. A failed Goal read is `unavailable`, never an
empty list.

Talk receives a bounded snapshot of active Goals. It may read them and, only
after a specific user instruction, prepare an add, edit or archive proposal.
The proposal is an editable confirmation card. The client applies the change to
the real Local or hosted source after Confirm; the model does not write it.

Personal assistant Settings keep only behavior choices: name, response detail,
planning approach and outcome follow-up. Direction no longer lives in Settings.

## Consequences

- Macro-to-micro planning has durable user-owned context without pretending a
  planned Item happened.
- A Goal cannot become an alternative backlog, schedule or progress tracker.
- The Goals surface groups direction by the modules that already own the work
  and evidence.
- Goal edits made through Talk are explicit, reviewable and use the same source
  path as manual edits.
- The `goals` table, Local document, account export and sync exchange all carry
  soft-deleted rows so archives propagate rather than reappearing.
