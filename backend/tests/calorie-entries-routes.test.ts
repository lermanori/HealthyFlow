import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getCalorieEntriesByDay: jest.fn(),
    createCalorieEntry: jest.fn(),
    getCalorieEntryById: jest.fn(),
    updateCalorieEntry: jest.fn(),
    deleteCalorieEntry: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    user_id: USER_ID,
    date: '2026-06-24',
    name: 'Eggs',
    calories: 140,
    protein: null,
    carbs: null,
    fat: null,
    quantity: null,
    created_at: '2026-06-24T08:00:00.000Z',
    updated_at: '2026-06-24T08:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('calorie entries API', () => {
  it('creates an entry and returns it in camelCase', async () => {
    mockDb.createCalorieEntry.mockResolvedValue(row())

    const res = await request(app)
      .post('/api/calories')
      .set('Authorization', TOKEN)
      .send({ date: '2026-06-24', name: 'Eggs', calories: 140 })

    expect(res.status).toBe(201)
    expect(res.body).toEqual(expect.objectContaining({
      id: 'entry-1',
      userId: USER_ID,
      date: '2026-06-24',
      name: 'Eggs',
      calories: 140,
      protein: null,
      carbs: null,
      fat: null,
      quantity: null,
    }))
  })

  it('lists entries for a given day', async () => {
    mockDb.getCalorieEntriesByDay.mockResolvedValue([row()])

    const res = await request(app)
      .get('/api/calories?date=2026-06-24')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(mockDb.getCalorieEntriesByDay).toHaveBeenCalledWith(USER_ID, '2026-06-24')
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('Eggs')
  })

  it('rejects list without a date query param', async () => {
    const res = await request(app)
      .get('/api/calories')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(400)
    expect(mockDb.getCalorieEntriesByDay).not.toHaveBeenCalled()
  })

  it('rejects list with an invalid date format', async () => {
    const res = await request(app)
      .get('/api/calories?date=06-24-2026')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(400)
    expect(mockDb.getCalorieEntriesByDay).not.toHaveBeenCalled()
  })

  it('rejects creation with a missing name', async () => {
    const res = await request(app)
      .post('/api/calories')
      .set('Authorization', TOKEN)
      .send({ date: '2026-06-24', calories: 140 })

    expect(res.status).toBe(400)
    expect(mockDb.createCalorieEntry).not.toHaveBeenCalled()
  })

  it('rejects creation with non-numeric calories', async () => {
    const res = await request(app)
      .post('/api/calories')
      .set('Authorization', TOKEN)
      .send({ date: '2026-06-24', name: 'Eggs', calories: 'lots' })

    expect(res.status).toBe(400)
    expect(mockDb.createCalorieEntry).not.toHaveBeenCalled()
  })

  it('rejects creation with negative calories', async () => {
    const res = await request(app)
      .post('/api/calories')
      .set('Authorization', TOKEN)
      .send({ date: '2026-06-24', name: 'Eggs', calories: -5 })

    expect(res.status).toBe(400)
    expect(mockDb.createCalorieEntry).not.toHaveBeenCalled()
  })

  it('omits macros as null when not provided', async () => {
    mockDb.createCalorieEntry.mockResolvedValue(row())

    await request(app)
      .post('/api/calories')
      .set('Authorization', TOKEN)
      .send({ date: '2026-06-24', name: 'Eggs', calories: 140 })

    expect(mockDb.createCalorieEntry).toHaveBeenCalledWith(expect.objectContaining({
      protein: null,
      carbs: null,
      fat: null,
      quantity: null,
    }))
  })

  it('updates an entry it owns', async () => {
    mockDb.getCalorieEntryById.mockResolvedValue(row())
    mockDb.updateCalorieEntry.mockResolvedValue(row({ calories: 200 }))

    const res = await request(app)
      .patch('/api/calories/entry-1')
      .set('Authorization', TOKEN)
      .send({ calories: 200 })

    expect(res.status).toBe(200)
    expect(mockDb.updateCalorieEntry).toHaveBeenCalledWith('entry-1', expect.objectContaining({ calories: 200 }))
    expect(res.body.calories).toBe(200)
  })

  it('returns 404 patching a missing entry', async () => {
    mockDb.getCalorieEntryById.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/calories/missing')
      .set('Authorization', TOKEN)
      .send({ calories: 200 })

    expect(res.status).toBe(404)
    expect(mockDb.updateCalorieEntry).not.toHaveBeenCalled()
  })

  it('returns 403 patching another user entry', async () => {
    mockDb.getCalorieEntryById.mockResolvedValue(row({ user_id: OTHER_USER_ID }))

    const res = await request(app)
      .patch('/api/calories/entry-1')
      .set('Authorization', TOKEN)
      .send({ calories: 200 })

    expect(res.status).toBe(403)
    expect(mockDb.updateCalorieEntry).not.toHaveBeenCalled()
  })

  it('deletes an entry it owns', async () => {
    mockDb.getCalorieEntryById.mockResolvedValue(row())
    mockDb.deleteCalorieEntry.mockResolvedValue(undefined)

    const res = await request(app)
      .delete('/api/calories/entry-1')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(204)
    expect(mockDb.deleteCalorieEntry).toHaveBeenCalledWith('entry-1')
  })

  it('returns 404 deleting a missing entry', async () => {
    mockDb.getCalorieEntryById.mockResolvedValue(null)

    const res = await request(app)
      .delete('/api/calories/missing')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(404)
    expect(mockDb.deleteCalorieEntry).not.toHaveBeenCalled()
  })

  it('returns 403 deleting another user entry', async () => {
    mockDb.getCalorieEntryById.mockResolvedValue(row({ user_id: OTHER_USER_ID }))

    const res = await request(app)
      .delete('/api/calories/entry-1')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(403)
    expect(mockDb.deleteCalorieEntry).not.toHaveBeenCalled()
  })
})
