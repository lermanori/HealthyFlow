import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getWeightEntryByDay: jest.fn(),
    getRecentWeightEntries: jest.fn(),
    createWeightEntry: jest.fn(),
    getWeightEntryById: jest.fn(),
    updateWeightEntry: jest.fn(),
    deleteWeightEntry: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'weight-1',
    user_id: USER_ID,
    date: '2026-06-24',
    weight_kg: 82.4,
    created_at: '2026-06-24T08:00:00.000Z',
    updated_at: '2026-06-24T08:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('weight entries API', () => {
  it('returns a day entry in camelCase', async () => {
    mockDb.getWeightEntryByDay.mockResolvedValue(row())

    const res = await request(app)
      .get('/api/weight?date=2026-06-24')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(mockDb.getWeightEntryByDay).toHaveBeenCalledWith(USER_ID, '2026-06-24')
    expect(res.body).toEqual(expect.objectContaining({
      id: 'weight-1',
      userId: USER_ID,
      date: '2026-06-24',
      weightKg: 82.4,
    }))
  })

  it('returns null when no day entry exists', async () => {
    mockDb.getWeightEntryByDay.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/weight?date=2026-06-24')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
  })

  it('rejects list with an invalid date', async () => {
    const res = await request(app)
      .get('/api/weight?date=24-06-2026')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(400)
    expect(mockDb.getWeightEntryByDay).not.toHaveBeenCalled()
  })

  it('returns recent trend entries oldest-first with latest, previous, and delta', async () => {
    mockDb.getRecentWeightEntries.mockResolvedValue([
      row({ id: 'w3', date: '2026-06-24', weight_kg: 82.4 }),
      row({ id: 'w2', date: '2026-06-20', weight_kg: 82.9 }),
      row({ id: 'w1', date: '2026-06-10', weight_kg: 83.2 }),
    ])

    const res = await request(app)
      .get('/api/weight/recent?limit=30')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(mockDb.getRecentWeightEntries).toHaveBeenCalledWith(USER_ID, 30)
    expect(res.body.entries.map((entry: { id: string }) => entry.id)).toEqual(['w1', 'w2', 'w3'])
    expect(res.body.latest.id).toBe('w3')
    expect(res.body.previous.id).toBe('w2')
    expect(res.body.deltaKg).toBeCloseTo(-0.5)
  })

  it('creates one weight entry for a day', async () => {
    mockDb.getWeightEntryByDay.mockResolvedValue(null)
    mockDb.createWeightEntry.mockResolvedValue(row())

    const res = await request(app)
      .post('/api/weight')
      .set('Authorization', TOKEN)
      .send({ date: '2026-06-24', weightKg: 82.4 })

    expect(res.status).toBe(201)
    expect(mockDb.createWeightEntry).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_ID,
      date: '2026-06-24',
      weight_kg: 82.4,
    }))
    expect(res.body.weightKg).toBe(82.4)
  })

  it('rejects duplicate daily weight creation', async () => {
    mockDb.getWeightEntryByDay.mockResolvedValue(row())

    const res = await request(app)
      .post('/api/weight')
      .set('Authorization', TOKEN)
      .send({ date: '2026-06-24', weightKg: 82.4 })

    expect(res.status).toBe(409)
    expect(mockDb.createWeightEntry).not.toHaveBeenCalled()
  })

  it('rejects nonpositive weight', async () => {
    const res = await request(app)
      .post('/api/weight')
      .set('Authorization', TOKEN)
      .send({ date: '2026-06-24', weightKg: 0 })

    expect(res.status).toBe(400)
    expect(mockDb.createWeightEntry).not.toHaveBeenCalled()
  })

  it('updates an entry it owns', async () => {
    mockDb.getWeightEntryById.mockResolvedValue(row())
    mockDb.updateWeightEntry.mockResolvedValue(row({ weight_kg: 82.1 }))

    const res = await request(app)
      .patch('/api/weight/weight-1')
      .set('Authorization', TOKEN)
      .send({ weightKg: 82.1 })

    expect(res.status).toBe(200)
    expect(mockDb.updateWeightEntry).toHaveBeenCalledWith('weight-1', expect.objectContaining({ weight_kg: 82.1 }))
    expect(res.body.weightKg).toBe(82.1)
  })

  it('returns 404 patching a missing entry', async () => {
    mockDb.getWeightEntryById.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/weight/missing')
      .set('Authorization', TOKEN)
      .send({ weightKg: 82.1 })

    expect(res.status).toBe(404)
    expect(mockDb.updateWeightEntry).not.toHaveBeenCalled()
  })

  it('returns 403 patching another user entry', async () => {
    mockDb.getWeightEntryById.mockResolvedValue(row({ user_id: OTHER_USER_ID }))

    const res = await request(app)
      .patch('/api/weight/weight-1')
      .set('Authorization', TOKEN)
      .send({ weightKg: 82.1 })

    expect(res.status).toBe(403)
    expect(mockDb.updateWeightEntry).not.toHaveBeenCalled()
  })

  it('deletes an entry it owns', async () => {
    mockDb.getWeightEntryById.mockResolvedValue(row())
    mockDb.deleteWeightEntry.mockResolvedValue(undefined)

    const res = await request(app)
      .delete('/api/weight/weight-1')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(204)
    expect(mockDb.deleteWeightEntry).toHaveBeenCalledWith('weight-1')
  })

  it('returns 404 deleting a missing entry', async () => {
    mockDb.getWeightEntryById.mockResolvedValue(null)

    const res = await request(app)
      .delete('/api/weight/missing')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(404)
    expect(mockDb.deleteWeightEntry).not.toHaveBeenCalled()
  })

  it('returns 403 deleting another user entry', async () => {
    mockDb.getWeightEntryById.mockResolvedValue(row({ user_id: OTHER_USER_ID }))

    const res = await request(app)
      .delete('/api/weight/weight-1')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(403)
    expect(mockDb.deleteWeightEntry).not.toHaveBeenCalled()
  })
})
