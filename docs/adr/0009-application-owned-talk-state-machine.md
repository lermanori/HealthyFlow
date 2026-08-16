# ADR 0009 — Application-owned Talk state machine with stage-scoped agent activities

**Status**: Accepted
**Date**: 2026-08-04
**Amends**: ADR-0008 (for Phase 6)

---

## Context

ADR-0008 established durable Talk workflows with a bounded OpenAI Agents SDK
runtime, and Phase 5 proved one workflow: `plan_focused_work`. That tracer used
one agent, one combined structured decision schema, one merged instruction pack
set, and one six-tool allowlist for every stage of the workflow.

Phase 6 must support a closed set of eight Talk workflows on the same visible
Talk surface. Extending the Phase 5 shape means one prompt carrying every
workflow's instructions and every workflow's tools. The Phase 6 tracer showed
that this shape already fails at two workflows' worth of contracts.

### The verified regression trace

A signed-in Work → Talk `plan_work` run against a Project with no open Tasks
produced this tool sequence:

1. `list_work_projects`
2. `get_work_scope`
3. `validate_daily_plan`
4. `validate_daily_plan`
5. `validate_daily_plan`
6. `validate_daily_plan`
7. `validate_daily_plan`
8. `validate_daily_plan`

**All eight tool calls succeeded. The model never returned a structured
decision.** The run ended by exhausting `TALK_AGENT_MAX_TURNS`.

The failure was **not** caused by invalid time-zone data and **not** by an
`indeterminate` Daily Plan result. It was caused by the runtime asking one agent
to choose between two materially different contracts in one turn budget:

- propose a new Task when the Project has no open Tasks; or
- plan and validate a Focus block from existing Tasks.

Stronger legacy instructions simultaneously required the agent to plan exactly
one Focus block and not substitute an ordinary Task. With both Work and Daily
Plan tools exposed, the model became the effective workflow router and retried
`validate_daily_plan` against a branch it could not satisfy. `maxTurns` only
bounded how long that ambiguous route ran.

The Phase 5 deterministic tests proved the application can process an injected
`task_proposal`. They did not prove the real model selects that branch from the
combined prompt. This distinction is why the trace above is retained as the
baseline regression case for Phase 6.

## Decision

Talk uses a lightweight, **application-owned hierarchical state machine**.

- The outer state is the active **Talk workflow**, from a closed registry.
- The inner state is that workflow's current **Talk stage**.
- Application code loads authoritative records and selects legal transitions
  through a **pure transition function**.
- A stage may invoke **one narrowly scoped agent activity**, which receives only
  the context, instructions, tools, and structured output contract that stage
  needs.
- Agent output becomes a **typed event** the application may accept or reject.
  It does not select an arbitrary next stage.
- A pending write pauses the workflow in an explicit confirmation stage.
  Confirmation produces a typed application event and resumes the workflow
  server-side — the frontend never fabricates a hidden continuation message.
- **Terminal workflow status is separate from the current domain stage.** A
  workflow is `active`, `completed`, `declined`, or `failed`; that is not a stage
  value.

An agent run is therefore an activity inside one stage. It is not the workflow
engine.

### Workflow, stage, and capability are separate concepts

| Concept | Example | Responsibility |
|---|---|---|
| Workflow | `plan_work` | Owns the durable user goal and the legal sequence of stages |
| Stage | `draft_task` | Performs one bounded reasoning or application step |
| Capability | `add_work_task` | Executes one validated, confirmed, idempotent product write |

`add_work_task` is a reusable confirmed capability, **not** a Talk workflow. It
is invoked after `plan_work` reaches Task confirmation, and may later be reused
by another workflow without inheriting that workflow's prompt, stages, or
transition rules.

### Ownership boundary

The application owns workflow selection, durable state, legal transitions,
confirmation, validation, idempotency, and all writes. `talk-workflow.ts` remains
the deep orchestration module; `talk-agent-runtime.ts` remains the OpenAI adapter
and must not decide which workflow or stage runs next.

### Stage budgets

