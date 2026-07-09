import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'
import { syncTaskToGoogleCalendar } from '../src/calendar'

jest.mock('../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    getNextPosition: jest.fn(),
    createTask: jest.fn(),
    getTaskById: jest.fn(),
    updateTask: jest.fn(),
  },
}))

jest.mock('../src/calendar', () => ({
  syncTaskToGoogleCalendar: jest.fn(),
  deleteGoogleCalendarEvent: jest.fn(),
  isGoogleCalendarNotConnectedError: (error: unknown) =>
    error instanceof Error && error.message === 'Google Calendar is not connected',
}))

const mockDb = db as jest.Mocked<typeof db>
const mockSyncTaskToGoogleCalendar = syncTaskToGoogleCalendar as jest.MockedFunction<typeof syncTaskToGoogleCalendar>

const USER_ID = 'user-1'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    user_id: USER_ID,
    title: 'Meet Sam',
    type: 'task',
    category: 'work',
    start_time: null,
    location: null,
    duration: 30,
    repeat_type: 'none',
    completed: false,
    scheduled_date: '2026-06-24',
    created_at: '2026-06-24T08:00:00.000Z',
    position: 0,
    google_event_id: null,
    synced_to_google: false,
    google_sync_status: 'pending',
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue({ id: USER_ID, email: 'test@example.com', name: 'Test', role: 'user' })
  mockDb.getNextPosition.mockResolvedValue(0)
  mockSyncTaskToGoogleCalendar.mockResolvedValue({
    googleEventId: 'google-1',
    synced: true,
    status: 'synced',
  })
})

describe('task location API', () => {
  it('normalizes blank location to null when creating a task', async () => {
    mockDb.createTask.mockResolvedValue(row({ location: null }))

    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', TOKEN)
      .send({
        title: 'Meet Sam',
        type: 'task',
        category: 'work',
        startTime: null,
        location: '   ',
        duration: 30,
        repeat: 'none',
        scheduledDate: '2026-06-24',
      })

    expect(res.status).toBe(200)
    expect(mockDb.createTask).toHaveBeenCalledWith(expect.objectContaining({
      location: null,
    }))
    expect(res.body.location).toBeNull()
  })

  it('trims and returns location when updating a task', async () => {
    mockDb.getTaskById.mockResolvedValue(row())
    mockDb.updateTask.mockResolvedValue(row({ location: 'Cafe Noga' }))

    const res = await request(app)
      .put('/api/tasks/task-1')
      .set('Authorization', TOKEN)
      .send({ location: '  Cafe Noga  ' })

    expect(res.status).toBe(200)
    expect(mockDb.updateTask).toHaveBeenCalledWith('task-1', { location: 'Cafe Noga' })
    expect(res.body.location).toBe('Cafe Noga')
  })

  it('rejects a location-only habit update', async () => {
    mockDb.getTaskById.mockResolvedValue(row({
      type: 'habit',
      repeat_type: 'daily',
      scheduled_date: null,
    }))

    const res = await request(app)
      .put('/api/tasks/task-1')
      .set('Authorization', TOKEN)
      .send({ location: 'Gym' })

    expect(res.status).toBe(400)
    expect(mockDb.updateTask).not.toHaveBeenCalled()
  })
})
