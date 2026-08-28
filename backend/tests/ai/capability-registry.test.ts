import { z } from 'zod'
import {
  AiCapabilities,
  AiCapabilityInventorySchema,
  type AiCapabilityName,
  aiCapabilityInventory,
  aiCapabilityTools,
  executeAiCapability,
} from '../../src/ai-capabilities'
import { HabitHistorySchema } from '../../src/habit-contracts'

const requiredFamilies = {
  goals: [
    'list_goals',
    'add_goal',
    'update_goal',
    'archive_goal',
  ],
  calendar_daily_plan: [
    'get_daily_plan',
    'compute_daily_availability',
    'validate_daily_plan',
    'place_item',
  ],
  work: [
    'list_work_projects',
    'get_work_scope',
    'review_task_alignment',
    'add_work_task',
    'create_focus_block',
    'transition_focus_block',
    'complete_work_review',
    'update_work_task',
    'update_project_context',
  ],
  nutrition: [
    'get_nutrition_context',
    'list_calorie_entries',
    'search_calorie_history',
    'plan_meal_timing',
    'parse_meal_entries',
    'schedule_meal',
    'add_calorie_entry',
  ],
  workouts: [
    'list_workout_plans',
    'list_workout_sessions',
    'add_workout_plan',
    'schedule_workout',
    'add_workout_session',
  ],
  habits: [
    'list_habit_instances',
    'get_habit_history',
    'add_habit',
    'record_habit_outcome',
    'record_habit_progress',
  ],
  progress: [
    'list_weight_summary',
    'list_achievements',
    'add_weight_entry',
    'add_achievement_entry',
  ],
  tasks: [
    'list_tasks',
    'explain_rollover',
    'add_task',
    'update_item',
    'place_item',
    'complete_task',
    'defer_task',
    'delete_item',
  ],
} as const

