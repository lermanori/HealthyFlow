import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Sync } from '../../src/sync'

jest.mock('../../src/supabase-client', () => ({
  db: { getUserCreditSubscription: jest.fn() },
  supabase: { from: jest.fn() },
}))

jest.mock('../../src/sync', () => ({
  Sync: { exchange: jest.fn() },
  SyncClockError: class SyncClockError extends Error {
    constructor(public readonly collection: string) {
      super('A record was dated further ahead than a clock can drift.')
      this.name = 'SyncClockError'
    }
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockSync = Sync as jest.Mocked<typeof Sync>

const TOKEN = `Bearer ${jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET!)}`

const emptyPayload = {
  tasks: [], habitProgress: [], calorieEntries: [], calorieItems: [],
  weightEntries: [], workoutSessions: [], workoutPlans: [],
  workoutExerciseItems: [], achievementDefinitions: [], achievementEntries: [],
  settings: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserCreditSubscription.mockResolvedValue({ active: true } as never)
  mockSync.exchange.mockResolvedValue({
    syncedAt: '2026-08-23T12:00:00.000Z',
    changed: emptyPayload,
  } as never)
})

describe('POST /api/sync', () => {
  it('exchanges deltas for a subscriber', async () => {
    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', TOKEN)
      .send({ since: '2026-08-23T11:00:00.000Z', changed: emptyPayload })

    expect(response.status).toBe(200)
    expect(response.body.syncedAt).toBe('2026-08-23T12:00:00.000Z')
    expect(mockSync.exchange).toHaveBeenCalledWith('user-1', expect.objectContaining({
      since: '2026-08-23T11:00:00.000Z',
    }))
  })

  it('accepts a first push, where nothing has been synced yet', async () => {
    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', TOKEN)
      .send({ since: null, changed: emptyPayload })

    expect(response.status).toBe(200)
  })

  it('refuses an account without a Cloud subscription', async () => {
    // Cloud is what hosting is sold as. A free user's data is never hosted
    // (TARGET.md, ADR-0012), so this is a boundary, not an error.
    mockDb.getUserCreditSubscription.mockResolvedValue({ active: false } as never)

    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', TOKEN)
      .send({ since: null, changed: emptyPayload })

    expect(response.status).toBe(403)
    expect(response.body.reason).toBe('cloud_not_active')
    expect(mockSync.exchange).not.toHaveBeenCalled()
  })

  it('refuses an account that has never had a subscription row', async () => {
    mockDb.getUserCreditSubscription.mockResolvedValue(null as never)

    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', TOKEN)
      .send({ since: null, changed: emptyPayload })

    expect(response.status).toBe(403)
    expect(response.body.reason).toBe('cloud_not_active')
  })

  it('requires a session', async () => {
    const response = await request(app).post('/api/sync').send({ since: null, changed: emptyPayload })

    expect(response.status).toBe(401)
    expect(mockSync.exchange).not.toHaveBeenCalled()
  })

  it('rejects a body it cannot read', async () => {
    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', TOKEN)
      .send({ since: null })

    expect(response.status).toBe(400)
    expect(mockSync.exchange).not.toHaveBeenCalled()
  })

  it('names the clock when a device is too far ahead, rather than blaming the network', async () => {
    // "Check your connection" was shown twice this week for problems that had
    // nothing to do with the network. The message has to name what actually failed.
    const { SyncClockError } = jest.requireMock('../../src/sync') as {
      SyncClockError: new (collection: string) => Error
    }
    mockSync.exchange.mockRejectedValue(new SyncClockError('tasks') as never)

    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', TOKEN)
      .send({ since: null, changed: emptyPayload })

    expect(response.status).toBe(409)
    expect(response.body.reason).toBe('device_clock_ahead')
  })

  it('reports a failed exchange as a failure rather than an empty day', async () => {
    mockSync.exchange.mockRejectedValue(new Error('Postgres is down') as never)

    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', TOKEN)
      .send({ since: null, changed: emptyPayload })

    expect(response.status).toBe(500)
    expect(response.body.changed).toBeUndefined()
  })
})
