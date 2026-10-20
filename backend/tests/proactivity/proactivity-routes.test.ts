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

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'

const mockDb = db as unknown as Record<string, jest.Mock>
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
    expect(res.body.daily).toEqual({ enabled: false, time: '20:30', lastSent: null })
    expect(res.body.timezone).toBe('UTC')
  })

  it('PUT /rhythm validates and upserts', async () => {
    mockDb.upsertUserRhythm.mockResolvedValue({ timezone: 'America/New_York', daily: { enabled: true, time: '21:00' } })
    const res = await request(app)
      .put('/api/proactivity/rhythm')
      .set('Authorization', TOKEN)
      .send({ timezone: 'America/New_York', daily: { enabled: true, time: '21:00' } })
    expect(res.status).toBe(200)
    expect(mockDb.upsertUserRhythm).toHaveBeenCalledWith('u1', { timezone: 'America/New_York', daily: { enabled: true, time: '21:00' } })
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

})
