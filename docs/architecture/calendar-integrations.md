# Calendar integrations

HealthyFlow uses the calendar that belongs to the surface where the day is
being used. Calendar access is not an account tier, and an account's role does
not choose a calendar provider.

Decisions behind this design: [ADR-0020](../adr/0020-iphone-calendar-is-read-directly-with-eventkit.md)
(the native Calendar boundary), [ADR-0011](../adr/0011-a-guests-day-lives-in-one-file-on-the-device.md)
(the Local day), and [ADR-0012](../adr/0012-entry-is-open-scarcity-belongs-to-the-paid-tier.md)
(what future Cloud buys).

## v1 target

| Person | Day source on iPhone | Device Calendar | Direct Google Calendar |
|---|---|---|---|
| Guest | Local day | Available | Hidden |
| Free account (claimed, new, or returning) | Local day | Available | Hidden |
| Existing founder Cloud account | Local day; existing Cloud may replicate it | Available | Optional legacy control |
| Future v1.1 Cloud account | Local day with Cloud replication | Available | Optional |

No user can obtain Cloud in v1. The existing founder entitlement is a legacy
operational exception, not a v1 plan or an acquisition path. An `admin` role
does not imply Cloud, and Cloud does not replace the Local day with a hosted
source.

Device Calendar uses EventKit directly. A Google account already added to iOS
Calendar is therefore a Device Calendar source and does not need HealthyFlow's
Google OAuth connection. Ordinary Device Calendar content does not pass through
HealthyFlow's backend.

## Direction and ownership

"Two-way" has two distinct responsibilities:

1. Device Calendar events appear in HealthyFlow as Calendar obligations. Since
   [ADR-0024](../adr/0024-a-writable-calendar-event-is-an-item.md) an event on a
   calendar that permits modification is a first-class Item — draggable,
   editable and completable — and the change is written back to that calendar.
   An event on a calendar that refuses modification renders as fixed, with a
   readable reason, and never offers an affordance that cannot succeed. There is
   one record per obligation: a foreign event is never shadowed by a second
   HealthyFlow Item.
2. A timed HealthyFlow Item has one linked Device Calendar event. Creating,
   editing, or rescheduling either side reconciles the linked record on the
   other side. Deleting a HealthyFlow-owned event in Device Calendar deletes its
   linked HealthyFlow Item; deleting the Item removes its linked event.
   When both sides changed since the last successful reconciliation, the last
   save wins: compare the Item's `updated_at` with EventKit's modification date
   and apply the newer state to the older side. If either timestamp is missing or
   invalid, or equal timestamps contain different values, surface a conflict and
   change neither side rather than guessing. Failed reads or writes also surface
   explicitly.

Automatic reconciliation begins after the person connects Device Calendar. A
manual sync button is recovery, not the normal workflow. HealthyFlow-owned
events must not also return as obligations, and a Google calendar exposed by
EventKit must not be read again through the backend on iPhone.

Direct Google Calendar is a different integration. It is server-backed and is
kept only for the existing founder Cloud account in v1. Its control stays hidden
for Guests and free accounts. RevenueCat, StoreKit, Lemon Squeezy, and every
other purchase rail are outside this architecture for v1.

## Account and storage boundaries

The session describes identity: id, email, name, role, and authentication
method. Guest is exactly `email === null`. Free versus Cloud is not encoded in
the session and must not be inferred from `role`.

The Local day is the source for every iPhone user. `dayUserId` selects the Local
service branch; `null` selects the legacy hosted branch. A successful iPhone
account entry must therefore place and validate the account's day on the device,
remember its owner, and only then expose the session. Restoring an existing
session must preserve the same invariant.

## Implementation status and gaps — 2026-09-10

| Area | Current implementation | Gap to v1 target |
|---|---|---|
| Guest routing | Guest ownership always selects the Local day | None observed; physical-device Item export works |
| Explicit account sign-in | Downloads, merges, validates, and remembers the Local day before adopting the session | Needs regression coverage proving Device Calendar starts for the resulting account |
| Existing-session restore | Verifies the token, then trusts an existing Local-day owner marker | A missing or mismatched marker leaves a registered account on the hosted branch instead of restoring the Local-day invariant |
| Manual Item write | Local writes emit `healthyflow:local-day-changed`; hosted writes call `/tasks` | The hosted branch bypasses EventKit, which matches the reported founder-account failure |
| Talk-confirmed Item write | Server confirms the action, then mirrors the returned record into the Local day when `dayUserId` exists | A wrongly hosted account skips the Local mirror and therefore skips EventKit |
| Device Calendar read | EventKit obligations are composed locally and HealthyFlow-owned events are filtered out | Implemented |
| HealthyFlow Item export | Local timed Item create/edit/reschedule/delete is reconciled to EventKit | Implemented for the HealthyFlow-to-Calendar direction |
| Device edit of linked Item | EventKit change triggers refresh and reconciliation | Reconciliation currently writes the HealthyFlow value back to EventKit; it does not apply a Device-side edit or deletion to the Item |
| Status UI | Item cards still render legacy Google sync state | The native UI can say `Syncing` when Device Calendar never ran; provider-specific status is not truthful |
| Direct Google | Backend sync remains and the native connection control is release-flagged and Cloud-gated | Keep hidden for Guest/free v1; verify the founder-only control and prevent duplicate EventKit/Google processing |

### Evidence classification

**Code facts:** Guest always selects a Local day; a registered account selects it
only when the remembered owner id matches; token restoration does not download
the account archive; the Device Calendar hook exits when `dayUserId` is null;
and the hosted timed-Item route invokes the backend Google adapter.

**Inference from the 2026-09-10 physical-device report:** the founder account is
probably taking the hosted branch, because Guest reaches EventKit on the same
build and device while the founder Item shows legacy Google status. This is not
yet a confirmed runtime fact.

**Still to observe:** the founder build's actual `dayUserId` state, remembered
owner id, Cloud entitlement result, selected task-service branch, and provider
mutation results. Diagnostics must expose states and identifiers without logging
tokens, calendar content, credentials, or other secrets.

## Required implementation slices

Each slice is independently verifiable and belongs in its own issue, branch,
and PR:

1. Restore the Local-day invariant for an existing authenticated iPhone account.
2. Prove manual and Talk-confirmed timed Items from a claimed/free account reach
   EventKit through the same path as Guest Items.
3. Make Item Calendar status provider-specific and remove the false Google
   `Syncing` state from the native Local path.
4. Apply Device-side edits to the linked Item. Deleting a HealthyFlow-owned
   Device Calendar event deletes the linked Item; deleting the Item removes its
   linked event. Implement both directions with test-first reconciliation
   coverage. When both sides changed, compare their validated modification
   timestamps and apply the last save; surface indeterminate ties or invalid
   timestamps without changing either side.
5. Verify the existing founder Cloud exception: Local day remains the source,
   Cloud only replicates, and direct Google is an explicit optional connection
   without duplicate Device Calendar events.

The physical-device release gate covers Guest, claimed free, returning free,
and the existing founder account separately. For each identity, create, edit,
reschedule, and delete a uniquely named timed Item, then verify the linked event
and the absence of duplicates.
