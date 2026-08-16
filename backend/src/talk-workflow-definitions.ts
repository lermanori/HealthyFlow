import { z } from 'zod'

// Phase 6 Talk workflow and stage contracts (ADR-0009).
//
// This module is deliberately pure: it declares the closed workflow set, each
// workflow's stages, durable state, accepted events, and legal transitions, and
// nothing else. It imports no database client, no OpenAI transport, and no
// capability executor, so the whole state machine can be simulated in tests
// without a model, a browser, or a database.
//
// Activity profiles are *declarative data* here. `talk-agent-runtime.ts` maps a
// profile onto an Agents SDK Agent/Runner in Slice 4; it does not choose which
// workflow or stage runs next.

/** The closed Phase 6 workflow set. */
export const TalkWorkflowNameSchema = z.enum([
  'plan_day',
  'plan_work',
  'run_focus_block',
  'review_focus_block',
  'replan_day',
  'log_outcome',
  'review_project',
  'quick_chat',
])
export type TalkWorkflowName = z.infer<typeof TalkWorkflowNameSchema>

/**
 * Phase 5 persisted `plan_focused_work`. ADR-0009 makes that version 1 of
 * `plan_work`; the alias exists only for the rollout read path.
 */
export const TALK_WORKFLOW_NAME_ALIASES: Readonly<Record<string, TalkWorkflowName>> = {
  plan_focused_work: 'plan_work',
}

export function canonicalTalkWorkflowName(name: string): TalkWorkflowName | null {
  const aliased = TALK_WORKFLOW_NAME_ALIASES[name] ?? name
  const parsed = TalkWorkflowNameSchema.safeParse(aliased)
  return parsed.success ? parsed.data : null
}

/**
 * Terminal status is tracked separately from the current domain stage. A
 * workflow that is `completed`, `declined`, or `failed` still records the stage
 * it stopped in, which the Phase 5 stage enum could not express.
 */
export const TalkWorkflowStatusSchema = z.enum(['active', 'completed', 'declined', 'failed'])
export type TalkWorkflowStatus = z.infer<typeof TalkWorkflowStatusSchema>

export const TERMINAL_TALK_WORKFLOW_STATUSES: readonly TalkWorkflowStatus[] = [
  'completed',
  'declined',
  'failed',
]

export function isTerminalTalkWorkflowStatus(status: TalkWorkflowStatus) {
  return TERMINAL_TALK_WORKFLOW_STATUSES.includes(status)
}

// ---------------------------------------------------------------------------
// plan_work
// ---------------------------------------------------------------------------

/**
 * Stage names state what is being done. A generic `clarifying` is not a stage —
 * `clarify_direction` and `clarify_capacity` are different questions with
 * different resumption targets.
 */
export const PlanWorkStageSchema = z.enum([
  'resolve_project',
  'clarify_project',
  'resolve_scope',
  'review_alignment',
  'clarify_alignment',
  'clarify_direction',
  'draft_task',
  'await_task_confirmation',
  'draft_focus_block',
  'clarify_capacity',
  'await_focus_confirmation',
])
export type PlanWorkStage = z.infer<typeof PlanWorkStageSchema>

export const TalkFocusMeaningSchema = z.enum(['focused_minutes', 'elapsed_window', 'both'])

export const PlanWorkStateSchema = z.object({
  projectId: z.string().uuid().nullable(),
  /** Verified, open, aligned Task ids the Focus-planning stage may reference. */
  selectedTaskIds: z.array(z.string().uuid()).max(20),
  /**
   * Tasks with no recorded relation that the alignment stage judged aligned.
   * Deterministic validation still requires them to be open and in the Project;
   * this only substitutes for a relation the user never recorded.
   */
  alignmentApprovedTaskIds: z.array(z.string().uuid()).max(20),
  /** Set once `add_work_task` has been confirmed for this workflow. */
  createdTaskId: z.string().uuid().nullable(),
  createdFocusBlockId: z.string().uuid().nullable(),
  focusMeaning: TalkFocusMeaningSchema.nullable(),
  /** What the workflow is currently waiting on the user to answer. */
  openQuestion: z.string().trim().min(1).max(500).nullable(),
  blockedReasonCodes: z.array(z.string().trim().min(1).max(120)).max(12),
}).strict()
export type PlanWorkState = z.infer<typeof PlanWorkStateSchema>

export const INITIAL_PLAN_WORK_STATE: PlanWorkState = Object.freeze({
  projectId: null,
  selectedTaskIds: [],
  alignmentApprovedTaskIds: [],
  createdTaskId: null,
  createdFocusBlockId: null,
  focusMeaning: null,
  openQuestion: null,
  blockedReasonCodes: [],
})

