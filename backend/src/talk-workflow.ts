import { createHash } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { executeAiCapability, preparePendingAiAction } from './ai-capabilities'
import { Credits, UnpricedModelError } from './credits'
import { buildDaySummary, validateDailyPlacement } from './day-summary'
import { db } from './supabase-client'
import {
  defaultTalkStageRuntime,
  TALK_AGENT_MAX_TOKENS,
  TALK_RUNTIME_VERSION,
  TalkStageRunError,
  type TalkFocusDraftOutput,
  type TalkAlignmentOutput,
  type TalkRuntimeMessage,
  type TalkRuntimeToolEvent,
  type TalkStageRuntime,
  type TalkTaskDraftOutput,
  buildTalkStagePlan,
} from './talk-agent-runtime'
import {
  INITIAL_PLAN_WORK_STATE,
  isTerminalTalkWorkflowStatus,
  PLAN_WORK_DEFINITION,
  PlanWorkStateSchema,
  type PlanWorkEvent,
  type PlanWorkStage,
  type PlanWorkState,
  type TalkWorkflowStatus,
} from './talk-workflow-definitions'
import {
  createSupabaseTalkWorkflowStore,
} from './talk-workflow-store.supabase'
import {
  parseTalkWorkflowState,
  type TalkWorkflowRecord,
  type TalkWorkflowStore,
} from './talk-workflow-store'
import { Work } from './work'
import type { AssistantContext } from './settings-schema'

// The deep Talk orchestration module (ADR-0009).
//
// It owns workflow creation and resumption, authoritative context loading, legal
// transitions, compare-and-swap claims, proposal validation and fingerprints,
// confirmation, and the translation of stage results into workflow events. It
// contains no OpenAI transport details: a stage that needs a model calls the
// stage-scoped runtime, which knows nothing about what runs next.

export const ALIGNED_RELATIONS = new Set(['Direct progress', 'Unblocking', 'Maintenance'])

export const TalkFocusProposalSchema = z.object({
  focusMeaning: z.enum(['focused_minutes', 'elapsed_window', 'both']),
  projectId: z.string().uuid(),
  taskIds: z.array(z.string().uuid()).min(1).max(20),
  scheduledDate: z.string().date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  plannedMinutes: z.number().int().positive().max(1440),
  intendedOutcome: z.string().trim().min(1).max(500),
  intendedEvidence: z.string().trim().min(1).max(500),
  transitionMinutes: z.number().int().min(0).max(180).nullable(),
  breakMinutes: z.number().int().min(0).max(180).nullable(),
}).strict()
export type TalkFocusProposal = z.infer<typeof TalkFocusProposalSchema>

export type TalkPendingAction = {
  id: string
  capability: string
  args: Record<string, unknown>
  preview: unknown
  expiresAt: string
  workflowId?: string
}

/** One entry per stage the turn actually ran. Surfaced for the debug view. */
export type TalkStageTrace = {
  stage: PlanWorkStage
  activity: 'application' | 'agent' | 'waiting'
  event: PlanWorkEvent['type'] | null
  nextStage: PlanWorkStage
  status: TalkWorkflowStatus
  toolNames: string[]
  outputContract: string | null
  note?: string
}

export type TalkWorkflowTurnResult = {
  message: string
  toolEvents: TalkRuntimeToolEvent[]
  pendingActions: TalkPendingAction[]
  workflow: TalkWorkflowRecord
  /** Ordered stage transitions performed by this turn. */
  trace: TalkStageTrace[]
}

export class TalkWorkflowConflictError extends Error {
  readonly code = 'talk_workflow_conflict'
}

export class TalkProposalStaleError extends Error {
  readonly code = 'talk_proposal_stale'
}

export class TalkWorkflowUnavailableError extends Error {
  readonly code = 'talk_workflow_unavailable'
}

export class TalkWorkflowBillingError extends Error {
  constructor(message: string, readonly code: 'insufficient_credits' | 'unpriced_model' | 'billing_error') {
    super(message)
  }
}

/** Injected so the whole machine can be driven without OpenAI or Supabase. */
export type TalkWorkflowDeps = {
  store: TalkWorkflowStore
  runtime: TalkStageRuntime
  work: Pick<typeof Work, 'getScope'>
  now: () => Date
}

export function defaultTalkWorkflowDeps(): TalkWorkflowDeps {
  return {
    store: createSupabaseTalkWorkflowStore(),
    runtime: defaultTalkStageRuntime,
    work: Work,
    now: () => new Date(),
  }
}

function pendingActionToClient(row: any): TalkPendingAction {
  return {
    id: row.id,
    capability: row.capability,
    args: row.args ?? {},
    preview: row.preview,
    expiresAt: row.expires_at,
    workflowId: row.workflow_id ?? undefined,
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stableValue(entry)]))
  }
  return value
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function hasDirection(project: any) {
  return Boolean([
    project?.target,
    project?.milestone,
    project?.definitionOfDone,
    project?.context?.summary,
    project?.context?.nextStep,
  ].some((value) => typeof value === 'string' && value.trim()))
}

