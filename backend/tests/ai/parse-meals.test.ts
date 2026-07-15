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
          nutritionLabelVisible: true,
          brand: 'müller',
          productName: 'משקה קפה',
          claimText: 'חלב 0% שומן',
          packageProteinGrams: 25,
          basisText: 'ב-100 מ״ל',
          packageText: '350 מ״ל',
          productText: 'משקה קפה חלב 0% שומן',
          columns: [{ basis: 'per_100ml', basisText: 'ב-100 מ״ל' }],
          rows: [
            { row: 1, rawLabel: 'אנרגיה (קלוריות)', nutrient: 'energy', rawValues: ['45'] },
            { row: 2, rawLabel: 'שומנים', nutrient: 'fat', rawValues: ['0'] },
            { row: 3, rawLabel: 'נתרן', nutrient: 'sodium', rawValues: ['70'] },
            { row: 4, rawLabel: 'סך הפחמימות', nutrient: 'carbs', rawValues: ['4.2'] },
            { row: 5, rawLabel: 'סוכרים', nutrient: 'sugars', rawValues: ['1'] },
            { row: 6, rawLabel: 'כפיות סוכר', nutrient: 'other', rawValues: ['1'] },
            { row: 7, rawLabel: 'חלבונים', nutrient: 'protein', rawValues: ['7.15'] },
            { row: 8, rawLabel: 'סידן', nutrient: 'calcium', rawValues: ['175'] },
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
    expect(allText).toContain('in any language')
    expect(allText).toContain('do not translate rawLabel')
    expect(allText).toContain('exactly one columns entry for each header')
    expect(allText).toContain('rawValues left-to-right')
    expect(allText).toContain('238 kJ / 56 kcal')
    expect(allText).toContain('folic acid')
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
    expect(allText).toContain('package amount')
    expect(allText).toContain('claim text')
    expect(allText).toContain('160 g')
    expect(allText).toContain('0% fat')
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
                nutritionLabelVisible: true,
                brand: 'müller',
                productName: 'משקה קפה',
                claimText: 'חלב 0% שומן',
                packageProteinGrams: null,
                basisText: 'ב-100 מ״ל',
                packageText: '350 מ״ל',
                productText: 'משקה קפה חלב 0% שומן',
                columns: [{ basis: 'per_100ml', basisText: 'ב-100 מ״ל' }],
                rows: [
                  { row: 1, rawLabel: 'אנרגיה (קלוריות)', nutrient: 'energy', rawValues: ['45'] },
                  { row: 2, rawLabel: 'שומנים', nutrient: 'fat', rawValues: ['0'] },
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
