# ADR 0014 — Goals carry user-owned context

**Status**: Accepted
**Date**: 2026-08-26

## Context

ADR-0013 introduced Goal as a concise direction and deliberately refused a
second planning lifecycle. A direction alone is not always enough for Talk to
reason personally. The user may also need to preserve why the Goal matters,
what led to it, constraints, prior decisions, and other facts that should shape
planning without bloating the Goal statement.

Putting that knowledge in Assistant settings would repeat the boundary error
that Goals corrected. Inferring it from activity would also confuse recorded
events with the user's own explanation.

## Decision

This decision supersedes only ADR-0013's closed list of Goal fields. A Goal also
carries one optional free-speech **context** field, up to 4,000 characters.

The statement remains the direction. Context is supporting user-owned
knowledge: background, motivation, constraints, decisions, and useful facts.
Context is not a progress journal, completion signal, task list, deadline, or
substitute for records owned by the Goal's module.

The user may edit Context directly on the Goals surface. Talk receives Context
with the bounded active Goal snapshot and may propose adding, replacing, or
clearing it only after a specific user instruction. The proposal remains
editable and the Local or hosted client writes it only after confirmation.

Existing Goals migrate with empty Context. A failed Goal read still makes both
the statement and Context unavailable; it never becomes an empty Goal list.

## Consequences

- Talk can plan with the user's reasons and constraints without inventing them.
- The visible Goal stays concise while supporting knowledge can be detailed.
- Context changes remain user-controlled and reviewable.
- Context cannot be cited as proof that planned work happened.
- Goal storage, sync, export, and confirmation previews carry the field together.
