jest.mock('../../src/supabase-client', () => ({
  db: {
    createAiPendingAction: jest.fn(),
    getAiPendingAction: jest.fn(),
    claimAiPendingAction: jest.fn(),
    completeAiPendingAction: jest.fn(),
    setAiPendingActionState: jest.fn(),
    getAiIdempotency: jest.fn(),
    createAiIdempotency: jest.fn(),
    createAiAuditLog: jest.fn(),
  },
}))

jest.mock('../../src/credits', () => ({
  Credits: {
    estimateReserve: jest.fn().mockResolvedValue(20),
    reserve: jest.fn().mockResolvedValue(true),
    settleReserved: jest.fn().mockResolvedValue({ ok: true, chargeTokens: 8, adjustmentTokens: 12 }),
  },
  UnpricedModelError: class UnpricedModelError extends Error {},
}))

jest.mock('../../src/day-summary', () => ({
  buildDaySummary: jest.fn(),
  validateDailyPlacement: jest.fn(),
}))

// Mocked at module level so the capability preview path resolves the same Work
// scope the workflow does, without reaching Supabase.
jest.mock('../../src/work', () => ({
  Work: { getScope: jest.fn(), createFocusBlock: jest.fn() },
}))

import { executeAiCapability } from '../../src/ai-capabilities'
import { buildDaySummary, validateDailyPlacement } from '../../src/day-summary'
import { db } from '../../src/supabase-client'
import { TalkStageRunError, type TalkStageRunResult, type TalkStageRuntime } from '../../src/talk-agent-runtime'
import { PLAN_WORK_DEFINITION } from '../../src/talk-workflow-definitions'
import { createInMemoryTalkWorkflowStore } from '../../src/talk-workflow-store'
import { Work } from '../../src/work'
import {
  cancelTalkWorkflowAction,
  confirmTalkWorkflowAction,
  continueTalkWorkflow,
  runTalkWorkflowTurn,
  TalkProposalStaleError,
  type TalkWorkflowDeps,
} from '../../src/talk-workflow'

jest.mock('../../src/ai-capabilities', () => {
  const actual = jest.requireActual('../../src/ai-capabilities')
  return { ...actual, executeAiCapability: jest.fn() }
})

const USER_ID = '10000000-0000-4000-8000-000000000001'
const CONVERSATION_ID = '20000000-0000-4000-8000-000000000002'
const PROJECT_ID = '40000000-0000-4000-8000-000000000004'
const TASK_ID = '50000000-0000-4000-8000-000000000005'
const NEW_TASK_ID = '70000000-0000-4000-8000-000000000007'
const FOCUS_BLOCK_ID = '60000000-0000-4000-8000-000000000006'
const NOW = '2026-08-03T12:00:00.000Z'
const ANCHOR = '2026-08-03'

let pendingRows: Map<string, any>

const project = (overrides: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  name: 'HealthyFlow',
  isArchived: false,
  status: 'Active',
  target: 'Ship Phase 6',
  milestone: 'Safe Talk orchestration',
  definitionOfDone: null,
  deadline: null,
  context: { summary: '', blockers: [], constraints: [], nonGoals: [], decisions: [], links: [], nextStep: '' },
  createdAt: NOW,
  ...overrides,
})

const openTask = (overrides: Record<string, unknown> = {}) => ({
  id: TASK_ID,
  title: 'Finish the Talk tracer',
  status: 'open',
  relation: 'Direct progress',
  scheduledDate: ANCHOR,
  duration: 90,
  ...overrides,
})

const scope = (overrides: Record<string, unknown> = {}) => ({
  project: project(),
  tasks: [openTask()],
  focusBlocks: [],
  sessions: [],
  ...overrides,
})

const daySummary = () => ({
  items: [],
  calendar: { status: 'connected_empty', reasonCode: null, events: [] },
  work: { status: 'available', focusBlocks: [] },
  capacity: {
    status: 'complete',
    window: {
      configuredStartTime: '08:00',
      configuredEndTime: '18:00',
      consideredStartTime: '08:00',
      consideredEndTime: '18:00',
      transitionBufferMinutes: 10,
    },
    basis: { planningWindowMinutes: 600, occupiedMinutes: 0, transitionMinutes: 0 },
    availableMinutes: 600,
    reasonCodes: [],
  },
})

