import request from 'supertest'
import nock from 'nock'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { AiCapabilities } from '../../src/ai-capabilities'
import { buildChatSystemPrompt } from '../../src/routes/ai'
import { app } from '../../src/index'

jest.mock('../../src/credits', () => ({
  Credits: {
    reserve: jest.fn().mockResolvedValue(true),
    estimateReserve: jest.fn().mockResolvedValue(10),
    settleReserved: jest.fn().mockResolvedValue({ ok: true, chargeTokens: 6, adjustmentTokens: 4 }),
    refundReserve: jest.fn().mockResolvedValue(undefined),
    grant: jest.fn().mockResolvedValue(undefined),
    getBalance: jest.fn(),
  },
  FREE_SIGNUP_CREDITS: 50,
  UnpricedModelError: class UnpricedModelError extends Error {},
}))

jest.mock('../../src/supabase-client', () => ({
  db: {
    getTasksWithRecurringHabits: jest.fn().mockResolvedValue([
      {
        id: 'task-1',
        title: 'Buy milk',
        type: 'task',
        category: 'personal',
        completed: false,
        scheduled_date: '2026-07-02',
        start_time: null,
        duration: 10,
        repeat_type: 'none',
        position: 0,
        created_at: '2026-07-02T08:00:00.000Z',
      },
    ]),
    getTaskById: jest.fn(),
    getCalorieEntriesByDay: jest.fn().mockResolvedValue([]),
    getCalorieItemByNormalizedName: jest.fn().mockResolvedValue(null),
    getRecentCalorieItems: jest.fn().mockResolvedValue([]),
    getMostUsedCalorieItems: jest.fn().mockResolvedValue([]),
    getWeightEntryByDay: jest.fn().mockResolvedValue(null),
    getRecentWeightEntries: jest.fn().mockResolvedValue([]),
    getAchievementDefinitions: jest.fn().mockResolvedValue([]),
    getAchievementEntries: jest.fn().mockResolvedValue([]),
    getWorkoutSessionsByDay: jest.fn().mockResolvedValue([]),
    getWorkoutSessionExercises: jest.fn().mockResolvedValue([]),
    createAiPendingAction: jest.fn().mockImplementation(async (row) => ({
      id: '11111111-1111-4111-8111-111111111111',
      capability: row.capability,
      preview: row.preview,
      expires_at: row.expires_at,
    })),
  },
}))

jest.mock('../../src/rollover', () => ({
  Rollover: {
    addCarryForwardRows: jest.fn(async (_userId, _date, rows) => rows),
  },
}))

const authHeader = (userId: string) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!)
  return `Bearer ${token}`
}

function toolCallResponse(name: string, args: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name,
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  }
}

function multiToolCallResponse(calls: Array<{ name: string; args?: Record<string, unknown> }>) {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: calls.map((call, index) => ({
            id: `call-${index + 1}`,
            type: 'function',
            function: {
              name: call.name,
              arguments: JSON.stringify(call.args ?? {}),
            },
          })),
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  }
}

const finalAnswerResponse = {
  choices: [
    {
      message: {
        content: 'You have Buy milk on your plate today.',
      },
    },
  ],
  usage: { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132 },
}

const emptyFinalAnswerResponse = {
  choices: [
    {
      message: {
        content: '',
      },
    },
  ],
  usage: { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132 },
}

describe('AI capability schemas', () => {
  it('do not accept userId in model-provided tool inputs', () => {
    for (const capability of Object.values(AiCapabilities)) {
      const schema = JSON.stringify(z.toJSONSchema(capability.inputSchema))
      expect(schema).not.toContain('userId')
    }
  })
})

