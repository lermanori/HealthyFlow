import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import {
  completeGoogleCalendarOAuth,
  disconnectGoogleCalendar,
  getCalendarOAuthReturnUrl,
  getGoogleCalendarConnectUrl,
  getGoogleCalendarOAuthReturnTarget,
  getGoogleCalendarStatus,
  syncGoogleCalendarEventsForDate,
  syncTimedTasksForDate,
  updateExternalCalendarEventCompletion,
  updateExternalCalendarEventSchedule,
} from '../src/calendar'
import { CloudNotActiveError } from '../src/cloud-access'
import { calendarRoutes } from '../src/routes/calendar'

jest.mock('../src/calendar', () => ({
  completeGoogleCalendarOAuth: jest.fn(),
  disconnectGoogleCalendar: jest.fn(),
  getCalendarOAuthReturnUrl: jest.fn((status: string, _message?: string, target?: string) =>
    target === 'native'
      ? `healthyflow://app/settings/connections-advanced?calendar=${status}`
      : `http://localhost:5173/settings?calendar=${status}`),
  getGoogleCalendarConnectUrl: jest.fn(),
  getGoogleCalendarOAuthReturnTarget: jest.fn(() => 'web'),
  getGoogleCalendarStatus: jest.fn(),
  isGoogleCalendarNotConnectedError: jest.fn(() => false),
  syncGoogleCalendarEventsForDate: jest.fn(),
  syncTimedTasksForDate: jest.fn(),
  updateExternalCalendarEventCompletion: jest.fn(),
  updateExternalCalendarEventSchedule: jest.fn(),
}))

const app = express()
app.use(express.json())
app.use('/api/calendar', calendarRoutes)

const token = `Bearer ${jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET!)}`
const cloudError = () => new CloudNotActiveError()

const mocks = [
  getGoogleCalendarConnectUrl,
  getGoogleCalendarStatus,
  syncGoogleCalendarEventsForDate,
  syncTimedTasksForDate,
  updateExternalCalendarEventCompletion,
  updateExternalCalendarEventSchedule,
] as jest.Mock[]

beforeEach(() => {
  jest.clearAllMocks()
  for (const mock of mocks) mock.mockRejectedValue(cloudError())
  ;(disconnectGoogleCalendar as jest.Mock).mockResolvedValue(undefined)
})

describe('Google Calendar route Cloud boundary', () => {
  it('passes the validated native return target into the connect URL', async () => {
    ;(getGoogleCalendarConnectUrl as jest.Mock).mockResolvedValueOnce('https://accounts.google.com/oauth')

    const response = await request(app)
      .get('/api/calendar/google/connect-url?returnTarget=native')
      .set('Authorization', token)

    expect(response.status).toBe(200)
    expect(getGoogleCalendarConnectUrl).toHaveBeenCalledWith('user-1', 'native')
  })

  it('returns a native OAuth callback to the app Settings route', async () => {
    ;(getGoogleCalendarOAuthReturnTarget as jest.Mock).mockReturnValueOnce('native')
    ;(completeGoogleCalendarOAuth as jest.Mock).mockResolvedValueOnce(undefined)

    const response = await request(app)
      .get('/api/calendar/google/callback?code=code-1&state=signed-state')

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe(
      'healthyflow://app/settings/connections-advanced?calendar=connected',
    )
    expect(getCalendarOAuthReturnUrl).toHaveBeenCalledWith('connected', undefined, 'native')
  })

  it.each([
    ['GET', '/api/calendar/google/connect-url', undefined],
    ['GET', '/api/calendar/google/status', undefined],
    ['GET', '/api/calendar/google/events?date=2026-09-09', undefined],
    ['PATCH', '/api/calendar/google/events/event-1/completion', { completed: true }],
    ['PATCH', '/api/calendar/google/events/event-1/schedule', { date: '2026-09-09', startTime: '10:00' }],
    ['POST', '/api/calendar/google/sync-timed-tasks', { date: '2026-09-09' }],
  ])('returns cloud_not_active for %s %s', async (method, path, body) => {
    const response = request(app)[method.toLowerCase() as 'get' | 'patch' | 'post'](path)
      .set('Authorization', token)
    if (body) response.send(body)

    const result = await response
    expect(result.status).toBe(403)
    expect(result.body).toEqual({
      error: 'Cloud is not active on this account.',
      reason: 'cloud_not_active',
    })
  })

  it('still allows an authenticated account to disconnect after Cloud ends', async () => {
    const response = await request(app)
      .delete('/api/calendar/google/disconnect')
      .set('Authorization', token)

    expect(response.status).toBe(204)
    expect(disconnectGoogleCalendar).toHaveBeenCalledWith('user-1')
  })
})