const focusDraft = () => ({
  kind: 'focus_draft' as const,
  message: 'I prepared one Focus block. Review it before applying.',
  question: null,
  focusMeaning: 'focused_minutes' as const,
  startTime: '14:00',
  plannedMinutes: 90,
  intendedOutcome: 'Complete the durable Talk tracer',
  intendedEvidence: 'Green workflow and safety evals',
  transitionMinutes: 10,
  breakMinutes: 15,
  reasonCodes: [],
})

const taskDraft = () => ({
  kind: 'task_draft' as const,
  message: 'This Project has no open Tasks, so I prepared one concrete next Task.',
  question: null,
  task: {
    title: 'Implement the first Phase 6 planning slice',
    relation: 'Direct progress' as const,
    duration: 90,
    scheduledDate: ANCHOR,
  },
  reasonCodes: [],
})

const stageResult = (output: unknown, contract: string, toolNames: string[] = []): TalkStageRunResult => ({
  output,
  outputContract: contract,
  toolEvents: toolNames.map((name) => ({ name, args: {}, result: { ok: true } })),
  usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
  runtimeVersion: 'fake-runtime/v1',
  instructionVersions: ['healthyflow-talk@1.1.0'],
  toolNames,
})

/** Records what each stage was actually given, so tool leakage is observable. */
function fakeRuntime(queue: Array<TalkStageRunResult | Error>): TalkStageRuntime & {
  run: jest.Mock
  stages: string[]
} {
  const stages: string[] = []
  const run = jest.fn(async (input: any) => {
    stages.push(input.stage)
    const next = queue.shift()
    if (!next) throw new Error(`No fake stage result queued for ${input.stage}`)
    if (next instanceof Error) throw next
    return next
  })
  return { run, stages } as any
}

const getScope = Work.getScope as jest.Mock

function deps(overrides: Partial<TalkWorkflowDeps> = {}): TalkWorkflowDeps {
  return {
    store: createInMemoryTalkWorkflowStore([], () => NOW),
    runtime: fakeRuntime([]),
    work: Work as any,
    now: () => new Date(NOW),
    ...overrides,
  }
}

const turn = (d: TalkWorkflowDeps, messages = [{ role: 'user' as const, content: 'plan two focused hours' }]) =>
  runTalkWorkflowTurn({
    userId: USER_ID,
    conversationId: CONVERSATION_ID,
    anchorDate: ANCHOR,
    timeZone: 'Asia/Jerusalem',
    model: 'gpt-4o-mini',
    messages,
    projectId: PROJECT_ID,
    deps: d,
  })

beforeEach(() => {
  jest.clearAllMocks()
  pendingRows = new Map()
  ;(buildDaySummary as jest.Mock).mockResolvedValue(daySummary())
  ;(validateDailyPlacement as jest.Mock).mockResolvedValue({ status: 'valid', reasons: [] })
  ;(db.createAiPendingAction as jest.Mock).mockImplementation(async (row) => {
    const action = {
      ...row,
      status: 'presented',
      executed_at: null,
      canceled_at: null,
      result: null,
      created_at: NOW,
      updated_at: NOW,
    }
    pendingRows.set(action.id, action)
    return action
  })
  ;(db.getAiPendingAction as jest.Mock).mockImplementation(async (id) => pendingRows.get(id) ?? null)
  ;(db.claimAiPendingAction as jest.Mock).mockImplementation(async (id) => {
    const action = pendingRows.get(id)
    if (!action || action.status !== 'presented') return null
    action.status = 'executing'
    return action
  })
  ;(db.completeAiPendingAction as jest.Mock).mockImplementation(async (id, _u, result) => {
    const action = pendingRows.get(id)
    if (!action || action.status !== 'executing') return null
    Object.assign(action, { status: 'executed', result, executed_at: NOW })
    return action
  })
  ;(db.setAiPendingActionState as jest.Mock).mockImplementation(async (id, _u, status, updates = {}) => {
    const action = pendingRows.get(id)
    if (!action) return null
    Object.assign(action, updates, { status })
    if (status === 'declined') action.canceled_at = NOW
    return action
  })
  getScope.mockResolvedValue(scope())
  ;(db.getAiIdempotency as jest.Mock).mockResolvedValue(null)
  ;(db.createAiIdempotency as jest.Mock).mockResolvedValue({ id: 'idem-1' })
  ;(db.createAiAuditLog as jest.Mock).mockResolvedValue({ id: 'audit-1' })
})

