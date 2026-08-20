# 05 — Midnight snack renders at 6 AM

**Severity:** Medium (silently misplaces real data on the timeline)
**File:** `src/components/DayTimeline.tsx:295`
**Verdict:** CONFIRMED (placement bug). The related "NaN drops the entry" claim was
REFUTED — times are strictly validated, so `parseInt` always succeeds.

## Symptom

Log a calorie entry outside 06:00–23:00 — a 00:15 midnight snack, a 05:30 pre-dawn
coffee — and it renders in the **6 AM** row of the timeline. The entry's own label
still shows the honest time ("00:15") next to the clock icon, which makes it look
even more broken: the text says 00:15 but it's sitting under the "6 AM" heading.

Late-night and early-morning eating is a completely normal tracking pattern, so
this will be seen regularly by exactly the calorie-focused users the redesign
promotes.

## Root cause

The timeline grid only has hour slots for 06:00–23:00 (`HOUR_SLOTS`). Out-of-range
entries are clamped into the nearest edge slot rather than shown where they
belong:

```ts
for (const entry of calorieEntries) {
  if (!entry.time) continue
  const hour = Math.min(23, Math.max(6, parseInt(entry.time, 10)))  // 00:15 → 0 → clamped to 6
  calorieBuckets[`${String(hour).padStart(2, '0')}:00`].push(entry)
}
```

`parseInt('00:15', 10)` → `0` → `Math.max(6, 0)` → `6` → bucket `'06:00'`. Same
happens at the top: a 23:50 entry is fine, but anything the grid doesn't cover gets
crushed to the boundary. (Note `parseInt` is safe here — times are validated to
strict `HH:mm` at the API Zod schema and the Postgres `TIME` column, so it never
produces `NaN`. Only the placement is wrong.)

## Fix — pick one

### Option A (recommended, smallest): an "earlier / later" overflow bucket

Keep the 06:00–23:00 grid, but collect out-of-range entries into a labeled group
rendered above the grid (before-6am) and below it (after-11pm), instead of jamming
them into edge slots.

```ts
const calorieBuckets: Record<string, CalorieEntry[]> = {}
for (const slot of HOUR_SLOTS) calorieBuckets[slot] = []
const earlyCalories: CalorieEntry[] = []   // before 06:00
const lateCalories: CalorieEntry[] = []    // after 23:00

for (const entry of calorieEntries) {
  if (!entry.time) continue
  const hour = parseInt(entry.time, 10)
  if (hour < 6) { earlyCalories.push(entry); continue }
  if (hour > 23) { lateCalories.push(entry); continue }
  calorieBuckets[`${String(hour).padStart(2, '0')}:00`].push(entry)
}
```

Render `earlyCalories` in a small "Earlier" strip above the first slot and
`lateCalories` in a "Later" strip below the last, each row still showing its real
time. Honest placement, minimal grid change.

### Option B (more work): extend the grid to 24 hours

Make `HOUR_SLOTS` cover 00:00–23:00. Correct by construction and removes the clamp
entirely, but it lengthens the timeline for everyone and touches slot layout,
drag-drop hit slots, and the empty-slot compaction logic — bigger blast radius.
Only worth it if you also want *tasks* schedulable before 6am.

Recommendation: **Option A.** It fixes the dishonesty without reflowing the whole
timeline or the compaction/drag code.

## Verification

- Log a calorie entry at 00:15 and one at 05:30 → both appear in an "Earlier"
  group above the 6 AM row with their real times, not inside the 6 AM slot.
- Log one at 08:00 → still in the 08:00 slot (no regression to in-range entries).

## Effort

~30 minutes for Option A (bucket split + two small render strips). Option B is
~1–2h with drag/compaction re-testing.
