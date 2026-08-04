import { z } from 'zod'
import {
  AiCapabilities,
  AiCapabilityInventorySchema,
  type AiCapabilityName,
  aiCapabilityInventory,
  aiCapabilityTools,
  executeAiCapability,
} from '../../src/ai-capabilities'

const requiredFamilies = {
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
    'schedule_workout',
    'add_workout_session',
  ],
  habits: [
    'list_habit_instances',
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
})