describe('plan_work: aligned open Task', () => {
  it('resolves Project and scope in application code and goes straight to Focus planning', async () => {
    const runtime = fakeRuntime([
      stageResult(focusDraft(), 'plan_work.focus_draft', ['validate_daily_plan']),
    ])
    const d = deps({ runtime })
    const result = await turn(d)

    // No model turn was spent listing Projects or reading Work scope.
    expect(runtime.stages).toEqual(['draft_focus_block'])
    expect(result.trace.map((entry) => `${entry.stage}:${entry.event}`)).toEqual([
      'resolve_project:project_selected',
      'resolve_scope:scope_aligned_tasks',
      'draft_focus_block:focus_drafted',
    ])
    expect(result.workflow.stage).toBe('await_focus_confirmation')
    expect(result.workflow.status).toBe('active')
    expect(result.pendingActions).toHaveLength(1)
    expect(result.pendingActions[0].capability).toBe('create_focus_block')
  })

  it('supplies the verified Project, Tasks, and anchor date rather than trusting the model', async () => {
    const runtime = fakeRuntime([stageResult(focusDraft(), 'plan_work.focus_draft')])
    const result = await turn(deps({ runtime }))
    expect(result.pendingActions[0].args).toMatchObject({
      projectId: PROJECT_ID,
      taskIds: [TASK_ID],
      scheduledDate: ANCHOR,
      startTime: '14:00',
    })
    // The Focus stage was told which Tasks are already verified.
    expect(runtime.run.mock.calls[0][0].stageContext.verifiedTaskIds).toEqual([TASK_ID])
  })
})

describe('plan_work: Project with no open Tasks', () => {
  const emptyScope = () => scope({ tasks: [] })

  it('drafts one Task without exposing Daily Plan tools', async () => {
    const runtime = fakeRuntime([stageResult(taskDraft(), 'plan_work.task_draft')])
    getScope.mockResolvedValue(emptyScope())
    const d = deps({ runtime })
    const result = await turn(d)

    expect(runtime.stages).toEqual(['draft_task'])
    expect(result.trace.map((entry) => entry.event)).toEqual([
      'project_selected', 'scope_empty_with_direction', 'task_drafted',
    ])
    expect(result.workflow.stage).toBe('await_task_confirmation')
    expect(result.pendingActions[0].capability).toBe('add_work_task')
    // The stage profile, not the prompt, is what withholds the tools.
    expect(PLAN_WORK_DEFINITION.activity.draft_task).toMatchObject({ kind: 'agent', tools: [] })
  })

  it('asks one question instead of inventing a Task when direction is missing, without a model call', async () => {
    const runtime = fakeRuntime([])
    const bare = scope({
      project: project({ target: '', milestone: '', definitionOfDone: null }),
      tasks: [],
    })
    getScope.mockResolvedValue(bare)
    const d = deps({ runtime })
    const result = await turn(d)

    expect(runtime.run).not.toHaveBeenCalled()
    expect(result.workflow.stage).toBe('clarify_direction')
    expect(result.message).toContain('outcome or next step')
    expect(result.pendingActions).toHaveLength(0)
  })

  it('creates the confirmed Task exactly once and continues server-side into Focus planning', async () => {
    const runtime = fakeRuntime([
      stageResult(taskDraft(), 'plan_work.task_draft'),
      stageResult(focusDraft(), 'plan_work.focus_draft', ['validate_daily_plan']),
    ])
    getScope.mockResolvedValue(emptyScope())
    const d = deps({ runtime })
    const first = await turn(d)
    const actionId = first.pendingActions[0].id

    ;(executeAiCapability as jest.Mock).mockResolvedValue({
      ok: true,
      value: { task: { id: NEW_TASK_ID, title: 'Implement the first Phase 6 planning slice' } },
    })
    const confirmed = await confirmTalkWorkflowAction(USER_ID, actionId, undefined, d)
    expect(confirmed?.result).toMatchObject({ task: { id: NEW_TASK_ID } })
    expect(executeAiCapability).toHaveBeenCalledTimes(1)

    const after = await d.store.getActiveByConversation(USER_ID, CONVERSATION_ID)
    expect(after).toMatchObject({ stage: 'draft_focus_block', status: 'active', confirmationState: 'confirmed' })
    expect(after!.state).toMatchObject({ createdTaskId: NEW_TASK_ID, selectedTaskIds: [NEW_TASK_ID] })

    // Continuation is a typed application event, not a hidden user message.
    getScope.mockResolvedValue(scope({ tasks: [openTask({ id: NEW_TASK_ID })] }))
    const continued = await continueTalkWorkflow({
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      model: 'gpt-4o-mini',
      deps: d,
    })
    expect(continued!.trace.map((e) => `${e.stage}:${e.event}`)).toEqual([
      'draft_focus_block:focus_drafted',
    ])
    expect(continued!.pendingActions[0].capability).toBe('create_focus_block')
    expect(continued!.pendingActions[0].args).toMatchObject({ taskIds: [NEW_TASK_ID] })
    expect(runtime.stages).toEqual(['draft_task', 'draft_focus_block'])
  })

  it('returns the same result on a repeated confirmation without writing twice', async () => {
    const runtime = fakeRuntime([stageResult(taskDraft(), 'plan_work.task_draft')])
    getScope.mockResolvedValue(emptyScope())
    const d = deps({ runtime })
    const first = await turn(d)
    const actionId = first.pendingActions[0].id
    ;(executeAiCapability as jest.Mock).mockResolvedValue({
      ok: true,
      value: { task: { id: NEW_TASK_ID, title: 'Implement the first Phase 6 planning slice' } },
    })

    await confirmTalkWorkflowAction(USER_ID, actionId, undefined, d)
    const again = await confirmTalkWorkflowAction(USER_ID, actionId, undefined, d)
    expect(again?.result).toMatchObject({ task: { id: NEW_TASK_ID } })
    expect(executeAiCapability).toHaveBeenCalledTimes(1)
  })

  it('refuses a stale Task write and returns to drafting', async () => {
    const runtime = fakeRuntime([stageResult(taskDraft(), 'plan_work.task_draft')])
    getScope.mockResolvedValue(emptyScope())
    const d = deps({ runtime })
    const first = await turn(d)
    const actionId = first.pendingActions[0].id

    // Someone added an open Task between preview and confirmation.
    getScope.mockResolvedValue(scope())
    await expect(confirmTalkWorkflowAction(USER_ID, actionId, undefined, d))
      .rejects.toThrow(TalkProposalStaleError)
    expect(executeAiCapability).not.toHaveBeenCalled()

    const after = await d.store.getActiveByConversation(USER_ID, CONVERSATION_ID)
    expect(after).toMatchObject({ stage: 'draft_task', status: 'active', confirmationState: 'stale' })
  })
})

