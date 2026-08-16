import { z } from 'zod'
import {
  buildTalkStagePlan,
  buildTalkStageRuntimeInput,
  OpenAiTalkStageRuntime,
  TALK_STAGE_OUTPUT_CONTRACTS,
  TalkAlignmentOutputSchema,
  TalkFocusDraftOutputSchema,
  TalkStageProfileError,
  TalkStageRunError,
  TalkTaskDraftOutputSchema,
  type TalkStageRunInput,
} from '../../src/talk-agent-runtime'

jest.mock('../../src/ai-capabilities', () => ({
  aiCapabilityTools: jest.fn(() => []),
}))

const DAILY_PLAN_TOOLS = ['get_daily_plan', 'compute_daily_availability', 'validate_daily_plan']

const runInput = (overrides: Partial<TalkStageRunInput> = {}): TalkStageRunInput => ({
  userId: '11111111-1111-4111-8111-111111111111',
  conversationId: '22222222-2222-4222-8222-222222222222',
  model: 'gpt-4o-mini',
  workflowName: 'plan_work',
  definitionVersion: 1,
  stage: 'draft_task',
  anchorDate: '2026-08-04',
  timeZone: 'Asia/Jerusalem',
  stageContext: { project: { target: 'Ship Phase 6' } },
  messages: [{ role: 'user', content: 'plan two focused hours' }],
  resumed: false,
  ...overrides,
})

describe('stage plan selection', () => {
  it('gives Task drafting no tools at all', () => {
    const plan = buildTalkStagePlan({ workflowName: 'plan_work', stage: 'draft_task', resumed: false })
    expect(plan.toolNames).toEqual([])
    for (const tool of DAILY_PLAN_TOOLS) expect(plan.toolNames).not.toContain(tool)
    expect(plan.outputContract).toBe('plan_work.task_draft')
  })

  it('gives Focus planning the Daily Plan tools and its own contract', () => {
    const plan = buildTalkStagePlan({ workflowName: 'plan_work', stage: 'draft_focus_block', resumed: false })
    expect(plan.toolNames).toEqual(DAILY_PLAN_TOOLS)
    expect(plan.outputContract).toBe('plan_work.focus_draft')
  })

  it('never loads Task-drafting and Focus instructions into the same run', () => {
    const task = buildTalkStagePlan({ workflowName: 'plan_work', stage: 'draft_task', resumed: false })
    const focus = buildTalkStagePlan({ workflowName: 'plan_work', stage: 'draft_focus_block', resumed: false })
    expect(task.instructions).toContain('draft-work-task')
    expect(task.instructions).not.toContain('plan-focus-block')
    expect(focus.instructions).toContain('plan-focus-block')
    expect(focus.instructions).not.toContain('draft-work-task')
  })

  it('budgets stages independently', () => {
    const task = buildTalkStagePlan({ workflowName: 'plan_work', stage: 'draft_task', resumed: false })
    const focus = buildTalkStagePlan({ workflowName: 'plan_work', stage: 'draft_focus_block', resumed: false })
    expect(task.maxTurns).toBeLessThan(focus.maxTurns)
  })

  it('appends the resume pack only when resuming', () => {
    const fresh = buildTalkStagePlan({ workflowName: 'plan_work', stage: 'draft_task', resumed: false })
    const resumed = buildTalkStagePlan({ workflowName: 'plan_work', stage: 'draft_task', resumed: true })
    expect(fresh.instructionVersions).not.toContain('durable-workflow-resume@1.0.0')
    expect(resumed.instructionVersions).toContain('durable-workflow-resume@1.0.0')
  })

  it('labels traces with workflow, version, and stage', () => {
    const plan = buildTalkStagePlan({ workflowName: 'plan_work', stage: 'draft_focus_block', resumed: false })
    expect(plan.traceLabel).toBe('plan_work.v1.draft_focus_block')
    expect(plan.traceMetadata).toMatchObject({
      workflow: 'plan_work',
      definitionVersion: '1',
      stage: 'draft_focus_block',
    })
    expect(plan.traceLabel).not.toBe('HealthyFlow Phase 6 Talk')
  })

  it('refuses to run a model for an application or waiting stage', () => {
    for (const stage of ['resolve_project', 'resolve_scope', 'await_task_confirmation', 'clarify_direction']) {
      expect(() => buildTalkStagePlan({ workflowName: 'plan_work', stage, resumed: false }))
        .toThrow(TalkStageProfileError)
    }
  })

  it('refuses an unknown stage or unregistered workflow', () => {
    expect(() => buildTalkStagePlan({ workflowName: 'plan_work', stage: 'clarifying', resumed: false }))
      .toThrow(TalkStageProfileError)
    expect(() => buildTalkStagePlan({ workflowName: 'plan_day', stage: 'draft_task', resumed: false }))
      .toThrow()
  })

  it('sends only the current stage context, not a shared checkpoint blob', () => {
    const payload = JSON.parse(buildTalkStageRuntimeInput(runInput()))
    expect(payload.stage).toEqual({
      workflow: 'plan_work',
      name: 'draft_task',
      context: { project: { target: 'Ship Phase 6' } },
    })
    expect(payload.anchor).toMatchObject({ date: '2026-08-04', timeZone: 'Asia/Jerusalem' })
    expect(payload).not.toHaveProperty('checkpoint')
  })
})

