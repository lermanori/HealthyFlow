import { aiCapabilityTools } from '../../src/ai-capabilities'
import {
  buildTalkRuntimeInput,
  FOCUSED_WORK_TOOL_NAMES,
  OpenAiAgentsTalkRuntime,
} from '../../src/talk-agent-runtime'

describe('Phase 5 Talk runtime input', () => {
  it('includes the current local time in the anchored timezone', () => {
    const serialized = buildTalkRuntimeInput({
      userId: '10000000-0000-4000-8000-000000000001',
      conversationId: '20000000-0000-4000-8000-000000000002',
      model: 'gpt-5-mini',
      stage: 'interpreting',
      anchorDate: '2026-08-04',
      timeZone: 'Asia/Jerusalem',
      focusMeaning: null,
      selectedProjectId: null,
      selectedTaskIds: [],
      messages: [{ role: 'user', content: 'Plan focused work today.' }],
      resumed: false,
    }, new Date('2026-08-04T12:37:00.000Z'))

    expect(JSON.parse(serialized).anchor).toEqual({
      date: '2026-08-04',
      timeZone: 'Asia/Jerusalem',
      time: '15:37',
    })
  })
})

const runLive = process.env.RUN_OPENAI_TALK_PHASE5_EVAL === '1'
  && process.env.OPENAI_API_KEY
  && process.env.OPENAI_API_KEY !== 'test-openai-key'

const describeLive = runLive ? describe : describe.skip

describeLive('Phase 5 Talk Agents SDK — live controlled eval', () => {
  jest.setTimeout(90_000)

  it('asks one capacity-defining question when focused and elapsed time are ambiguous', async () => {
    const registryTools = aiCapabilityTools({
      includeRegistered: true,
      allowedNames: FOCUSED_WORK_TOOL_NAMES,
    }).map((capability) => ({
      ...capability,
      execute: async () => ({ ok: false, error: { code: 'clarification_required' } }),
    }))
    const runtime = new OpenAiAgentsTalkRuntime(() => registryTools)
    const result = await runtime.run({
      userId: '10000000-0000-4000-8000-000000000001',
      conversationId: '20000000-0000-4000-8000-000000000002',
      model: 'gpt-5-mini',
      stage: 'interpreting',
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      focusMeaning: null,
      selectedProjectId: null,
      selectedTaskIds: [],
      messages: [{
        role: 'user',
        content: 'Plan a two-hour block today. I have not said whether two hours means focused work or total elapsed time including breaks.',
      }],
      resumed: false,
    })

    expect(result.decision.kind).toBe('ask')
    expect(result.decision.question).toMatch(/focus|elapsed|break/i)
    expect(result.decision.message).toBeTruthy()
    expect(result.decision.projectId).toBeNull()
  })

  it('returns a safe proposal against HealthyFlow records without a connected Calendar', async () => {
    const projectId = '40000000-0000-4000-8000-000000000004'
    const taskId = '50000000-0000-4000-8000-000000000005'
    const project = {
      id: projectId,
      name: 'HealthyFlow',
      color: '#123456',
      isArchived: false,
      status: 'Active',
      target: 'Ship the safe Phase 5 Talk tracer',
      milestone: 'Pass controlled agent evaluation',
      definitionOfDone: null,
      deadline: null,
      context: {
        summary: 'The app owns workflow state and confirmation.',
        blockers: [],
        constraints: ['No direct model writes'],
        nonGoals: ['Multi-agent orchestration'],
        decisions: [],
        links: [],
        nextStep: 'Finish the controlled tracer',
      },
      createdAt: '2026-08-03T08:00:00.000Z',
    }
    const task = {
      id: taskId,
      title: 'Finish the controlled Talk tracer',
      status: 'open',
      relation: 'Direct progress',
      scheduledDate: '2026-08-03',
      duration: 90,
    }
    const capacity = {
      status: 'partial',
      window: {
        configuredStartTime: '08:00',
        configuredEndTime: '18:00',
        consideredStartTime: '08:00',
        consideredEndTime: '18:00',
        transitionBufferMinutes: 10,
      },
      basis: { planningWindowMinutes: 600, occupiedMinutes: 120, transitionMinutes: 20 },
      availableUpperBoundMinutes: 460,
      reasonCodes: ['calendar_not_connected'],
    }
    const fixtureResults: Record<string, unknown> = {
      get_daily_plan: {
        version: 1,
        date: '2026-08-03',
        items: [],
        calendar: { status: 'not_connected', reasonCode: 'not_connected', events: [] },
        work: { status: 'available', focusBlocks: [] },
        capacity,
      },
      compute_daily_availability: { date: '2026-08-03', capacity },
      validate_daily_plan: {
        date: '2026-08-03',
        status: 'valid',
        requestedMinutes: 100,
        availableMinutes: 460,
        reasons: ['calendar_not_connected'],
        preview: { startTime: '14:00', durationMinutes: 90, transitionMinutes: 10 },
      },
      list_work_projects: {
        projects: [{
          id: projectId,
          name: 'HealthyFlow',
          color: '#123456',
          isArchived: false,
          status: 'Active',
          target: project.target,
          deadline: null,
          openTaskCount: 1,
        }],
      },
      get_work_scope: { project, tasks: [task], focusBlocks: [], sessions: [] },
      review_task_alignment: {
        project,
        tasks: [{ ...task, aligned: true, reason: 'Direct progress relative to the Project target.' }],
      },
    }

    const registryTools = aiCapabilityTools({
      includeRegistered: true,
      allowedNames: FOCUSED_WORK_TOOL_NAMES,
    }).map((capability) => ({
      ...capability,
      execute: async () => ({ ok: true, value: fixtureResults[capability.name] }),
    }))
    const runtime = new OpenAiAgentsTalkRuntime(() => registryTools)
    const result = await runtime.run({
      userId: '10000000-0000-4000-8000-000000000001',
      conversationId: '20000000-0000-4000-8000-000000000002',
      model: 'gpt-5-mini',
      stage: 'interpreting',
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      focusMeaning: 'focused_minutes',
      selectedProjectId: null,
      selectedTaskIds: [],
      messages: [{
        role: 'user',
        content: 'Plan exactly 90 focused minutes today on HealthyFlow. Breaks are outside the 90 focused minutes.',
      }],
      resumed: false,
    })

    expect(result.decision).toEqual(expect.objectContaining({
      kind: 'proposal',
      focusMeaning: 'focused_minutes',
      projectId,
      taskIds: [taskId],
      scheduledDate: '2026-08-03',
      plannedMinutes: 90,
    }))
    expect(result.decision.message).toMatch(/calendar/i)
    expect(result.toolEvents.map((event) => event.name)).toEqual(expect.arrayContaining([
      'get_daily_plan',
      'get_work_scope',
      'validate_daily_plan',
    ]))
    expect(result.toolNames).toEqual([...FOCUSED_WORK_TOOL_NAMES])
    expect(result.toolNames).not.toContain('create_focus_block')
    expect(result.usage.totalTokens).toBeGreaterThan(0)
  })
})
