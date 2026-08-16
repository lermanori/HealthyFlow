import {
  canonicalTalkWorkflowName,
  getTalkWorkflowDefinition,
  INITIAL_PLAN_WORK_STATE,
  isTerminalTalkWorkflowStatus,
  PLAN_WORK_DEFINITION,
  PlanWorkEventSchema,
  PlanWorkStageSchema,
  PlanWorkStateSchema,
  TalkWorkflowNameSchema,
  TalkWorkflowStatusSchema,
  UnregisteredTalkWorkflowError,
  type PlanWorkEvent,
  type PlanWorkStage,
} from '../../src/talk-workflow-definitions'

// These tests are pure: no OpenAI, no browser, no database. They exercise the
// plan_work state machine through its own contract only.

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const TASK_ID = '22222222-2222-4222-8222-222222222222'
const ACTION_ID = '33333333-3333-4333-8333-333333333333'
const FOCUS_ID = '44444444-4444-4444-8444-444444444444'

const { transition } = PLAN_WORK_DEFINITION

/** One representative payload per event type, used to drive the full matrix. */
const EVENT_FIXTURES: Record<string, PlanWorkEvent> = {
  project_selected: { type: 'project_selected', projectId: PROJECT_ID },
  project_unresolved: { type: 'project_unresolved', question: 'Which Project?' },
  project_clarified: { type: 'project_clarified', projectId: PROJECT_ID },
  scope_aligned_tasks: { type: 'scope_aligned_tasks', taskIds: [TASK_ID] },
  scope_alignment_unclear: { type: 'scope_alignment_unclear' },
  scope_empty_with_direction: { type: 'scope_empty_with_direction' },
  scope_empty_without_direction: { type: 'scope_empty_without_direction', question: 'What outcome?' },
  alignment_resolved: { type: 'alignment_resolved', taskIds: [TASK_ID] },
  alignment_needs_user_input: { type: 'alignment_needs_user_input', question: 'Which Task?' },
  alignment_clarified: { type: 'alignment_clarified' },
  direction_clarified: { type: 'direction_clarified' },
  task_drafted: { type: 'task_drafted', pendingActionId: ACTION_ID },
  task_draft_question: { type: 'task_draft_question', question: 'What is the next step?' },
  task_confirmed: { type: 'task_confirmed', taskId: TASK_ID, projectId: PROJECT_ID },
  task_declined: { type: 'task_declined' },
  task_stale: { type: 'task_stale', reason: 'The Project gained an open Task.' },
  focus_drafted: { type: 'focus_drafted', pendingActionId: ACTION_ID },
  focus_draft_question: { type: 'focus_draft_question', question: 'Focused minutes or elapsed?' },
  capacity_clarified: { type: 'capacity_clarified', focusMeaning: 'focused_minutes' },
  focus_confirmed: { type: 'focus_confirmed', focusBlockId: FOCUS_ID },
  focus_declined: { type: 'focus_declined' },
  focus_stale: { type: 'focus_stale', reason: 'The Daily Plan changed.' },
  stage_blocked: { type: 'stage_blocked', reasonCodes: ['no_project_direction'] },
  stage_failed: { type: 'stage_failed', reason: 'max_turns_exceeded' },
}

const ALL_EVENT_TYPES = Object.keys(EVENT_FIXTURES)
const ALL_STAGES = PlanWorkStageSchema.options as readonly PlanWorkStage[]

/** The authoritative expectation, written out independently of the source table. */
const LEGAL: Array<[PlanWorkStage, string, PlanWorkStage, string]> = [
  ['resolve_project', 'project_selected', 'resolve_scope', 'active'],
  ['resolve_project', 'project_unresolved', 'clarify_project', 'active'],
  ['clarify_project', 'project_clarified', 'resolve_scope', 'active'],
  ['resolve_scope', 'scope_aligned_tasks', 'draft_focus_block', 'active'],
  ['resolve_scope', 'scope_alignment_unclear', 'review_alignment', 'active'],
  ['resolve_scope', 'scope_empty_with_direction', 'draft_task', 'active'],
  ['resolve_scope', 'scope_empty_without_direction', 'clarify_direction', 'active'],
  ['review_alignment', 'alignment_resolved', 'draft_focus_block', 'active'],
  ['review_alignment', 'alignment_needs_user_input', 'clarify_alignment', 'active'],
  ['clarify_alignment', 'alignment_clarified', 'review_alignment', 'active'],
  ['clarify_direction', 'direction_clarified', 'draft_task', 'active'],
  ['draft_task', 'task_drafted', 'await_task_confirmation', 'active'],
  ['draft_task', 'task_draft_question', 'clarify_direction', 'active'],
  ['await_task_confirmation', 'task_confirmed', 'draft_focus_block', 'active'],
  ['await_task_confirmation', 'task_declined', 'await_task_confirmation', 'declined'],
  ['await_task_confirmation', 'task_stale', 'draft_task', 'active'],
  ['draft_focus_block', 'focus_drafted', 'await_focus_confirmation', 'active'],
  ['draft_focus_block', 'focus_draft_question', 'clarify_capacity', 'active'],
  ['clarify_capacity', 'capacity_clarified', 'draft_focus_block', 'active'],
  ['await_focus_confirmation', 'focus_confirmed', 'await_focus_confirmation', 'completed'],
  ['await_focus_confirmation', 'focus_declined', 'await_focus_confirmation', 'declined'],
  ['await_focus_confirmation', 'focus_stale', 'draft_focus_block', 'active'],
]