/**
 * Events are typed results the application produces — from an application
 * activity, from a validated agent output, or from a confirmed capability
 * result. An agent never names a target stage.
 */
export const PlanWorkEventSchema = z.discriminatedUnion('type', [
  // resolve_project (application activity)
  z.object({ type: z.literal('project_selected'), projectId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('project_unresolved'), question: z.string().trim().min(1).max(500) }).strict(),
  // clarify_project
  z.object({ type: z.literal('project_clarified'), projectId: z.string().uuid() }).strict(),
  // resolve_scope (application activity — branches on facts, not on model output)
  z.object({ type: z.literal('scope_aligned_tasks'), taskIds: z.array(z.string().uuid()).min(1).max(20) }).strict(),
  z.object({ type: z.literal('scope_alignment_unclear') }).strict(),
  z.object({ type: z.literal('scope_empty_with_direction') }).strict(),
  z.object({ type: z.literal('scope_empty_without_direction'), question: z.string().trim().min(1).max(500) }).strict(),
  // review_alignment
  z.object({ type: z.literal('alignment_resolved'), taskIds: z.array(z.string().uuid()).min(1).max(20) }).strict(),
  z.object({ type: z.literal('alignment_needs_user_input'), question: z.string().trim().min(1).max(500) }).strict(),
  z.object({ type: z.literal('alignment_clarified') }).strict(),
  // clarify_direction
  z.object({ type: z.literal('direction_clarified') }).strict(),
  // draft_task (agent activity)
  z.object({ type: z.literal('task_drafted'), pendingActionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('task_draft_question'), question: z.string().trim().min(1).max(500) }).strict(),
  // await_task_confirmation
  z.object({
    type: z.literal('task_confirmed'),
    taskId: z.string().uuid(),
    projectId: z.string().uuid(),
  }).strict(),
  z.object({ type: z.literal('task_declined') }).strict(),
  z.object({ type: z.literal('task_stale'), reason: z.string().trim().min(1).max(500) }).strict(),
  // draft_focus_block (agent activity)
  z.object({ type: z.literal('focus_drafted'), pendingActionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('focus_draft_question'), question: z.string().trim().min(1).max(500) }).strict(),
  // clarify_capacity
  z.object({
    type: z.literal('capacity_clarified'),
    focusMeaning: TalkFocusMeaningSchema.nullable(),
  }).strict(),
  // await_focus_confirmation
  z.object({ type: z.literal('focus_confirmed'), focusBlockId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('focus_declined') }).strict(),
  z.object({ type: z.literal('focus_stale'), reason: z.string().trim().min(1).max(500) }).strict(),
  // Any executable stage may report a bounded product-level block, or the
  // runtime may fail. Both are terminal `failed`, but they stay distinguishable.
  z.object({
    type: z.literal('stage_blocked'),
    reasonCodes: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
  }).strict(),
  z.object({ type: z.literal('stage_failed'), reason: z.string().trim().min(1).max(500) }).strict(),
])
export type PlanWorkEvent = z.infer<typeof PlanWorkEventSchema>

// ---------------------------------------------------------------------------
// Activity profiles
// ---------------------------------------------------------------------------

/**
 * An application activity runs deterministic code. An agent activity runs one
 * bounded model turn budget with only the tools and output contract that stage
 * needs. A waiting stage runs nothing until a typed user event arrives.
 */
export type TalkStageActivity =
  | { kind: 'application' }
  | { kind: 'waiting'; waitingFor: 'user_answer' | 'confirmation' }
  | {
      kind: 'agent'
      /** Instruction pack ids selected for this stage only. */
      instructionPacks: readonly string[]
      /** Capability tool allowlist for this stage only. Never includes a write. */
      tools: readonly string[]
      /** Name of this stage's single structured output contract. */
      outputContract: string
      /** Per-stage turn budget. There is no global product-workflow budget. */
      maxTurns: number
    }

export type TalkTransitionResult<TStage extends string> =
  | { ok: true; stage: TStage; status: TalkWorkflowStatus }
  | { ok: false; reason: string }

