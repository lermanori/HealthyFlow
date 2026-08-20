# 03 — `ai_question_asked` activation metric flatlined

**Severity:** High (a documented activation KPI silently reads zero)
**Files:** `src/pages/AssistantPage.tsx` (missing instrumentation),
`src/lib/analytics/types.ts:36` (orphaned event)
**Verdict:** CONFIRMED

## Symptom

The `ai_question_asked` event has no emitter anywhere in the codebase after the
redesign. It still exists in the analytics schema and is documented as a KPI, but
it will read zero forever while users actually ask the AI things on `/talk`.

Why this one matters more than a normal missing event: `docs/analytics/STRATEGY.md`
calls AI usage *"the secondary activation signal — the differentiated value moment
and the on-ramp to monetization."* This is the exact funnel the 10-customer
marketing plan (`MARKETING.md`) measures activation with. A flatlined signal here
doesn't just lose data — it makes the activation dashboard lie right when you start
watching it.

## Root cause

Slice 2 merged Add + Ask into the Talk surface and deleted `AskAIModal.tsx`, which
held the **only** `analytics.capture('ai_question_asked')` call. The replacement
surface, `AssistantPage` (now `/talk`), contains zero analytics calls — grep for
`analytics`, `capture`, or `posthog` in that file returns nothing. The backend
assistant route doesn't emit a product event either (its audit log is not the same
thing as a captured analytics event with user/session properties).

## Fix

Capture the event when a user sends a message from the Talk composer. The send
path is `sendMessage` in `AssistantPage.tsx:708`. Enrich the event while you're
there — the current schema type is bare `void`, which is a good moment to give it
useful properties consistent with the sibling `ai_parse_requested` event.

### 1. Widen the event type — `src/lib/analytics/types.ts`

```ts
// before
ai_question_asked: void

// after
ai_question_asked: {
  surface: 'talk'
  has_attachment: boolean
  model: string
}
```

### 2. Emit on send — `src/pages/AssistantPage.tsx`, inside `sendMessage`

Add the import (top of file, next to other imports):

```ts
import { analytics } from '@/lib/analytics' // match the existing analytics import path used elsewhere in src
```

Then capture after the guard clause, before the network call, so a fired event
reflects intent-to-ask even if the request later errors:

```ts
const sendMessage = async (content: string, messageAttachment = attachment) => {
  const trimmed = content.trim()
  if ((!trimmed && !messageAttachment) || isSending) return

  analytics.capture('ai_question_asked', {
    surface: 'talk',
    has_attachment: !!messageAttachment,
    model,
  })
  // ...rest unchanged
}
```

`model` is already in scope in the component (the model selector state).

### 3. Update the doc

`docs/analytics/STRATEGY.md` line ~78 lists `ai_question_asked` with an empty
properties column — fill it in to match the new shape so the tracking plan stays
accurate.

## Note on scope

The Talk surface also runs *writes* (add-type and confirm-class actions via the
capability layer). Those aren't "questions" — if you want engagement coverage of
the write path too, that's a separate event (e.g. `ai_action_confirmed`), out of
scope for restoring this specific KPI. Don't overload `ai_question_asked` with
writes; keep it meaning "user asked the AI something."

## Verification

- With PostHog debug on (or the network tab filtered to the capture endpoint),
  send a message on `/talk` → one `ai_question_asked` event fires with
  `surface: 'talk'`.
- `grep -rn "ai_question_asked" src/` now returns the type def **and** the call
  site (previously only the type def).

## Effort

~15 minutes. One import, one capture call, one type widen, one doc line.
