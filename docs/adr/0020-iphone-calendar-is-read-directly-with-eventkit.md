# ADR 0020 — iPhone Calendar is read directly with EventKit

**Status**: Accepted

**Decision date**: 2026-09-08

## Context

HealthyFlow's existing Google Calendar integration stores OAuth credentials and
reads calendar events through the backend. That is useful for a hosted web day,
but it breaks the v1 Local boundary on iPhone: a Guest's ordinary day should not
need HealthyFlow's backend, and the founder should not carry backend Calendar
traffic for the free Local product.

iOS already presents calendars from accounts the person has configured on the
device, including iCloud and Google accounts. EventKit can therefore add those
obligations to the Local day without a second HealthyFlow calendar account or a
server-side sync.

## Decision

### 1. The iPhone app reads Device Calendar through EventKit

After the person explicitly grants Calendar access, the native bridge reads the
device's events for the requested local date and maps them into the canonical
`DaySummary` calendar-event schema. The Local day composes those events into
Today and Capacity on the device.

The app distinguishes not requested, denied, restricted, connected-empty, and
failed reads. A failed EventKit read is `unavailable`; it is never represented as
an empty Calendar.

### 2. Device Calendar content does not pass through HealthyFlow's backend

The EventKit result stays inside the native app. HealthyFlow does not upload the
event title, time, location, notes, calendar identifier, or event identifier as
part of ordinary Calendar reading.

This boundary does not change server-keyed AI. If a person explicitly invokes an
AI action whose request includes day context, that request still follows the AI
boundary and must be disclosed separately.

### 3. Device Calendar is read-only in this v1 slice

HealthyFlow shows Device Calendar events as obligations but does not complete,
move, create, or edit them. Exporting HealthyFlow tasks to Device Calendar is a
separate independently verifiable change.

### 4. Native does not also read backend Google Calendar

The iPhone app selects one Calendar source: EventKit. It neither starts the
backend Google Calendar OAuth flow nor calls Google Calendar event read/write
routes. This prevents duplicate events when a Google account is already exposed
to iOS Calendar.

The existing backend Google Calendar direction remains available to the web and
may be reconsidered for a future hosted or cross-device product. It is not part
of the Local iPhone v1 path.

## Consequences

- Guest/free Calendar reads add no HealthyFlow backend request or Google API
  request.
- A person controls access in iOS Settings and can use any calendar source that
  iOS exposes through EventKit.
- Denying Calendar permission leaves Calendar outside HealthyFlow's known world,
  so Capacity remains complete. A read failure after access was granted makes
  Calendar unavailable and Capacity partial.
- The iOS permission copy and App Store privacy inventory must describe the
  on-device read accurately.
- The web Google Calendar implementation remains server-backed and must not be
  described as the native v1 implementation.

## Sources checked on 2026-09-08

- [Apple — `requestFullAccessToEvents(completion:)`](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoevents%28completion%3A%29)
- [Apple — App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/)