function projectUsable(project: any) {
  return Boolean(project) && !project.isArchived && project.status !== 'Paused' && project.status !== 'Done'
}

async function proposalSnapshot(
  userId: string,
  proposal: TalkFocusProposal,
  timeZone: string,
  work: Pick<typeof Work, 'getScope'>,
  alignmentApprovedTaskIds: string[] = [],
) {
  const [scope, day] = await Promise.all([
    work.getScope(userId, proposal.projectId),
    buildDaySummary(userId, proposal.scheduledDate, timeZone),
  ])
  if (!projectUsable(scope.project)) {
    throw new TalkProposalStaleError('The selected Project is no longer available for planning.')
  }

  const taskIds = new Set(proposal.taskIds)
  const selectedTasks = scope.tasks.filter((task) => taskIds.has(task.id))
  if (selectedTasks.length !== taskIds.size) {
    throw new TalkProposalStaleError('One or more selected Tasks are no longer in this Project.')
  }
  if (selectedTasks.some((task) => task.status !== 'open')) {
    throw new TalkProposalStaleError('One or more selected Tasks are no longer open.')
  }
  const approved = new Set(alignmentApprovedTaskIds)
  if (selectedTasks.some((task) => (
    task.relation ? !ALIGNED_RELATIONS.has(task.relation) : !approved.has(task.id)
  ))) {
    throw new TalkProposalStaleError('The selected Tasks are not aligned with the Project target.')
  }

  const placement = await validateDailyPlacement(userId, {
    date: proposal.scheduledDate,
    timeZone,
    startTime: proposal.startTime,
    durationMinutes: proposal.plannedMinutes + (proposal.breakMinutes ?? 0),
    transitionMinutes: proposal.transitionMinutes ?? 0,
  })
  if (placement.status !== 'valid') {
    throw new TalkProposalStaleError(
      `The proposed time is no longer valid: ${placement.reasons.join(', ') || placement.status}.`,
    )
  }

  const sourceFingerprint = fingerprint({
    date: proposal.scheduledDate,
    timeZone,
    dailyPlan: {
      capacity: day.capacity,
      items: day.items.map((item) => ({
        id: item.id,
        title: item.title,
        completed: item.completed,
        startTime: item.startTime,
        duration: item.duration,
        scheduledDate: item.scheduledDate,
        position: item.position,
        completedAt: item.completedAt,
        resolvedTime: item.resolvedTime,
      })),
      calendar: day.calendar,
      focusBlocks: day.work.focusBlocks,
    },
    work: {
      project: scope.project,
      tasks: scope.tasks,
      focusBlocks: scope.focusBlocks,
    },
  })

  return { sourceFingerprint, placement }
}

async function reserveStageRun(input: {
  userId: string
  model: string
  instructions: string
  maxTurns: number
  messages: TalkRuntimeMessage[]
}) {
  try {
    const reservedTokens = await Credits.estimateReserve({
      model: input.model,
      systemPrompt: input.instructions,
      userPrompt: JSON.stringify(input.messages.slice(-12)),
      // Budget follows the stage, not one global product-workflow limit.
      maxOutputTokens: TALK_AGENT_MAX_TOKENS * input.maxTurns,
    })
    const ok = await Credits.reserve(input.userId, reservedTokens)
    if (!ok) throw new TalkWorkflowBillingError('Insufficient AI tokens', 'insufficient_credits')
    return reservedTokens
  } catch (error) {
    if (error instanceof TalkWorkflowBillingError) throw error
    if (error instanceof UnpricedModelError) {
      throw new TalkWorkflowBillingError('AI model pricing is not configured', 'unpriced_model')
    }
    throw new TalkWorkflowBillingError('AI billing failed', 'billing_error')
  }
}

// ---------------------------------------------------------------------------
// Stage outcomes
// ---------------------------------------------------------------------------

type StageOutcome = {
  event: PlanWorkEvent
  state?: Partial<PlanWorkState>
  message?: string
  pendingAction?: TalkPendingAction
  toolEvents?: TalkRuntimeToolEvent[]
  outputContract?: string | null
  toolNames?: string[]
}

type StageContext = {
  userId: string
  model: string
  conversationId: string
  record: TalkWorkflowRecord
  state: PlanWorkState
  messages: TalkRuntimeMessage[]
  assistantContext?: AssistantContext
  deps: TalkWorkflowDeps
  resumed: boolean
}

/**
 * resolve_project — an application activity. The Work → Talk handoff already
 * knows the Project, so this verifies ownership instead of spending a model turn
 * on list_work_projects.
 */
async function runResolveProject(ctx: StageContext): Promise<StageOutcome> {
  if (!ctx.state.projectId) {
    return {
      event: { type: 'project_unresolved', question: 'Which Project should this focused work advance?' },
      message: 'Which Project should this focused work advance?',
      state: { openQuestion: 'Which Project should this focused work advance?' },
    }
  }
  const scope = await ctx.deps.work.getScope(ctx.userId, ctx.state.projectId)
  if (!projectUsable(scope.project)) {
    return {
      event: { type: 'stage_blocked', reasonCodes: ['project_unavailable'] },
      message: 'The selected Project is no longer available for planning.',
      state: { blockedReasonCodes: ['project_unavailable'] },
    }
  }
  return {
    event: { type: 'project_selected', projectId: ctx.state.projectId },
    state: { projectId: ctx.state.projectId, openQuestion: null, blockedReasonCodes: [] },
  }
}

