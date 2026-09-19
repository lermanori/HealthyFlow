import nock from 'nock'
import { db } from '../../src/supabase-client'
import { Credits, calculateOpenAiCostUsd } from '../../src/credits'
import { Openai, parseMealsWithAi } from '../../src/openai'

// Whatever OpenAI reports it spent is recorded as cost, even when the action
// fails and the user's action is refunded (#295). A failure whose spend cannot
// be known records cost as unknown (null), never as 0.

jest.mock('../../src/supabase-client', () => ({
  db: {
    insertUsageLog: jest.fn(),
    grantCredits: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const USER = 'user-1'
const OPENAI = 'https://api.openai.com'
const usage = { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 }

function authorize(actionClass: 'text' | 'photo', credits: number) {
  jest.spyOn(Credits, 'authorizeAction').mockResolvedValue({
    ok: true, actionClass, credits, charged: credits, coveredBy: 'balance',
  })
}

function structured(parser: (v: unknown) => unknown = () => { throw new Error('schema violated') }) {
  return Openai.callBillableStructured({
    userId: USER,
    endpoint: 'parse-tasks',
    model: 'gpt-4o-mini',
    systemPrompt: 'system',
    userPrompt: 'plan my day',
    maxTokens: 400,
    schemaName: 'probe',
    jsonSchema: { type: 'object' },
    parser,
  })
}

function ledgerRow() {
  expect(mockDb.insertUsageLog).toHaveBeenCalledTimes(1)
  return mockDb.insertUsageLog.mock.calls[0][0]
}

beforeAll(() => {
  process.env.OPENAI_API_KEY = 'test-key'
  nock.disableNetConnect()
})
afterAll(() => nock.enableNetConnect())

beforeEach(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
  nock.cleanAll()
  mockDb.insertUsageLog.mockResolvedValue(undefined)
  mockDb.grantCredits.mockResolvedValue(0)
  authorize('text', 1)
})

describe('failed calls still record what OpenAI spent', () => {
  it('a structured reply that fails validation records its cost and refunds the action', async () => {
    nock(OPENAI).post('/v1/chat/completions')
      .reply(200, { choices: [{ message: { content: '{"unexpected":true}' } }], usage })

    const result = await structured()

    expect(result.ok).toBe(false)
    expect(mockDb.grantCredits).toHaveBeenCalledWith(USER, 1)
    expect(ledgerRow()).toMatchObject({
      user_id: USER,
      endpoint: 'parse-tasks',
      model: 'gpt-4o-mini',
      action_class: 'text',
      credits_delta: 0,
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
      cost_usd: calculateOpenAiCostUsd('gpt-4o-mini', { promptTokens: 1000, completionTokens: 200 }),
    })
  })

  it('a reply with no content still records the tokens it spent', async () => {
    nock(OPENAI).post('/v1/chat/completions')
      .reply(200, { choices: [{ message: { content: '' }, finish_reason: 'length' }], usage })

    const result = await structured()

    expect(result.ok).toBe(false)
    expect(ledgerRow()).toMatchObject({
      credits_delta: 0,
      cost_usd: calculateOpenAiCostUsd('gpt-4o-mini', { promptTokens: 1000, completionTokens: 200 }),
    })
  })

  it('an error status from OpenAI is recorded as unbilled, not unknown', async () => {
    nock(OPENAI).post('/v1/chat/completions').reply(500, { error: { message: 'boom' } })

    await structured()

    expect(ledgerRow()).toMatchObject({ credits_delta: 0, cost_usd: 0, model: 'gpt-4o-mini' })
  })

  it('a call that never got an answer records cost as unknown, never as 0', async () => {
    nock(OPENAI).post('/v1/chat/completions').replyWithError('socket hang up')

    await structured()

    const row = ledgerRow()
    expect(row).toMatchObject({ credits_delta: 0, cost_usd: null })
    expect(row.reason).toMatch(/unknown/)
  })

  it('a successful call that reported no usage records cost as unknown', async () => {
    nock(OPENAI).post('/v1/chat/completions')
      .reply(200, { choices: [{ message: { content: '{"ok":true}' } }] })

    const result = await structured(value => value)

    expect(result.ok).toBe(true)
    expect(ledgerRow()).toMatchObject({ credits_delta: -1, cost_usd: null })
  })

  it('a reply that reused cached input records it at the cached rate', async () => {
    nock(OPENAI).post('/v1/chat/completions').reply(200, {
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { ...usage, prompt_tokens_details: { cached_tokens: 400 } },
    })

    await structured(value => value)

    expect(ledgerRow()).toMatchObject({
      credits_delta: -1,
      cost_usd: calculateOpenAiCostUsd('gpt-4o-mini', {
        promptTokens: 1000, cachedPromptTokens: 400, completionTokens: 200,
      }),
    })
  })

  it('a meal photo whose label could not be read records every OCR call it made', async () => {
    authorize('photo', 5)
    const unreadable = {
      nutritionLabelVisible: true,
      brand: null,
      productName: null,
      claimText: null,
      packageProteinGrams: null,
      basisText: null,
      packageText: null,
      productText: null,
      columns: [],
      rows: [],
      notes: 'label is blurred',
    }
    nock(OPENAI).post('/v1/chat/completions').times(3)
      .reply(200, { choices: [{ message: { content: JSON.stringify(unreadable) } }], usage })

    const result = await parseMealsWithAi({
      userId: USER,
      photo: { mimeType: 'image/jpeg', data: 'aGVsbG8=' },
    })

    expect(result.ok).toBe(false)
    expect(mockDb.grantCredits).toHaveBeenCalledWith(USER, 5)
    expect(ledgerRow()).toMatchObject({
      action_class: 'photo',
      model: 'gpt-5.4-mini',
      credits_delta: 0,
      prompt_tokens: 3000,
      completion_tokens: 600,
      cost_usd: calculateOpenAiCostUsd('gpt-5.4-mini', { promptTokens: 3000, completionTokens: 600 }),
    })
  })
})
