# Mission: Reason about HealthyFlow Talk data flows

## Why
Make sound architecture choices for Talk so it answers from the right day data,
especially on iPhone when Calendar is held by the device. Understand the path
well enough to review a proposed implementation before it ships.

## Success looks like
- Trace a user message from date/source selection through authoritative reads to an answer.
- Recognize when `not_read`, `unavailable`, and a successful empty Calendar mean different things.
- Judge a context router by whether it retrieves required evidence, not just by its output format or speed.

## Constraints
- Keep lessons short, visual, and tied to actual HealthyFlow failures and code.
- Preserve the Local day, EventKit, server-keyed AI, and confirmed-write boundaries.

## Out of scope
- Choosing or integrating a new router vendor before a replay evaluation.
