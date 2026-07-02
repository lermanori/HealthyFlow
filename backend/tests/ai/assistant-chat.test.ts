import request from 'supertest'
import nock from 'nock'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { AiCapabilities } from '../../src/ai-capabilities'
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
    getCalorieEntriesByDay: jest.fn().mockResolvedValue([]),
    getWeightEntryByDay: jest.fn().mockResolvedValue(null),
    getRecentWeightEntries: jest.fn().mockResolvedValue([]),
    getAchievementDefinitions: jest.fn().mockResolvedValue([]),
    getAchievementEntries: jest.fn().mockResolvedValue([]),
    getWorkoutSessionsByDay: jest.fn().mockResolvedValue([]),
    getWorkoutSessionExercises: jest.fn().mockResolvedValue([]),
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

describe('AI capability schemas', () => {
  it('do not accept userId in model-provided tool inputs', () => {
    for (const capability of Object.values(AiCapabilities)) {
      const schema = JSON.stringify(z.toJSONSchema(capability.inputSchema))
      expect(schema).not.toContain('userId')
    }
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
