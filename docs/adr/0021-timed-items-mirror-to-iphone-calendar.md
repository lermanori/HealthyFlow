# ADR 0021 — Timed Items mirror automatically to iPhone Calendar

**Status**: Accepted

**Decision date**: 2026-09-09

## Context

ADR-0020 brought external Calendar obligations into the Local day through
EventKit without a HealthyFlow backend request. It deliberately left exporting
Items for a later slice. The product now needs Calendar to work in both
directions on iPhone while preserving the free Local boundary.

"Both directions" can be ambiguous. External events remain obligations rather
than HealthyFlow Items: HealthyFlow reads them into Today and Capacity but does
not adopt their lifecycle. In the other direction, HealthyFlow mirrors its own
timed Items into Calendar and remains authoritative for those mirrored events.

## Decision

### 1. Full Calendar access enables automatic reconciliation

Once the person grants full Calendar access, the native app reconciles after a
Local-day change, after a successful connection, when the app returns to the
foreground, and when the person explicitly retries.

A live Item with a date and start time creates or updates one EventKit event in
the default writable calendar. Changing its title, date, start time, duration,
or location updates that event. Removing its timing or deleting the Item removes
the event. An Item without a duration exports as 30 minutes, matching the
existing declared Calendar-export default; Capacity still reports a missing
duration rather than using that export default.

### 2. The Local Item is authoritative for its mirrored event

Each generated event carries a `healthyflow://item/<item-id>` marker. The native
bridge uses the saved EventKit identifier first and the marker as an idempotency
recovery path. A deleted generated event is recreated during reconciliation; an
external edit is overwritten by the next reconciliation.

Generated events are filtered from imported obligations. The Item therefore
appears once in HealthyFlow, not once as an Item and again as a Calendar event.

### 3. EventKit linkage is device-only bookkeeping

The Item-to-event identifier, last reconciled Item timestamp, and any explicit
failure are stored in the Local day file. These fields are outside the Cloud sync
collections and never travel to HealthyFlow's backend. They remain on the
physical iPhone across Guest Claim or account-day adoption so stale generated
events can be cleaned up safely.

This path is identical for Guest, claimed-free, and Cloud identities. Identity
or entitlement never selects whether Device Calendar works.

### 4. Failures remain visible and retryable

Permission states are distinct from failures. A denied, restricted, or
not-yet-requested Calendar is not connected. A native save or delete failure is
recorded and surfaced with Retry; it is never converted to success or an empty
result.

### 5. Backend Google Calendar stays a separate path

The iPhone app does not start Google OAuth or call the backend Google Calendar
routes. Google accounts already added to iOS can participate through Apple's
Calendar and EventKit. The backend Google integration remains a separate hosted
path and is not used to provide free or Guest iPhone Calendar sync.

## Consequences

- Device Calendar read/write adds no HealthyFlow backend or Google API cost for
  Guest or free users.
- HealthyFlow needs full EventKit access because it both reads obligations and
  writes timed Items.
- Removing permission pauses reconciliation without changing the Local day.
- The App Store privacy inventory must describe on-device Calendar writes as
  well as reads.
- External Calendar events remain read-only inside HealthyFlow; only
  HealthyFlow-owned timed Items are written back.

## Primary sources rechecked on 2026-09-09

- [Apple — Creating events and reminders](https://developer.apple.com/documentation/eventkit/creating-events-and-reminders)
- [Apple — `EKEventStore.save(_:span:commit:)`](https://developer.apple.com/documentation/eventkit/ekeventstore/save(_:span:commit:))
- [Apple — `requestFullAccessToEvents(completion:)`](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoevents(completion:))
- [Apple — App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/)
