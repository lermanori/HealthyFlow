# ADR 0003 — LLM data access interface: shared capability layer, internal tools, external MCP

**Status**: Accepted  
**Date**: 2026-07-01  
**Issue**: #99  
**Unblocks**: #100

---

## Context

HealthyFlow needs an AI control plane that lets an LLM read and mutate the
user's data: tasks, habits, calorie entries, weight entries, achievements, and
workout sessions. There are two caller shapes:

- **Internal assistant**: HealthyFlow's own UI and CLI, server-keyed OpenAI API,
  authenticated as the logged-in user.
- **External LLMs**: clients outside HealthyFlow, ideally platform-agnostic, that
  can connect to HealthyFlow data and actions.

The existing AI harness rules still apply:

- OpenAI remains **server-keyed only**. No BYOK.
- AI failures must surface explicitly. No silent fallback responses.
- Structured AI outputs use Zod schemas as the source of truth.

Current official docs make three constraints relevant to this decision:

- MCP is an open protocol for sharing resources and exposing tools to LLM
  applications, using resources for context and tools for model-invoked actions
  ([MCP specification](https://modelcontextprotocol.io/specification/2025-03-26)).
- MCP tools are model-controlled and should include human approval for sensitive
  operations; servers must validate inputs, enforce access controls, rate limit,
  sanitize outputs, and clients should log tool use
  ([MCP tools](https://modelcontextprotocol.io/specification/2025-03-26/server/tools)).
- Protected MCP servers are OAuth resource servers; they must use audience-bound
  access tokens and must not accept token passthrough
  ([MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization),
  [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)).
- OpenAI function calling exposes JSON-schema tools to models and lets the
  application execute those tools itself
  ([OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)).
- OpenAI's Responses API can call remote MCP servers directly, but remote MCP
  servers should be trusted, filtered with `allowed_tools`, and approval should
  be required for sensitive actions
  ([OpenAI MCP and connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)).

## Options

### Option A — MCP server as the only interface

Build a HealthyFlow MCP server and have both the internal assistant and external
LLMs call it.

**Pros**

- One protocol surface for internal and external callers.
- Strong portability across MCP-capable clients.
- Resources and tools map well to "read context" and "mutate data".

**Cons**

- Internal UI/CLI would route through a protocol server even though it already
  runs inside the trusted HealthyFlow backend.
- Remote MCP auth is non-trivial: OAuth discovery, token audience validation,
  scoped authorization, approval UX, and audit logging are launch-relevant.
- OpenAI-hosted MCP calls send data to a third-party MCP server endpoint; that
  is unnecessary for the internal assistant.

### Option B — Function-calling over existing REST routes

Give the internal assistant JSON-schema tools that call existing REST endpoints.
External LLMs would integrate by calling the public REST API directly or through
their own tool schemas.

**Pros**

- Lowest effort for the internal assistant.
- Reuses existing route validation and auth.
- Easy to keep OpenAI server-keyed.

**Cons**

- REST routes are shaped for UI workflows, not LLM capabilities. The model sees
  too many incidental details and not enough domain intent.
- External integrations are not platform-agnostic; every client must hand-roll
  schemas and auth behavior.
- Harder to enforce consistent write confirmation and audit semantics across
  internal and external callers.

### Option C — Thin dedicated tool gateway

Create a server-side capability layer with stable, Zod-backed tools. The
internal assistant calls that layer through OpenAI function tools. A remote MCP
server is an adapter over the same capability layer for external LLM clients.

**Pros**

- Internal assistant stays simple: OpenAI function calling returns tool calls,
  HealthyFlow executes tools inside its own backend under the logged-in user.
- External LLMs get a standard MCP interface without duplicating business logic.
- All write rules, auth checks, Zod schemas, logging, and rate limits live in
  one place.
- The MCP server can start with a narrow tool/resource set and grow without
  rewiring the internal assistant.

**Cons**

- More structure than calling REST directly.
- Requires an MCP adapter and eventually OAuth/PAT issuance before external
  write access is production-ready.

## Decision

Choose **Option C — a shared capability layer with two adapters**.

Internal assistant transport:

- Use **OpenAI function calling** from the HealthyFlow backend.
- The model receives a curated set of function tools generated from the
  capability layer's Zod schemas.
- The backend executes tool calls directly against service modules such as
  tasks, calories, achievements, workouts, and settings.
- No client-side OpenAI key is introduced.

External LLM interface:

- Expose a **remote MCP server** as the platform-agnostic interface.
- MCP tools wrap the same capability functions used by the internal assistant.
- MCP resources expose read-only context snapshots such as:
  - `healthyflow://today/{date}`
  - `healthyflow://tasks/{date}`
  - `healthyflow://calories/{date}`
  - `healthyflow://achievements`
  - `healthyflow://workouts/{date}`
- MCP tools expose mutations only through the same write-safe capability layer.

The REST API remains the UI contract. It is not the LLM contract.

## Capability Layer Shape

Create one deep server module for LLM capabilities, e.g.
`backend/src/ai-capabilities.ts`, rather than one file per tool.

Initial read capabilities:

- `get_today(date)`
- `list_tasks(date, filters)`
- `list_calorie_entries(date)`
- `list_weight_summary()`
- `list_achievements()`
- `list_workout_sessions(date)`

Initial write capabilities:

- `add_task(input)`
- `add_habit(input)`
- `update_item(input)`
- `complete_task(id)`
- `delete_item(id)`
- `add_calorie_entry(input)`
- `add_weight_entry(input)`
- `add_achievement_entry(input)`
- `add_workout_session(input)`

Out of scope for the first control-plane slice:

- Bulk destructive operations.
- Cross-user/admin operations.
- Direct SQL or generic "patch any table" tools.
- Arbitrary URL fetching.
- Passing external OAuth tokens through to Supabase or OpenAI.

## Auth and Permission Model

### Internal assistant

- Runs under the normal HealthyFlow JWT/session.
- The server derives `userId` from authenticated request context, never from
  model-supplied arguments.
- OpenAI API calls use the server OpenAI key only.
- Internal tools never accept `userId` as an input schema field.

### External MCP

External MCP access must not launch as "open JWT passthrough."

Accepted production model:

- HealthyFlow issues **per-user, revocable access tokens** for LLM clients.
- Tokens are audience-bound to the HealthyFlow MCP server.
- Tokens carry explicit scopes:
  - `hf:read`
  - `hf:write:add`
  - `hf:write:update`
  - `hf:write:complete`
  - `hf:write:delete`
- The MCP server maps the token to a HealthyFlow user and injects `userId`
  server-side.
- The MCP server rejects tokens not issued for the MCP server audience.
- Later, replace/augment personal access tokens with OAuth 2.1 if the product
  needs third-party client registration and consent screens.

Development-only model:

- A local PAT can be used against a local/preview MCP server.
- Production external MCP writes remain disabled until scoped token issuance,
  audit logging, and user-facing revocation exist.

## Write Safety Rules

All mutating capabilities must follow these rules:

1. **Validate twice**: schema-validate tool input, then call the existing domain
   service/route-level validation. Zod remains the source of truth.
2. **Server-owned identity**: `userId`, role, and scopes come from auth context,
   never from tool arguments.
3. **Narrow tools**: expose domain verbs, not generic database writes.
4. **Preview before risky writes**:
   - Internal assistant may auto-run low-risk add operations after the user asks
     for them plainly.
   - Update/delete/bulk operations return a preview and require explicit user
     confirmation in the UI/CLI.
   - External MCP tools should advertise destructive tools separately and require
     client-side approval where supported.
5. **Idempotency**: mutating tools accept an optional `requestId` so retries do
   not duplicate entries.
6. **Audit log**: every LLM write stores user id, caller type (`internal` or
   `mcp`), tool name, arguments summary, target ids, result, timestamp, and
   model/request id when available.
7. **Rate limit**: apply per-user and per-token limits, stricter for external
   MCP writes.
8. **No silent fallback**: tool execution errors are returned to the assistant
   and surfaced to the user.
9. **No hidden broad context**: resources return bounded snapshots, not entire
   account dumps by default.
10. **Output hygiene**: resource/tool output should be summarized and sanitized
    before re-entering model context.

## Consequences

Positive:

- #100 can start by building one capability layer and the internal assistant
  first, without waiting for full OAuth/MCP production hardening.
- External LLM support has a standards-based path that works beyond OpenAI.
- The same Zod schemas and domain services govern UI, internal assistant, and
  external LLM behavior.

Neutral:

- There will be three layers: REST routes for UI, capability functions for LLM
  verbs, and adapters for OpenAI function tools / MCP. This is intentional; the
  capability layer is the shared contract.

Negative (accepted):

- External write access requires token issuance, revocation UI, audit logging,
  and approval semantics before it can be considered production-ready.
- MCP resource/tool design must remain conservative because exposed tool
  descriptions and outputs become part of model context.

## Amendment — 2026-07-02

The internal assistant requires confirmation for all write capabilities,
including low-risk add/log/create operations. This is a deliberate stricter
choice than the §4 allowance that adds may auto-run: a uniform preview,
confirm, then execute flow is simpler to reason about, test, and audit.

`lookup_food_nutrition` is an explicit exception to the "no arbitrary URL
fetching" out-of-scope rule. It may call the single allowlisted Open Food Facts
search endpoint from the backend with a bounded timeout; failures must degrade
inside the nutrition lookup result rather than block an assistant turn.

## Implementation Checklist for #100

- Add `backend/src/ai-capabilities.ts` with Zod schemas and typed results.
- Implement internal OpenAI function-tool adapter over that module.
- Add UI chat and CLI entry point that share the same adapter.
- Add audit table/migration for LLM tool calls.
- Add idempotency storage for mutating capability calls.
- Implement read-only MCP server first.
- Add scoped PAT issuance/revocation before enabling MCP writes.
- Enable MCP writes one scope at a time, with approval guidance in tool
  descriptions and audit logs.
- Add tests that verify:
  - a model/tool caller cannot pass or override `userId`;
  - write scopes are enforced;
  - failed tools surface errors;
  - duplicate `requestId` does not duplicate writes;
  - internal and MCP adapters call the same capability functions.
