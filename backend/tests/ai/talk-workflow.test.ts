jest.mock('../../src/supabase-client', () => ({
  db: {
    getTalkWorkflowByConversation: jest.fn(),
    getTalkWorkflowById: jest.fn(),
    createTalkWorkflow: jest.fn(),
    updateTalkWorkflowCas: jest.fn(),
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

jest.mock('../../src/work', () => ({
  Work: {
    getScope: jest.fn(),
    createFocusBlock: jest.fn(),
  },
}))

import { db } from '../../src/supabase-client'
import { Credits } from '../../src/credits'
import { buildDaySummary, validateDailyPlacement } from '../../src/day-summary'
import {
  FOCUSED_WORK_TOOL_NAMES,
  selectTalkInstructionPacks,
  type TalkAgentRuntime,
  type TalkAgentRunResult,
} from '../../src/talk-agent-runtime'
import {
  cancelTalkWorkflowAction,
  confirmTalkWorkflowAction,
  runTalkWorkflowTurn,
  TalkProposalStaleError,
} from '../../src/talk-workflow'
import { Work } from '../../src/work'

const USER_ID = '10000000-0000-4000-8000-000000000001'
const CONVERSATION_ID = '20000000-0000-4000-8000-000000000002'
const WORKFLOW_ID = '30000000-0000-4000-8000-000000000003'
const PROJECT_ID = '40000000-0000-4000-8000-000000000004'
const TASK_ID = '50000000-0000-4000-8000-000000000005'
const FOCUS_BLOCK_ID = '60000000-0000-4000-8000-000000000006'
const NOW = '2026-08-03T12:00:00.000Z'

let workflowRow: any
let pendingRows: Map<string, any>

const scope = () => ({
  project: {
    id: PROJECT_ID,
    name: 'HealthyFlow',
    color: '#123456',
    isArchived: false,
    status: 'Active',
    target: 'Ship Phase 5',
    milestone: 'Safe Talk tracer',
    definitionOfDone: null,
    deadline: null,
    context: { summary: '', blockers: [], constraints: [], nonGoals: [], decisions: [], links: [], nextStep: '' },
    createdAt: NOW,
  },
  tasks: [{
    id: TASK_ID,
    title: 'Finish the Talk tracer',
    status: 'open',
    relation: 'Direct progress',
    scheduledDate: '2026-08-03',
    duration: 90,
  }],
  focusBlocks: [],
  sessions: [],
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

const proposalDecision = () => ({
  kind: 'proposal' as const,
  message: 'I prepared one Focus block. Review it before applying.',
  question: null,
  focusMeaning: 'focused_minutes' as const,
  projectId: PROJECT_ID,
  taskIds: [TASK_ID],
  scheduledDate: '2026-08-03',
  startTime: '14:00',
  plannedMinutes: 90,
  intendedOutcome: 'Complete the durable Talk tracer',
  intendedEvidence: 'Green workflow and safety evals',
  transitionMinutes: 10,
  breakMinutes: 15,
  reasonCodes: [],
})

const runtimeResult = (decision: TalkAgentRunResult['decision']): TalkAgentRunResult => ({
  decision,
  toolEvents: [{ name: 'validate_daily_plan', args: {}, result: { ok: true } }],
  usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
  runtimeVersion: 'fake-runtime/v1',
  instructionVersions: ['healthyflow-talk@1.0.0'],
  toolNames: [...FOCUSED_WORK_TOOL_NAMES],
})

function fakeRuntime(decisions: TalkAgentRunResult['decision'][]): TalkAgentRuntime & { run: jest.Mock } {
  return {
    run: jest.fn(async () => {
      const decision = decisions.shift()
      if (!decision) throw new Error('No fake decision queued')
      return runtimeResult(decision)
    }),
  }
}

function installPersistenceHarness() {
  ;(db.getTalkWorkflowByConversation as jest.Mock).mockImplementation(async () => workflowRow)
  ;(db.getTalkWorkflowById as jest.Mock).mockImplementation(async () => workflowRow)
  ;(db.createTalkWorkflow as jest.Mock).mockImplementation(async (row) => {
    workflowRow = { ...row, id: WORKFLOW_ID, updated_at: NOW }
    return workflowRow
  })
  ;(db.updateTalkWorkflowCas as jest.Mock).mockImplementation(async (_userId, _workflowId, expectedRevision, updates) => {
    if (!workflowRow || workflowRow.revision !== expectedRevision) return null
    workflowRow = {
      ...workflowRow,
      ...updates,
      revision: expectedRevision + 1,
      updated_at: NOW,
    }
    return workflowRow
  })
  ;(db.createAiPendingAction as jest.Mock).mockImplementation(async (row) => {
    const action = {
      ...row,
      status: 'presented',
      executed_at: null,
      canceled_at: null,
      result: null,
      updated_at: NOW,
      created_at: NOW,
    }
    pendingRows.set(action.id, action)
    return action
  })
  ;(db.getAiPendingAction as jest.Mock).mockImplementation(async (actionId) => pendingRows.get(actionId) ?? null)
  ;(db.claimAiPendingAction as jest.Mock).mockImplementation(async (actionId) => {
    const action = pendingRows.get(actionId)
    if (!action || action.status !== 'presented') return null
    action.status = 'executing'
    return action
  })
  ;(db.completeAiPendingAction as jest.Mock).mockImplementation(async (actionId, _userId, result) => {
    const action = pendingRows.get(actionId)
    if (!action || action.status !== 'executing') return null
    Object.assign(action, { status: 'executed', result, executed_at: NOW })
    return action
  })
  ;(db.setAiPendingActionState as jest.Mock).mockImplementation(async (actionId, _userId, status, updates = {}) => {
    const action = pendingRows.get(actionId)
    if (!action) return null
    Object.assign(action, updates, { status })
    if (status === 'declined') action.canceled_at = NOW
    return action
  })
  ;(db.getAiIdempotency as jest.Mock).mockResolvedValue(null)
  ;(db.createAiIdempotency as jest.Mock).mockResolvedValue({ id: 'idem-1' })
  ;(db.createAiAuditLog as jest.Mock).mockResolvedValue({ id: 'audit-1' })
}

describe('Phase 5 Talk workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    workflowRow = null
    pendingRows = new Map()
    installPersistenceHarness()
    ;(Work.getScope as jest.Mock).mockImplementation(async () => scope())
    ;(buildDaySummary as jest.Mock).mockImplementation(async () => daySummary())
    ;(validateDailyPlacement as jest.Mock).mockResolvedValue({
      date: '2026-08-03',
      status: 'valid',
      requestedMinutes: 115,
      availableMinutes: 600,
      reasons: [],
      preview: { startTime: '14:00', durationMinutes: 105, transitionMinutes: 10 },
    })
    ;(Work.createFocusBlock as jest.Mock).mockResolvedValue({
      id: FOCUS_BLOCK_ID,
      projectId: PROJECT_ID,
      taskIds: [TASK_ID],
      standaloneTitle: null,
      standaloneContext: null,
      scheduledDate: '2026-08-03',
      startTime: '14:00',
      plannedMinutes: 90,
      intendedOutcome: 'Complete the durable Talk tracer',
      intendedEvidence: 'Green workflow and safety evals',
      transitionMinutes: 10,
      breakMinutes: 15,
      status: 'planned',
      reviewTrigger: null,
      startedAt: null,
      endedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })

  it('loads only the stage-relevant instruction packs and six bounded non-write tools', () => {
    expect(selectTalkInstructionPacks('interpreting', false).map((pack) => pack.name))
      .toContain('one-useful-question')
    expect(selectTalkInstructionPacks('gathering_context', false).map((pack) => pack.name))
      .not.toContain('one-useful-question')
    expect(selectTalkInstructionPacks('clarifying', true).map((pack) => pack.name))
      .toContain('durable-workflow-resume')
    expect(FOCUSED_WORK_TOOL_NAMES).toEqual([
      'get_daily_plan',
      'compute_daily_availability',
      'validate_daily_plan',
      'list_work_projects',
      'get_work_scope',
      'review_task_alignment',
    ])
    expect(FOCUSED_WORK_TOOL_NAMES).not.toContain('create_focus_block')
  })

  it('persists one useful clarification and resumes from that checkpoint', async () => {
    const runtime = fakeRuntime([
      {
        kind: 'ask',
        message: 'I need one capacity clarification.',
        question: 'Do you mean 90 focused minutes, or a 90-minute elapsed window including breaks?',
        focusMeaning: null,
        projectId: null,
        taskIds: [],
        scheduledDate: null,
        startTime: null,
        plannedMinutes: null,
        intendedOutcome: null,
        intendedEvidence: null,
        transitionMinutes: null,
        breakMinutes: null,
        reasonCodes: [],
      },
      {
        kind: 'blocked',
        message: 'There is not enough available time today.',
        question: null,
        focusMeaning: 'focused_minutes',
        projectId: null,
        taskIds: [],
        scheduledDate: null,
        startTime: null,
        plannedMinutes: null,
        intendedOutcome: null,
        intendedEvidence: null,
        transitionMinutes: null,
        breakMinutes: null,
        reasonCodes: ['insufficient_available_minutes'],
      },
    ])

    const first = await runTalkWorkflowTurn({
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Plan 90 minutes of focus.' }],
      runtime,
    })
    expect(first.message).toContain('focused minutes')
    expect(first.workflow.stage).toBe('clarifying')

    const second = await runTalkWorkflowTurn({
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Focused minutes.' }],
      runtime,
    })
    expect(second.workflow.lastError).toBe('insufficient_available_minutes')
    expect(runtime.run.mock.calls[0][0].resumed).toBe(false)
    expect(runtime.run.mock.calls[1][0]).toEqual(expect.objectContaining({
      resumed: true,
      stage: 'clarifying',
    }))
  })

  it('validates schedule arithmetic and persists a confirmable proposal', async () => {
    const result = await runTalkWorkflowTurn({
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Plan 90 focused minutes on HealthyFlow.' }],
      runtime: fakeRuntime([proposalDecision()]),
    })

    expect(validateDailyPlacement).toHaveBeenCalledWith(USER_ID, {
      date: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      startTime: '14:00',
      durationMinutes: 105,
      transitionMinutes: 10,
    })
    expect(result.workflow.stage).toBe('awaiting_confirmation')
    expect(result.workflow.confirmationState).toBe('presented')
    expect(result.pendingActions).toHaveLength(1)
    expect(result.pendingActions[0]).toEqual(expect.objectContaining({
      capability: 'create_focus_block',
      workflowId: WORKFLOW_ID,
    }))
    expect(result.pendingActions[0].args.requestId).toBe(result.pendingActions[0].id)
  })

  it.each([
    {
      name: 'no Project',
      arrange: () => (Work.getScope as jest.Mock).mockResolvedValue({ ...scope(), project: null }),
      expected: 'Project is no longer available',
    },
    {
      // `calendar_not_connected` is no longer an indeterminate state — placement
      // only refuses on what it knows to be true, and an unusable timezone is the
      // one gap that makes every clock time unjudgeable.
      name: 'an unusable timezone',
      arrange: () => (validateDailyPlacement as jest.Mock).mockResolvedValue({
        date: '2026-08-03',
        status: 'indeterminate',
        requestedMinutes: 115,
        availableMinutes: null,
        reasons: ['timezone_missing'],
        preview: { startTime: '14:00', durationMinutes: 105, transitionMinutes: 10 },
      }),
      expected: 'timezone_missing',
    },
    {
      name: 'a time conflict',
      arrange: () => (validateDailyPlacement as jest.Mock).mockResolvedValue({
        date: '2026-08-03',
        status: 'invalid',
        requestedMinutes: 115,
        availableMinutes: 460,
        reasons: ['conflicts_with:calendar_event:event-1'],
        preview: { startTime: '14:00', durationMinutes: 105, transitionMinutes: 10 },
      }),
      expected: 'conflicts_with:calendar_event:event-1',
    },
  ])('refuses a proposal when there is $name', async ({ arrange, expected }) => {
    arrange()
    const result = await runTalkWorkflowTurn({
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Plan my focused work.' }],
      runtime: fakeRuntime([proposalDecision()]),
    })

    expect(result.pendingActions).toEqual([])
    expect(result.message).toContain(expected)
    expect(result.workflow.stage).toBe('clarifying')
  })

  it('surfaces a runtime or tool-loop failure and persists a resumable failed stage', async () => {
    const runtime: TalkAgentRuntime = {
      run: jest.fn().mockRejectedValue(new Error('get_work_scope failed')),
    }

    await expect(runTalkWorkflowTurn({
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Plan my focused work.' }],
      runtime,
    })).rejects.toThrow('get_work_scope failed')

    expect(workflowRow.stage).toBe('failed')
    expect(workflowRow.last_error).toBe('get_work_scope failed')
    expect(Credits.settleReserved).toHaveBeenCalledWith(
      USER_ID,
      20,
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      { endpoint: 'talk-phase-5', model: 'gpt-4o-mini' },
    )
  })

  it('revalidates stale Tasks and refuses the write after confirmation', async () => {
    const turn = await runTalkWorkflowTurn({
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Plan my focused work.' }],
      runtime: fakeRuntime([proposalDecision()]),
    })
    ;(Work.getScope as jest.Mock).mockImplementation(async () => ({
      ...scope(),
      tasks: [{ ...scope().tasks[0], status: 'completed' }],
    }))

    await expect(confirmTalkWorkflowAction(USER_ID, turn.pendingActions[0].id))
      .rejects.toBeInstanceOf(TalkProposalStaleError)
    expect(Work.createFocusBlock).not.toHaveBeenCalled()
    expect(workflowRow.stage).toBe('stale')
    expect(pendingRows.get(turn.pendingActions[0].id).status).toBe('stale')
  })

  it('returns an invalid edited preview to presented state without writing', async () => {
    const turn = await runTalkWorkflowTurn({
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Plan my focused work.' }],
      runtime: fakeRuntime([proposalDecision()]),
    })
    const actionId = turn.pendingActions[0].id

    await expect(confirmTalkWorkflowAction(USER_ID, actionId, { plannedMinutes: 0 }))
      .rejects.toMatchObject({ name: 'ZodError' })
    expect(pendingRows.get(actionId).status).toBe('presented')
    expect(Work.createFocusBlock).not.toHaveBeenCalled()
  })

  it('applies a proposal exactly once across repeated confirmation requests', async () => {
    const turn = await runTalkWorkflowTurn({
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Plan my focused work.' }],
      runtime: fakeRuntime([proposalDecision()]),
    })
    const actionId = turn.pendingActions[0].id

    const first = await confirmTalkWorkflowAction(USER_ID, actionId)
    const second = await confirmTalkWorkflowAction(USER_ID, actionId)

    expect(first).toEqual(second)
    expect(Work.createFocusBlock).toHaveBeenCalledTimes(1)
    expect(Work.createFocusBlock).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ projectId: PROJECT_ID, taskIds: [TASK_ID] }),
      { requestId: actionId },
    )
    expect(workflowRow.stage).toBe('applied')
    expect(Credits.settleReserved).toHaveBeenCalledTimes(1)
  })

  it('records a declined proposal without writing', async () => {
    const turn = await runTalkWorkflowTurn({
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Plan my focused work.' }],
      runtime: fakeRuntime([proposalDecision()]),
    })

    await cancelTalkWorkflowAction(USER_ID, turn.pendingActions[0].id)
    expect(workflowRow.stage).toBe('declined')
    expect(workflowRow.confirmation_state).toBe('declined')
    expect(Work.createFocusBlock).not.toHaveBeenCalled()
  })
})