describe('nutrition lookup capabilities', () => {
  afterEach(() => {
    nock.cleanAll()
    jest.clearAllMocks()
  })

  const danoneItem = {
    id: 'cal-item-1',
    user_id: 'user-1',
    name: 'דנונה PRO יוגורט חלבון 20 גרם',
    normalized_name: 'דנונה pro יוגורט חלבון 20 גרם',
    calories: 140,
    protein: 20,
    carbs: 7,
    fat: 3,
    usage_count: 4,
    last_used_at: '2026-07-02T08:00:00.000Z',
    created_at: '2026-07-01T08:00:00.000Z',
    updated_at: '2026-07-02T08:00:00.000Z',
  }

  it('returns exact calorie history matches before fuzzy matches', async () => {
    const { db } = await import('../../src/supabase-client')
    ;(db.getCalorieItemByNormalizedName as jest.Mock).mockResolvedValueOnce(danoneItem)
    ;(db.getRecentCalorieItems as jest.Mock).mockResolvedValueOnce([
      { ...danoneItem, id: 'cal-item-2', name: 'Protein pudding', normalized_name: 'protein pudding', usage_count: 10 },
    ])
    ;(db.getMostUsedCalorieItems as jest.Mock).mockResolvedValueOnce([])

    const result = await AiCapabilities.search_calorie_history.execute(
      { userId: 'user-1' },
      { query: 'דנונה pro יוגורט חלבון 20 גרם', limit: 5 }
    )

    expect(result.matches[0]).toEqual(expect.objectContaining({
      id: 'cal-item-1',
      matchType: 'exact',
      score: 1,
    }))
  })

  it('fuzzy-matches English query variants to Hebrew calorie history', async () => {
    const { db } = await import('../../src/supabase-client')
    ;(db.getCalorieItemByNormalizedName as jest.Mock).mockResolvedValueOnce(null)
    ;(db.getRecentCalorieItems as jest.Mock).mockResolvedValueOnce([danoneItem])
    ;(db.getMostUsedCalorieItems as jest.Mock).mockResolvedValueOnce([])

    const result = await AiCapabilities.search_calorie_history.execute(
      { userId: 'user-1' },
      { query: 'Danone Pro protein yogurt', limit: 5 }
    )

    expect(result.matches).toEqual([
      expect.objectContaining({
        id: 'cal-item-1',
        matchType: 'fuzzy',
        score: expect.any(Number),
      }),
    ])
  })

  it('returns sourced online candidates for Israeli Danone Pro queries', async () => {
    nock('https://world.openfoodfacts.org')
      .get('/cgi/search.pl')
      .query(true)
      .reply(200, { products: [] })

    const result = await AiCapabilities.lookup_food_nutrition.execute(
      { userId: 'user-1' },
      { query: 'אכלתי יוגורט חלבון 20 גרם דנונה פרו', locale: 'he-IL', limit: 5 }
    )

    expect(result.candidates[0]).toEqual(expect.objectContaining({
      name: 'דנונה PRO יוגורט חלבון 20 גרם',
      calories: 140,
      protein: 20,
      sourceType: 'curated_web',
      confidence: 'medium',
    }))
  })

  it('bounds Open Food Facts lookup with an abort signal', async () => {
    const originalFetch = global.fetch
    const fetchMock = jest.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return {
        ok: true,
        json: async () => ({ products: [] }),
      } as Response
    })
    global.fetch = fetchMock as typeof fetch

    try {
      await AiCapabilities.lookup_food_nutrition.execute(
        { userId: 'user-1' },
        { query: 'unmatched food', locale: 'en-US', limit: 5 }
      )
    } finally {
      global.fetch = originalFetch
    }

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns an explicit low-confidence estimate when no online source matches', async () => {
    nock('https://world.openfoodfacts.org')
      .get('/cgi/search.pl')
      .query(true)
      .reply(200, { products: [] })

    const result = await AiCapabilities.lookup_food_nutrition.execute(
      { userId: 'user-1' },
      { query: '20g protein yogurt', locale: 'en-US', limit: 5 }
    )

    expect(result.candidates[0]).toEqual(expect.objectContaining({
      sourceType: 'estimate',
      confidence: 'low',
      protein: 20,
      notes: expect.stringContaining('Low-confidence estimate'),
    }))
  })

  it('returns low-confidence itemized estimates for vague composite Hebrew meals', async () => {
    nock('https://world.openfoodfacts.org')
      .get('/cgi/search.pl')
      .query(true)
      .reply(200, { products: [] })

    const result = await AiCapabilities.lookup_food_nutrition.execute(
      { userId: 'user-1' },
      { query: 'שקשוקה עם 3 ביצים ופיתה וחצי עם טחינה', locale: 'he-IL', limit: 5 }
    )

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: 'בסיס שקשוקה', calories: 150, sourceType: 'estimate', confidence: 'low' }),
      expect.objectContaining({ name: 'ביצים', quantity: '3 eggs', calories: 210, protein: 18 }),
      expect.objectContaining({ name: 'פיתה', quantity: '1.5 pita', calories: 255, carbs: 49.5 }),
      expect.objectContaining({ name: 'טחינה', calories: 180, fat: 16 }),
    ])
  })

  it('reuses the AI Meal Entry parser for composite meal decomposition', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                meals: [
                  { name: 'שקשוקה', calories: 300, protein: 18, carbs: 20, fat: 20, quantity: '1 serving', labelEvidence: null },
                  { name: 'ביצה', calories: 70, protein: 6, carbs: 1, fat: 5, quantity: '3 eggs', labelEvidence: null },
                  { name: 'פיתה', calories: 150, protein: 5, carbs: 30, fat: 1, quantity: '1.5 pitas', labelEvidence: null },
                  { name: 'טחינה', calories: 90, protein: 3, carbs: 5, fat: 8, quantity: '2 tablespoons', labelEvidence: null },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
      })

    const result = await AiCapabilities.parse_meal_entries.execute(
      { userId: 'user-1' },
      { text: 'שקשוקה עם 3 ביצים ופיתה וחצי עם טחינה', date: '2026-07-02' }
    )

    expect(result).toEqual(expect.objectContaining({
      date: '2026-07-02',
      meals: [
        expect.objectContaining({ name: 'שקשוקה', calories: 300 }),
        expect.objectContaining({ name: 'ביצה', quantity: '3 eggs' }),
        expect.objectContaining({ name: 'פיתה', quantity: '1.5 pitas' }),
        expect.objectContaining({ name: 'טחינה', quantity: '2 tablespoons' }),
      ],
    }))
  })
})

