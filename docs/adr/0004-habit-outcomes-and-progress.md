# ADR 0004 — Habit outcomes and accumulated progress

**Status:** Accepted  
**Date:** 2026-07-16  
**Issue:** #138

## Context

Habit instances previously exposed only `completed: boolean`. That collapsed pending, explicitly unsuccessful, and partially completed days into the same state, and the existing `duration` field described schedule length rather than actual progress.

## Decision

Per-day Habit instances use four outcomes: `pending`, `partial`, `completed`, and `failed` (shown as “Not done”). Habit definitions may remain binary or declare a separate target using minutes, repetitions, or count. Target-based instances accumulate positive progress chunks; reaching the target completes automatically, while an explicit failed outcome may preserve sub-target effort.

Any progress or explicit outcome materializes the selected virtual Habit instance under ADR-0001. The target is copied from the parent at materialization so recorded history stays frozen. A whole-Habit tracking edit is the deliberate exception: it updates the selected day as well as the parent definition, so the new tracking method takes effect immediately while other materialized days remain historical snapshots. The legacy `completed` boolean remains a compatibility mirror and is true only for the completed outcome.

## Consequences

- Today and Week open one focused outcome/progress sheet for Habits; Task completion is unchanged.
- Pending days are never automatically failed, and avoidance Habits never complete from the clock alone.
- Only completed counts toward streaks; analytics may report the other outcomes separately.
- Progress chunks do not create calendar blocks.
- Weekly Habit synthesis and AI target inference remain out of scope.