describe('plan_work: alignment review', () => {
  it('routes open-but-unaligned Tasks to review_alignment rather than guessing', async () => {
    const runtime = fakeRuntime([
      stageResult(
        { kind: 'alignment', message: 'This Task serves the target.', question: null, taskIds: [TASK_ID], reasonCodes: [] },
        'plan_work.alignment_decision',
        ['review_task_alignment'],
      ),
      stageResult(focusDraft(), 'plan_work.focus_draft'),
    ])
    // Unrecorded relation is the genuinely unclear case the stage exists for.
    const unclear = scope({ tasks: [openTask({ relation: null })] })
    getScope.mockResolvedValue(unclear)
    const d = deps({ runtime })
    const result = await turn(d)

    expect(runtime.stages).toEqual(['review_alignment', 'draft_focus_block'])
    expect(result.trace.map((e) => e.event)).toEqual([
      'project_selected', 'scope_alignment_unclear', 'alignment_resolved', 'focus_drafted',
    ])
  })

  it('rejects a selection that is not one of the loaded open Tasks', async () => {
    const runtime = fakeRuntime([
      stageResult(
        { kind: 'alignment', message: 'ok', question: null, taskIds: ['99999999-9999-4999-8999-999999999999'], reasonCodes: [] },
        'plan_work.alignment_decision',
      ),
    ])
    getScope.mockResolvedValue(scope({ tasks: [openTask({ relation: null })] }))
    const d = deps({ runtime })
    const result = await turn(d)
    expect(result.workflow.status).toBe('failed')
    expect(result.trace.at(-1)?.event).toBe('stage_blocked')
  })
})

