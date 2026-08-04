import { createHash } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { executeAiCapability, preparePendingAiAction } from './ai-capabilities'
import { Credits, UnpricedModelError } from './credits'
import { buildDaySummary, validateDailyPlacement } from './day-summary'
import { db } from './supabase-client'
import {
  defaultTalkAgentRuntime,
  selectTalkInstructionPacks,
  TALK_AGENT_MAX_TOKENS,
  TALK_AGENT_MAX_TURNS,
  TALK_RUNTIME_VERSION,
  TalkAgentDecisionSchema,
  TalkFocusMeaningSchema,
  TalkWorkflowStageSchema,
  type TalkAgentRuntime,
  type TalkRuntimeMessage,
} from './talk-agent-runtime'
import { Work } from './work'

export const TalkWorkflowNameSchema = z.literal('plan_focused_work')

export const TalkFocusProposalSchema = z.object({
  focusMeaning: TalkFocusMeaningSchema,
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

export const TalkWorkflowSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  name: TalkWorkflowNameSchema,
  stage: TalkWorkflowStageSchema,
  anchorDate: z.string().date(),
  timeZone: z.string(),
  focusMeaning: TalkFocusMeaningSchema.nullable(),
  selectedProjectId: z.string().uuid().nullable(),
  selectedTaskIds: z.array(z.string().uuid()),
  pendingActionId: z.string().uuid().nullable(),
  pendingProposal: TalkFocusProposalSchema.nullable(),
  confirmationState: z.enum(['none', 'presented', 'confirmed', 'declined', 'stale']),
  runtimeVersion: z.string(),
  instructionVersions: z.array(z.string()),
  model: z.string(),
  revision: z.number().int().positive(),
  lastError: z.string().nullable(),
  updatedAt: z.string(),
})
export type TalkWorkflow = z.infer<typeof TalkWorkflowSchema>

export type TalkPendingAction = {
  id: string
  capability: string
  args: Record<string, unknown>
  preview: unknown
  expiresAt: string
  workflowId?: string
}

export type TalkWorkflowTurnResult = {
  message: string
  toolEvents: Array<{ name: string; args: unknown; result: unknown }>
  pendingActions: TalkPendingAction[]
  workflow: TalkWorkflow
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

function rowToWorkflow(row: any): TalkWorkflow {
  return TalkWorkflowSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    name: row.name,
    stage: row.stage,
    anchorDate: row.anchor_date,
    timeZone: row.time_zone,
    focusMeaning: row.focus_meaning ?? null,
    selectedProjectId: row.selected_project_id ?? null,
    selectedTaskIds: row.selected_task_ids ?? [],
    pendingActionId: row.pending_action_id ?? null,
    pendingProposal: row.pending_proposal ?? null,
    confirmationState: row.confirmation_state ?? 'none',
    runtimeVersion: row.runtime_version,
    instructionVersions: row.instruction_versions ?? [],
    model: row.model,
    revision: row.revision,
    lastError: row.last_error ?? null,
    updatedAt: row.updated_at,
  })
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

function databaseCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : ''
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