describe('stage output contracts', () => {
  it('registers one schema per declared contract', () => {
    expect(Object.keys(TALK_STAGE_OUTPUT_CONTRACTS).sort()).toEqual([
      'plan_work.alignment_decision',
      'plan_work.focus_draft',
      'plan_work.task_draft',
    ])
  })

  it('Focus planning cannot return a Task draft', () => {
    const withTask = {
      kind: 'focus_draft',
      message: 'planned',
      question: null,
      focusMeaning: 'focused_minutes',
      startTime: '09:00',
      plannedMinutes: 90,
      intendedOutcome: 'outcome',
      intendedEvidence: 'evidence',
      transitionMinutes: 15,
      breakMinutes: null,
      reasonCodes: [],
      task: { title: 'A new Task', relation: 'Direct progress', duration: 60, scheduledDate: null },
    }
    expect(TalkFocusDraftOutputSchema.safeParse(withTask).success).toBe(false)
    expect(TalkFocusDraftOutputSchema.safeParse({ ...withTask, kind: 'task_draft' }).success).toBe(false)
  })

  it('Focus planning cannot re-select Tasks, choose a Project, or move the date', () => {
    const base = {
      kind: 'focus_draft',
      message: 'planned',
      question: null,
      focusMeaning: 'focused_minutes',
      startTime: '09:00',
      plannedMinutes: 90,
      intendedOutcome: 'outcome',
      intendedEvidence: 'evidence',
      transitionMinutes: 15,
      breakMinutes: null,
      reasonCodes: [],
    }
    expect(TalkFocusDraftOutputSchema.safeParse(base).success).toBe(true)
    for (const smuggled of [
      { taskIds: ['33333333-3333-4333-8333-333333333333'] },
      { projectId: '33333333-3333-4333-8333-333333333333' },
      { scheduledDate: '2026-08-05' },
    ]) {
      expect(TalkFocusDraftOutputSchema.safeParse({ ...base, ...smuggled }).success).toBe(false)
    }
  })

  it('Task drafting cannot return a Focus block placement', () => {
    const base = {
      kind: 'task_draft',
      message: 'drafted',
      question: null,
      task: { title: 'Write the migration', relation: 'Direct progress', duration: 60, scheduledDate: null },
      reasonCodes: [],
    }
    expect(TalkTaskDraftOutputSchema.safeParse(base).success).toBe(true)
    for (const smuggled of [
      { startTime: '09:00' },
      { plannedMinutes: 90 },
      { intendedEvidence: 'evidence' },
      { kind: 'focus_draft' },
    ]) {
      expect(TalkTaskDraftOutputSchema.safeParse({ ...base, ...smuggled }).success).toBe(false)
    }
  })

  it('requires the payload matching each kind', () => {
    expect(TalkTaskDraftOutputSchema.safeParse({
      kind: 'task_draft', message: 'm', question: null, task: null, reasonCodes: [],
    }).success).toBe(false)
    expect(TalkTaskDraftOutputSchema.safeParse({
      kind: 'ask', message: 'm', question: null, task: null, reasonCodes: [],
    }).success).toBe(false)
    expect(TalkTaskDraftOutputSchema.safeParse({
      kind: 'blocked', message: 'm', question: null, task: null, reasonCodes: [],
    }).success).toBe(false)
    expect(TalkAlignmentOutputSchema.safeParse({
      kind: 'alignment', message: 'm', question: null, taskIds: [], reasonCodes: [],
    }).success).toBe(false)
  })
})