describe('plan_work: explicitly unaligned Tasks', () => {
  it('will not let the model overturn a recorded Unrelated relation', async () => {
    const runtime = fakeRuntime([])
    getScope.mockResolvedValue(scope({ tasks: [openTask({ relation: 'Unrelated' })] }))
    const result = await turn(deps({ runtime }))
    expect(runtime.run).not.toHaveBeenCalled()
    expect(result.workflow.status).toBe('failed')
    expect(result.trace.at(-1)).toMatchObject({ stage: 'resolve_scope', event: 'stage_blocked' })
  })
})

describe('plan_work: Focus confirmation', () => {
  const presentFocus = async () => {
    const runtime = fakeRuntime([stageResult(focusDraft(), 'plan_work.focus_draft')])
    const d = deps({ runtime })
    const first = await turn(d)
    return { d, actionId: first.pendingActions[0].id }
  }

  it('applies a confirmed Focus block exactly once and completes the workflow', async () => {
    const { d, actionId } = await presentFocus()
    ;(executeAiCapability as jest.Mock).mockResolvedValue({
      ok: true,
      value: { focusBlock: { id: FOCUS_BLOCK_ID } },
    })
    await confirmTalkWorkflowAction(USER_ID, actionId, undefined, d)
    await confirmTalkWorkflowAction(USER_ID, actionId, undefined, d)
    expect(executeAiCapability).toHaveBeenCalledTimes(1)

    const all = d.store.getById(USER_ID, (await d.store.listByConversation(USER_ID, CONVERSATION_ID))[0].id)
    expect(await all).toMatchObject({
      stage: 'await_focus_confirmation',
      status: 'completed',
      confirmationState: 'confirmed',
    })
    // The conversation is free to start a new workflow now.
    expect(await d.store.getActiveByConversation(USER_ID, CONVERSATION_ID)).toBeNull()
  })

  it('refuses a stale Focus proposal and returns to Focus drafting', async () => {
    const { d, actionId } = await presentFocus()
    ;(validateDailyPlacement as jest.Mock).mockResolvedValue({ status: 'conflict', reasons: ['overlap'] })
    await expect(confirmTalkWorkflowAction(USER_ID, actionId, undefined, d))
      .rejects.toThrow(TalkProposalStaleError)
    expect(executeAiCapability).not.toHaveBeenCalled()
    expect(await d.store.getActiveByConversation(USER_ID, CONVERSATION_ID))
      .toMatchObject({ stage: 'draft_focus_block', confirmationState: 'stale' })
  })

  it('records a decline without writing', async () => {
    const { d, actionId } = await presentFocus()
    await cancelTalkWorkflowAction(USER_ID, actionId, d)
    expect(executeAiCapability).not.toHaveBeenCalled()
    const history = await d.store.listByConversation(USER_ID, CONVERSATION_ID)
    expect(history[0]).toMatchObject({ status: 'declined', confirmationState: 'declined' })
  })

  it('holds the workflow at the preview instead of drafting another proposal', async () => {
    const { d } = await presentFocus()
    const second = await turn(d)
    expect(second.message).toContain('Confirm or Cancel')
    expect(second.pendingActions).toHaveLength(1)
    expect(second.trace).toHaveLength(0)
  })
})

describe('plan_work: stage failures', () => {
  it('preserves the completed tool sequence when a stage exceeds its budget', async () => {
    const failure = new TalkStageRunError('Max turns (6) exceeded', {
      workflowName: 'plan_work',
      stage: 'draft_focus_block',
      toolEvents: [
        { name: 'validate_daily_plan', args: {}, result: { ok: true } },
        { name: 'validate_daily_plan', args: {}, result: { ok: true } },
      ],
    })
    const runtime = fakeRuntime([failure])
    const d = deps({ runtime })
    const result = await turn(d)

    expect(result.workflow.status).toBe('failed')
    expect(result.workflow.stage).toBe('draft_focus_block')
    expect(result.toolEvents.map((e) => e.name)).toEqual(['validate_daily_plan', 'validate_daily_plan'])
    expect(result.workflow.lastError).toContain('Max turns')
    expect(result.trace.at(-1)).toMatchObject({ event: 'stage_failed', toolNames: ['validate_daily_plan', 'validate_daily_plan'] })
  })

  it('blocks when the Project is no longer usable', async () => {
    getScope.mockResolvedValue(scope({ project: project({ isArchived: true }) }))
    const d = deps()
    const result = await turn(d)
    expect(result.workflow.status).toBe('failed')
    expect(result.trace[0]).toMatchObject({ stage: 'resolve_project', event: 'stage_blocked' })
  })
})
