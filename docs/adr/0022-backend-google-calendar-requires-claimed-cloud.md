# ADR 0022 — Backend Google Calendar requires a claimed Cloud account

**Status**: Accepted

**Decision date**: 2026-09-09

## Context

Device Calendar gives every iPhone identity automatic Calendar read/write through
EventKit without sending Calendar data through HealthyFlow. The older direct
Google integration is different: HealthyFlow stores OAuth credentials, calls
Google APIs, and stores imported event state on the backend.

Free v1 must not make Guest or claimed-free Calendar activity a hosted cost. At
the same time, direct Google remains useful for Cloud and must not be confused
with Google accounts that iOS already exposes through Device Calendar.

## Decision

Direct backend Google Calendar is a Cloud entitlement. Access requires both:

1. a claimed identity (`users.email` is present); and
2. an active `user_credit_subscriptions` row.

The same typed guard runs before a connect URL, OAuth token exchange, stored
connection read, event import or mutation, and timed-Item export. The OAuth
callback rechecks the entitlement after validating signed state because access
may change while the person is at Google.

An expected missing entitlement returns `cloud_not_active`. A failed entitlement
read remains a server failure; it is never converted to inactive. Day composition
represents the expected boundary as `calendar.status = not_entitled`, not as a
successful empty Google read and not as an unavailable Calendar.

Disconnect and authorization revocation remain available to an authenticated
account after Cloud ends so consent can always be withdrawn.

For a Cloud user on iPhone, the product direction is to show direct Google as a
second connection beside Device Calendar. That UI and combined-source behavior
land separately; this decision first makes the backend boundary safe.

## Consequences

- Guest and claimed-free Device Calendar stays entirely on-device.
- An active subscription row can never accidentally give a Guest backend Google
  access.
- Existing claimed Cloud accounts retain direct Google behavior.
- Deactivating Cloud blocks new Google reads and writes without deleting stored
  consent or credentials automatically.
- Native combined-provider presentation needs its own independently tested issue.

