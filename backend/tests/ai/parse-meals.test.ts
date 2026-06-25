import request from 'supertest'
import nock from 'nock'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { Credits } from '../../src/credits'

// Mirrors tests/ai/parse-tasks.test.ts: stub Credits so the route's
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
              labelEvidence: null,
            },
            {
              name: 'Black coffee',
              calories: 2,
              protein: null,
              carbs: null,
              fat: null,
              quantity: null,
              labelEvidence: null,
            },
          ],
        }),
      },
    },
  ],
}
const validOcrOpenAIResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          brand: 'müller',
          productName: 'משקה קפה',
          claimText: 'חלב 0% שומן',
          basisText: 'ב-100 מ״ל',
          packageText: '350 מ״ל',
          productText: 'משקה קפה חלב 0% שומן',
          numericColumnTopToBottom: ['45', '0', '70', '4.2', '1', '1', '7.15', '175'],
          labelColumnTopToBottom: ['אנרגיה (קלוריות)', 'שומנים', 'נתרן', 'סך הפחמימות', 'סוכרים', 'כפיות סוכר', 'חלבונים', 'סידן'],
          pairedRows: [
            { row: 1, rawNumber: '45', rawLabel: 'אנרגיה (קלוריות)', canonical: '45 קלוריות' },
            { row: 2, rawNumber: '0', rawLabel: 'שומנים', canonical: '0 גרם' },
            { row: 3, rawNumber: '70', rawLabel: 'נתרן', canonical: '70 מ״ג' },
            { row: 4, rawNumber: '4.2', rawLabel: 'סך הפחמימות', canonical: '4.2 גרם' },
            { row: 5, rawNumber: '1', rawLabel: 'סוכרים', canonical: '1 גרם' },
            { row: 6, rawNumber: '1', rawLabel: 'כפיות סוכר', canonical: '1 כפית' },
            { row: 7, rawNumber: '7.15', rawLabel: 'חלבונים', canonical: '7.15 גרם' },
            { row: 8, rawNumber: '175', rawLabel: 'סידן', canonical: '175 מ״ג' },
          ],
          notes: '',
        }),
      },
    },
  ],
}
const highReview = {
  confidence: 'high',
  score: 100,
  needsReview: false,
  reasons: [],
  summary: 'ב-100 מ״ל · 350 מ״ל · 45 cal · P 7.15g · C 4.2g · F 0g',
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
      review: {
        confidence: 'high',
        score: 100,
        needsReview: false,
        reasons: [],
        summary: null,
      },
    })
  })

  it('accepts a photo-only request and forwards it as multimodal OpenAI content with json_schema response format', async () => {
    let observedBody: any

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, function (_uri, body) {
        observedBody = body
        return validOcrOpenAIResponse
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
    expect(res.body).toEqual({
      meals: [
        {
          name: 'müller משקה קפה',
          calories: 158,
          protein: 25,
          carbs: 14.7,
          fat: 0,
          quantity: '350 ml',
        },
      ],
      review: highReview,
    })
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

  it('uses an OCR-only prompt before calculating nutrition for label photos', async () => {
    let observedBody: any

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, function (_uri, body) {
        observedBody = body
        return validOcrOpenAIResponse
      })

    await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({
        photo: {
          mimeType: 'image/jpeg',
          data: Buffer.from('fake-hebrew-label').toString('base64'),
        },
      })

    const allText = observedBody.messages.map((message: any) =>
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part: any) => part.text ?? '').join('\n')
    ).join('\n')
    expect(allText).toContain('OCR ONLY')
    expect(allText).toContain('Do not estimate nutrition and do not calculate totals')
    expect(allText).toContain('brand/logo text')
    expect(allText).toContain('Do not use nutrition claims like 0% שומן as the productName')
    expect(allText).toContain('Extract the numeric column top-to-bottom')
    expect(allText).toContain('Pair rows by index only')
    expect(allText).toContain('חלבונים')
    expect(allText).toContain('סידן')
  })

  it('asks OCR to extract basis, package amount, and product claims before table rows', async () => {
    let observedBody: any

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, function (_uri, body) {
        observedBody = body
        return validOcrOpenAIResponse
      })

    await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({
        photo: {
          mimeType: 'image/jpeg',
          data: Buffer.from('fake-muller-bottle-label').toString('base64'),
        },
      })

    const allText = observedBody.messages.map((message: any) =>
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part: any) => part.text ?? '').join('\n')
    ).join('\n')
    expect(allText).toContain('nutrition table basis/header')
    expect(allText).toContain('package/bottle amount')
    expect(allText).toContain('claim text')
    expect(allText).toContain('350 מ״ל')
    expect(allText).toContain('0% שומן')
  })

  it('normalizes OCR-first per-100ml table rows into package totals before returning public meals', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, validOcrOpenAIResponse)

    const res = await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({
        photo: {
          mimeType: 'image/jpeg',
          data: Buffer.from('fake-muller-bottle-label').toString('base64'),
        },
      })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      meals: [
        {
          name: 'müller משקה קפה',
          calories: 158,
          protein: 25,
          carbs: 14.7,
          fat: 0,
          quantity: '350 ml',
        },
      ],
      review: highReview,
    })
  })

  it('returns review metadata when OCR evidence is missing required label data', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                brand: 'müller',
                productName: 'משקה קפה',
                claimText: 'חלב 0% שומן',
                basisText: 'ב-100 מ״ל',
                packageText: '350 מ״ל',
                productText: 'משקה קפה חלב 0% שומן',
                numericColumnTopToBottom: ['45', '0'],
                labelColumnTopToBottom: ['אנרגיה (קלוריות)', 'שומנים'],
                pairedRows: [
                  { row: 1, rawNumber: '45', rawLabel: 'אנרגיה (קלוריות)', canonical: '45 קלוריות' },
                  { row: 2, rawNumber: '0', rawLabel: 'שומנים', canonical: '0 גרם' },
                ],
                notes: '',
              }),
            },
          },
        ],
      })

    const res = await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({
        photo: {
          mimeType: 'image/jpeg',
          data: Buffer.from('partial-label').toString('base64'),
        },
      })

    expect(res.status).toBe(200)
    expect(res.body.review).toEqual(expect.objectContaining({
      confidence: 'medium',
      needsReview: true,
      reasons: expect.arrayContaining(['Missing protein row', 'Missing carbs row']),
    }))
  })

  it('keeps text-only estimated meals unchanged when no label evidence is present', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, validOpenAIResponse)

    const res = await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({ text: '2 eggs and a black coffee' })

    expect(res.status).toBe(200)
    expect(res.body.meals[0]).toEqual({ name: 'Eggs', calories: 140, protein: 12, carbs: 1, fat: 10, quantity: '2 eggs' })
    expect(res.body.meals[0].labelEvidence).toBeUndefined()
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
