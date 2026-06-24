import request from 'supertest'
import nock from 'nock'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { Credits } from '../../src/credits'

// ponytail: mirrors tests/ai/parse-tasks.test.ts — stub Credits so the route's
// reserve/settle calls don't hit real Supabase. Enforcement itself is covered
// by tests/credits/enforcement.test.ts.
jest.mock('../../src/credits', () => ({
  Credits: {
    reserve: jest.fn().mockResolvedValue(true),
    estimateReserve: jest.fn().mockReturnValue(10),
    settleReserved: jest.fn().mockResolvedValue({ ok: true, chargeTokens: 6, adjustmentTokens: 4 }),
    refundReserve: jest.fn().mockResolvedValue(undefined),
    grant: jest.fn().mockResolvedValue(undefined),
    getBalance: jest.fn(),
  },
  FREE_SIGNUP_CREDITS: 50,
}))

const authHeader = () => {
  const token = jwt.sign({ userId: 'test-user-id' }, process.env.JWT_SECRET!)
  return `Bearer ${token}`
}

const validOpenAIResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          meals: [
            {
              name: 'Eggs',
              calories: 140,
              protein: 12,
              carbs: 1,
              fat: 10,
              quantity: '2 eggs',
            },
            {
              name: 'Black coffee',
              calories: 2,
              protein: null,
              carbs: null,
              fat: null,
              quantity: null,
            },
          ],
        }),
      },
    },
  ],
}

describe('POST /api/ai/parse-meals — happy path', () => {
  afterEach(() => {
    nock.cleanAll()
    jest.clearAllMocks()
  })

  it('returns 200 with a list of validated meals when OpenAI returns a well-formed response', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, validOpenAIResponse)

    const res = await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({ text: '2 eggs and a black coffee' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      meals: [
        { name: 'Eggs', calories: 140, protein: 12, carbs: 1, fat: 10, quantity: '2 eggs' },
        { name: 'Black coffee', calories: 2, protein: null, carbs: null, fat: null, quantity: null },
      ],
    })
  })

  it('accepts a photo-only request and forwards it as multimodal OpenAI content with json_schema response format', async () => {
    let observedBody: any

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, function (_uri, body) {
        observedBody = body
        return validOpenAIResponse
      })

    const res = await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({
        photo: {
          mimeType: 'image/png',
          data: Buffer.from('fake-meal-photo').toString('base64'),
        },
      })

    expect(res.status).toBe(200)
    expect(observedBody.messages[1].content).toEqual([
      expect.objectContaining({ type: 'text' }),
      {
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${Buffer.from('fake-meal-photo').toString('base64')}`,
        },
      },
    ])
    expect(observedBody.response_format.type).toBe('json_schema')
  })

  // Regression: OpenAI strict structured-output mode rejects (400) any object
  // whose `properties` aren't all listed in `required`. The meal macros must be
  // nullable-but-required, not optional. The nock mock can't catch this, so we
  // assert it directly against the schema the route actually sends.
  it('sends a json_schema where every object property is required (OpenAI strict mode)', async () => {
    let observedBody: any
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, function (_uri, body) {
        observedBody = body
        return validOpenAIResponse
      })

    await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({ text: 'yogurt' })

    const offenders: string[] = []
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return
      if (node.type === 'object' && node.properties) {
        const props = Object.keys(node.properties)
        const required: string[] = node.required ?? []
        for (const p of props) if (!required.includes(p)) offenders.push(p)
      }
      for (const v of Object.values(node)) walk(v)
    }
    walk(observedBody.response_format.json_schema.schema)
    expect(offenders).toEqual([])
  })
})

describe('POST /api/ai/parse-meals — failure paths', () => {
  afterEach(() => {
    nock.cleanAll()
    jest.clearAllMocks()
  })

  it('returns 400 when neither text nor photo is provided', async () => {
    const res = await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
  })

  it('returns 500 and refunds reserved credits with no meals body when OpenAI upstream fails', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(500, { error: 'internal' })

    const res = await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({ text: '2 eggs and toast' })

    expect(res.status).toBe(500)
    expect(res.body.meals).toBeUndefined()
    expect(Credits.refundReserve).toHaveBeenCalledWith('test-user-id', 10, 'refund_failed_call')
    expect(Credits.settleReserved).not.toHaveBeenCalled()
  })

  it('settles reserved credits with endpoint "parse-meals" on success', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, validOpenAIResponse)

    await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({ text: '2 eggs and a black coffee' })

    expect(Credits.settleReserved).toHaveBeenCalledWith(
      'test-user-id',
      10,
      expect.anything(),
      expect.objectContaining({ endpoint: 'parse-meals' })
    )
  })
})