async function proposalSnapshot(userId: string, proposal: TalkFocusProposal, timeZone: string) {
  const [scope, day] = await Promise.all([
    Work.getScope(userId, proposal.projectId),
    buildDaySummary(userId, proposal.scheduledDate, timeZone),
  ])
  if (
    !scope.project
    || scope.project.isArchived
    || scope.project.status === 'Paused'
    || scope.project.status === 'Done'
  ) {
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
  const aligned = new Set(['Direct progress', 'Unblocking', 'Maintenance'])
  if (selectedTasks.some((task) => !task.relation || !aligned.has(task.relation))) {
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

async function createWorkflow(input: {
  userId: string
  conversationId: string
  anchorDate: string
  timeZone: string
  model: string
}) {
  const instructionVersions = selectTalkInstructionPacks('interpreting', false)
    .map((pack) => `${pack.name}@${pack.version}`)
  try {
    return await db.createTalkWorkflow({
      id: uuidv4(),
      user_id: input.userId,
      conversation_id: input.conversationId,
      name: 'plan_focused_work',
      stage: 'interpreting',
      anchor_date: input.anchorDate,
      time_zone: input.timeZone,
      focus_meaning: null,
      selected_project_id: null,
      selected_task_ids: [],
      pending_action_id: null,
      pending_proposal: null,
      source_fingerprint: null,
      confirmation_state: 'none',
      runtime_version: TALK_RUNTIME_VERSION,
      instruction_versions: instructionVersions,
      model: input.model,
      revision: 1,
    })
  } catch (error) {
    if (databaseCode(error) === '23505') {
      const existing = await db.getTalkWorkflowByConversation(input.userId, input.conversationId)
      if (existing) return existing
    }
    throw error
  }
}

async function casWorkflow(
  userId: string,
  workflow: TalkWorkflow,
  updates: Record<string, unknown>,
) {
  const row = await db.updateTalkWorkflowCas(userId, workflow.id, workflow.revision, updates)
  if (!row) throw new TalkWorkflowConflictError('This Talk workflow changed in another request. Retry the turn.')
  return rowToWorkflow(row)
}

async function reserveAgentRun(input: {
  userId: string
  model: string
  stage: z.infer<typeof TalkWorkflowStageSchema>
  resumed: boolean
  messages: TalkRuntimeMessage[]
}) {
  const systemPrompt = selectTalkInstructionPacks(input.stage, input.resumed)
    .map((pack) => pack.instructions)
    .join('\n\n')
  try {
    const reservedTokens = await Credits.estimateReserve({
      model: input.model,
      systemPrompt,
      userPrompt: JSON.stringify(input.messages.slice(-12)),
      maxOutputTokens: TALK_AGENT_MAX_TOKENS * TALK_AGENT_MAX_TURNS,
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

export async function getTalkWorkflow(userId: string, conversationId: string) {
  const row = await db.getTalkWorkflowByConversation(userId, conversationId)
  return row ? rowToWorkflow(row) : null
}

export async function runTalkWorkflowTurn(input: {
  userId: string
  conversationId: string
  anchorDate: string
  timeZone: string
  model: string
  messages: TalkRuntimeMessage[]
  runtime?: TalkAgentRuntime
}): Promise<TalkWorkflowTurnResult> {
  let row = await db.getTalkWorkflowByConversation(input.userId, input.conversationId)
  const resumed = Boolean(row)
  if (!row) row = await createWorkflow(input)
  const workflow = rowToWorkflow(row)

  if (workflow.stage === 'awaiting_confirmation' && workflow.pendingActionId) {
    const action = await db.getAiPendingAction(workflow.pendingActionId)
    if (action && !action.executed_at && !action.canceled_at) {
      return {
        message: 'Review the current Focus block preview, then Confirm or Cancel it before requesting another proposal.',
        toolEvents: [],
        pendingActions: [pendingActionToClient(action)],
        workflow,
      }
    }
  }
  if (workflow.stage === 'applied') {
    return { message: 'This focused-work workflow is complete.', toolEvents: [], pendingActions: [], workflow }
  }
  if (workflow.stage === 'declined') {
    return { message: 'That Focus block proposal was declined. Start a new planning chat when you want another one.', toolEvents: [], pendingActions: [], workflow }
  }

  const claimed = await casWorkflow(input.userId, workflow, {
    stage: 'gathering_context',
    model: input.model,
    last_error: null,
  })
  let reservedTokens: number
  try {
    reservedTokens = await reserveAgentRun({
      userId: input.userId,
      model: input.model,
      stage: workflow.stage,
      resumed,
      messages: input.messages,
    })
  } catch (error) {
    await casWorkflow(input.userId, claimed, {
      stage: 'failed',
      last_error: error instanceof Error ? error.message.slice(0, 1000) : 'Talk billing failed',
    }).catch(() => undefined)
    throw error
  }
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  let runtimeResult
  try {
    runtimeResult = await (input.runtime ?? defaultTalkAgentRuntime).run({
      userId: input.userId,
      conversationId: input.conversationId,
      model: input.model,
      stage: workflow.stage,
      anchorDate: workflow.anchorDate,
      timeZone: workflow.timeZone,
      focusMeaning: workflow.focusMeaning,
      selectedProjectId: workflow.selectedProjectId,
      selectedTaskIds: workflow.selectedTaskIds,
      messages: input.messages,
      resumed,
    })
    usage = runtimeResult.usage
  } catch (error) {
    await casWorkflow(input.userId, claimed, {
      stage: 'failed',
      last_error: error instanceof Error ? error.message.slice(0, 1000) : 'Talk runtime failed',
    }).catch(() => undefined)
    throw error
  } finally {
    await Credits.settleReserved(input.userId, reservedTokens, usage, {
      endpoint: 'talk-phase-5',
      model: input.model,
    })
  }

  let decision: z.infer<typeof TalkAgentDecisionSchema>
  try {
    decision = TalkAgentDecisionSchema.parse(runtimeResult.decision)
  } catch (error) {
    await casWorkflow(input.userId, claimed, {
      stage: 'failed',
      last_error: 'Talk runtime returned an invalid structured decision',
    }).catch(() => undefined)
    throw error
  }
  if (decision.kind === 'ask') {
    const next = await casWorkflow(input.userId, claimed, {
      stage: 'clarifying',
      focus_meaning: decision.focusMeaning ?? workflow.focusMeaning,
      runtime_version: runtimeResult.runtimeVersion,
      instruction_versions: runtimeResult.instructionVersions,
      last_error: null,
    })
    return {
      message: decision.question ?? decision.message,
      toolEvents: runtimeResult.toolEvents,
      pendingActions: [],
      workflow: next,
    }
  }

  if (decision.kind === 'blocked') {
    const next = await casWorkflow(input.userId, claimed, {
      stage: 'clarifying',
      focus_meaning: decision.focusMeaning ?? workflow.focusMeaning,
      runtime_version: runtimeResult.runtimeVersion,
      instruction_versions: runtimeResult.instructionVersions,
      last_error: decision.reasonCodes.join(', ') || null,
    })
    return {
      message: decision.message,
      toolEvents: runtimeResult.toolEvents,
      pendingActions: [],
      workflow: next,
    }
  }

  let proposal: TalkFocusProposal
  try {
    proposal = TalkFocusProposalSchema.parse({
      focusMeaning: decision.focusMeaning,
      projectId: decision.projectId,
      taskIds: decision.taskIds,
      scheduledDate: decision.scheduledDate,
      startTime: decision.startTime,
      plannedMinutes: decision.plannedMinutes,
      intendedOutcome: decision.intendedOutcome,
      intendedEvidence: decision.intendedEvidence,
      transitionMinutes: decision.transitionMinutes,
      breakMinutes: decision.breakMinutes,
    })
  } catch (error) {
    await casWorkflow(input.userId, claimed, {
      stage: 'failed',
      last_error: 'Talk proposal violated its structured contract',
    }).catch(() => undefined)
    throw error
  }
  if (proposal.scheduledDate !== workflow.anchorDate) {
    const message = 'The proposal date does not match the workflow anchor date.'
    const next = await casWorkflow(input.userId, claimed, {
      stage: 'clarifying',
      last_error: message,
    })
    return {
      message,
      toolEvents: runtimeResult.toolEvents,
      pendingActions: [],
      workflow: next,
    }
  }

  let sourceFingerprint: string
  try {
    sourceFingerprint = (await proposalSnapshot(input.userId, proposal, workflow.timeZone)).sourceFingerprint
  } catch (error) {
    if (!(error instanceof TalkProposalStaleError)) throw error
    const next = await casWorkflow(input.userId, claimed, {
      stage: 'clarifying',
      runtime_version: runtimeResult.runtimeVersion,
      instruction_versions: runtimeResult.instructionVersions,
      last_error: error.message,
    })
    return {
      message: error.message,
      toolEvents: runtimeResult.toolEvents,
      pendingActions: [],
      workflow: next,
    }
  }

  const actionId = uuidv4()
  const { focusMeaning: _focusMeaning, ...createInput } = proposal
  const pendingAction = await preparePendingAiAction(
    { userId: input.userId, caller: 'internal', model: input.model },
    'create_focus_block',
    { ...createInput, requestId: actionId },
    {
      id: actionId,
      workflowId: workflow.id,
      workflowRevision: claimed.revision + 1,
      sourceFingerprint,
      expiresInMs: 30 * 60 * 1000,
    },
  )

  let next: TalkWorkflow
  try {
    next = await casWorkflow(input.userId, claimed, {
      stage: 'awaiting_confirmation',
      focus_meaning: proposal.focusMeaning,
      selected_project_id: proposal.projectId,
      selected_task_ids: proposal.taskIds,
      pending_action_id: actionId,
      pending_proposal: proposal,
      source_fingerprint: sourceFingerprint,
      confirmation_state: 'presented',
      runtime_version: runtimeResult.runtimeVersion,
      instruction_versions: runtimeResult.instructionVersions,
      last_error: null,
    })
  } catch (error) {
    await db.setAiPendingActionState(actionId, input.userId, 'failed')
    throw error
  }

  return {
    message: decision.message,
    toolEvents: runtimeResult.toolEvents,
    pendingActions: [pendingAction],
    workflow: next,
  }
}

async function reconcileExecutedWorkflow(userId: string, action: any) {
  if (!action.workflow_id) return
  const workflowRow = await db.getTalkWorkflowById(userId, action.workflow_id)
  if (!workflowRow) return
  const workflow = rowToWorkflow(workflowRow)
  if (workflow.pendingActionId !== action.id || workflow.stage === 'applied') return
  if (workflow.stage !== 'awaiting_confirmation') return
  await casWorkflow(userId, workflow, {
    stage: 'applied',
    confirmation_state: 'confirmed',
    last_error: null,
  }).catch(() => undefined)
}

export async function confirmTalkWorkflowAction(userId: string, actionId: string, overrides?: unknown) {
  const action = await db.getAiPendingAction(actionId)
  if (!action?.workflow_id) return null
  if (action.user_id !== userId) throw new Error('Pending action not found')
  if (action.status === 'executed' && action.result) {
    await reconcileExecutedWorkflow(userId, action)
    return { result: action.result, action: pendingActionToClient(action) }
  }

  const claimed = await db.claimAiPendingAction(actionId, userId)
  if (!claimed) {
    const current = await db.getAiPendingAction(actionId)
    if (current?.status === 'executed' && current.result) {
      await reconcileExecutedWorkflow(userId, current)
      return { result: current.result, action: pendingActionToClient(current) }
    }
    throw new TalkWorkflowUnavailableError('This Focus block proposal is unavailable or already being confirmed.')
  }

  const workflowRow = await db.getTalkWorkflowById(userId, claimed.workflow_id)
  if (!workflowRow) {
    await db.setAiPendingActionState(actionId, userId, 'stale')
    throw new TalkWorkflowUnavailableError('Talk workflow not found')
  }
  const workflow = rowToWorkflow(workflowRow)
  if (
    workflow.stage !== 'awaiting_confirmation'
    || workflow.pendingActionId !== actionId
    || claimed.workflow_revision !== workflow.revision
  ) {
    await db.setAiPendingActionState(actionId, userId, 'stale')
    throw new TalkProposalStaleError('This proposal is not the current Talk workflow proposal.')
  }

  const editedArgs = overrides && typeof overrides === 'object' && !Array.isArray(overrides)
    ? {
        ...(claimed.args as Record<string, unknown>),
        ...(overrides as Record<string, unknown>),
        requestId: actionId,
      }
    : claimed.args
  let proposal: TalkFocusProposal
  try {
    const storedProposal = TalkFocusProposalSchema.parse(workflow.pendingProposal)
    proposal = TalkFocusProposalSchema.parse({
      focusMeaning: storedProposal.focusMeaning,
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
    const snapshot = await proposalSnapshot(userId, proposal, workflow.timeZone)
    if (snapshot.sourceFingerprint !== claimed.source_fingerprint) {
      throw new TalkProposalStaleError('Tasks, Project context, or the Daily Plan changed. Generate a fresh proposal.')
    }
  } catch (error) {
    if (error instanceof TalkProposalStaleError) {
      await db.setAiPendingActionState(actionId, userId, 'stale')
      await casWorkflow(userId, workflow, {
        stage: 'stale',
        confirmation_state: 'stale',
        last_error: error.message,
      }).catch(() => undefined)
      throw error
    }
    await db.setAiPendingActionState(actionId, userId, 'presented', {
      result: { error: error instanceof Error ? error.message : 'Revalidation failed' },
    })
    throw error
  }

  const result = await executeAiCapability(
    { userId, caller: 'internal', model: workflow.model },
    'create_focus_block',
    editedArgs,
  )
  if (!result.ok) {
    await db.setAiPendingActionState(actionId, userId, 'presented', {
      result: { error: result.error },
    })
    throw new Error(result.error.message)
  }

  const completed = await db.completeAiPendingAction(actionId, userId, result.value)
  if (!completed) throw new TalkWorkflowUnavailableError('The proposal confirmation could not be completed.')
  await reconcileExecutedWorkflow(userId, completed)
  return { result: result.value, action: pendingActionToClient(completed) }
}

export async function cancelTalkWorkflowAction(userId: string, actionId: string) {
  const action = await db.getAiPendingAction(actionId)
  if (!action?.workflow_id) return null
  if (action.user_id !== userId) throw new Error('Pending action not found')
  const canceled = await db.setAiPendingActionState(actionId, userId, 'declined')
  if (!canceled) throw new TalkWorkflowUnavailableError('This Focus block proposal is no longer available.')
  const workflowRow = await db.getTalkWorkflowById(userId, action.workflow_id)
  if (workflowRow) {
    const workflow = rowToWorkflow(workflowRow)
    if (workflow.pendingActionId === actionId && workflow.stage === 'awaiting_confirmation') {
      await casWorkflow(userId, workflow, {
        stage: 'declined',
        confirmation_state: 'declined',
        last_error: null,
      })
    }
  }
  return pendingActionToClient(canceled)
}
