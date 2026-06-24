import request from 'supertest'
import nock from 'nock'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'

// ponytail: this suite predates credit enforcement — stub Credits so the
// route's reserve/settle calls don't hit real Supabase. Enforcement itself
// is covered by tests/credits/enforcement.test.ts.
jest.mock('../../src/credits', () => ({
  Credits: {
    reserve: jest.fn().mockResolvedValue(true),
    settle: jest.fn().mockResolvedValue(undefined),
    grant: jest.fn().mockResolvedValue(undefined),
    getBalance: jest.fn(),
  },
  CREDITS_PER_ACTION: 1,
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
            {
              title: 'Call the dentist',
              type: 'task',
              category: 'personal',
              duration: 10,
              priority: 'medium',
              startTime: null,
              scheduledDate: '2026-06-10',
              repeat: 'none',
            },
          ],
        }),
      },
    },
  ],
}

describe('POST /api/ai/parse-tasks — happy path', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  it('returns 200 with a list of validated Items when OpenAI returns a well-formed response', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, validOpenAIResponse)

    const res = await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .send({ text: 'Start meditating daily and call the dentist tomorrow' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
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
        {
          title: 'Call the dentist',
          type: 'task',
          category: 'personal',
          duration: 10,
          priority: 'medium',
          startTime: null,
          scheduledDate: '2026-06-10',
          repeat: 'none',
        },
      ],
    })
  })

  it('ignores apiKey in the request body and forwards process.env.OPENAI_API_KEY to OpenAI', async () => {
    let observedAuthHeader: string | undefined

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, function (_uri, _body) {
        observedAuthHeader = this.req.headers['authorization'] as string
        return validOpenAIResponse
      })

    await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .send({
        text: 'meditate daily',
        apiKey: 'sk-rogue-key-from-body-should-be-ignored',
      })

    expect(observedAuthHeader).toBe(`Bearer ${process.env.OPENAI_API_KEY}`)
    expect(observedAuthHeader).not.toContain('rogue')
  })
})