There is no global turn budget for an entire product workflow. Each agent
activity carries a budget appropriate to its own contract, chosen from live
evaluation of that stage. Raising the old global `maxTurns` is explicitly not an
acceptable response to a stage failure — the eight-call trace above is what a
raised global budget buys.

## Relationship to ADR-0008

ADR-0008 remains accepted and is not reversed. Every safety mechanism it
established is retained: `talk_workflows` durable rows, revision compare-and-swap
claims, no database transaction held across a model call, application-owned
proposal validation, source fingerprints, exactly-once pending-action
confirmation, no write capability in the model's tool list, and no model-performed
date arithmetic.

ADR-0009 amends ADR-0008 in three places, all scoped to Phase 6:

1. **Workflow name** is a closed enum rather than the single literal
   `plan_focused_work`. The Phase 5 workflow becomes version 1 of `plan_work`.
2. **Stage** becomes workflow-specific and domain-named, validated by the
   application contract, rather than one generic enum shared by all workflows.
   Terminal status moves out of the stage enum.
3. **Instruction packs, tool allowlist, output schema, and turn budget** are
   selected per stage rather than per workflow. ADR-0008's "dynamic instruction
   loading" already selected packs by stage; ADR-0009 extends that selection to
   the tool surface and the output contract, which ADR-0008 left global.

ADR-0008's "rejected for Phase 5" list stands unchanged for Phase 6.

## Rejected alternatives

- **XState, LangGraph, or Temporal.** These validate the separation between
  deterministic orchestration and nondeterministic activities, but the closed
  eight-workflow set does not need a general engine. Adding one would import a
  runtime, a persistence model, and a debugging surface without removing any
  current product complexity.
- **A general graph engine or dynamically authored workflows.** The workflow set
  is closed and reviewed. Authoring topology at runtime would move legal
  transitions out of code review and tests.
- **A manager agent that routes between workflows.** This reinstates exactly the
  failure in the trace above — a model choosing product transitions. A manager
  agent may later be reconsidered for bounded cross-module *synthesis*, but must
  never own durable workflow transitions.
- **SDK handoffs between stages of one workflow.** Handoffs are justified when
  stages materially differ in model or approval policy across agent boundaries;
  using them to move between stages of one workflow would put transition control
  back in the model.
- **Raising `maxTurns` or rewriting the combined prompt.** Both treat the symptom.
  The contract ambiguity, not the budget, produced the six repeated
  `validate_daily_plan` calls.
- **Static DAG execution as the outer model.** Reasonable later *inside* a stage
  with genuinely parallel independent activities; it is not the outer Talk
  workflow model and is not needed for `plan_work`.
- **Persisting opaque Agents SDK `RunState` as product workflow state.** Carried
  forward from ADR-0008 and still rejected.
- **A separate Talk workflow for creating a Task.** Task creation is a
  capability. Modelling it as a workflow would duplicate confirmation machinery
  and split `plan_work`'s durable goal across two rows.

## Consequences

Positive:

- Each model run has one job, one output family, and a minimal tool surface, so a
  failure names its stage and its actual tool sequence.
- Adding a workflow extends the registry and its tests without touching the
  generic runtime loop, pending-action machinery, routes, or Talk UI protocol.
- `plan_work` can be simulated end to end without a model, browser, or database.
- Active workflow resumption takes precedence over re-classifying chat text.

Negative (accepted):

- More declared surface: every workflow must enumerate stages, events, and
  transitions rather than delegating ambiguity to a prompt.
- The `talk_workflows` schema needs a generic state envelope and a backfill of
  `plan_focused_work` → `plan_work` v1, with a compatibility alias during
  rollout.
- Migration is incremental. Until a workflow is migrated, it stays on the legacy
  path, so two shapes coexist for part of Phase 6.

## Implementation plan

See
`docs/superpowers/plans/2026-08-04-phase-6-talk-workflow-separation-and-extensibility-plan.md`
for the seven delivery slices, the `plan_work` reference state machine, the
persistence migration boundary, and the verification matrix.
