# ADR 0011 — A Guest's day lives in one file on the device

**Status**: Accepted
**Date**: 2026-08-21

## Context

`TARGET.md` says free users' data is never hosted — for cost, and because if it
were, the Cloud subscription would have nothing to sell. ADR-0010 settled who a
Guest *is* (a `users` row with no email, holding identity and a credit balance)
and deliberately left open **where their day goes**. This decides that.

Two things narrowed the choice before it was made:

1. **v1 is iPhone only.** The store runs inside a Capacitor shell, so a native
   plugin is available and browser storage is not the only option.
2. **There is no query workload.** Composing a day already reads a whole week of
   Items into memory and derives everything from them in one pure pass
   (`buildDaySummaryCore`). A person's entire history is small enough to hold in
   memory — a year of daily use is on the order of a few hundred kilobytes.

## Decision

**One JSON document, written through `@capacitor/filesystem` to
`Directory.Data`, holding raw rows in the server's own column shape.**

Three separable decisions, each with its own reason.

### Why a file, not SQLite and not browser storage

| Option | Why not |
|---|---|
| `localStorage` / IndexedDB in the WKWebView | The classic Capacitor loss: web-view storage has been reported cleared by app updates, and iOS may evict script-writable storage under pressure. "Your day lives here, forever" cannot rest on a store the OS treats as a cache. |
| `@capacitor/preferences` | Correct durability — it is `UserDefaults` — but `UserDefaults` is for preferences. A growing record set under one key is a misuse that gets slower and riskier as it grows. |
| `@capacitor-community/sqlite` | Real durability and real queries, but the queries buy nothing here, and it adds a community native dependency, a SQL schema and migrations to maintain. |

`@capacitor/filesystem` is an official plugin in the same major version as the
ten already installed, has no size ceiling, and survives app updates. The store
sits behind a two-method driver interface, so if the dataset ever outgrows a
document, SQLite is a driver swap rather than a rewrite.

### Why `Directory.Data` rather than `Directory.Documents`

`Directory.Data` is `Library/NoCloud`: it survives app updates and is **excluded
from iCloud backup**. The exclusion is the deliberate half. Cross-device is what
the Cloud subscription sells, so a Guest's day arriving on a second device for
free would be the product giving itself away. A Guest is single-device by nature
(`TARGET.md`), and this is what makes that true rather than merely stated.

The cost is stated plainly: **a lost or wiped phone loses the day.** That is the
thing signing up fixes, and the entry point says so before anyone taps it.

### Why raw rows in the server's shape

The document stores `tasks` and `habit_progress_entries` rows in their snake_case
column shape rather than a device-native model. Two consequences:

- The same `composeDayTaskRows`, `isCarryForwardRow`, `itemRowToClient`,
  `deriveHabitOutcome` and `buildDaySummaryCore` run over them. A day rendered
  offline and a day rendered online are the same shape **by construction**, not by
  convention — which is the one mitigation against the two implementations
  drifting.
- Claim becomes an upload rather than a translation.

Records are **born sync-ready**: ids are generated on the device and every record
carries `updated_at`. If the server assigned ids at claim time, every local id
would change on upload and a later sync would have no stable identity to
reconcile against. It costs nothing now and is the single decision that keeps
"backup now, sync later" cheap.

## What the device refuses to answer

Nutrition, Weight, Training and Progress records are not stored on the device.
The local settings baseline switches those modules off, so the day contract
reports `disabled` — a state Today already renders — and the core never asks for
them. The dependency functions still exist and **throw**: an empty Nutrition
would claim the user logged nothing, which is exactly the `unavailable`-versus-
`not_logged` confusion `CONTEXT.md` names.

Google Calendar reports `not_connected`, which is simply true: a Guest has
connected no Calendar. Per `CONTEXT.md` that is outside the system's world rather
than a failed read, so **Capacity stays `complete`** — the offline Guest sees an
exact "usable time left", which is the sentence the whole listing rests on.

## The consequence that is not resolved

`TARGET.md` calls food, weight and training **core, not optional**, and says no
part of the day itself is withheld. A Guest whose Health modules are off does not
have the whole day. That is a real contradiction between this ADR's scope and the
target, carried deliberately so the rest could ship, and it has to close before
the App Store listing claims the whole day works without an account. Either the
device learns to hold those four record types, or `TARGET.md` says that Health
needs an account and accepts what that costs.

## Consequences

- A Guest cannot log out. There is no email and no password to sign back in
  with, so signing out would strand the day behind a session that can never be
  re-issued. Account deletion remains available and erases the document, because
  that is a deletion the user asked for by name.
- A read that fails throws. A missing document means a first open and is an empty
  day; anything else — unparseable JSON, an unknown version, a document belonging
  to another session — surfaces, because silently starting a returning Guest on a
  blank day destroys their only copy on the next write.
- The web is unchanged. The entry point is iPhone-only, so no web user can become
  a Guest, and the ~7-day eviction of script-writable storage in iOS Safari stays
  an open question for whenever the web reaches guest parity.