export type TalkWorkflowDefinition<TStage extends string, TEvent> = {
  name: TalkWorkflowName
  /** Bumped whenever stages, events, or transitions change. Persisted per row. */
  version: number
  stageSchema: z.ZodType<TStage>
  eventSchema: z.ZodType<TEvent>
  stateSchema: z.ZodTypeAny
  initialStage: TStage
  initialState: unknown
  /** Events each stage will accept. Anything else is an illegal transition. */
  acceptedEvents: Readonly<Record<TStage, readonly string[]>>
  activity: Readonly<Record<TStage, TalkStageActivity>>
  transition: (stage: TStage, event: TEvent) => TalkTransitionResult<TStage>
  traceLabel: (stage: TStage) => string
}

const PLAN_WORK_ACTIVITY: Readonly<Record<PlanWorkStage, TalkStageActivity>> = {
  // The Work → Talk handoff already knows the Project, and ownership plus scope
  // are facts the application reads directly. Neither stage spends a model turn.
  resolve_project: { kind: 'application' },
  resolve_scope: { kind: 'application' },
  clarify_project: { kind: 'waiting', waitingFor: 'user_answer' },
  clarify_alignment: { kind: 'waiting', waitingFor: 'user_answer' },
  clarify_direction: { kind: 'waiting', waitingFor: 'user_answer' },
  clarify_capacity: { kind: 'waiting', waitingFor: 'user_answer' },
  await_task_confirmation: { kind: 'waiting', waitingFor: 'confirmation' },
  await_focus_confirmation: { kind: 'waiting', waitingFor: 'confirmation' },
  review_alignment: {
    kind: 'agent',
    instructionPacks: ['base', 'task_alignment', 'one_question'],
    tools: ['review_task_alignment'],
    outputContract: 'plan_work.alignment_decision',
    maxTurns: 3,
  },
  // No Daily Plan tools, no Focus-block instructions, no write tool. This stage
  // cannot return a Focus block or call validate_daily_plan.
  draft_task: {
    kind: 'agent',
    instructionPacks: ['base', 'task_drafting', 'one_question'],
    tools: [],
    outputContract: 'plan_work.task_draft',
    maxTurns: 2,
  },
  // No Task-drafting instructions and no write tool. A zero-tool drafting stage
  // and a Daily Plan validation stage do not share a budget.
  draft_focus_block: {
    kind: 'agent',
    instructionPacks: ['base', 'focused_work', 'one_question'],
    tools: ['get_daily_plan', 'compute_daily_availability', 'validate_daily_plan'],
    outputContract: 'plan_work.focus_draft',
    maxTurns: 6,
  },
}

const PLAN_WORK_ACCEPTED_EVENTS: Readonly<Record<PlanWorkStage, readonly string[]>> = {
  resolve_project: ['project_selected', 'project_unresolved', 'stage_blocked', 'stage_failed'],
  clarify_project: ['project_clarified', 'stage_blocked', 'stage_failed'],
  resolve_scope: [
    'scope_aligned_tasks',
    'scope_alignment_unclear',
    'scope_empty_with_direction',
    'scope_empty_without_direction',
    'stage_blocked',
    'stage_failed',
  ],
  review_alignment: ['alignment_resolved', 'alignment_needs_user_input', 'stage_blocked', 'stage_failed'],
  clarify_alignment: ['alignment_clarified', 'stage_blocked', 'stage_failed'],
  clarify_direction: ['direction_clarified', 'stage_blocked', 'stage_failed'],
  draft_task: ['task_drafted', 'task_draft_question', 'stage_blocked', 'stage_failed'],
  await_task_confirmation: ['task_confirmed', 'task_declined', 'task_stale', 'stage_blocked', 'stage_failed'],
  draft_focus_block: ['focus_drafted', 'focus_draft_question', 'stage_blocked', 'stage_failed'],
  clarify_capacity: ['capacity_clarified', 'stage_blocked', 'stage_failed'],
  await_focus_confirmation: ['focus_confirmed', 'focus_declined', 'focus_stale', 'stage_blocked', 'stage_failed'],
}

/**
 * Legal next stage per (stage, event). Terminal outcomes set a status and keep
 * the stage they stopped in, so a completed workflow still reports where it
 * ended.
 */
const PLAN_WORK_TRANSITIONS: Readonly<
  Record<PlanWorkStage, Readonly<Record<string, { stage: PlanWorkStage; status: TalkWorkflowStatus }>>>