/**
 * resolve_scope — an application activity. Open Task count and recorded Task
 * relationships are facts, so code branches on them rather than asking a model
 * to decide which contract it is fulfilling. This is the branch whose ambiguity
 * produced the ADR-0009 regression trace.
 */
async function runResolveScope(ctx: StageContext): Promise<StageOutcome> {
  const projectId = ctx.state.projectId
  if (!projectId) {
    return {
      event: { type: 'stage_blocked', reasonCodes: ['project_missing'] },
      message: 'This workflow lost its Project reference.',
    }
  }
  const scope = await ctx.deps.work.getScope(ctx.userId, projectId)
  if (!projectUsable(scope.project)) {
    return {
      event: { type: 'stage_blocked', reasonCodes: ['project_unavailable'] },
      message: 'The selected Project is no longer available for planning.',
    }
  }

  const open = scope.tasks.filter((task) => task.status === 'open')
  const aligned = open.filter((task) => task.relation && ALIGNED_RELATIONS.has(task.relation))

  if (aligned.length > 0) {
    return {
      event: { type: 'scope_aligned_tasks', taskIds: aligned.slice(0, 20).map((task) => task.id) },
      state: { selectedTaskIds: aligned.slice(0, 20).map((task) => task.id) },
    }
  }
  // Only an unrecorded relation is genuinely unclear. An explicit 'Unrelated' or
  // 'Optional polish' is a recorded fact the model does not get to overturn.
  const unclear = open.filter((task) => !task.relation)
  if (unclear.length > 0) {
    return { event: { type: 'scope_alignment_unclear' } }
  }
  if (open.length > 0) {
    return {
      event: { type: 'stage_blocked', reasonCodes: ['no_aligned_task'] },
      message: 'This Project\'s open Tasks are not aligned with its target.',
    }
  }
  if (hasDirection(scope.project)) {
    return { event: { type: 'scope_empty_with_direction' } }
  }
  const question = 'What concrete outcome or next step should this Project advance?'
  return {
    event: { type: 'scope_empty_without_direction', question },
    message: question,
    state: { openQuestion: question },
  }
}

/** Bounded, verified context for a stage. Never the whole conversation state. */
async function projectStageContext(ctx: StageContext) {
  const scope = await ctx.deps.work.getScope(ctx.userId, ctx.state.projectId!)
  return {
    project: {
      id: scope.project?.id,
      name: scope.project?.name,
      target: scope.project?.target ?? null,
      milestone: scope.project?.milestone ?? null,
      definitionOfDone: scope.project?.definitionOfDone ?? null,
      summary: scope.project?.context?.summary ?? null,
      nextStep: scope.project?.context?.nextStep ?? null,
    },
    openQuestionAnswered: ctx.state.openQuestion,
  }
}

async function runAgentStage(ctx: StageContext, stage: PlanWorkStage) {
  const plan = buildTalkStagePlan({
    workflowName: 'plan_work',
    stage,
    resumed: ctx.resumed,
  })
  const stageContext = {
    ...(ctx.assistantContext ? { assistant: ctx.assistantContext } : {}),
    ...(stage === 'draft_focus_block'
    ? {
        ...(await projectStageContext(ctx)),
        // Already verified: the model selects a placement, not the work.
        verifiedTaskIds: ctx.state.selectedTaskIds,
        focusMeaning: ctx.state.focusMeaning,
      }
    : stage === 'review_alignment'
      ? {
          ...(await projectStageContext(ctx)),
          candidateTaskIds: (await ctx.deps.work.getScope(ctx.userId, ctx.state.projectId!)).tasks
            .filter((task) => task.status === 'open')
            .slice(0, 20)
            .map((task) => ({ id: task.id, title: task.title, relation: task.relation ?? null })),
        }
      : await projectStageContext(ctx)),
  }

  const reservedTokens = await reserveStageRun({
    userId: ctx.userId,
    model: ctx.model,
    instructions: plan.instructions,
    maxTurns: plan.maxTurns,
    messages: ctx.messages,
  })
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  try {
    const result = await ctx.deps.runtime.run({
      userId: ctx.userId,
      conversationId: ctx.conversationId,
      model: ctx.model,
      workflowName: 'plan_work',
      definitionVersion: PLAN_WORK_DEFINITION.version,
      stage,
      anchorDate: ctx.record.anchorDate,
      timeZone: ctx.record.timeZone,
      stageContext,
      messages: ctx.messages,
      resumed: ctx.resumed,
    })
    usage = result.usage
    return { result, plan }
  } finally {
    await Credits.settleReserved(ctx.userId, reservedTokens, usage, {
      endpoint: `talk-${stage}`,
      model: ctx.model,
    })
  }
}

