import assert from 'node:assert/strict'
import test from 'node:test'
import assertions from './assertions.cjs'
import generateTalkTests from './generate-tests.cjs'
import { openAiScenario } from '../talk-prompt-lab.mjs'
import HealthyFlowTalkProvider from './talk-provider.mjs'

const config = {
  requiredTools: ['get_today', 'list_goals'],
  forbiddenTools: ['add_task'],
  replyIncludes: ['App Store reviewer notes'],
  replyIncludesOneOf: [['upper bound', 'at most', 'not exact'], ['16:30', 'later sessions', '4 of 5']],
  replyExcludes: ['estimate', 'about 75'],
  requireNoPendingActions: true,
}

test('deterministic grader accepts a grounded read-only recommendation', () => {
  const grade = assertions.validateTalkBehavior(JSON.stringify({
    reply: 'Finish App Store reviewer notes before 16:30. Capacity is an upper bound because Calendar is unavailable.',
    toolEvents: [{ name: 'get_today' }, { name: 'list_goals' }],
    pendingActions: [],
  }), { config })

  assert.equal(grade.pass, true)
  assert.equal(grade.score, 1)
})

test('deterministic grader rejects missing context and an unsolicited write', () => {
  const grade = assertions.validateTalkBehavior(JSON.stringify({
    reply: 'I added a new task for you.',
    toolEvents: [{ name: 'get_today' }, { name: 'add_task' }],
    pendingActions: [{ capability: 'add_task' }],
  }), { config })

  assert.equal(grade.pass, false)
  assert.ok(grade.score < 1)
  assert.ok(grade.componentResults.some((component) => !component.pass))
})

test('deterministic grader rejects an upper bound described as an estimate', () => {
  const grade = assertions.validateTalkBehavior(JSON.stringify({
    reply: 'Finish App Store reviewer notes before 16:30. Capacity is estimated at 75 minutes because Calendar is unavailable.',
    toolEvents: [{ name: 'get_today' }, { name: 'list_goals' }, { name: 'list_habit_history' }],
    pendingActions: [],
  }), { config })

  assert.equal(grade.pass, false)
  assert.ok(grade.componentResults.some((component) => component.reason.includes('estimate') && !component.pass))
})

test('every scenario with expectations becomes a Promptfoo test automatically', async () => {
  const cases = await generateTalkTests()
  assert.equal(cases.length, 6)
  assert.ok(cases.some((item) => item.vars.scenarioId === 'day-pivot'))
  assert.ok(cases.some((item) => item.vars.scenarioId === 'weekly-limited-evidence'))
  assert.match(cases[0].vars.DATE_CONTEXT, /Current local date:/)
})

test('Promptfoo runner treats the target as an opaque scenario adapter', async () => {
  const source = `export async function runScenario({ scenario, systemPrompt, options }) {
    return {
      reply: [scenario.id, systemPrompt, options.sentinel].join(':'),
      turns: [{ user: scenario.user, reply: 'stub', toolEvents: [], pendingActions: [] }],
      toolEvents: [], pendingActions: [], finalState: { observed: true },
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }, elapsedMs: 4,
    }
  }`
  const provider = new HealthyFlowTalkProvider({ config: {
    name: 'opaque-stub',
    targetModule: `data:text/javascript,${encodeURIComponent(source)}`,
    options: { sentinel: 'passed' },
  } })
  const response = await provider.callApi('prompt', { vars: { scenarioId: 'mixed-capture' } })
  assert.equal(provider.id(), 'healthyflow-talk:opaque-stub')
  assert.equal(response.error, undefined)
  assert.equal(JSON.parse(response.output).reply, 'mixed-capture:prompt:passed')
  assert.deepEqual(JSON.parse(response.output).finalFixtureState, { observed: true })
})

test('the headless harness carries history across turns but only previews writes', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-placeholder'
  const requests = []
  const responses = [
    { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'add_task', arguments: '{"title":"Call Maya","scheduledDate":"2026-10-21"}' } }] },
    { role: 'assistant', content: 'Please review the Task preview before saving.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call-2', type: 'function', function: { name: 'update_item', arguments: '{"itemId":"old-id","startTime":"16:00"}' } }] },
    { role: 'assistant', content: 'It is still only a preview; I need a fresh Item id before updating it.' },
  ]
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body))
    return { ok: true, json: async () => ({ choices: [{ message: responses.shift() }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) }
  }
  try {
    const fixtureState = { tasks: [] }
    const result = await openAiScenario({
      model: 'gpt-4o-mini',
      systemPrompt: 'Test Talk',
      scenario: {
        fixtureState,
        toolResults: {},
        turns: [{ user: 'Add Call Maya tomorrow.' }, { user: 'Move it to 16:00.' }],
      },
    })
    assert.equal(result.turns.length, 2)
    assert.equal(result.turns[0].pendingActions[0].status, 'preview_only')
    assert.equal(Object.hasOwn(result.turns[0].pendingActions[0].args, 'duration'), false)
    assert.equal(result.turns[1].toolEvents[0].result.error.code, 'unverified_item_id')
    assert.equal(result.turns[1].pendingActions.length, 0)
    assert.deepEqual(fixtureState, { tasks: [] })
    assert.ok(requests[2].messages.some((message) => message.role === 'tool' && message.content.includes('preview_only')))
    assert.ok(requests[2].messages.some((message) => message.role === 'assistant' && message.content?.includes('Please review')))
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
  }
})

test('turn checks fail when a later response drops the corrected item', () => {
  const grade = assertions.validateTalkBehavior(JSON.stringify({
    reply: 'Finish reviewer notes.',
    toolEvents: [],
    pendingActions: [],
    turns: [
      { reply: 'Finish reviewer notes.', toolEvents: [{ name: 'get_today' }], pendingActions: [] },
      { reply: 'Finish reviewer notes.', toolEvents: [{ name: 'get_today' }], pendingActions: [] },
    ],
  }), { config: { turnChecks: [{ turn: 1, replyIncludes: ['release checklist'] }] } })
  assert.equal(grade.pass, false)
  assert.ok(grade.componentResults.some((component) => component.reason.includes('turn 2')))
})
