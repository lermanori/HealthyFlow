import request from 'supertest'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { app } from '../src/index'
import {
  DailySignalReviewError,
  prepareDailySignalAction,
} from '../src/ai-capabilities'
import { buildDailyContext } from '../src/daily-context'

jest.mock('../src/daily-context', () => ({
  DailyContextInputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  DailyContextSchema: z.unknown(),
  DailySignalReviewInputSchema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    signalId: z.string().trim().min(1).max(500),
  }).strict(),
  buildDailyContext: jest.fn(),
}))

jest.mock('../src/ai-capabilities', () => ({
  ...jest.requireActual('../src/ai-capabilities'),
  prepareDailySignalAction: jest.fn(),
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

describe('POST /api/ai/daily-context/review', () => {
  it('returns the revalidated signal and existing pending-action preview', async () => {
    ;(prepareDailySignalAction as jest.Mock).mockResolvedValue({
      signal: {
        id: 'signal-1',
        kind: 'actionable',
      },
      pendingAction: {
        id: '22222222-2222-4222-8222-222222222222',
        capability: 'update_item',
      },
    })

    const res = await request(app)
      .post('/api/ai/daily-context/review')
      .set('Authorization', authHeader())
      .send({ date: '2026-07-02', signalId: 'signal-1' })

    expect(res.status).toBe(200)
    expect(prepareDailySignalAction).toHaveBeenCalledWith('user-1', {
      date: '2026-07-02',
      signalId: 'signal-1',
    })
    expect(res.body.pendingAction).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      capability: 'update_item',
    })
  })

  it('returns a recoverable conflict when the signal is stale', async () => {
    ;(prepareDailySignalAction as jest.Mock).mockRejectedValue(
      new DailySignalReviewError('Refresh Daily Signals', 'daily_signal_stale')
    )

    const res = await request(app)
      .post('/api/ai/daily-context/review')
      .set('Authorization', authHeader())
      .send({ date: '2026-07-02', signalId: 'signal-1' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error: 'Refresh Daily Signals',
      code: 'daily_signal_stale',
    })
  })

  it('rejects malformed review requests before reaching the service', async () => {
    const res = await request(app)
      .post('/api/ai/daily-context/review')
      .set('Authorization', authHeader())
      .send({ date: '07-02-2026', signalId: '' })

    expect(res.status).toBe(400)
    expect(prepareDailySignalAction).not.toHaveBeenCalled()
  })
})