async function runDraftTask(ctx: StageContext): Promise<StageOutcome> {
  const { result, plan } = await runAgentStage(ctx, 'draft_task')
  const output = result.output as TalkTaskDraftOutput
  const shared = {
    toolEvents: result.toolEvents,
    outputContract: result.outputContract,
    toolNames: result.toolNames,
  }

  if (output.kind === 'ask') {
    return {
      ...shared,
      event: { type: 'task_draft_question', question: output.question! },
      message: output.question!,
      state: { openQuestion: output.question! },
    }
  }
  if (output.kind === 'blocked') {
    return {
      ...shared,
      event: { type: 'stage_blocked', reasonCodes: output.reasonCodes },
      message: output.message,
      state: { blockedReasonCodes: output.reasonCodes },
    }
  }

  const draft = output.task!
  // The application, not the model, owns the anchor date.
  if (draft.scheduledDate && draft.scheduledDate !== ctx.record.anchorDate) {
    return {
      ...shared,
      event: { type: 'stage_blocked', reasonCodes: ['task_date_off_anchor'] },
      message: 'The proposed Task date does not match the workflow anchor date.',
    }
  }

  const actionId = uuidv4()
  const pendingAction = await preparePendingAiAction(
    { userId: ctx.userId, caller: 'internal', model: ctx.model },
    'add_work_task',
    { projectId: ctx.state.projectId, ...draft, requestId: actionId },
    {
      id: actionId,
      workflowId: ctx.record.id,
      workflowRevision: ctx.record.revision + 1,
      expiresInMs: 30 * 60 * 1000,
    },
  )
  void plan
  return {
    ...shared,
    event: { type: 'task_drafted', pendingActionId: actionId },
    message: output.message,
    pendingAction,
    state: { openQuestion: null },
  }
}

async function runDraftFocusBlock(ctx: StageContext): Promise<StageOutcome> {
  const { result } = await runAgentStage(ctx, 'draft_focus_block')
  const output = result.output as TalkFocusDraftOutput
  const shared = {
    toolEvents: result.toolEvents,
    outputContract: result.outputContract,
    toolNames: result.toolNames,
  }

  if (output.kind === 'ask') {
    return {
      ...shared,
      event: { type: 'focus_draft_question', question: output.question! },
      message: output.question!,
      state: { openQuestion: output.question! },
    }
  }
  if (output.kind === 'blocked') {
    return {
      ...shared,
      event: { type: 'stage_blocked', reasonCodes: output.reasonCodes },
      message: output.message,
      state: { blockedReasonCodes: output.reasonCodes },
    }
  }

  // Project, Tasks, and date come from verified state; the contract gives the
  // model no field in which to supply them.
  const proposal = TalkFocusProposalSchema.parse({
    focusMeaning: output.focusMeaning,
    projectId: ctx.state.projectId,
    taskIds: ctx.state.selectedTaskIds,
    scheduledDate: ctx.record.anchorDate,
    startTime: output.startTime,
    plannedMinutes: output.plannedMinutes,
    intendedOutcome: output.intendedOutcome,
    intendedEvidence: output.intendedEvidence,
    transitionMinutes: output.transitionMinutes,
    breakMinutes: output.breakMinutes,
  })

  let sourceFingerprint: string
  try {
    sourceFingerprint = (await proposalSnapshot(
      ctx.userId, proposal, ctx.record.timeZone, ctx.deps.work, ctx.state.alignmentApprovedTaskIds,
    )).sourceFingerprint
  } catch (error) {
    if (!(error instanceof TalkProposalStaleError)) throw error
    return {
      ...shared,
      event: { type: 'focus_stale', reason: error.message },
      message: error.message,
    }
  }

  const actionId = uuidv4()
  const { focusMeaning: _focusMeaning, ...createInput } = proposal
  const pendingAction = await preparePendingAiAction(
    { userId: ctx.userId, caller: 'internal', model: ctx.model },
    'create_focus_block',
    { ...createInput, requestId: actionId },
    {
      id: actionId,
      workflowId: ctx.record.id,
      workflowRevision: ctx.record.revision + 1,
      sourceFingerprint,
      expiresInMs: 30 * 60 * 1000,
    },
  )
  return {
    ...shared,
    event: { type: 'focus_drafted', pendingActionId: actionId },
    message: output.message,
    pendingAction,
    state: { focusMeaning: proposal.focusMeaning, openQuestion: null },
  }
}

