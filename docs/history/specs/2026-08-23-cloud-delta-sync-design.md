# Cloud delta sync

**Date:** 2026-08-23
**Status:** Approved design, not yet implemented
**Depends on:** Claim, Health on the device, Sign in (all built 2026-08-21)

## The problem

**Nothing uploads.** Local is the source and the server is never updated from it.
Three consequences, all of which have already happened to a real user:

- Items completed and deleted on a phone came back, because signing in
  re-downloaded the server's older copy.
- A registered user has **no backup at all**. Lose the phone, lose the day.
- Two devices cannot show the same day, which is the thing `TARGET.md` says the
  Cloud subscription sells.

Every fix shipped on 2026-08-23 was a mitigation of this. This is the fix.

## Decisions this records

| Decision | Why |
|---|---|
| **Two-way.** Changes go up and come down. | Backup alone does not deliver "your day on every device", which is what Cloud sells |
| **Delta by watermark**, not an operation log | Soft deletes and `updated_at` already make rows self-describing, so the queue, its ordering and its dead letters are all unnecessary |
| **The watermark is the server's clock** | A device clock decides conflicts but must never decide what has been seen |
| **Conflicts are row-level, most recently changed wins** | The rule already chosen for the sign-in merge. Field-level merging is not worth it for a single-user product |
| **Subscribers only** | Cloud is the paid tier. A free user's data is never hosted (`TARGET.md`, ADR-0012) |
| **On lapse: freeze, then delete after a grace period** | Bounds storage cost without destroying a backup the moment a card fails |

## Two prerequisites, both real work

### 1. `tasks` has no `updated_at`

Every other table has one. `tasks` does not — and it is the table the day is made
of. Delta sync is "everything changed since X", which that table currently cannot
answer.

This is the same missing column that made a downloaded day unreadable on
2026-08-23. It needs a migration, a backfill from `created_at`, and to be kept
current on every write.

### 2. Health deletes are hard deletes

Items soft-delete: `deleted_at` is set and the row stays, so a deletion travels as
data. The four health kinds delete by removing the row from the array. To the
server "absent" and "deleted" are identical, so **the next pull resurrects it**.

Health needs `deleted_at` and a filter on read, exactly as Items already have.

Neither prerequisite is optional and neither is a detour: without the first,
nothing can sync; without the second, sync silently undoes deletions.

## The exchange

One endpoint, and the request and response are the same shape:

```
POST /api/sync
  → { since: string | null, changed: { tasks: [...], calorieEntries: [...], ... } }
  ← { syncedAt: string,     changed: { tasks: [...], calorieEntries: [...], ... } }
```

One shape both ways means **one merge function**, used on the server for what
arrives and on the device for what comes back. Separate upload and download paths
would be two implementations of one rule, which is the mistake this codebase has
already paid for three times — `composeDayTaskRows`, `deriveHabitOutcome` and
`summarizeAchievement` all exist because of it.

`since` is whatever `syncedAt` the server last returned, or null for a first push.

## The merge rule

For each row, by id: **the row whose `updated_at` is later wins.** A tie goes to
the incoming row, so a device that just wrote something is not overruled by a copy
that has not moved.

Deletions are rows like any other — `deleted_at` set, `updated_at` bumped — so a
delete competes on the same terms as an edit, and the later one wins. This is why
prerequisite 2 exists.

## Clocks

**The watermark is the server's clock. Conflicts use the device's.**

They are different questions. "What have I already seen?" must be answered by one
authority or a device with a skewed clock either misses rows forever or re-sends
everything on every sync. "Which edit happened later?" is about when a person did
something, which only the device knows.

The risk that remains is a device whose clock is far ahead winning every conflict
until real time catches up. The server therefore **rejects rows dated more than a
few minutes into the future** rather than storing them, which bounds the damage to
one refused sync instead of a permanently poisoned row.

## Settings

Settings are a patch object, not rows, so they sync as **one record with one
`updated_at`**. Last write wins for the whole object. Merging individual settings
keys would mean a schema for something that is already small enough to lose whole.

## When it runs

- On app open
- On regaining a connection — `@capacitor/network` already dispatches this and
  `useOfflineStatus` already listens
- After a local change, debounced

Offline is not a special case: the watermark simply does not advance, and the next
exchange carries whatever accumulated. **There is no queue to drain and nothing to
retry**, which is the whole reason for choosing a delta over an operation log.

## Subscription

Sync runs only while the account is registered **and** subscribed.

Switching Cloud on runs a **full first push**: `since` is null, so the delta is the
entire day. That is the same exchange, not a separate mechanism.

Switching off stops it. The hosted copy freezes.

## Lapse

The hosted copy is frozen on lapse and deleted after a grace period with warnings.
**This spec builds the freeze only.** The deletion needs a scheduler, warning
emails and a clock, and none of that belongs inside a sync engine — it is its own
piece of work and must not be forgotten, because the storage cost it bounds is the
reason the grace period was chosen over keeping data forever.

## Realtime, later

A Supabase Realtime subscription becomes a **nudge to run the same exchange**, not
a second code path. Designing the pull as "everything since a watermark" is what
makes that nearly free, and it is why the exchange is not shaped as a push.

Not built here.

## Testing

The merge is pure and gets the treatment the day core gets. The cases that matter
are the ones that have already caused damage:

- A row present on **both** sides — the case that would have duplicated an entire
  account, because the first design assumed ids could not collide.
- A delete racing an edit, in both directions.
- A device clock in the future, refused rather than stored.
- A second sync with nothing changed, sending nothing.
- A first push, where `since` is null and the delta is everything.
- A row the server has never seen, keeping the id the device gave it — the
  duplication risk from client-generated ids.

**And one integration test that runs a real account export through the whole
path.** Every bug found on a device this week came from data the server creates,
while every test used data the device creates. That gap is the reason this list
exists.

## Out of scope

- **The deletion job** after the grace period.
- **Realtime.**
- **Field-level conflict resolution.**
- **Sharing a day between accounts.** Nothing here implies it.

## Open questions

- **Does the web app sync too, or keep reading the server directly?** It has no
  local day today. Until it does, a subscriber's phone and the web are consistent
  only because both trust the same server rows.
- **What a subscriber sees while a sync is failing.** Silence is wrong, and a
  permanent error banner is worse. Not designed.
