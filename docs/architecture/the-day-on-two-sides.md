# The day, composed on two sides

How the same day is assembled from Supabase on the server and from a file on the
device, without two implementations of what a day *is*.

Decisions behind it: [ADR-0010](../adr/0010-guest-identity-and-session-lifetime.md)
(who a Guest is), [ADR-0011](../adr/0011-a-guests-day-lives-in-one-file-on-the-device.md)
(where their day goes), [ADR-0001](../adr/0001-materialize-habit-instance-on-drag.md)
and [ADR-0002](../adr/0002-task-scheduling-and-materialization-model.md) (Habits
and scheduling).

## The shape

```
                    backend/src/day-summary-core.ts        ← browser-safe
                    ├── composeDayTaskRows                    which rows are this day's
                    ├── isCarryForwardRow                     the rollover rule
                    ├── itemRowToClient                       row → Item
                    └── buildDaySummaryCore                   nine sources → DaySummary
                              ▲                    ▲
              server adapter  │                    │  device adapter
      backend/src/day-summary.ts                src/lib/local/day.ts
        Supabase queries, Google Calendar,        one JSON document
        Health, Work, logging                     read through a driver
```

Plus two more rules that are shared the same way:

- `backend/src/habit-contracts.ts` — `deriveHabitOutcome` and
  `resolveHabitOutcomeRequest`: what measured progress makes a Habit's day, and
  what to do when the user asks for an outcome the record does not support.
- `backend/src/utils/sortTasksForTimeline.ts` — timeline ordering.

**The rule is shared; where the rows are found is not.** Every module above the
line is pure and imports nothing server-only, which is what lets the browser
bundle include it.

## The nine sources

`buildDaySummaryCore` takes all nine as injected dependencies and derives
everything else. That is the whole seam:

`itemsForDay`, `getSettings`, `getCalendarStatus`, `getCalendarEvents`,
`getCalorieEntries`, `getWeightEntry`, `getWorkoutSessions`, `getAchievements`,
`listDayFocusBlocks`.

| Source | Server | Device |
|---|---|---|
| `itemsForDay` | three Supabase queries → `composeDayTaskRows`, plus `Rollover` | three in-memory filters → the same `composeDayTaskRows`, plus the same `isCarryForwardRow` |
| `getSettings` | `users_settings` row | the document's `settings` patch over the local baseline |
| `getCalendarStatus` | Google connection state | `{ connected: false }` — true, and not a failure |
| `getCalendarEvents` | Google sync | **throws** — unreachable, and `[]` would claim the day has no obligations |
| Nutrition, Training, Progress | their tables | **throw** — the modules are off in the local baseline, so the core never calls them |
| `listDayFocusBlocks` | `Work.listDayFocusBlocks` | `[]` — genuinely empty; Work is behind a release flag and nothing on a device can create a Focus block |

The throwing sources matter. `unavailable` means a read *failed*; empty means
nothing was there. A device that answered `[]` for Nutrition would be reporting
"you logged nothing today" about records it does not hold.

## Which side answers

A **Guest** is an account with no email, and a Guest's day is not hosted. So the
routing follows the identity, not a separate flag:

```
AuthContext.adoptUser(user)
  └── setLocalDayUser(isGuestSession(user) ? user.id : null)

src/services/api.ts
  └── onDevice(local, hosted)   // picks a branch per call
```

`onDevice` wraps each service method that touches the day: `taskService`,
`settingsService`, `daySummaryService`. Both branches return the same shape, so
no page knows which side answered. `setLocalDayUser` is called beside `setUser`
rather than in an effect, because an effect can land after the first query.

Everything else still goes to the server, because a Guest has a real `users` row
and a real token: credits, AI, account deletion, version gating, push.

## The boundary, and how it is guarded

A browser import reaching a server-only module produced a blank Vite dev screen
once. `tests/frontend-startup.test.ts` boots the app in Chromium through Vite,
asserts nothing threw, and then imports `day-summary-core.ts` in the page and
checks `buildDaySummaryCore` is there. If someone adds a Supabase import to the
core, that test fails rather than production.

Two module-format details cost time and are worth knowing:

- The backend package is CommonJS and the frontend is ESM. Named value imports
  across that line resolve under Vite but not under `tsx --test`. Shared modules
  therefore also export a **default object** (`TaskContracts`, `SettingsContracts`,
  `HabitContracts`, `DaySummaryCore`) and callers destructure it. Types can be
  imported by name freely — they are erased.
- `backend/src/*-contracts.ts` is the established home for anything the browser
  needs from a server module. Put the schema and the rule there; leave the
  database call behind.

## The store

One JSON document, `@capacitor/filesystem`, `Directory.Data`. Held in memory once
loaded — composing a day reads seven days of Items, and re-reading the file seven
times to answer one question would be absurd — and written through on every
mutation, with the in-memory copy advanced only after the write succeeds.

Rows are stored in the server's own snake_case column shape with client-generated
ids and `updated_at` on every record, so the shared core runs over them unchanged
and Claim can be an upload rather than a translation.

`src/lib/local/` is three files, each a layer:

| File | Holds |
|---|---|
| `store.ts` | the document schema, the driver interface, the Capacitor and memory drivers, load/mutate/erase |
| `day.ts` | the nine sources and every write: create, edit, complete, delete, reorder, Habit progress and outcome |
| `services.ts` | the client shapes `src/services/api.ts` returns, and `onDevice` |

## What is not built

- **Claim.** A Guest cannot become an account holder. The upload and the credit
  carry-over do not exist.
- **Health on the device.** Nutrition, Weight, Training and Progress are not
  stored locally. ADR-0011 records that this contradicts `TARGET.md`.
- **The web.** The entry point is iPhone-only.
- **The Keychain.** The session token still lives in `localStorage`, so deleting
  the app takes the session with it. `src/lib/session.ts` is the seam: it holds a
  swappable synchronous token store precisely so a Keychain-backed one can replace
  it without touching callers.
