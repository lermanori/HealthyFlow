# 01 — "NOW" card labels a finished task as current all day

**Severity:** High (wrong info on the hero card of the hero screen)
**File:** `src/pages/TodayPage.tsx` — `NowNextCard`, line 90
**Verdict:** CONFIRMED

## Symptom

You have an 08:00 task, 15 minutes long, and you forget to check it off. At 4pm
the "NOW" card on Today still says you're doing it. The card that's supposed to
answer "what am I meant to be doing right now" is confidently wrong for the rest
of the day.

## Root cause

`current` is selected as the *latest* timed, uncompleted task whose start time has
passed — with no upper bound from the task's end time:

```ts
const current = [...timed].reverse().find((t) => toMin(t.startTime!) <= nowMinutes)
const next    = timed.find((t) => toMin(t.startTime!) > nowMinutes)
```

Trace with tasks at 08:00 (uncompleted), 12:00 (completed → filtered out), 18:00
(uncompleted) and `now = 16:00`: `timed = [08:00, 18:00]`, the reverse-find picks
08:00. So "NOW = 08:00 task" even though it ended eight hours ago.

The task model *has* the data to fix this — `duration` is an optional field on the
item base — but `NowNextCard` never reads it.

## Decision to make first

What counts as "now"? Two reasonable definitions; pick one:

- **A. Currently in progress** — start ≤ now < start + duration. Strict and
  honest, but "NOW" goes empty in the gaps between timed items (most of the day).
- **B. In progress, else the most recent unfinished thing that isn't stale** —
  fall back to the last passed task *only if it started within a grace window*
  (say 2h), otherwise treat it as overdue, not current.

Recommendation: **B with a grace window.** A card that's blank 80% of the day
isn't useful; a card that lies is worse. The grace window gives "you're probably
still on this" without "you're on something from this morning."

## Fix (option B)

```ts
function NowNextCard({ tasks }: { tasks: Task[] }) {
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()
  const GRACE_MIN = 120 // treat a passed task as "now" only within 2h of its start
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  const endMin = (t: Task) => toMin(t.startTime!) + (t.duration ?? 0)

  const timed = tasks
    .filter((t) => t.startTime && !t.completed)
    .sort((a, b) => toMin(a.startTime!) - toMin(b.startTime!))

  // In progress right now: started, and (if it has a duration) not yet ended.
  const inProgress = [...timed]
    .reverse()
    .find((t) => toMin(t.startTime!) <= nowMinutes && (t.duration ? endMin(t) > nowMinutes : true))

  // Fallback: most recent started task, but only if it started within the grace window.
  const recent = [...timed]
    .reverse()
    .find((t) => toMin(t.startTime!) <= nowMinutes && nowMinutes - toMin(t.startTime!) <= GRACE_MIN)

  const current = inProgress ?? recent
  const next = timed.find((t) => toMin(t.startTime!) > nowMinutes)
  // ...unchanged from here
```

Note the fallback still can't be perfect for zero-duration tasks (no end time to
know when they're "done"), which is exactly what the grace window covers.

## Verification

- Unit-level (no infra needed): extract the selection into a pure helper and test
  the 08:00/16:00 case → `current` is undefined or `next`, never the 08:00 task.
- Manual: seed a timed task earlier today, leave it unchecked, confirm "NOW" is
  empty (or shows the genuinely current item) rather than the morning task.

## Effort

~20 minutes. One function, no data-model or backend change.