describe('POST /api/ai/chat', () => {
  afterEach(() => {
    nock.cleanAll()
    jest.clearAllMocks()
  })

  it('answers with tool-grounded data and returns tool events', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('list_tasks', { date: '2026-07-02' }))
      .post('/v1/chat/completions')
      .reply(200, finalAnswerResponse)

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-1'))
      .send({ messages: [{ role: 'user', content: "What's on my plate today?" }] })

    expect(res.status).toBe(200)
    expect(res.body.message).toBe('You have Buy milk on your plate today.')
    expect(res.body.toolEvents).toEqual([
      expect.objectContaining({ name: 'list_tasks' }),
    ])
  })

  it('sends image attachments as OpenAI image content on the latest user message', async () => {
    let observedBody: any
    nock('https://api.openai.com')
      .post('/v1/chat/completions', (body: any) => {
        observedBody = body
        return true
      })
      .reply(200, finalAnswerResponse)

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-image-attachment'))
      .send({
        messages: [{ role: 'user', content: 'What is in this image?' }],
        attachment: {
          kind: 'image',
          name: 'note.png',
          mimeType: 'image/png',
          data: Buffer.from('fake-image').toString('base64'),
        },
      })

    expect(res.status).toBe(200)
    const latestUser = observedBody.messages.findLast((message: any) => message.role === 'user')
    expect(latestUser.content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Attachment: note.png (image/png)'),
      }),
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${Buffer.from('fake-image').toString('base64')}` },
      },
    ])
  })

  it('includes text attachments in the latest user message without using image content', async () => {
    let observedBody: any
    nock('https://api.openai.com')
      .post('/v1/chat/completions', (body: any) => {
        observedBody = body
        return true
      })
      .reply(200, finalAnswerResponse)

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-text-attachment'))
      .send({
        messages: [{ role: 'user', content: 'Summarize this.' }],
        attachment: {
          kind: 'text',
          name: 'notes.md',
          mimeType: 'text/markdown',
          text: '# Plan\n\nDrink water and stretch.',
        },
      })

    expect(res.status).toBe(200)
    const latestUser = observedBody.messages.findLast((message: any) => message.role === 'user')
    expect(latestUser.content).toContain('Attached text file: notes.md (text/markdown)')
    expect(latestUser.content).toContain('Drink water and stretch.')
  })

  it('rejects oversized image attachments before calling OpenAI', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-big-image'))
      .send({
        messages: [{ role: 'user', content: 'What is this?' }],
        attachment: {
          kind: 'image',
          name: 'large.png',
          mimeType: 'image/png',
          data: Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64'),
        },
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Image attachment must be 4MB or smaller')
    expect(nock.pendingMocks()).toEqual([])
  })

  it('uses the selected assistant model when provided', async () => {
    let observedBody: any
    nock('https://api.openai.com')
      .post('/v1/chat/completions', (body: any) => {
        observedBody = body
        return true
      })
      .reply(200, finalAnswerResponse)

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-selected-model'))
      .send({
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: 'Hello' }],
      })

    expect(res.status).toBe(200)
    expect(observedBody).toEqual(expect.objectContaining({
      model: 'gpt-5.4-mini',
      max_completion_tokens: expect.any(Number),
    }))
    expect(observedBody).not.toHaveProperty('max_tokens')
    expect(observedBody).not.toHaveProperty('temperature')
  })

  it('instructs the assistant to answer in the latest user message language', async () => {
    let observedBody: any
    nock('https://api.openai.com')
      .post('/v1/chat/completions', (body: any) => {
        observedBody = body
        return true
      })
      .reply(200, finalAnswerResponse)

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-language'))
      .send({ messages: [{ role: 'user', content: 'מה אכלתי היום?' }] })

    expect(res.status).toBe(200)
    const systemMessage = observedBody.messages.find((message: any) => message.role === 'system')
    expect(systemMessage.content).toContain("Answer in the same language as the user's latest message")
    expect(systemMessage.content).toContain('Tool/action preview text, confirmation requests, and result summaries')
  })

  it('instructs calorie previews to preserve explicit meal times', async () => {
    let observedBody: any
    nock('https://api.openai.com')
      .post('/v1/chat/completions', (body: any) => {
        observedBody = body
        return true
      })
      .reply(200, finalAnswerResponse)

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-calorie-time'))
      .send({ messages: [{ role: 'user', content: 'Log 300 calories for lunch at 13:30.' }] })

    expect(res.status).toBe(200)
    const systemMessage = observedBody.messages.find((message: any) => message.role === 'system')
    expect(systemMessage.content).toContain('preserve it in the add_calorie_entry.time field')

    const addCalorieTool = observedBody.tools.find((tool: any) => tool.function?.name === 'add_calorie_entry')
    expect(addCalorieTool.function.parameters.properties.time.description).toContain('Preserve a user-provided time')
  })

  it('grounds relative dates in the current client date context', async () => {
    const systemPrompt = buildChatSystemPrompt('Asia/Jerusalem', new Date('2026-07-05T12:00:00.000Z'))

    expect(systemPrompt).toContain('Client time zone: Asia/Jerusalem')
    expect(systemPrompt).toContain('Current local date: 2026-07-05')
    expect(systemPrompt).toContain('Current local time: 15:00')
    expect(systemPrompt).toContain('Yesterday: 2026-07-04')
    expect(systemPrompt).toContain('Tomorrow: 2026-07-06')
    expect(systemPrompt).toContain('Resolve relative dates and times')
    expect(systemPrompt).toContain('If the user says now or right now, use the current local time')
  })

  it('rejects unsupported assistant models before calling OpenAI', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-invalid-model'))
      .send({
        model: 'not-a-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })

    expect(res.status).toBe(400)
    expect(nock.pendingMocks()).toEqual([])
  })

  it('returns a pending preview instead of immediately executing add tools', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('add_calorie_entry', {
        requestId: 'log-lunch-1',
        date: '2026-07-02',
        name: 'Lunch',
        calories: 300,
      }))
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [
          {
            message: {
              content: 'I prepared that Calorie entry. Confirm it to save.',
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132 },
      })

    const { db } = await import('../../src/supabase-client')
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-add-preview'))
      .send({ messages: [{ role: 'user', content: 'Log lunch as 300 calories.' }] })

    expect(res.status).toBe(200)
    expect(res.body.pendingActions).toEqual([expect.objectContaining({
      id: '11111111-1111-4111-8111-111111111111',
      capability: 'add_calorie_entry',
      preview: {
        action: 'add_calorie_entry',
        willCreate: {
          entry: expect.objectContaining({
            date: '2026-07-02',
            name: 'Lunch',
            calories: 300,
          }),
        },
      },
    })])
    expect(db.createAiPendingAction).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'chat-user-add-preview',
      capability: 'add_calorie_entry',
    }))
  })

  it('uses nutrition lookup tools before preparing a Hebrew food-log preview', async () => {
    nock('https://world.openfoodfacts.org')
      .get('/cgi/search.pl')
      .query(true)
      .reply(200, { products: [] })

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, multiToolCallResponse([
        { name: 'search_calorie_history', args: { query: 'יוגורט חלבון 20 גרם דנונה פרו', limit: 5 } },
        { name: 'list_calorie_entries', args: { date: '2026-07-02', limit: 20 } },
      ]))
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('lookup_food_nutrition', {
        query: 'יוגורט חלבון 20 גרם דנונה פרו',
        locale: 'he-IL',
        limit: 5,
      }))
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('add_calorie_entry', {
        requestId: 'danone-pro-2026-07-02',
        date: '2026-07-02',
        name: 'דנונה PRO יוגורט חלבון 20 גרם',
        quantity: '200g cup',
        calories: 140,
        protein: 20,
        carbs: 7,
        fat: 3,
      }))
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [
          {
            message: {
              content: 'I found a medium-confidence web source for Danone PRO and prepared a Calorie entry. Confirm it to save.',
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132 },
      })

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-hebrew-food'))
      .send({ messages: [{ role: 'user', content: 'אכלתי יוגורט חלבון 20 גרם דנונה פרו' }] })

    expect(res.status).toBe(200)
    expect(res.body.toolEvents.map((event: any) => event.name)).toEqual([
      'search_calorie_history',
      'list_calorie_entries',
      'lookup_food_nutrition',
      'add_calorie_entry',
    ])
    expect(res.body.pendingActions).toEqual([expect.objectContaining({
      capability: 'add_calorie_entry',
      preview: {
        action: 'add_calorie_entry',
        willCreate: {
          entry: expect.objectContaining({
            name: 'דנונה PRO יוגורט חלבון 20 גרם',
            calories: 140,
            protein: 20,
          }),
        },
      },
    })])
  })

  it('prepares a confirmable preview for vague composite meal inserts', async () => {
    nock('https://world.openfoodfacts.org')
      .get('/cgi/search.pl')
      .query(true)
      .reply(200, { products: [] })

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, multiToolCallResponse([
        { name: 'search_calorie_history', args: { query: 'שקשוקה עם 3 ביצים ופיתה וחצי עם טחינה', limit: 5 } },
        { name: 'list_calorie_entries', args: { date: '2026-07-02', limit: 20 } },
      ]))
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('parse_meal_entries', {
        text: 'שקשוקה עם 3 ביצים ופיתה וחצי עם טחינה',
        date: '2026-07-02',
      }))
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                meals: [
                  { name: 'שקשוקה', calories: 300, protein: 18, carbs: 20, fat: 20, quantity: '1 serving', labelEvidence: null },
                  { name: 'ביצה', calories: 70, protein: 6, carbs: 1, fat: 5, quantity: '3 eggs', labelEvidence: null },
                  { name: 'פיתה', calories: 150, protein: 5, carbs: 30, fat: 1, quantity: '1.5 pitas', labelEvidence: null },
                  { name: 'טחינה', calories: 90, protein: 3, carbs: 5, fat: 8, quantity: '2 tablespoons', labelEvidence: null },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
      })
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('add_calorie_entries', {
        requestId: 'vague-shakshuka-2026-07-02',
        entries: [
          { date: '2026-07-02', time: '20:30', name: 'שקשוקה', quantity: '1 serving', calories: 300, protein: 18, carbs: 20, fat: 20 },
          { date: '2026-07-02', time: '20:30', name: 'ביצה', quantity: '3 eggs', calories: 70, protein: 6, carbs: 1, fat: 5 },
          { date: '2026-07-02', time: '20:30', name: 'פיתה', quantity: '1.5 pitas', calories: 150, protein: 5, carbs: 30, fat: 1 },
          { date: '2026-07-02', time: '20:30', name: 'טחינה', quantity: '2 tablespoons', calories: 90, protein: 3, carbs: 5, fat: 8 },
        ],
      }))
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [
          {
            message: {
              content: 'This is a low-confidence estimate for a vague meal. I prepared separate reusable Calorie entries; edit them if needed, then confirm to save.',
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132 },
      })

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-vague-food'))
      .send({
        messages: [
          { role: 'user', content: 'אתמול בערב אכלתי שקשוקה עם 3 ביצים ופיתה וחצי עם טחינה' },
          { role: 'assistant', content: 'I found the requested HealthyFlow data.' },
          { role: 'user', content: 'תכניס את זה כרשומה' },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.message).toContain('low-confidence estimate')
    expect(res.body.toolEvents.map((event: any) => event.name)).toEqual([
      'search_calorie_history',
      'list_calorie_entries',
      'parse_meal_entries',
      'add_calorie_entries',
    ])
    expect(res.body.pendingActions).toEqual([expect.objectContaining({
      capability: 'add_calorie_entries',
      preview: {
        action: 'add_calorie_entries',
        willCreate: {
          entries: expect.arrayContaining([
            expect.objectContaining({ name: 'שקשוקה', calories: 300 }),
            expect.objectContaining({ name: 'ביצה', calories: 70 }),
            expect.objectContaining({ name: 'פיתה', calories: 150 }),
            expect.objectContaining({ name: 'טחינה', calories: 90 }),
          ]),
        },
      },
    })])
  })

  it('can mention a same-day duplicate before preparing another calorie preview', async () => {
    const { db } = await import('../../src/supabase-client')
    ;(db.getCalorieEntriesByDay as jest.Mock).mockResolvedValueOnce([
      {
        id: 'entry-1',
        date: '2026-07-02',
        time: null,
        name: 'דנונה PRO יוגורט חלבון 20 גרם',
        calories: 140,
        protein: 20,
        carbs: 7,
        fat: 3,
        quantity: '200g cup',
        created_at: '2026-07-02T08:00:00.000Z',
      },
    ])

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, multiToolCallResponse([
        { name: 'search_calorie_history', args: { query: 'דנונה פרו', limit: 5 } },
        { name: 'list_calorie_entries', args: { date: '2026-07-02', limit: 20 } },
      ]))
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('add_calorie_entry', {
        requestId: 'danone-pro-duplicate',
        date: '2026-07-02',
        name: 'דנונה PRO יוגורט חלבון 20 גרם',
        quantity: '200g cup',
        calories: 140,
        protein: 20,
      }))
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [
          {
            message: {
              content: 'You already have a matching Calorie entry today. I prepared another one in case this was a second cup; confirm it to save.',
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132 },
      })

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-duplicate-food'))
      .send({ messages: [{ role: 'user', content: 'אכלתי עוד דנונה פרו' }] })

    expect(res.status).toBe(200)
    expect(res.body.message).toContain('already have a matching Calorie entry today')
    expect(res.body.pendingActions).toEqual([expect.objectContaining({
      capability: 'add_calorie_entry',
    })])
  })

  it('falls back to a preview message when a write tool succeeds but the final answer is empty', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('add_calorie_entry', {
        requestId: 'log-lunch-empty-final',
        date: '2026-07-02',
        name: 'Lunch',
        calories: 300,
      }))
      .post('/v1/chat/completions')
      .reply(200, emptyFinalAnswerResponse)

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-empty-final'))
      .send({
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: 'Log lunch as 300 calories.' }],
      })

    expect(res.status).toBe(200)
    expect(res.body.message).toBe('I prepared that change. Review the preview, then Confirm or Cancel.')
    expect(res.body.pendingActions).toEqual([expect.objectContaining({
      capability: 'add_calorie_entry',
    })])
  })

  it('returns every pending preview from a multi-write tool turn', async () => {
    const { db } = await import('../../src/supabase-client')
    ;(db.createAiPendingAction as jest.Mock)
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        capability: 'add_calorie_entry',
        args: { requestId: 'coffee', name: 'Coffee', calories: 10 },
        preview: { action: 'add_calorie_entry' },
        expires_at: '2026-07-02T10:10:00.000Z',
      })
      .mockResolvedValueOnce({
        id: '22222222-2222-4222-8222-222222222222',
        capability: 'add_weight_entry',
        args: { requestId: 'weight', date: '2026-07-02', weightKg: 82 },
        preview: { action: 'add_weight_entry' },
        expires_at: '2026-07-02T10:10:00.000Z',
      })

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, multiToolCallResponse([
        { name: 'add_calorie_entry', args: { requestId: 'coffee', name: 'Coffee', calories: 10 } },
        { name: 'add_weight_entry', args: { requestId: 'weight', date: '2026-07-02', weightKg: 82 } },
      ]))
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [{ message: { content: 'I prepared both changes. Confirm the ones you want.' } }],
        usage: { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132 },
      })

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-two-previews'))
      .send({ messages: [{ role: 'user', content: 'Log coffee and my weight.' }] })

    expect(res.status).toBe(200)
    expect(res.body.pendingActions).toEqual([
      expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111', capability: 'add_calorie_entry' }),
      expect.objectContaining({ id: '22222222-2222-4222-8222-222222222222', capability: 'add_weight_entry' }),
    ])
  })

  it('surfaces capability failures as explicit errors', async () => {
    const { db } = await import('../../src/supabase-client')
    ;(db.getTasksWithRecurringHabits as jest.Mock).mockRejectedValueOnce(new Error('database unavailable'))

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('list_tasks', { date: '2026-07-02' }))

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-2'))
      .send({ messages: [{ role: 'user', content: "What's on my plate today?" }] })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'database unavailable', code: 'tool_error' })
  })

  it('surfaces object-shaped tool failures instead of generic fallback text', async () => {
    const { db } = await import('../../src/supabase-client')
    ;(db.createAiPendingAction as jest.Mock).mockRejectedValueOnce({
      code: 'PGRST205',
      message: 'Could not find the table public.ai_pending_actions',
      details: 'Searched for public.ai_pending_actions in schema cache',
    })

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('add_task', {
        title: 'Buy coffee',
        category: 'personal',
        duration: 15,
      }))

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-object-error'))
      .send({ messages: [{ role: 'user', content: 'Add buy coffee as a task.' }] })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      error: expect.stringContaining('Could not find the table public.ai_pending_actions'),
      code: 'tool_error',
    })
    expect(res.body.error).toContain('PGRST205')
    expect(res.body.error).not.toBe('Tool execution failed')
  })

  it('recovers from an invented item id instead of leaking a raw db error', async () => {
    const { db } = await import('../../src/supabase-client')

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('complete_task', { itemId: '1' }))
      .post('/v1/chat/completions')
      .reply(200, finalAnswerResponse)

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-bad-id'))
      .send({ messages: [{ role: 'user', content: 'mark coffee with sami as done' }] })

    // The invented id never reached Postgres, so no raw 22P02 surfaced and the
    // turn was not aborted — the model got a recoverable error and answered.
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('You have Buy milk on your plate today.')
    expect(db.getTaskById).not.toHaveBeenCalled()
    const badEvent = res.body.toolEvents.find((event: any) => event.name === 'complete_task')
    expect(badEvent.result).toEqual({
      ok: false,
      error: expect.stringContaining('No Item found with id "1"'),
    })
  })

  it('settles accumulated usage when a later tool loop fails', async () => {
    const { Credits } = await import('../../src/credits')

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('list_tasks', { date: '2026-07-02' }))
      .post('/v1/chat/completions')
      .reply(200, toolCallResponse('missing_tool', {}))

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-billing-failure'))
      .send({ messages: [{ role: 'user', content: "What's on my plate today?" }] })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Unknown tool: missing_tool', code: 'tool_error' })
    expect(Credits.settleReserved).toHaveBeenCalledWith(
      'chat-user-billing-failure',
      10,
      { promptTokens: 200, completionTokens: 40, totalTokens: 240 },
      { endpoint: 'ai-chat', model: 'gpt-4o-mini' }
    )
    expect(Credits.refundReserve).not.toHaveBeenCalled()
  })

  it('rate limits per user', async () => {
    nock('https://api.openai.com')
      .persist()
      .post('/v1/chat/completions')
      .reply(200, finalAnswerResponse)

    for (let i = 0; i < 12; i += 1) {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', authHeader('chat-user-rate-limit'))
        .send({ messages: [{ role: 'user', content: `Question ${i}` }] })
      expect(res.status).toBe(200)
    }

    const limited = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', authHeader('chat-user-rate-limit'))
      .send({ messages: [{ role: 'user', content: 'One more' }] })

    expect(limited.status).toBe(429)
    expect(limited.body.code).toBe('rate_limited')
  })
})