describe('closed Talk workflow set', () => {
  it('accepts exactly the Phase 6 workflow names', () => {
    expect(TalkWorkflowNameSchema.options).toEqual([
      'plan_day',
      'plan_work',
      'run_focus_block',
      'review_focus_block',
      'replan_day',
      'log_outcome',
      'review_project',
      'quick_chat',
    ])
    expect(TalkWorkflowNameSchema.safeParse('add_work_task').success).toBe(false)
    expect(TalkWorkflowNameSchema.safeParse('plan_focused_work').success).toBe(false)
  })

  it('maps the Phase 5 name onto plan_work as a compatibility alias', () => {
    expect(canonicalTalkWorkflowName('plan_focused_work')).toBe('plan_work')
    expect(canonicalTalkWorkflowName('plan_work')).toBe('plan_work')
    expect(canonicalTalkWorkflowName('something_else')).toBeNull()
  })

  it('resolves registered workflows and rejects unmigrated ones', () => {
    expect(getTalkWorkflowDefinition('plan_work')).toBe(PLAN_WORK_DEFINITION)
    expect(() => getTalkWorkflowDefinition('plan_day')).toThrow(UnregisteredTalkWorkflowError)
  })
})

describe('terminal status is separate from the current stage', () => {
  it('never expresses a terminal outcome as a stage value', () => {
    for (const terminal of ['completed', 'declined', 'failed', 'applied', 'stale']) {
      expect(PlanWorkStageSchema.safeParse(terminal).success).toBe(false)
    }
  })

  it('classifies statuses', () => {
    expect(TalkWorkflowStatusSchema.options).toEqual(['active', 'completed', 'declined', 'failed'])
    expect(isTerminalTalkWorkflowStatus('active')).toBe(false)
    expect(isTerminalTalkWorkflowStatus('completed')).toBe(true)
    expect(isTerminalTalkWorkflowStatus('declined')).toBe(true)
    expect(isTerminalTalkWorkflowStatus('failed')).toBe(true)
  })

  it('retains the stage a terminal workflow stopped in', () => {
    const confirmed = transition('await_focus_confirmation', EVENT_FIXTURES.focus_confirmed)
    expect(confirmed).toEqual({ ok: true, stage: 'await_focus_confirmation', status: 'completed' })
  })
})

describe('plan_work legal transitions', () => {
  it('starts at resolve_project with empty state', () => {
    expect(PLAN_WORK_DEFINITION.initialStage).toBe('resolve_project')
    expect(PlanWorkStateSchema.parse(INITIAL_PLAN_WORK_STATE)).toEqual(INITIAL_PLAN_WORK_STATE)
    expect(INITIAL_PLAN_WORK_STATE.projectId).toBeNull()
    expect(INITIAL_PLAN_WORK_STATE.selectedTaskIds).toEqual([])
  })

  it.each(LEGAL)('%s + %s -> %s (%s)', (stage, eventType, expectedStage, expectedStatus) => {
    expect(transition(stage, EVENT_FIXTURES[eventType])).toEqual({
      ok: true,
      stage: expectedStage,
      status: expectedStatus,
    })
  })

  it('reaches Focus planning from a zero-Task Project without a hidden user message', () => {
    let stage: PlanWorkStage = PLAN_WORK_DEFINITION.initialStage
    const path: PlanWorkEvent[] = [
      EVENT_FIXTURES.project_selected,
      EVENT_FIXTURES.scope_empty_with_direction,
      EVENT_FIXTURES.task_drafted,
      EVENT_FIXTURES.task_confirmed,
      EVENT_FIXTURES.focus_drafted,
      EVENT_FIXTURES.focus_confirmed,
    ]
    const visited: PlanWorkStage[] = []
    let status = 'active'
    for (const event of path) {
      const result = transition(stage, event)
      if (!result.ok) throw new Error(result.reason)
      stage = result.stage
      status = result.status
      visited.push(stage)
    }
    expect(visited).toEqual([
      'resolve_scope',
      'draft_task',
      'await_task_confirmation',
      'draft_focus_block',
      'await_focus_confirmation',
      'await_focus_confirmation',
    ])
    expect(status).toBe('completed')
  })

  it('reaches Focus planning directly when aligned open Tasks exist', () => {
    const scoped = transition('resolve_scope', EVENT_FIXTURES.scope_aligned_tasks)
    expect(scoped).toEqual({ ok: true, stage: 'draft_focus_block', status: 'active' })
  })

  it.each(ALL_STAGES)('treats a blocked or failed %s stage as terminal failure in place', (stage) => {
    expect(transition(stage, EVENT_FIXTURES.stage_blocked)).toEqual({ ok: true, stage, status: 'failed' })
    expect(transition(stage, EVENT_FIXTURES.stage_failed)).toEqual({ ok: true, stage, status: 'failed' })
  })
})

