/**
 * Slice B (Enforcement) — issue #44.
 *
 * Behaviors tested:
 *   parse-tasks happy path  → reserves estimated AI tokens, OpenAI call settles actual usage
 *   insufficient AI tokens  → 402 before OpenAI is ever called
 *   AI failure               → refund (grant) before returning an explicit error response
 *   signup                   → seeds FREE_SIGNUP_CREDITS via Credits.grant
 *   balance endpoint          → returns Credits.getBalance for the authed user
 */
import request from 'supertest'
import nock from 'nock'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Credits, FREE_SIGNUP_CREDITS } from '../../src/credits'
import { Onboarding } from '../../src/onboarding'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getTasksByUserId: jest.fn(),
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
  },
}))

jest.mock('../../src/credits', () => ({
  Credits: {
    reserve: jest.fn(),
    estimateReserve: jest.fn(),
    settleReserved: jest.fn(),
    refundReserve: jest.fn(),
    grant: jest.fn(),
    getBalance: jest.fn(),
  },
  FREE_SIGNUP_CREDITS: 50,
}))

jest.mock('../../src/onboarding', () => ({
  Onboarding: {
    seedNewUser: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockCredits = Credits as jest.Mocked<typeof Credits>
const mockOnboarding = Onboarding as jest.Mocked<typeof Onboarding>

const USER_ID = 'test-user-id'
const authHeader = () => `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

const validOpenAIResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          items: [
            {
              title: 'Daily meditation',
              type: 'habit',
              category: 'health',
              duration: 15,
              priority: 'high',
              startTime: '07:00',
              scheduledDate: '2026-06-09',
              repeat: 'daily',
            },
          ],
        }),
      },
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCredits.estimateReserve.mockResolvedValue(10)
  mockCredits.settleReserved.mockResolvedValue({ ok: true, chargeTokens: 6, adjustmentTokens: 4 })
})

afterEach(() => {
  nock.cleanAll()
})

describe('POST /api/ai/parse-tasks — credit enforcement', () => {
  it('reserves, calls OpenAI, and settles with usage on success', async () => {
    mockCredits.reserve.mockResolvedValue(true)
    nock('https://api.openai.com').post('/v1/chat/completions').reply(200, validOpenAIResponse)

    const res = await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .send({ text: 'meditate daily' })

    expect(res.status).toBe(200)
    expect(mockCredits.estimateReserve).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o-mini',
      maxOutputTokens: 1000,
    }))
    expect(mockCredits.reserve).toHaveBeenCalledWith(USER_ID, 10)
    expect(mockCredits.settleReserved).toHaveBeenCalledWith(
      USER_ID,
      10,
      { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      { endpoint: 'parse-tasks', model: 'gpt-4o-mini' }
    )
    expect(mockCredits.grant).not.toHaveBeenCalled()
  })

  it('returns 402 and never calls OpenAI when reserve fails (insufficient credits)', async () => {
    mockCredits.reserve.mockResolvedValue(false)
    const scope = nock('https://api.openai.com').post('/v1/chat/completions').reply(200, validOpenAIResponse)

    const res = await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .send({ text: 'meditate daily' })

    expect(res.status).toBe(402)
    expect(res.body).toEqual({ error: 'Insufficient AI tokens', code: 'insufficient_credits' })
    expect(scope.isDone()).toBe(false)
    expect(mockCredits.settleReserved).not.toHaveBeenCalled()
  })

  it('refunds the full reserve when OpenAI call fails, then returns the existing 500 error', async () => {
    mockCredits.reserve.mockResolvedValue(true)
    nock('https://api.openai.com').post('/v1/chat/completions').reply(500)

    const res = await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .send({ text: 'meditate daily' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Could not parse — try again', code: 'ai_parse_failed' })
    expect(mockCredits.refundReserve).toHaveBeenCalledWith(USER_ID, 10, 'refund_failed_call')
    expect(mockCredits.settleReserved).not.toHaveBeenCalled()
  })

  it('settles with zeroed usage when OpenAI omits usage data', async () => {
    mockCredits.reserve.mockResolvedValue(true)
    const { usage, ...noUsageResponse } = validOpenAIResponse
    nock('https://api.openai.com').post('/v1/chat/completions').reply(200, noUsageResponse)

    const res = await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .send({ text: 'meditate daily' })

    expect(res.status).toBe(200)
    expect(mockCredits.settleReserved).toHaveBeenCalledWith(
      USER_ID,
      10,
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      { endpoint: 'parse-tasks', model: 'gpt-4o-mini' }
    )
  })

  it('estimates image parse before the call and settles with actual returned usage', async () => {
    mockCredits.reserve.mockResolvedValue(true)
    nock('https://api.openai.com').post('/v1/chat/completions').reply(200, validOpenAIResponse)

    const res = await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .send({
        photo: {
          mimeType: 'image/png',
          data: Buffer.from('tiny image fixture').toString('base64'),
        },
      })

    expect(res.status).toBe(200)
    expect(mockCredits.estimateReserve).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o-mini',
      userPrompt: expect.arrayContaining([
        expect.objectContaining({ type: 'image_url' }),
      ]),
      maxOutputTokens: 1000,
    }))
    expect(mockCredits.settleReserved).toHaveBeenCalledWith(
      USER_ID,
      10,
      { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      { endpoint: 'parse-tasks', model: 'gpt-4o-mini' }
    )
  })
})

describe('POST /api/ai/query-tasks — credit enforcement', () => {
  it('reserves, calls OpenAI, and settles on success', async () => {
    mockDb.getTasksByUserId.mockResolvedValue([])
    mockCredits.reserve.mockResolvedValue(true)
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [{ message: { content: 'You have no tasks.' } }],
        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
      })

    const res = await request(app)
      .post('/api/ai/query-tasks')
      .set('Authorization', authHeader())
      .send({ question: 'What do I have today?' })

    expect(res.status).toBe(200)
    expect(mockCredits.estimateReserve).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-3.5-turbo',
      maxOutputTokens: 500,
    }))
    expect(mockCredits.reserve).toHaveBeenCalledWith(USER_ID, 10)
    expect(mockCredits.settleReserved).toHaveBeenCalledWith(
      USER_ID,
      10,
      { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
      { endpoint: 'query-tasks', model: 'gpt-3.5-turbo' }
    )
  })

  it('returns 402 when reserve fails', async () => {
    mockDb.getTasksByUserId.mockResolvedValue([])
    mockCredits.reserve.mockResolvedValue(false)
    const scope = nock('https://api.openai.com').post('/v1/chat/completions').reply(200, {})

    const res = await request(app)
      .post('/api/ai/query-tasks')
      .set('Authorization', authHeader())
      .send({ question: 'What do I have today?' })

    expect(res.status).toBe(402)
    expect(res.body).toEqual({ error: 'Insufficient AI tokens', code: 'insufficient_credits' })
    expect(scope.isDone()).toBe(false)
  })

  it('refunds via grant when OpenAI call fails, returning an explicit error', async () => {
    mockDb.getTasksByUserId.mockResolvedValue([])
    mockCredits.reserve.mockResolvedValue(true)
    nock('https://api.openai.com').post('/v1/chat/completions').reply(500)

    const res = await request(app)
      .post('/api/ai/query-tasks')
      .set('Authorization', authHeader())
      .send({ question: 'What do I have today?' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'AI service unavailable', code: 'ai_unavailable' })
    expect(mockCredits.refundReserve).toHaveBeenCalledWith(USER_ID, 10, 'refund_failed_call')
    expect(mockCredits.settleReserved).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/signup — credit seeding', () => {
  it('grants FREE_SIGNUP_CREDITS to the new user', async () => {
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({
      id: 'new-user-id',
      email: 'new@example.com',
      name: 'New User',
      password_hash: 'hash',
    })

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'password123', name: 'New User' })

    expect(res.status).toBe(200)
    expect(mockCredits.grant).toHaveBeenCalledWith('new-user-id', FREE_SIGNUP_CREDITS, 'signup_bonus')
    expect(mockOnboarding.seedNewUser).toHaveBeenCalledWith('new-user-id')
  })
})

describe('GET /api/credits/balance', () => {
  it('returns the balance for the authed user', async () => {
    mockCredits.getBalance.mockResolvedValue(42)

    const res = await request(app).get('/api/credits/balance').set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ balance: 42 })
    expect(mockCredits.getBalance).toHaveBeenCalledWith(USER_ID)
  })
})
