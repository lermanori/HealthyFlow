# Work → Today → Talk: six-phase delivery plan

**Date:** 2026-08-03  
**Status:** Active delivery roadmap  
**Current phase:** Phase 4 — define the module capability registry

## Purpose

This document records the agreed order for building HealthyFlow's Work and Talk experience so implementation does not jump ahead to AI before the underlying product actions are reliable.

The sequence is:

> **Make Work correct manually → make Work executable from Today → make Today represent every module → define every module capability → prove the AI runtime → ship the complete guided Talk experience.**

The GitHub Project remains the source of truth for issue status. This document is the source of truth for phase boundaries, ordering, and exit criteria.

## Principles that apply to every phase

- Talk coordinates; modules remain the source of truth for their records.
- Today is the shared Daily Plan and execution surface. It references module records instead of copying them.
- Planning and recording reality are different operations.
- A Focus block is not a Task and must never be represented by creating an ordinary Task.
- A planned meal is not a Calorie entry.
- A planned Workout is not a Workout session.
- Time spent working does not automatically complete a Task or prove Project progress.
- User-visible writes are previewed and explicitly confirmed.
- Deterministic code owns time arithmetic, state transitions, validation, permissions, and writes.
- The model owns conversation, explanation, decomposition, prioritization proposals, and summaries.
- Zod schemas are the single source of truth for records, capabilities, and structured model output.
- A phase is complete only when its exit scenario works without depending on an unfinished later phase.

## Phase overview

| Phase | Outcome | Dependency | Status |
|---|---|---|---|
| 1 | Work functions completely by hand | Existing Tasks and Projects | Complete |
| 2 | Work Focus blocks are executable from Today | Phase 1 | Complete |
| 3 | Every enabled module has an honest Today representation | Phase 2 | Complete |
| 4 | Every module exposes a bounded capability contract | Phase 3 | In progress — implementation complete, verification pending |
| 5 | The server-keyed AI runtime is researched and proven with evaluations | Phase 4 | Not started |
| 6 | Existing Talk orchestrates the full day and John golden scenario | Phase 5 | Not started |

---

## Phase 1 — Complete Work manually

### Outcome

Work is a durable module similar to Nutrition: it owns Project, Task relationship, Focus block, Work session, Work review, and Project-context records. A user can create, correct, execute, and review these records without Talk or AI.

### Required records

- **Project:** target, definition of done, current milestone, status, deadline, and bounded context.
- **Project context:** summary, blockers, constraints, non-goals, decisions, links, and next valuable step.
- **Task relationship:** Project reference and overridable relationship to the Project target.
- **Focus block:** stable identity, Project or standalone context, referenced Tasks, scheduled start, planned focused minutes, intended evidence, and lifecycle.
- **Work review:** structured answers about outcome, evidence, target impact, blockers, drift, unnecessary work, actual minutes, and next step.
- **Work session:** the durable account of what happened, created from a completed review or entered explicitly as historical work.

### Required manual flow

1. Create and edit a Project and its context.
2. Add, edit, complete, reopen, defer, reactivate, and delete its Tasks.
3. Record and change each Task's relationship to the target.
4. Create and schedule a Project or standalone Focus block manually.
5. Start the block and preserve its active state across navigation or reload.
6. Finish, continue, block, drift, or cancel the block.
7. Complete a structured Work review.
8. Create exactly one Work session from the review.
9. Explicitly choose any resulting Task or Project-context updates.

### Boundaries

- Talk links may prefill an editable prompt, but the manual flow cannot require Talk.
- No Today representation is required yet.
- No Calendar availability, AI planning, or multi-module orchestration is required yet.
- Starting or reviewing work never silently completes a Task.

### Exit scenario

John can create InvoiceFlow, classify an authentication Task as Unblocking, schedule and start a 45-minute Focus block, report drift after 30 minutes, review what changed, record a new blocker and next valuable step, leave the Task open, and see the complete durable result after reload—all without Talk.

---

## Phase 2 — Put Work on Today

### Outcome

Today can display and execute Work Focus blocks as first-class Daily Plan entries. A Focus block remains visibly different from an ordinary Task.

### Required behavior

- Show planned Focus blocks at their scheduled time with Project or standalone context, intended evidence, and focused duration.
- Show active, reviewing, completed, and canceled states honestly.
- Expose **Start**, recovery, and review entry points from Today.
- Keep the current target visible while a block is active.
- Preserve one shared Focus-block record between Work and Today; do not synchronize copies.
- Continue showing ordinary Tasks through the existing Item model.
- Ensure scheduling, dragging, completion, Rollover, and Focus-block behavior do not accidentally mutate one another.