async function runReviewAlignment(ctx: StageContext): Promise<StageOutcome> {
  const { result } = await runAgentStage(ctx, 'review_alignment')
  const output = result.output as TalkAlignmentOutput
  const shared = {
    toolEvents: result.toolEvents,
    outputContract: result.outputContract,
    toolNames: result.toolNames,
  }

  if (output.kind === 'ask') {
    return {
      ...shared,
      event: { type: 'alignment_needs_user_input', question: output.question! },
      message: output.question!,
      state: { openQuestion: output.question! },
    }
  }
  if (output.kind === 'blocked') {
    return {
      ...shared,
      event: { type: 'stage_blocked', reasonCodes: output.reasonCodes },
      message: output.message,
      state: { blockedReasonCodes: output.reasonCodes },
    }
  }

  // The model may only select among Tasks the application already loaded.
  const scope = await ctx.deps.work.getScope(ctx.userId, ctx.state.projectId!)
  const selectable = new Set(scope.tasks
    .filter((task) => task.status === 'open')
    .filter((task) => !task.relation || ALIGNED_RELATIONS.has(task.relation))
    .map((task) => task.id))
  const selected = output.taskIds.filter((id) => selectable.has(id))
  if (selected.length === 0) {
    return {
      ...shared,
      event: { type: 'stage_blocked', reasonCodes: ['no_aligned_task'] },
      message: 'None of this Project\'s open Tasks are aligned with its target.',
    }
  }
  return {
    ...shared,
    event: { type: 'alignment_resolved', taskIds: selected },
    message: output.message,
    state: { selectedTaskIds: selected, alignmentApprovedTaskIds: selected },
  }
}

const STAGE_RUNNERS: Partial<Record<PlanWorkStage, (ctx: StageContext) => Promise<StageOutcome>>> = {
  resolve_project: runResolveProject,
  resolve_scope: runResolveScope,
  review_alignment: runReviewAlignment,
  draft_task: runDraftTask,
  draft_focus_block: runDraftFocusBlock,
}

// ---------------------------------------------------------------------------
// The drive loop
// ---------------------------------------------------------------------------

/** Bounded so a definition bug cannot spin. Well above the longest legal path. */
const MAX_STAGES_PER_TURN = 8

function waitingMessage(stage: PlanWorkStage, state: PlanWorkState) {
  if (stage === 'await_task_confirmation') {
    return 'Review the Task preview, then Confirm or Cancel it.'
  }
  if (stage === 'await_focus_confirmation') {
    return 'Review the Focus block preview, then Confirm or Cancel it.'
  }
  return state.openQuestion ?? 'Waiting for your answer.'
}

