import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'
import { deleteGoogleCalendarEvent } from '../src/calendar'

jest.mock('../src/supabase-client', () => ({
  db: {
    getTaskById: jest.fn(),
    deleteTask: jest.fn(),
    softDeleteTask: jest.fn(),
    softDeleteHabitInstance: jest.fn(),
    deleteHabitSeries: jest.fn(),
    getHabitSeriesRows: jest.fn(),
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
  },
}))

jest.mock('../src/calendar', () => ({
  deleteGoogleCalendarEvent: jest.fn(),
  syncTaskToGoogleCalendar: jest.fn(),
}))

const mockDb = db as jest.Mocked<typeof db>
const mockDeleteGoogleCalendarEvent = deleteGoogleCalendarEvent as jest.MockedFunction<typeof deleteGoogleCalendarEvent>

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const HABIT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const DATE = '2026-06-23'
const VIRTUAL_ID = `${HABIT_ID}-${DATE}`
const INSTANCE_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

function habitTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: HABIT_ID,
    user_id: USER_ID,
    title: 'Workout',
    type: 'habit',
    repeat_type: 'daily',
    scheduled_date: null,
    original_habit_id: null,
    google_event_id: null,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getHabitSeriesRows.mockResolvedValue([])
})

describe('DELETE /api/tasks/:id — recurring habit scopes', () => {
  it('soft-deletes only the selected virtual habit instance', async () => {
    mockDb.getTaskById.mockResolvedValue(habitTemplate())
    mockDb.softDeleteHabitInstance.mockResolvedValue(undefined)

    const res = await request(app)
      .delete(`/api/tasks/${VIRTUAL_ID}`)
      .set('Authorization', TOKEN)
      .send({ deleteScope: 'instance' })

    expect(res.status).toBe(200)
    expect(mockDb.softDeleteHabitInstance).toHaveBeenCalledWith(HABIT_ID, DATE, USER_ID)
    expect(mockDb.deleteHabitSeries).not.toHaveBeenCalled()
    expect(mockDb.deleteTask).not.toHaveBeenCalled()
  })

  it('deletes the whole recurring habit series from a virtual habit instance', async () => {
    mockDb.getTaskById.mockResolvedValue(habitTemplate())
    mockDb.getHabitSeriesRows.mockResolvedValue([
      { id: HABIT_ID, google_event_id: null },
      { id: INSTANCE_ID, google_event_id: 'google-1' },
    ])
    mockDb.deleteHabitSeries.mockResolvedValue(undefined)
    mockDeleteGoogleCalendarEvent.mockResolvedValue(undefined)

    const res = await request(app)
      .delete(`/api/tasks/${VIRTUAL_ID}`)
      .set('Authorization', TOKEN)
      .send({ deleteScope: 'habit' })

    expect(res.status).toBe(200)
    expect(mockDeleteGoogleCalendarEvent).toHaveBeenCalledWith(USER_ID, 'google-1')
    expect(mockDb.deleteHabitSeries).toHaveBeenCalledWith(HABIT_ID, USER_ID)
    expect(mockDb.softDeleteHabitInstance).not.toHaveBeenCalled()
  })

  it('soft-deletes a materialized habit instance when scope is instance', async () => {
    mockDb.getTaskById.mockResolvedValue(habitTemplate({
      id: INSTANCE_ID,
      scheduled_date: DATE,
      original_habit_id: HABIT_ID,
      google_event_id: 'google-2',
    }))
    mockDb.softDeleteTask.mockResolvedValue(undefined)
    mockDeleteGoogleCalendarEvent.mockResolvedValue(undefined)

    const res = await request(app)
      .delete(`/api/tasks/${INSTANCE_ID}`)
      .set('Authorization', TOKEN)
      .send({ deleteScope: 'instance' })

    expect(res.status).toBe(200)
    expect(mockDeleteGoogleCalendarEvent).toHaveBeenCalledWith(USER_ID, 'google-2')
    expect(mockDb.softDeleteTask).toHaveBeenCalledWith(INSTANCE_ID)
    expect(mockDb.deleteHabitSeries).not.toHaveBeenCalled()
  })

  it('hard-deletes a normal task with the original delete behavior', async () => {
    mockDb.getTaskById.mockResolvedValue({
      id: 'task-1',
      user_id: USER_ID,
      type: 'task',
      google_event_id: null,
    })
    mockDb.deleteTask.mockResolvedValue(undefined)

    const res = await request(app)
      .delete('/api/tasks/task-1')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(mockDb.deleteTask).toHaveBeenCalledWith('task-1')
    expect(mockDb.softDeleteTask).not.toHaveBeenCalled()
  })

  it('deletes a synced normal task locally when Google Calendar is disconnected', async () => {
    mockDb.getTaskById.mockResolvedValue({
      id: 'task-1',
      user_id: USER_ID,
      type: 'task',
      google_event_id: 'stale-google-event',
    })
    mockDeleteGoogleCalendarEvent.mockRejectedValue(new Error('Google Calendar is not connected'))
    mockDb.deleteTask.mockResolvedValue(undefined)

    const res = await request(app)
      .delete('/api/tasks/task-1')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(mockDeleteGoogleCalendarEvent).toHaveBeenCalledWith(USER_ID, 'stale-google-event')
    expect(mockDb.deleteTask).toHaveBeenCalledWith('task-1')
  })

  it('rejects deleting another user habit', async () => {
    mockDb.getTaskById.mockResolvedValue(habitTemplate({ user_id: OTHER_USER_ID }))

    const res = await request(app)
      .delete(`/api/tasks/${VIRTUAL_ID}`)
      .set('Authorization', TOKEN)
      .send({ deleteScope: 'instance' })

    expect(res.status).toBe(403)
    expect(mockDb.softDeleteHabitInstance).not.toHaveBeenCalled()
    expect(mockDb.deleteHabitSeries).not.toHaveBeenCalled()
  })
})
