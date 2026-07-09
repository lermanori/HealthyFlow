# 02 — One checkbox click triggers 8 task refetches

**Severity:** High (request storm on every interaction, worst on mobile)
**File:** `src/pages/TodayPage.tsx` — mutations at lines 225, 247, 259, 307 (and the
Google-event mutations, which are already scoped and fine)
**Verdict:** CONFIRMED

## Symptom

Completing, un-completing, editing, or deleting a single task refetches **8**
`tasks` queries at once. Every tick of a checkbox is 8 network round trips. On a
slow or metered mobile connection this is the difference between instant and janky,
and it repeats for every action in a session.

## Root cause

The redesign added the week ribbon, which mounts 7 per-day queries keyed
`['tasks', dateKey]`:

```ts
const weekQueries = useQueries({
  queries: weekDayKeys.map((dateKey) => ({
    queryKey: ['tasks', dateKey],
    queryFn: () => taskService.getTasks(dateKey),
  })),
})
```

Meanwhile every task mutation invalidates the **whole `['tasks']` prefix**:

```ts
onSuccess: (completedTask) => {
  queryClient.invalidateQueries({ queryKey: ['tasks'] })   // ← prefix match
  ...
}
```

React Query treats `['tasks']` as a prefix, so it matches all 7 ribbon queries
*plus* a separate always-mounted `['tasks']` (no-arg) query inside
`SmartReminders` (`src/components/SmartReminders.tsx`, `refetchInterval: 60s`).
`staleTime` does **not** protect already-mounted queries from an explicit
invalidate — it only governs automatic refetch-on-mount/focus. So all 8 active
queries refetch immediately. Total: **8 requests per mutation**, on lines 225,
247, 259, and 307.

## Fix

Invalidate only what actually changed — the selected day. The ribbon's counts for
that day live under the same key, so they update too; the other 6 days and the
SmartReminders poll don't need to refetch on a single-task change.

```ts
// completeTaskMutation.onSuccess
queryClient.invalidateQueries({ queryKey: ['tasks', selectedDateKey] })
```

Apply the same change to `uncompleteTaskMutation` (247), `updateTaskMutation`
(259), and `deleteTaskMutation` (307). `selectedDateKey` is already in scope in
the component.

### Edge case: drag between days

If a task can be moved to a *different* day (drag-materialization can set a new
`scheduledDate`), that day's ribbon count also needs refreshing. For those paths,
invalidate both keys:

```ts
queryClient.invalidateQueries({ queryKey: ['tasks', selectedDateKey] })
if (movedToDateKey && movedToDateKey !== selectedDateKey) {
  queryClient.invalidateQueries({ queryKey: ['tasks', movedToDateKey] })
}
```

Complete/uncomplete/edit-in-place/delete don't change the day, so the single-key
invalidate is correct for all four mutations flagged here.

### Optional: quiet SmartReminders too

`SmartReminders` uses a bare `['tasks']` key with no date. If you'd rather it not
be swept by *any* `['tasks', dateKey]`-scoped invalidate mismatch in future,
re-key it to something like `['tasks', 'reminders']` — but that's optional cleanup,
not required for this fix.

## Verification

- Open devtools Network, tick a task on Today, confirm exactly **1** `GET /tasks`
  request fires (for the selected day), not 8.
- Confirm the ribbon dot for today still updates (same key) and other days don't
  refetch.

## Effort

~15 minutes. Four one-line edits (plus the optional drag-across-days guard).
