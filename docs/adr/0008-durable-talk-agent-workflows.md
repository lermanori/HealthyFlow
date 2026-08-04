# ADR 0008 — Durable Talk workflows with a bounded OpenAI Agents SDK runtime

**Status**: Accepted
**Date**: 2026-08-03
**Amends**: ADR-0003

---

## Context

ADR-0003 established Zod-backed HealthyFlow capabilities as the LLM contract,
with internal function tools and an external MCP adapter. Phase 4 registered the
Calendar/Daily Plan and Work capabilities needed to plan a Focus block, but did
not let a model choose or invoke those tools in production.

Phase 5 must prove one narrow workflow in the existing Talk page: read an
anchored day, clarify what the requested capacity means, inspect the relevant
Project and Tasks, draft one valid Focus block, preview it, and apply it only
after explicit confirmation. The workflow must resume after Talk is reopened
and must remain safe if records change or confirmation is retried.

The research report considered remote MCP, hosted OpenAI Skills/tool search,
multi-agent orchestration, and persisting SDK run state. Those mechanisms solve
broader discovery or orchestration problems than this tracer needs.

## Decision

Use one server-side OpenAI Agents SDK agent over the Responses API for the
focused-work tracer. Keep workflow state, confirmation, idempotency, and writes
in the HealthyFlow application.

### Runtime boundary

- `talk-agent-runtime.ts` is the OpenAI adapter. It creates one `Agent`, maps a
  selected subset of the real Zod capability registry through SDK `tool()`, and
  runs the loop with `Runner`.
- The model receives exactly six read/proposal capabilities for this workflow:
  `get_daily_plan`, `compute_daily_availability`, `validate_daily_plan`,
  `list_work_projects`, `get_work_scope`, and `review_task_alignment`.
- No write capability is present in the model's tool list.
- The model returns one strict structured decision: ask one question, provide a
  draft proposal, or explain why it is blocked.
- The model never performs date arithmetic. The server supplies an ISO anchor
  date, IANA timezone, and current local `HH:mm` time, and deterministic Daily
  Plan code validates placement.
- Google Calendar is optional. When it is disconnected or unavailable, the
  capacity summary remains partial and retains an explicit Calendar reason,
  but placement can still be valid against known HealthyFlow Items and Focus
  blocks. Missing or invalid HealthyFlow scheduling data remains blocking.

### Dynamic instruction loading

“Dynamic skills” in this tracer means application-owned, versioned instruction
packs selected by workflow stage. It does not mean hosted OpenAI Skills,
tool-search, shell execution, or arbitrary prompt files.

The base, focused-work, confirmation-safety, one-question, and resume packs are
static TypeScript values. Their `name@version` identifiers are persisted with
the workflow and attached to traces. The stage selects only the relevant packs;
the capability allowlist is selected independently and remains explicit.

This shape is intentionally small enough to test. Hosted skill discovery can be
reconsidered only when several reliable workflows share a large enough catalog
to justify it.

### Durable application workflow

Human-visible Talk messages remain in `assistant_conversations` and
`assistant_messages`. Machine workflow state lives separately in
`talk_workflows`, including:

- workflow name and stage;
- anchor date and timezone;
- interpretation of focused minutes versus elapsed window;
- selected Project and Task ids;
- pending proposal and pending action id;
- source fingerprint and confirmation state;
- model, runtime version, instruction-pack versions, revision, and last error.

Each model turn uses two short database operations around the API call:

1. compare-and-swap the workflow revision to claim the turn;
2. run the model and tools without a database transaction;
3. compare-and-swap the result into the next checkpoint.

No database transaction or lock is held across an OpenAI request.

### Proposal and confirmation safety

The model only drafts. The application verifies that:

- the date equals the workflow anchor;
- the Project is still available;
- every selected Task still belongs to the Project, is open, and has an aligned
  target relation;
- planned minutes, break minutes, and transition minutes fit deterministic
  Daily Plan capacity without a conflict.

The application fingerprints the bounded authoritative Daily Plan and Work
scope used for the preview. Confirmation re-reads and revalidates those records.
Any change makes the proposal stale and requires a fresh proposal.

Confirmation atomically claims the pending action. The proposal id is also the
unique `focus_blocks.request_id`, so a retry after a process crash resolves to
the same Focus block. The pending action stores the final result, allowing a
completed repeated confirmation to return the same result without another
write. Audit and idempotency records also tolerate recovery after the domain
write.

### Model, cost, and traces

The tracer uses the model already selected in Talk and keeps `gpt-4o-mini` as
the default. This avoids silently introducing an unpriced model into the credit
ledger. A controlled live evaluation also exercises `gpt-5-mini`; changing the
product default requires separate latency, quality, and pricing evidence.
GPT-5-family runs use low reasoning effort and a bounded structured-output
budget; the live eval showed that a smaller budget could truncate otherwise
valid proposal JSON after a multi-tool turn.

The existing credit reserve/settle ledger wraps the full agent loop. SDK traces
use the workflow name, conversation group id, stage, and runtime version, with
sensitive trace payloads disabled. Deterministic fake-runtime tests remain the
CI gate; explicitly enabled live tests exercise the actual Agents SDK and
OpenAI API over synthetic registry fixtures.

A signed-in Work → Talk run on 2026-08-04 provided the current local time in
the runtime anchor. `gpt-4o-mini` selected the next rounded start time, called
`list_work_projects`, `get_work_scope`, and `validate_daily_plan`, and returned
a valid structured proposal in three tool calls. The proposal remained
unconfirmed; deterministic tests cover confirmation, stale-data rejection,
decline, and exactly-once write recovery without using hosted user data.

## Consequences

Positive:

- The existing Talk surface gains a resumable, inspectable tracer without a
  second assistant UI.
- The model sees a small capability set and cannot write.
- Confirmation is safe under stale data, duplicate requests, and recoverable
  worker crashes.
- Prompt/instruction changes and runtime changes are attributable in persisted
  state and traces.

Negative (accepted):

- Phase 5 handles only `plan_focused_work`; all other Talk uses remain on the
  legacy assistant loop until Phase 6 deliberately migrates them.
- A user must start this workflow through Work's “Plan in Talk” handoff. Free
  text intent classification across every Talk request is not part of this
  tracer.
- Attachments are rejected inside this workflow until their bounded context and
  safety semantics are designed.
- An abandoned confirmation claim waits two minutes before safe recovery.

## Rejected for Phase 5

- A multi-agent supervisor or handoffs.
- Remote MCP for the internal Talk call path.
- Hosted OpenAI Skills, tool search, or shell-based skill loading.
- Persisting opaque SDK `RunState` as the product workflow state.
- A second direct-Responses production runtime beside the Agents SDK.
- Holding a database transaction open across a model call.
- Letting a model calculate dates, approve its own proposal, or write directly.
