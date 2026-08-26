import request from 'supertest'
import nock from 'nock'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'

jest.mock('../../src/credits', () => ({
  Credits: {
    reserve: jest.fn().mockResolvedValue(true),
    authorizeAction: jest.fn().mockResolvedValue({ ok: true, actionClass: 'text' as const, credits: 1, charged: 1, coveredBy: 'balance' as const }),
    settleAction: jest.fn().mockResolvedValue(undefined),
    refundAction: jest.fn().mockResolvedValue(undefined),
    grant: jest.fn().mockResolvedValue(undefined),
    getBalance: jest.fn(),
  },
}))

const authHeader = () => {
  const token = jwt.sign({ userId: 'test-user-id' }, process.env.JWT_SECRET!)
  return `Bearer ${token}`
}

describe('POST /api/ai/parse-tasks — date context regressions', () => {
  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'setInterval', 'setTimeout'],
    })
    jest.setSystemTime(new Date('2026-07-26T14:48:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
    nock.cleanAll()
  })

  it('provides the client-local weekday map and dated next-seven-day list', async () => {
    let observedBody: any

    nock('https://api.openai.com')
      .post('/v1/chat/completions', (body: any) => {
        observedBody = body
        return true
      })
      .reply(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({ items: [] }),
            },
          },
        ],
      })

    const res = await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .set('X-Client-Time-Zone', 'Asia/Jerusalem')
      .send({
        text: `ראשון- ערן ויואב
שלישי- דסו ויאיר 20:30
חמישי- האפי האוור ורמוטריה 17:30`,
      })

    expect(res.status).toBe(200)
    const systemPrompt = observedBody.messages[0].content
    expect(systemPrompt).toContain('Client time zone: Asia/Jerusalem')
    expect(systemPrompt).toContain('Current local date: Sunday, 2026-07-26')
    expect(systemPrompt).toContain('Yesterday: Saturday, 2026-07-25')
    expect(systemPrompt).toContain('Tomorrow: Monday, 2026-07-27')
    expect(systemPrompt).toContain(`Next 7 days (counting today):
- Sunday, 2026-07-26
- Monday, 2026-07-27
- Tuesday, 2026-07-28
- Wednesday, 2026-07-29
- Thursday, 2026-07-30
- Friday, 2026-07-31
- Saturday, 2026-08-01`)
    expect(systemPrompt).toContain(
      'ראשון=Sunday, שני=Monday, שלישי=Tuesday, רביעי=Wednesday, חמישי=Thursday, שישי=Friday, שבת=Saturday',
    )
    expect(systemPrompt).toContain('Never compute a weekday from a date yourself; use the dated list above')
  })
})
