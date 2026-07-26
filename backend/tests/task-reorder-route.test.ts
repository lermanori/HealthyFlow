import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    reorderTasks: jest.fn(),
  },
}))

jest.mock('../src/calendar', () => ({
  deleteGoogleCalendarEvent: jest.fn(),
  isGoogleCalendarNotConnectedError: () => false,
  syncTaskToGoogleCalendar: jest.fn(),
}))

const mockDb = db as jest.Mocked<typeof db>
const USER_ID = 'user-1'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

beforeEach(() => {
  jest.clearAllMocks()
})

describe('PATCH /api/tasks/reorder', () => {
  it('persists owner-scoped positions in the requested order', async () => {
    mockDb.reorderTasks.mockResolvedValue(undefined)

    const res = await request(app)
      .patch('/api/tasks/reorder')
      .set('Authorization', TOKEN)
      .send({ ids: ['task-b', 'task-a'] })

    expect(res.status).toBe(200)
    expect(mockDb.reorderTasks).toHaveBeenCalledWith(USER_ID, [
      { id: 'task-b', position: 0 },
      { id: 'task-a', position: 1 },
    ])
  })

  it('surfaces a database write failure instead of reporting a false success', async () => {
    mockDb.reorderTasks.mockRejectedValue(new Error('write failed'))

    const res = await request(app)
      .patch('/api/tasks/reorder')
      .set('Authorization', TOKEN)
      .send({ ids: ['task-a'] })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Database error' })
  })
})
