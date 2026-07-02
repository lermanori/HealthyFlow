import request from 'supertest'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { app } from '../src/index'
import { buildDailyContext } from '../src/daily-context'

jest.mock('../src/daily-context', () => ({
  DailyContextInputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  buildDailyContext: jest.fn(),
}))

const authHeader = () => `Bearer ${jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET!)}`

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/ai/daily-context', () => {
  it('returns daily context for the authenticated user and date', async () => {
    ;(buildDailyContext as jest.Mock).mockResolvedValue({
      date: '2026-07-02',
      generatedAt: '2026-07-02T10:00:00.000Z',
      day: {
        tasks: [],
        calorieEntries: [],
        weight: null,
        achievements: [],
        workoutSessions: [],
        calendarEvents: [],
      },
      lookback: {
        habitHistory: { windowDays: 3, days: [] },
        calorieHistory: { windowDays: 7, days: [] },
        workoutHistory: { windowDays: 14, days: [] },
      },
      signals: [],
    })

    const res = await request(app)
      .get('/api/ai/daily-context?date=2026-07-02')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(buildDailyContext).toHaveBeenCalledWith('user-1', '2026-07-02')
    expect(res.body).toMatchObject({ date: '2026-07-02', signals: [] })
  })

  it('rejects an invalid date', async () => {
    const res = await request(app)
      .get('/api/ai/daily-context?date=07-02-2026')
      .set('Authorization', authHeader())

    expect(res.status).toBe(400)
    expect(buildDailyContext).not.toHaveBeenCalled()
  })
})