describe('stage runtime failures preserve the tool sequence', () => {
  const capability = (name: string) => ({
    name,
    description: name,
    inputSchema: z.object({}).strict(),
    execute: jest.fn(async () => ({ ok: true, name })),
  })

  it('returns the completed tool calls when the loop throws', async () => {
    const tools = DAILY_PLAN_TOOLS.map(capability)
    const runtime = new OpenAiTalkStageRuntime(
      () => tools as any,
      async (agent) => {
        // Simulate the max-turn failure from the ADR-0009 regression trace.
        const registered = (agent as any).tools as Array<{ name: string; invoke: Function }>
        for (const entry of registered) {
          if (entry.name === 'validate_daily_plan') {
            await (entry as any).invoke({ context: {} }, '{}')
            await (entry as any).invoke({ context: {} }, '{}')
          }
        }
        throw new Error('Max turns (6) exceeded')
      },
    )

    const error = await runtime.run(runInput({ stage: 'draft_focus_block' })).catch((e) => e)
    expect(error).toBeInstanceOf(TalkStageRunError)
    expect(error.message).toContain('Max turns')
    expect(error.detail.stage).toBe('draft_focus_block')
    expect(error.detail.workflowName).toBe('plan_work')
    expect(error.toolSequence).toEqual(['validate_daily_plan', 'validate_daily_plan'])
  })

  it('reports a missing structured output as a typed stage failure, not a generic 500', async () => {
    const runtime = new OpenAiTalkStageRuntime(
      () => [] as any,
      async () => ({ state: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } }),
    )
    const error = await runtime.run(runInput()).catch((e) => e)
    expect(error).toBeInstanceOf(TalkStageRunError)
    expect(error.message).toContain('plan_work.v1.draft_task')
    expect(error.toolSequence).toEqual([])
  })

  it('rejects output that violates the stage contract', async () => {
    const runtime = new OpenAiTalkStageRuntime(
      () => [] as any,
      async () => ({
        // A Focus draft returned by the Task-drafting stage.
        finalOutput: { kind: 'focus_draft', message: 'm', question: null, task: null, reasonCodes: [] },
        state: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
      }),
    )
    const error = await runtime.run(runInput()).catch((e) => e)
    expect(error).toBeInstanceOf(TalkStageRunError)
    expect(error.message).toContain('violated plan_work.task_draft')
  })

  it('returns parsed output and usage on success', async () => {
    const runtime = new OpenAiTalkStageRuntime(
      () => [] as any,
      async () => ({
        finalOutput: {
          kind: 'task_draft',
          message: 'drafted',
          question: null,
          task: { title: 'Write the migration', relation: 'Direct progress', duration: 60, scheduledDate: null },
          reasonCodes: [],
        },
        state: { usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } },
      }),
    )
    const result = await runtime.run(runInput())
    expect(result.outputContract).toBe('plan_work.task_draft')
    expect(result.toolNames).toEqual([])
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 4, totalTokens: 14 })
    expect((result.output as any).kind).toBe('task_draft')
  })

  it('fails closed when a declared stage tool is not registered', async () => {
    const runtime = new OpenAiTalkStageRuntime(() => [] as any, async () => {
      throw new Error('should not run')
    })
    await expect(runtime.run(runInput({ stage: 'draft_focus_block' })))
      .rejects.toThrow(TalkStageProfileError)
  })
})
