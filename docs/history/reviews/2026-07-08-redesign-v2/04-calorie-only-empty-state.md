# 04 — Calorie-only day shows content and "No tasks scheduled" at once

**Severity:** Medium (contradictory UI, visible in one screenful)
**File:** `src/components/DayTimeline.tsx:544`
**Verdict:** CONFIRMED

## Symptom

On a day where you've logged food but have no tasks or calendar events, the
timeline shows your calorie entries in their hour rows **and**, right below the
grid, the message *"No tasks scheduled for today. Add some tasks to get started!"*
Both are on screen simultaneously — the app tells you the day is empty while
showing you content in it.

This is now a reachable state precisely because the redesign made calories
first-class on the timeline (and slice 4 turned the calorie module on by default),
so plenty of users will have calorie-only days early on.

## Root cause

The empty-state block guards on tasks and calendar events but was never updated for
the new `calorieEntries` prop:

```tsx
{/* Empty state when both sections are empty */}
{tasks.length === 0 && calendarEvents.length === 0 && (
  <div className="text-center py-12 text-ink-muted">
    <p className="text-ink-soft">No tasks scheduled for today.</p>
    <p className="text-sm mt-1 text-ink-muted">Add some tasks to get started!</p>
  </div>
)}
```

The hour-slot grid above it renders unconditionally and includes calorie rows per
slot (`slotCalories.map(...)` → `CalorieEntryBlock`), so it and the empty state are
siblings, not alternatives. When calories exist but tasks/events don't, both render.

## Fix

Include `calorieEntries` in the guard so the empty state only appears when the day
is *actually* empty:

```tsx
{tasks.length === 0 && calendarEvents.length === 0 && calorieEntries.length === 0 && (
  <div className="text-center py-12 text-ink-muted">
    <p className="text-ink-soft">Nothing on your day yet.</p>
    <p className="text-sm mt-1 text-ink-muted">Add a task, or tell HealthyFlow about your day.</p>
  </div>
)}
```

Two things bundled in:

1. **The actual bug fix** — the added `calorieEntries.length === 0` term.
2. **Copy aligned to the thesis** — "No tasks scheduled" is task-app language on a
   screen that's supposed to be the *whole day* (per the packaging spec). "Nothing
   on your day yet" fits the day-is-the-unit story and doesn't presuppose the user
   only tracks tasks. Optional, but cheap and on-message. If you'd rather keep the
   copy change out of a bug fix, keep just the guard term.

## Verification

- Manual: on a fresh day, log one calorie entry and add no tasks → the entry shows
  and the empty state does **not**. Then a truly empty day → empty state shows.

## Effort

~5 minutes. One condition (plus optional copy tweak).