describe('Phase 4 AI capability registry contract', () => {
  it('publishes one Zod-backed bounded inventory covering every module family', () => {
    const parsed = z.array(AiCapabilityInventorySchema).parse(aiCapabilityInventory)
    const names = new Set(parsed.map(capability => capability.name))

    for (const [module, capabilities] of Object.entries(requiredFamilies)) {
      for (const capability of capabilities) {
        expect(names).toContain(capability)
        expect(parsed.find(candidate => candidate.name === capability)?.modules).toContain(module)
      }
    }

    expect(new Set(parsed.flatMap(capability => capability.modules))).toEqual(
      new Set(Object.keys(requiredFamilies)),
    )
    expect(new Set(parsed.map(capability => capability.kind))).toEqual(
      new Set(['read', 'proposal', 'write', 'outcome']),
    )
    expect(parsed.find(capability => capability.name === 'list_tasks')?.availability).toBe('runtime')
    expect(parsed.find(capability => capability.name === 'get_daily_plan')?.availability).toBe('registered')
  })

  it('makes identity server-owned and gives every capability concrete input/output contracts', () => {
    for (const [name, capability] of Object.entries(AiCapabilities)) {
      const input = JSON.stringify(z.toJSONSchema(capability.inputSchema))
      const output = JSON.stringify(z.toJSONSchema(capability.outputSchema))

      expect(capability.name).toBe(name)
      expect(capability.risk).toBe(
        capability.kind === 'write' || capability.kind === 'outcome' ? 'confirm' : 'auto',
      )
      expect(capability).not.toHaveProperty('apply')
      expect(input).not.toContain('userId')
      expect(output).not.toContain('"items":{}')
      expect(output).not.toContain('"anyOf":[{},')
      expect(output).not.toContain('"anyOf":[{"type":"null"},{}]')
    }
  })

  it('declares uniform confirmation, idempotency, audit, and scope semantics for mutations', () => {
    for (const capability of aiCapabilityInventory) {
      if (capability.kind === 'read' || capability.kind === 'proposal') {
        expect(capability.confirmation).toBe('not_required')
        expect(capability.idempotency).toBe('not_applicable')
        expect(capability.audit).toBe('not_applicable')
        continue
      }

      expect(capability.confirmation).toBe('required')
      expect(capability.risk).toBe('confirm')
      expect(capability.idempotency).toBe('request_id')
      expect(capability.audit).toBe('required')
      expect(capability.errorCodes).toEqual(expect.arrayContaining([
        'invalid_input', 'invalid_output', 'not_found', 'forbidden', 'conflict', 'execution_failed',
      ]))
      expect(capability.scope).toMatch(/^hf:write:/)
      expect(JSON.stringify(z.toJSONSchema(AiCapabilities[capability.name as AiCapabilityName].inputSchema))).toContain('requestId')
    }
  })

  it('keeps internal and MCP adapters over the same shared definitions', () => {
    const internal = aiCapabilityTools({ includeRegistered: true }).map(tool => tool.name).sort()
    const mcp = aiCapabilityTools({
      mode: 'mcp',
      caller: 'mcp',
      scopes: ['hf:write:add', 'hf:write:update', 'hf:write:complete', 'hf:write:delete'],
      includeRegistered: true,
    }).map(tool => tool.name).sort()

    expect(internal).toEqual(Object.keys(AiCapabilities).sort())
    expect(mcp).toEqual(internal)
  })

  it('withholds every mutation from an MCP caller that lacks its write scope', () => {
    const readOnlyTools = new Set(aiCapabilityTools({
      mode: 'mcp',
      caller: 'mcp',
      scopes: [],
      includeRegistered: true,
    }).map(tool => tool.name))

    for (const capability of aiCapabilityInventory) {
      if (capability.kind === 'write' || capability.kind === 'outcome') {
        expect(readOnlyTools).not.toContain(capability.name)
      } else {
        expect(readOnlyTools).toContain(capability.name)
      }
    }
  })

  it('does not activate the Phase 4 inventory in the production model adapter before Phase 5', () => {
    const productionTools = new Set(aiCapabilityTools().map(tool => tool.name))
    const runtimeInventory = new Set(
      aiCapabilityInventory
        .filter(capability => capability.availability === 'runtime')
        .map(capability => capability.name),
    )

    expect(productionTools).toEqual(runtimeInventory)
  })

  it('returns explicit typed errors for unsupported actions and invalid input', async () => {
    await expect(executeAiCapability(
      { userId: 'user-1', caller: 'internal' },
      'generic_sql',
      {},
    )).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'unsupported_capability', retryable: false }),
    })

    await expect(executeAiCapability(
      { userId: 'user-1', caller: 'internal' },
      'add_task',
      { title: '' },
    )).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'invalid_input', retryable: false }),
    })
  })

  it('reads the client-owned Goal snapshot and prepares changes without a server write', async () => {
    const goal = {
      id: '11111111-1111-4111-8111-111111111111',
      module: 'whole_day' as const,
      statement: 'Launch HealthyFlow without sacrificing training consistency.',
      context: 'The launch can move, but the training routine should remain stable.',
      createdAt: '2026-08-26T08:00:00.000Z',
      updatedAt: '2026-08-26T08:00:00.000Z',
      archivedAt: null,
    }
    const context = {
      userId: 'user-1',
      caller: 'internal' as const,
      goals: { status: 'ready' as const, records: [goal] },
    }

    await expect(executeAiCapability(context, 'list_goals', {})).resolves.toEqual({
      ok: true,
      value: { goals: [goal] },
    })
    await expect(executeAiCapability(context, 'update_goal', {
      goalId: goal.id,
      context: 'Protect three training sessions per week through launch.',
    })).resolves.toEqual({
      ok: true,
      value: {
        pendingAction: expect.objectContaining({
          capability: 'update_goal',
          args: {
            goalId: goal.id,
            context: 'Protect three training sessions per week through launch.',
          },
          expiresAt: expect.any(String),
        }),
      },
    })
  })

  it('surfaces an unavailable Goal read instead of treating it as no Goals', async () => {
    const result = await executeAiCapability(
      { userId: 'user-1', caller: 'internal', goals: { status: 'unavailable' } },
      'list_goals',
      {},
    )

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ message: expect.stringContaining('Goal read failed') }),
    })
  })

  it('reads the client-owned bounded Habit history without querying hidden model memory', async () => {
    const history = HabitHistorySchema.parse({
      from: '2026-08-24',
      to: '2026-08-26',
      habits: [{
        habitId: 'habit-1',
        title: 'Do not smoke before 11:00',
        category: 'health',
        days: [
          { date: '2026-08-24', recordState: 'recorded', outcome: 'completed', progressTotal: 0, target: null },
          { date: '2026-08-25', recordState: 'recorded', outcome: 'failed', progressTotal: 0, target: null },
          { date: '2026-08-26', recordState: 'not_recorded', outcome: null, progressTotal: 0, target: null },
        ],
        summary: {
          completedDays: 1,
          partialDays: 0,
          failedDays: 1,
          pendingDays: 0,
          recordedDays: 2,
          notRecordedDays: 1,
          currentStreak: 0,
          bestStreak: 1,
          completionRate: 0.5,
        },
      }],
    })

    await expect(executeAiCapability({
      userId: 'user-1',
      caller: 'internal',
      habitHistory: { status: 'ready', record: history },
    }, 'get_habit_history', { habitId: 'habit-1' })).resolves.toEqual({
      ok: true,
      value: history,
    })
  })

  it('surfaces an unavailable Habit-history read instead of treating it as no history', async () => {
    const result = await executeAiCapability({
      userId: 'user-1',
      caller: 'internal',
      habitHistory: { status: 'unavailable' },
    }, 'get_habit_history', {})

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ message: expect.stringContaining('Habit history is unavailable') }),
    })
  })
})