### Boundaries

- Talk may open from a Focus block, but Today must still support the manual Phase 1 actions.
- Calendar-aware AI planning is not required yet.
- Other modules do not need new Today representations in this phase.

### Exit scenario

A Focus block created in Work appears at the correct time on Today, starts from Today, survives reload, enters review, creates a Work session, and shows the same final state back in Work. No ordinary Task is created as a substitute.

---

## Phase 3 — Make Today the shared Daily Plan

### Outcome

Every enabled module has an explicit, honest way to participate in Today. Today answers: **What should I do now, and what comes next?**

### Module representation contract

| Module | Today may show | Actual outcome remains owned by |
|---|---|---|
| Calendar | Fixed event and protected transition | External Calendar; no duplicate record |
| Work | Focus block and referenced Tasks | Work review, Work session, Task, Project context |
| Tasks | Scheduled or Anytime Task | Task completion/rescheduling/Rollover |
| Habits | Habit instance | Habit outcome/progress |
| Nutrition | Planned meal timing or logging reminder | Confirmed Calorie entries |
| Workouts | Planned Workout time and selected plan | Saved Workout session |
| Progress | Relevant target or measurement reminder | Saved Achievement/measurement result |

### Required behavior

- Define a typed Daily Plan reference for each module without duplicating its source record.
- Give each representation the correct actions and deep link back to its source module.
- Keep planned versus actual states visually and behaviorally distinct.
- Compose Calendar commitments, transitions, Focus blocks, Tasks, Habits, meals, Workouts, and Progress without pretending all entries share one lifecycle.
- Handle hidden/disabled modules without deleting or misreporting their data.
- Preserve Today's responsive, drag, accessibility, and failure-recovery behavior.

### Exit scenario

John can inspect one day and correctly distinguish his meeting, Focus block, ordinary Task, lunch plan, open walking Habit, planned Workout, and weight target. Completing or logging one entry updates only the owning module's record.

---

## Phase 4 — Define the module capability registry

> **Implementation state (2026-08-03):** The existing `backend/src/ai-capabilities.ts` deep module now materializes a typed inventory across all seven module families from one definition interface, deriving names and risk while applying idempotency and audit policy uniformly. Daily Plan owns deterministic placement validation behind its module interface; internal and MCP adapters share the materialized definitions and model-independent contract/authorization coverage. Newly registered Phase 4 capabilities remain excluded from the production model-tool surface until Phase 5 deliberately activates and evaluates runtime selection.

### Outcome

HealthyFlow has a complete, bounded inventory of what Talk is allowed to read, propose, write, and record for every module. This is the deterministic control plane the model will use later.

### Required work

1. Inventory the user actions already supported by every module.
2. Separate capabilities into:
   - **read** — retrieve bounded context;
   - **proposal** — compute or validate a possible change without writing;
   - **write** — apply an explicitly confirmed change;
   - **outcome** — record what actually happened.
3. Define Zod input/output schemas and typed results for every capability.
4. Reuse domain services; do not expose generic database mutation tools.
5. Specify authentication, ownership, confirmation, idempotency, audit, and error semantics.
6. Build the shared server-side capability registry described by ADR-0003.
7. Add contract and authorization tests independent of any model.

### Initial capability families

- **Calendar/Daily Plan:** read commitments, compute availability, validate a plan, preview changes, apply confirmed placement.
- **Work:** list Projects, read context, review Task alignment, create/start/finish Focus blocks, record reviews, update Tasks and Project context.
- **Nutrition:** read targets/history, plan meal timing, prepare and confirm Calorie entries.
- **Workouts:** read plans/history, schedule a planned Workout, record a Workout session.
- **Habits:** read relevant instances and record explicit outcomes or progress.
- **Progress:** read definitions/targets and record measurements.
- **Tasks:** create, edit, schedule, complete, defer, delete, and explain Rollover state.

### Boundaries

- No model chooses or invokes tools in production yet.
- The REST API remains the UI contract; capabilities are the LLM contract.
- No capability accepts a model-supplied `userId`.

### Exit scenario

Deterministic tests can reproduce every read and confirmed write needed by John without sending a prompt to a model. Unsupported actions are explicit rather than silently ignored.

---

## Phase 5 — Prove the AI runtime through the OpenAI API

### Outcome

