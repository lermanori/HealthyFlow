# ADR 0024 — a writable Calendar event is an Item

**Status**: Accepted

**Decision date**: 2026-09-10

**Supersedes** [ADR-0020](./0020-iphone-calendar-is-read-directly-with-eventkit.md) §3
("Device Calendar is read-only in this v1 slice"). ADR-0020 §1, §2 and §4 stand:
EventKit is still the native Calendar source, ordinary Calendar content still
does not pass through HealthyFlow's backend, and native still does not also read
backend Google Calendar.

## Context

ADR-0020 §3 made Device Calendar strictly read-only: HealthyFlow showed events as
obligations but did not complete, move, create or edit them. That produced a
timeline where two rows describing the same kind of commitment behaved as
different kinds of thing — one draggable and editable, one inert — with no
explanation a user could see.

The founder's decision on 2026-09-10 is that a Calendar event and an Item should
be the same thing from the person's point of view.

The obstacle is ownership. A real calendar is mostly events HealthyFlow did not
create: work meetings, a shared family calendar, invitations from other people,
subscribed holiday and birthday calendars. Writing to those is not uniformly
possible or uniformly safe. Editing a shared event can propagate the change to
other attendees, and a subscribed calendar refuses writes outright.

## Decision

### 1. Editability follows the calendar, not the creator

HealthyFlow no longer asks "did I create this event". It asks whether the
event's calendar permits modification, via EventKit's
`EKCalendar.allowsContentModifications`.

An event on a writable calendar is a first-class Item: it can be dragged,
rescheduled, edited and completed exactly like an Item HealthyFlow created, and
the change is written back to the real calendar.

### 2. A read-only event says so, before it is touched

Writability is resolved when the row is rendered, not discovered on failure. An
event on a calendar that refuses modification renders as fixed, with a reason a
person can read. It does not present a drag affordance that cannot succeed.

A write that fails anyway surfaces a typed failure. A silent no-op is the
specific outcome this ADR exists to prevent — it is the same dishonesty as a
failed write rendered as absence.

### 3. There is one record per obligation

A foreign event is never shadowed by a second HealthyFlow Item that duplicates
it. Shadowing was considered and rejected: it leaves the real calendar unchanged
while HealthyFlow shows the new time, so two records disagree about one
commitment and the person cannot tell which is true.

This keeps the intent of the ownership filter from
`docs/architecture/calendar-integrations.md`, while replacing its mechanism:
what prevents duplication is now one record with one owner, not a filter that
hides HealthyFlow's own events from the obligation read.

### 4. Provenance stays visible even though behaviour converges

Identical behaviour does not mean indistinguishable origin. A person keeps being
able to tell what came from their calendar and what they created in HealthyFlow.
Convergence is about affordances, not about erasing where a commitment came from.

## Consequences

- **The native ownership guard is deliberately lifted.** `DeviceCalendarPlugin`
  currently rejects mutating any event that is not HealthyFlow-owned
  (`isHealthyFlowItemEvent`). That guard is replaced by the writability check in
  §1. This is a widening of what HealthyFlow may change on the person's device
  and must be treated as such in review.
- **HealthyFlow now writes to calendars it does not own.** Where those calendars
  are shared, an edit may reach other people. This is a visible, user-initiated
  action — dragging a row — and not background reconciliation, which is what
  makes it acceptable.
- **The App Store privacy inventory changes.** `docs/runbooks/app-store-v1.md`
  describes Device Calendar as a read. It becomes read and write, and the
  permission copy must say so before submission.
- **This depends on two-way reconciliation.** The write path and last-save-wins
  behaviour are [#267](https://github.com/lermanori/HealthyFlow/issues/267).
  Shipping the converged UI before that path exists would deliver a draggable row
  whose drag does nothing, which §2 forbids.
- Subscribed, holiday and Contacts-derived calendars remain permanently fixed.
  This is a property of the calendars themselves, not a HealthyFlow limitation,
  and the reason shown to the person should say so.
- ADR-0020 §3's guarantee that HealthyFlow never alters a person's calendar is
  withdrawn. Anyone relying on that guarantee — privacy copy, App Privacy
  answers, support material — needs revisiting.

## Sources checked on 2026-09-10

- [Apple — `EKCalendar.allowsContentModifications`](https://developer.apple.com/documentation/eventkit/ekcalendar/allowscontentmodifications)
- [Apple — `EKEventStore.save(_:span:commit:)`](https://developer.apple.com/documentation/eventkit/ekeventstore/save%28_%3Aspan%3Acommit%3A%29)
