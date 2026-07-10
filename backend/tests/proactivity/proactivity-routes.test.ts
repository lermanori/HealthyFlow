jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) },
}))
jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserRhythm: jest.fn(),
    upsertUserRhythm: jest.fn(),
    addPushSubscription: jest.fn(),
    deletePushSubscriptionByEndpoint: jest.fn(),
    listPushSubscriptions: jest.fn(),
  },
}))
jest.mock('../../src/daily-context', () => ({
  buildDailyContext: jest.fn(),
}))

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { buildDailyContext } from '../../src/daily-context'

const mockDb = db as unknown as Record<string, jest.Mock>
const mockBuildDailyContext = buildDailyContext as jest.Mock
const TOKEN = `Bearer ${jwt.sign({ userId: 'u1' }, process.env.JWT_SECRET!)}`

beforeEach(() => jest.clearAllMocks())

describe('proactivity routes', () => {
  it('GET /rhythm returns parsed defaults', async () => {
    mockDb.getUserRhythm.mockResolvedValue({})
    const res = await request(app).get('/api/proactivity/rhythm').set('Authorization', TOKEN)
    expect(res.status).toBe(200)
    expect(res.body.morning.time).toBe('07:00')
    expect(res.body.timezone).toBe('UTC')
  })

  it('PUT /rhythm validates and upserts', async () => {
    mockDb.upsertUserRhythm.mockResolvedValue({ timezone: 'America/New_York', morning: { time: '06:30' } })
    const res = await request(app)
      .put('/api/proactivity/rhythm')
      .set('Authorization', TOKEN)
      .send({ timezone: 'America/New_York', morning: { time: '06:30' } })
    expect(res.status).toBe(200)
    expect(mockDb.upsertUserRhythm).toHaveBeenCalledWith('u1', { timezone: 'America/New_York', morning: { time: '06:30' } })
  })

  it('POST /push/subscribe stores the subscription', async () => {
    mockDb.addPushSubscription.mockResolvedValue(undefined)
    const res = await request(app)
      .post('/api/proactivity/push/subscribe')
      .set('Authorization', TOKEN)
      .send({ endpoint: 'https://push/x', keys: { p256dh: 'P', auth: 'A' } })
    expect(res.status).toBe(201)
    expect(mockDb.addPushSubscription).toHaveBeenCalledWith({ user_id: 'u1', endpoint: 'https://push/x', p256dh: 'P', auth: 'A' })
  })

  it('POST /push/subscribe rejects a malformed body', async () => {
    const res = await request(app)
      .post('/api/proactivity/push/subscribe')
      .set('Authorization', TOKEN)
      .send({ endpoint: 'not-a-url' })
    expect(res.status).toBe(400)
  })

  it('DELETE /push/subscribe removes by endpoint', async () => {
    mockDb.deletePushSubscriptionByEndpoint.mockResolvedValue(undefined)
    const res = await request(app)
      .delete('/api/proactivity/push/subscribe')
      .set('Authorization', TOKEN)
      .send({ endpoint: 'https://push/x' })
    expect(res.status).toBe(200)
    expect(mockDb.deletePushSubscriptionByEndpoint).toHaveBeenCalledWith('https://push/x')
  })

  it('POST /test-notification sends a push and returns ok', async () => {
    mockDb.listPushSubscriptions.mockResolvedValue([{ endpoint: 'https://push/x', p256dh: 'P', auth: 'A' }])
    const res = await request(app).post('/api/proactivity/test-notification').set('Authorization', TOKEN)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('GET /kickoff builds a morning seed message from daily context', async () => {
    mockBuildDailyContext.mockResolvedValue({
      date: '2026-07-09',
      day: { tasks: [{ title: 'Gym', completed: false, startTime: '08:00' }], calorieEntries: [], workoutSessions: [] },
      signals: [],
    })
    const res = await request(app).get('/api/proactivity/kickoff?type=morning').set('Authorization', TOKEN)
    expect(res.status).toBe(200)
    expect(typeof res.body.message).toBe('string')
    expect(res.body.message.toLowerCase()).toContain('morning')
    expect(res.body.message).toContain('Run this as a topic-by-topic check-in')
    expect(res.body.message).toContain('Do not move to the next topic until I answer')
  })

  it('GET /kickoff rejects an unknown type', async () => {
    const res = await request(app).get('/api/proactivity/kickoff?type=bogus').set('Authorization', TOKEN)
    expect(res.status).toBe(400)
  })
})