> = {
  resolve_project: {
    project_selected: { stage: 'resolve_scope', status: 'active' },
    project_unresolved: { stage: 'clarify_project', status: 'active' },
  },
  clarify_project: {
    project_clarified: { stage: 'resolve_scope', status: 'active' },
  },
  resolve_scope: {
    scope_aligned_tasks: { stage: 'draft_focus_block', status: 'active' },
    scope_alignment_unclear: { stage: 'review_alignment', status: 'active' },
    scope_empty_with_direction: { stage: 'draft_task', status: 'active' },
    scope_empty_without_direction: { stage: 'clarify_direction', status: 'active' },
  },
  review_alignment: {
    alignment_resolved: { stage: 'draft_focus_block', status: 'active' },
    alignment_needs_user_input: { stage: 'clarify_alignment', status: 'active' },
  },
  clarify_alignment: {
    alignment_clarified: { stage: 'review_alignment', status: 'active' },
  },
  clarify_direction: {
    direction_clarified: { stage: 'draft_task', status: 'active' },
  },
  draft_task: {
    task_drafted: { stage: 'await_task_confirmation', status: 'active' },
    task_draft_question: { stage: 'clarify_direction', status: 'active' },
  },
  await_task_confirmation: {
    // Server-side continuation: a confirmed Task resumes Focus planning without
    // the frontend sending a synthetic hidden user message.
    task_confirmed: { stage: 'draft_focus_block', status: 'active' },
    task_declined: { stage: 'await_task_confirmation', status: 'declined' },
    task_stale: { stage: 'draft_task', status: 'active' },
  },
  draft_focus_block: {
    focus_drafted: { stage: 'await_focus_confirmation', status: 'active' },
    focus_draft_question: { stage: 'clarify_capacity', status: 'active' },
  },
  clarify_capacity: {
    capacity_clarified: { stage: 'draft_focus_block', status: 'active' },
  },
  await_focus_confirmation: {
    focus_confirmed: { stage: 'await_focus_confirmation', status: 'completed' },
    focus_declined: { stage: 'await_focus_confirmation', status: 'declined' },
    focus_stale: { stage: 'draft_focus_block', status: 'active' },
  },
}

function planWorkTransition(stage: PlanWorkStage, event: PlanWorkEvent): TalkTransitionResult<PlanWorkStage> {
  if (!PlanWorkStageSchema.safeParse(stage).success) {
    return { ok: false, reason: `Unknown plan_work stage: ${String(stage)}` }
  }
  const parsed = PlanWorkEventSchema.safeParse(event)
  if (!parsed.success) return { ok: false, reason: 'Event does not satisfy the plan_work event contract' }
  const accepted = PLAN_WORK_ACCEPTED_EVENTS[stage]
  if (!accepted.includes(parsed.data.type)) {
    return { ok: false, reason: `Stage ${stage} does not accept event ${parsed.data.type}` }
  }
  // Accepted at every executable stage, so they are handled outside the table.
  if (parsed.data.type === 'stage_blocked' || parsed.data.type === 'stage_failed') {
    return { ok: true, stage, status: 'failed' }
  }
  const next = PLAN_WORK_TRANSITIONS[stage][parsed.data.type]
  if (!next) return { ok: false, reason: `Stage ${stage} does not accept event ${parsed.data.type}` }
  return { ok: true, stage: next.stage, status: next.status }
}

export const PLAN_WORK_DEFINITION: TalkWorkflowDefinition<PlanWorkStage, PlanWorkEvent> = {
  name: 'plan_work',
  version: 1,
  stageSchema: PlanWorkStageSchema,
  eventSchema: PlanWorkEventSchema,
  stateSchema: PlanWorkStateSchema,
  initialStage: 'resolve_project',
  initialState: INITIAL_PLAN_WORK_STATE,
  acceptedEvents: PLAN_WORK_ACCEPTED_EVENTS,
  activity: PLAN_WORK_ACTIVITY,
  transition: planWorkTransition,
  traceLabel: (stage) => `plan_work.v1.${stage}`,
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Adding a workflow extends this registry and its tests. It must not require
 * changing the generic Agents SDK loop, pending-action machinery, routes, or
 * the Talk UI protocol.
 *
 * The remaining Phase 6 workflows are migrated one vertical slice at a time, so
 * the registry is intentionally partial over the closed name set.
 */
export const TALK_WORKFLOW_DEFINITIONS: Partial<
  Record<TalkWorkflowName, TalkWorkflowDefinition<any, any>>
> = {
  plan_work: PLAN_WORK_DEFINITION,
}

export class UnregisteredTalkWorkflowError extends Error {
  readonly code = 'talk_workflow_unregistered'
}

export function getTalkWorkflowDefinition(name: TalkWorkflowName) {
  const definition = TALK_WORKFLOW_DEFINITIONS[name]
  if (!definition) {
    throw new UnregisteredTalkWorkflowError(`Talk workflow "${name}" is not registered yet.`)
  }
  return definition
}