async function driveWorkflow(input: {
  userId: string
  conversationId: string
  model: string
  messages: TalkRuntimeMessage[]
  assistantContext?: AssistantContext
  deps: TalkWorkflowDeps
  record: TalkWorkflowRecord
  resumed: boolean
  /** A typed continuation event, e.g. the result of a confirmed capability. */
  seedEvent?: PlanWorkEvent
  seedState?: Partial<PlanWorkState>
}): Promise<TalkWorkflowTurnResult> {
  let record = input.record
  let state = parseTalkWorkflowState(record) as PlanWorkState
  const trace: TalkStageTrace[] = []
  const toolEvents: TalkRuntimeToolEvent[] = []
  const pendingActions: TalkPendingAction[] = []
  let message = ''

  const applyTransition = async (
    stage: PlanWorkStage,
    outcome: StageOutcome,
    activity: TalkStageTrace['activity'],
  ) => {
    const transitioned = PLAN_WORK_DEFINITION.transition(stage, outcome.event)
    if (!transitioned.ok) {
      // An illegal transition is a definition or stage-runner bug, never
      // something a model result should be able to cause silently.
      throw new TalkWorkflowUnavailableError(
        `Illegal plan_work transition from ${stage} on ${outcome.event.type}: ${transitioned.reason}`,
      )
    }
    state = PlanWorkStateSchema.parse({ ...state, ...(outcome.state ?? {}) })
    const updated = await input.deps.store.updateCas(input.userId, record.id, record.revision, {
      stage: transitioned.stage,
      status: transitioned.status,
      state,
      lastError: outcome.event.type === 'stage_blocked' || outcome.event.type === 'stage_failed'
        ? (outcome.message ?? outcome.event.type).slice(0, 1000)
        : null,
      ...(outcome.pendingAction ? { pendingActionId: outcome.pendingAction.id, confirmationState: 'presented' } : {}),
    })
    if (!updated) {
      throw new TalkWorkflowConflictError('This Talk workflow changed in another request. Retry the turn.')
    }
    record = updated
    trace.push({
      stage,
      activity,
      event: outcome.event.type,
      nextStage: transitioned.stage,
      status: transitioned.status,
      toolNames: outcome.toolNames ?? [],
      outputContract: outcome.outputContract ?? null,
      note: outcome.message,
    })
    if (outcome.toolEvents) toolEvents.push(...outcome.toolEvents)
    if (outcome.pendingAction) pendingActions.push(outcome.pendingAction)
    if (outcome.message) message = outcome.message
    return transitioned
  }

  if (input.seedEvent) {
    state = PlanWorkStateSchema.parse({ ...state, ...(input.seedState ?? {}) })
    await applyTransition(record.stage as PlanWorkStage, { event: input.seedEvent, state: input.seedState }, 'waiting')
  }

  for (let step = 0; step < MAX_STAGES_PER_TURN; step += 1) {
    if (isTerminalTalkWorkflowStatus(record.status)) break
    const stage = record.stage as PlanWorkStage
    const profile = PLAN_WORK_DEFINITION.activity[stage]
    if (!profile) throw new TalkWorkflowUnavailableError(`plan_work has no stage named ${stage}`)

    if (profile.kind === 'waiting') {
      if (!message) message = waitingMessage(stage, state)
      break
    }

    const runner = STAGE_RUNNERS[stage]
    if (!runner) throw new TalkWorkflowUnavailableError(`plan_work stage ${stage} has no runner`)

    const ctx: StageContext = {
      userId: input.userId,
      model: input.model,
      conversationId: input.conversationId,
      record,
      state,
      messages: input.messages,
      assistantContext: input.assistantContext,
      deps: input.deps,
      resumed: input.resumed,
    }

    let outcome: StageOutcome
    try {
      outcome = await runner(ctx)
    } catch (error) {
      if (error instanceof TalkWorkflowBillingError) throw error
      if (error instanceof TalkStageRunError) {
        // The tool sequence survives the failure and is recorded on the turn.
        toolEvents.push(...error.detail.toolEvents)
        outcome = {
          event: { type: 'stage_failed', reason: error.message.slice(0, 500) },
          message: `The ${stage} step failed: ${error.message}`,
          toolNames: error.toolSequence,
        }
      } else {
        throw error
      }
    }

    const transitioned = await applyTransition(stage, outcome, profile.kind)
    if (isTerminalTalkWorkflowStatus(transitioned.status)) break
  }

  return { message: message || waitingMessage(record.stage as PlanWorkStage, state), toolEvents, pendingActions, workflow: record, trace }
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function getTalkWorkflow(
  userId: string,
  conversationId: string,
  deps: TalkWorkflowDeps = defaultTalkWorkflowDeps(),
) {
  return deps.store.getActiveByConversation(userId, conversationId)
}

export async function runTalkWorkflowTurn(input: {
  userId: string
  conversationId: string
  anchorDate: string
  timeZone: string
  model: string
  messages: TalkRuntimeMessage[]
  assistantContext?: AssistantContext
  /** Structured Work → Talk handoff input. */
  projectId?: string | null
  deps?: TalkWorkflowDeps
}): Promise<TalkWorkflowTurnResult> {
  const deps = input.deps ?? defaultTalkWorkflowDeps()
  const existing = await deps.store.getActiveByConversation(input.userId, input.conversationId)
  const resumed = Boolean(existing)

  const record = existing ?? await deps.store.create({
    id: uuidv4(),
    userId: input.userId,
    conversationId: input.conversationId,
    name: 'plan_work',
    definitionVersion: PLAN_WORK_DEFINITION.version,
    stage: PLAN_WORK_DEFINITION.initialStage,
    anchorDate: input.anchorDate,
    timeZone: input.timeZone,
    state: { ...INITIAL_PLAN_WORK_STATE, projectId: input.projectId ?? null },
    runtimeVersion: TALK_RUNTIME_VERSION,
    instructionVersions: [],
    model: input.model,
  })

  // A pending preview pauses the workflow: another proposal must not be drafted
  // until the user confirms or cancels the current one.
  if (record.pendingActionId) {
    const action = await db.getAiPendingAction(record.pendingActionId)
    if (action && !action.executed_at && !action.canceled_at) {
      const subject = action.capability === 'add_work_task' ? 'Task' : 'Focus block'
      return {
        message: `Review the current ${subject} preview, then Confirm or Cancel it before requesting another proposal.`,
        toolEvents: [],
        pendingActions: [pendingActionToClient(action)],
        workflow: record,
        trace: [],
      }
    }
  }

  // A user answer resolves whatever the current clarify_* stage asked.
  const state = parseTalkWorkflowState(record) as PlanWorkState
  const stage = record.stage as PlanWorkStage
  const answerEvent: Partial<Record<PlanWorkStage, PlanWorkEvent>> = {
    clarify_project: state.projectId ? { type: 'project_clarified', projectId: state.projectId } : undefined,
    clarify_direction: { type: 'direction_clarified' },
    clarify_alignment: { type: 'alignment_clarified' },
    clarify_capacity: { type: 'capacity_clarified', focusMeaning: state.focusMeaning },
  }

  return driveWorkflow({
    userId: input.userId,
    conversationId: input.conversationId,
    model: input.model,
    messages: input.messages,
    assistantContext: input.assistantContext,
    deps,
    record,
    resumed,
    seedEvent: answerEvent[stage],
  })
}

/**
 * Typed server-side continuation. Used after a confirmed capability advances the
 * workflow — the frontend calls this instead of fabricating a hidden user
 * message asking the model what to do next.
 */
export async function continueTalkWorkflow(input: {
  userId: string
  conversationId: string
  model: string
  messages?: TalkRuntimeMessage[]
  assistantContext?: AssistantContext
  deps?: TalkWorkflowDeps
}): Promise<TalkWorkflowTurnResult | null> {
  const deps = input.deps ?? defaultTalkWorkflowDeps()
  const record = await deps.store.getActiveByConversation(input.userId, input.conversationId)
  if (!record) return null
  const profile = PLAN_WORK_DEFINITION.activity[record.stage as PlanWorkStage]
  if (!profile || profile.kind === 'waiting') return null

  return driveWorkflow({
    userId: input.userId,
    conversationId: input.conversationId,
    model: input.model,
    messages: input.messages ?? [],
    assistantContext: input.assistantContext,
    deps,
    record,
    resumed: true,
  })
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

async function reconcileExecutedWorkflow(userId: string, action: any, deps: TalkWorkflowDeps) {
  if (!action.workflow_id) return
  const record = await deps.store.getById(userId, action.workflow_id)
  if (!record) return
  if (record.pendingActionId !== action.id) return
  const stage = record.stage as PlanWorkStage
  const state = parseTalkWorkflowState(record) as PlanWorkState

  if (action.capability === 'add_work_task') {
    if (stage !== 'await_task_confirmation') return
    const taskId = z.string().uuid().safeParse(action.result?.task?.id)
    const projectId = z.string().uuid().safeParse(action.args?.projectId)
    if (!taskId.success || !projectId.success) return
    const transitioned = PLAN_WORK_DEFINITION.transition(stage, {
      type: 'task_confirmed',
      taskId: taskId.data,
      projectId: projectId.data,
    })
    if (!transitioned.ok) return
    await deps.store.updateCas(userId, record.id, record.revision, {
      stage: transitioned.stage,
      status: transitioned.status,
      state: PlanWorkStateSchema.parse({
        ...state,
        projectId: projectId.data,
        createdTaskId: taskId.data,
        // The confirmed Task is the verified Task the Focus stage plans from.
        selectedTaskIds: [taskId.data],
      }),
      pendingActionId: null,
      sourceFingerprint: null,
      confirmationState: 'confirmed',
      lastError: null,
    }).catch(() => undefined)
    return
  }

  if (stage !== 'await_focus_confirmation') return
  const focusBlockId = z.string().uuid().safeParse(action.result?.focusBlock?.id ?? action.result?.id)
  const transitioned = PLAN_WORK_DEFINITION.transition(stage, {
    type: 'focus_confirmed',
    focusBlockId: focusBlockId.success ? focusBlockId.data : uuidv4(),
  })
  if (!transitioned.ok) return
  await deps.store.updateCas(userId, record.id, record.revision, {
    stage: transitioned.stage,
    status: transitioned.status,
    state: PlanWorkStateSchema.parse({
      ...state,
      createdFocusBlockId: focusBlockId.success ? focusBlockId.data : state.createdFocusBlockId,
    }),
    pendingActionId: null,
    confirmationState: 'confirmed',
    lastError: null,
  }).catch(() => undefined)
}

export async function confirmTalkWorkflowAction(
  userId: string,
  actionId: string,
  overrides?: unknown,
  deps: TalkWorkflowDeps = defaultTalkWorkflowDeps(),
) {
  const action = await db.getAiPendingAction(actionId)
  if (!action?.workflow_id) return null
  if (action.user_id !== userId) throw new Error('Pending action not found')
  if (action.status === 'executed' && action.result) {
    await reconcileExecutedWorkflow(userId, action, deps)
    return { result: action.result, action: pendingActionToClient(action) }
  }

  const claimed = await db.claimAiPendingAction(actionId, userId)
  if (!claimed) {
    const current = await db.getAiPendingAction(actionId)
    if (current?.status === 'executed' && current.result) {
      await reconcileExecutedWorkflow(userId, current, deps)
      return { result: current.result, action: pendingActionToClient(current) }
    }
    throw new TalkWorkflowUnavailableError('This proposal is unavailable or already being confirmed.')
  }

  const record = await deps.store.getById(userId, claimed.workflow_id)
  if (!record) {
    await db.setAiPendingActionState(actionId, userId, 'stale')
    throw new TalkWorkflowUnavailableError('Talk workflow not found')
  }
  const stage = record.stage as PlanWorkStage
  const state = parseTalkWorkflowState(record) as PlanWorkState
  const expectedStage = claimed.capability === 'add_work_task'
    ? 'await_task_confirmation'
    : 'await_focus_confirmation'
  if (
    stage !== expectedStage
    || record.pendingActionId !== actionId
    || claimed.workflow_revision !== record.revision
  ) {
    await db.setAiPendingActionState(actionId, userId, 'stale')
    throw new TalkProposalStaleError('This proposal is not the current Talk workflow proposal.')
  }

  const editedArgs = overrides && typeof overrides === 'object' && !Array.isArray(overrides)
    ? { ...(claimed.args as Record<string, unknown>), ...(overrides as Record<string, unknown>), requestId: actionId }
    : claimed.args

  const markStale = async (message: string) => {
    await db.setAiPendingActionState(actionId, userId, 'stale')
    const staleEvent: PlanWorkEvent = claimed.capability === 'add_work_task'
      ? { type: 'task_stale', reason: message }
      : { type: 'focus_stale', reason: message }
    const transitioned = PLAN_WORK_DEFINITION.transition(stage, staleEvent)
    if (transitioned.ok) {
      await deps.store.updateCas(userId, record.id, record.revision, {
        stage: transitioned.stage,
        status: transitioned.status,
        pendingActionId: null,
        confirmationState: 'stale',
        lastError: message,
      }).catch(() => undefined)
    }
    throw new TalkProposalStaleError(message)
  }

  if (claimed.capability === 'add_work_task') {
    const storedProjectId = z.string().uuid().parse(claimed.args?.projectId)
    const scope = await deps.work.getScope(userId, storedProjectId)
    if (!projectUsable(scope.project)) {
      await markStale('The selected Project is no longer available for Task creation.')
    }
    if (scope.tasks.some((task) => task.status === 'open')) {
      await markStale('The Project now has an open Task. Plan the Focus block from current scope.')
    }

    const result = await executeAiCapability(
      { userId, caller: 'internal', model: record.model },
      'add_work_task',
      { ...(editedArgs as Record<string, unknown>), projectId: storedProjectId, requestId: actionId },
    )
    if (!result.ok) {
      await db.setAiPendingActionState(actionId, userId, 'presented', { result: { error: result.error } })
      throw new Error(result.error.message)
    }
    const completed = await db.completeAiPendingAction(actionId, userId, result.value)
    if (!completed) throw new TalkWorkflowUnavailableError('The Task confirmation could not be completed.')
    await reconcileExecutedWorkflow(userId, completed, deps)
    return { result: result.value, action: pendingActionToClient(completed) }
  }

  let proposal: TalkFocusProposal
  try {
    proposal = TalkFocusProposalSchema.parse({
      focusMeaning: state.focusMeaning ?? 'focused_minutes',
      projectId: (editedArgs as Record<string, unknown>).projectId,
      taskIds: (editedArgs as Record<string, unknown>).taskIds,
      scheduledDate: (editedArgs as Record<string, unknown>).scheduledDate,
      startTime: (editedArgs as Record<string, unknown>).startTime,
      plannedMinutes: (editedArgs as Record<string, unknown>).plannedMinutes,
      intendedOutcome: (editedArgs as Record<string, unknown>).intendedOutcome,
      intendedEvidence: (editedArgs as Record<string, unknown>).intendedEvidence,
      transitionMinutes: (editedArgs as Record<string, unknown>).transitionMinutes ?? null,
      breakMinutes: (editedArgs as Record<string, unknown>).breakMinutes ?? null,
    })
  } catch (error) {
    await db.setAiPendingActionState(actionId, userId, 'presented')
    throw error
  }
  try {
    const snapshot = await proposalSnapshot(
      userId, proposal, record.timeZone, deps.work, state.alignmentApprovedTaskIds,
    )
    if (snapshot.sourceFingerprint !== claimed.source_fingerprint) {
      throw new TalkProposalStaleError('Tasks, Project context, or the Daily Plan changed. Generate a fresh proposal.')
    }
  } catch (error) {
    if (error instanceof TalkProposalStaleError) await markStale(error.message)
    await db.setAiPendingActionState(actionId, userId, 'presented', {
      result: { error: error instanceof Error ? error.message : 'Revalidation failed' },
    })
    throw error
  }

  const result = await executeAiCapability(
    { userId, caller: 'internal', model: record.model },
    'create_focus_block',
    editedArgs,
  )
  if (!result.ok) {
    await db.setAiPendingActionState(actionId, userId, 'presented', { result: { error: result.error } })
    throw new Error(result.error.message)
  }
  const completed = await db.completeAiPendingAction(actionId, userId, result.value)
  if (!completed) throw new TalkWorkflowUnavailableError('The proposal confirmation could not be completed.')
  await reconcileExecutedWorkflow(userId, completed, deps)
  return { result: result.value, action: pendingActionToClient(completed) }
}

export async function cancelTalkWorkflowAction(
  userId: string,
  actionId: string,
  deps: TalkWorkflowDeps = defaultTalkWorkflowDeps(),
) {
  const action = await db.getAiPendingAction(actionId)
  if (!action?.workflow_id) return null
  if (action.user_id !== userId) throw new Error('Pending action not found')
  const canceled = await db.setAiPendingActionState(actionId, userId, 'declined')
  if (!canceled) throw new TalkWorkflowUnavailableError('This proposal is no longer available.')

  const record = await deps.store.getById(userId, action.workflow_id)
  if (record && record.pendingActionId === actionId) {
    const stage = record.stage as PlanWorkStage
    const declineEvent: PlanWorkEvent | null = stage === 'await_task_confirmation'
      ? { type: 'task_declined' }
      : stage === 'await_focus_confirmation'
        ? { type: 'focus_declined' }
        : null
    if (declineEvent) {
      const transitioned = PLAN_WORK_DEFINITION.transition(stage, declineEvent)
      if (transitioned.ok) {
        await deps.store.updateCas(userId, record.id, record.revision, {
          stage: transitioned.stage,
          status: transitioned.status,
          pendingActionId: null,
          confirmationState: 'declined',
          lastError: null,
        })
      }
    }
  }
  return pendingActionToClient(canceled)
}