Research and prototype how the server-keyed model receives bounded context, discovers the allowed actions, selects tools, maintains workflow state, requests confirmation, and recovers from errors. The result is an evidence-backed runtime design, not prompt guesswork.

### Questions to answer

- How should the current OpenAI API expose the Phase 4 Zod capabilities as function tools?
- Which tools and context should be supplied for each workflow instead of exposing the entire registry every turn?
- How are active workflow and stage persisted separately from chat messages?
- How does the runtime distinguish a proposal from a confirmed write?
- How are stale proposals revalidated before execution?
- How are tool errors, retries, idempotency, and partial failures surfaced?
- How does the model ask one useful question at a time while retaining a small queue of later topics?
- What traces and evaluation fixtures are required to diagnose wrong tool choice, bad sequencing, or unnecessary questions?
- What model/latency/cost combination is acceptable for planning, active Focus coaching, and lightweight check-ins?

### Required prototype and evaluations

- Use the existing Talk page; do not create a separate AI surface.
- Implement a narrow local/preview tracer bullet over the real capability registry.
- Persist workflow name, stage, anchor date, selected records, pending proposal, and confirmation state.
- Evaluate tool selection, question relevance, confirmation safety, schedule arithmetic boundaries, recovery from tool failure, and conversation resume.
- Use John plus edge cases such as no Calendar, no Project, insufficient time, conflicting commitments, stale Tasks, and declined writes.
- Record the chosen runtime architecture in an ADR or amend ADR-0003.

### Boundaries

- Do not expand to every module before the tracer bullet is reliable.
- Do not let the model perform date arithmetic or write directly to the database.
- Do not ship proactive personalization from unstructured chat history.

### Exit scenario

In a controlled environment, the model correctly reads a day, asks the capacity clarification, requests the relevant Work context, proposes a valid Focus block, previews the write, applies it only after confirmation, and resumes the persisted workflow after Talk is reopened.

---

## Phase 6 — Ship guided Talk orchestration

### Outcome

The existing Talk surface becomes HealthyFlow's guided coordinator across Calendar, Work, Nutrition, Workouts, Habits, Progress, and Tasks. It follows prototype A: one decision at a time with the day and current target kept visible.

### Required workflows

- `plan_day`
- `plan_work`
- `run_focus_block`
- `review_focus_block`
- `replan_day`
- `log_outcome`
- `review_project`
- `quick_chat`

### Required behavior

- Start from the user's explicit request and known day context.
- Ask only questions whose answers can change the plan.
- Clarify focused time versus total elapsed time.
- Respect Calendar commitments, transitions, and the requested Focus budget.
- Review whether candidate Tasks serve the active target and explain the judgment.
- Propose observable evidence for every Focus block.
- Preview and confirm every write.
- Guide Focus check-ins and support done, continuing, blocked, and drifted outcomes.
- Recover from drift without changing the target unless the user chooses to.
- Replan the remaining day after new commitments or outcomes.
- Plan meals and Workouts without logging them as completed outcomes.
- Produce an optional day summary that separates progress, maintenance, health, and consciously deferred work.
- Turn repeated structured evidence into preference suggestions; never silently change durable preferences.

### Final acceptance: John golden scenario

The complete John scenario in the design target passes end to end, including:

- two requested hours of focused work;
- a 45-minute safe block before an 11:00 meeting and a 15-minute transition;
- Project and Task-alignment choice;
- evidence-based Focus review;
- a newly discovered blocker;
- replanning after a client commitment;
- drift into unrelated research and a 15-minute recovery step;
- explicit Task and Project-context updates;
- lunch planning followed by separately confirmed Calorie logging;
- Workout planning followed by a separately recorded Workout session;
- a truthful cross-module day summary.

Phase 6 is complete only when scenario evaluations, deterministic invariants, API/tool traces, and the real UI flow all agree on the result.

## Maintaining this roadmap

- Do not begin a later phase to avoid finishing an earlier phase's data model or manual flow.
- When a phase exits, update its status here and link the completed GitHub issues or PRs.
- If a phase boundary changes, update this document and the design target in the same change.
- New features belong in the earliest phase whose exit criterion genuinely requires them.
- Marketing language is intentionally out of scope until the product loop is proven.

## Related decisions and designs

- [Talk orchestration and Work module — design target](../specs/2026-08-02-talk-orchestration-and-work-design.md)
- [ADR-0003: shared capability layer, internal tools, external MCP](../../adr/0003-llm-data-access-interface.md)
- [Daily Signals](../../daily-signals.md)
