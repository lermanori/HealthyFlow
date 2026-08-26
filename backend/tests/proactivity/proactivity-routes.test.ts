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
    addNativePushDevice: jest.fn(),
    deleteNativePushDevice: jest.fn(),
    listNativePushDevices: jest.fn(),
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
import { buildKickoffMessage } from '../../src/proactivity'

const mockDb = db as unknown as Record<string, jest.Mock>
const mockBuildDailyContext = buildDailyContext as jest.Mock
const TOKEN = `Bearer ${jwt.sign({ userId: 'u1' }, process.env.JWT_SECRET!)}`

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.listNativePushDevices.mockResolvedValue([])
})

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

  it('POST /push/native/register stores an authenticated iOS device', async () => {
    const deviceToken = 'a'.repeat(64)
    const res = await request(app)
      .post('/api/proactivity/push/native/register')
      .set('Authorization', TOKEN)
      .send({
        platform: 'ios',
        deviceToken,
        appId: 'app.healthyflow.mobile',
      })
    expect(res.status).toBe(201)
    expect(mockDb.addNativePushDevice).toHaveBeenCalledWith({
      user_id: 'u1',
      device_token: deviceToken,
      platform: 'ios',
      app_id: 'app.healthyflow.mobile',
    })
  })

  it('DELETE /push/native/register scopes removal to the authenticated user', async () => {
    const deviceToken = 'b'.repeat(64)
    const res = await request(app)
      .delete('/api/proactivity/push/native/register')
      .set('Authorization', TOKEN)
      .send({
        platform: 'ios',
        deviceToken,
        appId: 'app.healthyflow.mobile',
      })
    expect(res.status).toBe(200)
    expect(mockDb.deleteNativePushDevice).toHaveBeenCalledWith(
      'u1',
      deviceToken,
      'app.healthyflow.mobile',
    )
  })

  it('POST /push/native/register rejects a malformed or foreign app registration', async () => {
    const res = await request(app)
      .post('/api/proactivity/push/native/register')
      .set('Authorization', TOKEN)
      .send({
        platform: 'ios',
        deviceToken: 'not-a-device-token',
        appId: 'com.attacker.app',
      })
    expect(res.status).toBe(400)
    expect(mockDb.addNativePushDevice).not.toHaveBeenCalled()
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

  it('builds weekly planning from seven dated days instead of today alone', async () => {
    mockBuildDailyContext.mockImplementation(async (_userId: string, date: string) => ({
      date,
      day: {
        tasks: [{ title: `Item for ${date}`, completed: false, startTime: date.endsWith('-26') ? '09:00' : null }],
        calorieEntries: [],
        workoutSessions: [],
      },
      signals: [],
    }))

    const message = await buildKickoffMessage(
      'u1',
      'weekly',
      'Europe/Vienna',
      new Date('2026-08-26T10:00:00.000Z'),
    )

    expect(mockBuildDailyContext).toHaveBeenCalledTimes(7)
    expect(mockBuildDailyContext.mock.calls.map((call) => call[1])).toEqual([
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
    ])
    expect(message).toContain('Coming 7 days:')
    expect(message).toContain('Item for 2026-08-26 at 09:00')
    expect(message).toContain('Item for 2026-09-01')
  })
})