describe('plan_work illegal transitions', () => {
  const legalPairs = new Set(LEGAL.map(([stage, eventType]) => `${stage}:${eventType}`))

  it('rejects every stage/event pair outside the transition table', () => {
    const rejected: string[] = []
    for (const stage of ALL_STAGES) {
      for (const eventType of ALL_EVENT_TYPES) {
        if (eventType === 'stage_blocked' || eventType === 'stage_failed') continue
        const result = transition(stage, EVENT_FIXTURES[eventType])
        if (legalPairs.has(`${stage}:${eventType}`)) {
          expect(result.ok).toBe(true)
          continue
        }
        expect(result.ok).toBe(false)
        rejected.push(`${stage}:${eventType}`)
      }
    }
    // 11 stages x 22 non-terminal events, minus the 22 legal pairs.
    expect(rejected).toHaveLength(ALL_STAGES.length * 22 - LEGAL.length)
  })

  it('will not let a confirmation stage be skipped', () => {
    expect(transition('draft_task', EVENT_FIXTURES.task_confirmed).ok).toBe(false)
    expect(transition('draft_focus_block', EVENT_FIXTURES.focus_confirmed).ok).toBe(false)
    expect(transition('resolve_scope', EVENT_FIXTURES.focus_drafted).ok).toBe(false)
  })

  it('will not accept a Focus event at a Task stage, or the reverse', () => {
    expect(transition('await_task_confirmation', EVENT_FIXTURES.focus_confirmed).ok).toBe(false)
    expect(transition('await_focus_confirmation', EVENT_FIXTURES.task_confirmed).ok).toBe(false)
  })

  it('rejects an unknown stage', () => {
    expect(transition('clarifying' as PlanWorkStage, EVENT_FIXTURES.project_selected)).toEqual({
      ok: false,
      reason: 'Unknown plan_work stage: clarifying',
    })
  })

  it('rejects a malformed event before consulting the table', () => {
    const result = transition('resolve_project', { type: 'project_selected', projectId: 'not-a-uuid' } as PlanWorkEvent)
    expect(result).toEqual({
      ok: false,
      reason: 'Event does not satisfy the plan_work event contract',
    })
  })

  it('rejects an unknown event type', () => {
    expect(PlanWorkEventSchema.safeParse({ type: 'do_whatever' }).success).toBe(false)
    expect(transition('resolve_project', { type: 'do_whatever' } as unknown as PlanWorkEvent).ok).toBe(false)
  })
})

describe('plan_work activity profiles', () => {
  const { activity } = PLAN_WORK_DEFINITION

  it('resolves the Project and its scope in application code', () => {
    expect(activity.resolve_project).toEqual({ kind: 'application' })
    expect(activity.resolve_scope).toEqual({ kind: 'application' })
  })

  it('gives Task drafting no Daily Plan tools and no turn budget to loop', () => {
    const draftTask = activity.draft_task
    expect(draftTask.kind).toBe('agent')
    if (draftTask.kind !== 'agent') throw new Error('unreachable')
    expect(draftTask.tools).toEqual([])
    expect(draftTask.outputContract).toBe('plan_work.task_draft')
    expect(draftTask.instructionPacks).not.toContain('focused_work')
  })

  it('gives Focus planning the Daily Plan tools and no Task-drafting instructions', () => {
    const draftFocus = activity.draft_focus_block
    if (draftFocus.kind !== 'agent') throw new Error('unreachable')
    expect(draftFocus.tools).toContain('validate_daily_plan')
    expect(draftFocus.instructionPacks).not.toContain('task_drafting')
    expect(draftFocus.outputContract).toBe('plan_work.focus_draft')
  })

  it('never exposes a write capability to any stage', () => {
    for (const stage of ALL_STAGES) {
      const profile = activity[stage]
      if (profile.kind !== 'agent') continue
      for (const toolName of profile.tools) {
        expect(toolName).toMatch(/^(get_|list_|compute_|validate_|review_)/)
      }
    }
  })

  it('budgets each stage separately rather than sharing one product-workflow budget', () => {
    const budgets = ALL_STAGES
      .map((stage) => activity[stage])
      .filter((profile): profile is Extract<typeof profile, { kind: 'agent' }> => profile.kind === 'agent')
      .map((profile) => profile.maxTurns)
    expect(budgets.length).toBeGreaterThan(1)
    expect(new Set(budgets).size).toBeGreaterThan(1)
    for (const budget of budgets) expect(budget).toBeLessThanOrEqual(6)
  })

  it('labels traces with the workflow, version, and stage', () => {
    expect(PLAN_WORK_DEFINITION.traceLabel('draft_task')).toBe('plan_work.v1.draft_task')
  })
})
