import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getReminderCandidates: jest.fn(),
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
const TODAY = '2026-08-17'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/tasks/reminders', () => {
  it("scopes the query to the caller's own local day", async () => {
    mockDb.getReminderCandidates.mockResolvedValue([])

    const res = await request(app)
      .get('/api/tasks/reminders')
      .query({ today: TODAY })
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(mockDb.getReminderCandidates).toHaveBeenCalledWith(USER_ID, TODAY)
  })

  it('returns only the six fields a reminder is decided from', async () => {
    mockDb.getReminderCandidates.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Standup',
        start_time: '09:00',
        completed: false,
        scheduled_date: '2026-08-16',
        overdue_notified: false,
      },
    ])

    const res = await request(app)
      .get('/api/tasks/reminders')
      .query({ today: TODAY })
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      {
        id: 'task-1',
        title: 'Standup',
        startTime: '09:00',
        completed: false,
        scheduledDate: '2026-08-16',
        overdueNotified: false,
      },
    ])
  })

  it('reports NULL completed and overdue_notified as false', async () => {
    mockDb.getReminderCandidates.mockResolvedValue([
      {
        id: 'legacy',
        title: 'Old item',
        start_time: '08:00',
        completed: null,
        scheduled_date: '2025-08-17',
        overdue_notified: null,
      },
    ])

    const res = await request(app)
      .get('/api/tasks/reminders')
      .query({ today: TODAY })
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ completed: false, overdueNotified: false })
  })

  it('rejects a missing or malformed local day rather than guessing one', async () => {
    for (const query of [{}, { today: '17-08-2026' }, { today: 'today' }]) {
      const res = await request(app)
        .get('/api/tasks/reminders')
        .query(query)
        .set('Authorization', TOKEN)

      expect(res.status).toBe(400)
    }
    expect(mockDb.getReminderCandidates).not.toHaveBeenCalled()
  })

  it('requires authentication', async () => {
    const res = await request(app).get('/api/tasks/reminders').query({ today: TODAY })

    expect(res.status).toBe(401)
    expect(mockDb.getReminderCandidates).not.toHaveBeenCalled()
  })

  it('surfaces a read failure instead of reporting an empty day', async () => {
    mockDb.getReminderCandidates.mockRejectedValue(new Error('read failed'))

    const res = await request(app)
      .get('/api/tasks/reminders')
      .query({ today: TODAY })
      .set('Authorization', TOKEN)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Database error' })
  })
})
