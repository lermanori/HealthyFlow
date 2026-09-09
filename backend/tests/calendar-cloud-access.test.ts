import {
  completeGoogleCalendarOAuth,
  deleteGoogleCalendarEvent,
  getCalendarOAuthReturnUrl,
  getGoogleCalendarConnectUrl,
  getGoogleCalendarOAuthReturnTarget,
  getGoogleCalendarDayStatus,
  getGoogleCalendarStatus,
  syncGoogleCalendarEventsForDate,
  syncTimedTasksForDate,
  updateExternalCalendarEventCompletion,
  updateExternalCalendarEventSchedule,
} from '../src/calendar'
import { db, supabase } from '../src/supabase-client'

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id'
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret'
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

jest.mock('../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    getUserCreditSubscription: jest.fn(),
  },
  supabase: { from: jest.fn() },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockFrom = supabase.from as jest.MockedFunction<typeof supabase.from>

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue({ id: 'user-1', email: 'person@example.com' } as never)
  mockDb.getUserCreditSubscription.mockResolvedValue({ active: true } as never)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('Google Calendar Cloud boundary', () => {
  it('signs a closed native return target into OAuth state', async () => {
    const connectUrl = await getGoogleCalendarConnectUrl('user-1', 'native')
    const state = new URL(connectUrl).searchParams.get('state')!

    expect(getGoogleCalendarOAuthReturnTarget(state)).toBe('native')
    expect(getCalendarOAuthReturnUrl('connected', undefined, 'native')).toBe(
      'healthyflow://app/settings/connections-advanced?calendar=connected',
    )
  })

  it('defaults existing web callers to the web Settings return', async () => {
    const connectUrl = await getGoogleCalendarConnectUrl('user-1')
    const state = new URL(connectUrl).searchParams.get('state')!

    expect(getGoogleCalendarOAuthReturnTarget(state)).toBe('web')
    expect(getCalendarOAuthReturnUrl('error', 'Denied', 'web')).toBe(
      'http://localhost:5173/settings?calendar=error&message=Denied',
    )
  })

  it('refuses to generate a Google OAuth URL without active Cloud', async () => {
    mockDb.getUserCreditSubscription.mockResolvedValue({ active: false } as never)

    await expect(Promise.resolve(getGoogleCalendarConnectUrl('user-1'))).rejects.toMatchObject({
      name: 'CloudNotActiveError',
      reason: 'cloud_not_active',
    })
  })

  it('rechecks Cloud after signed OAuth state validation and before token exchange', async () => {
    const connectUrl = await getGoogleCalendarConnectUrl('user-1')
    const state = new URL(connectUrl).searchParams.get('state')!
    mockDb.getUserCreditSubscription.mockResolvedValue({ active: false } as never)
    const fetchSpy = jest.spyOn(global, 'fetch')

    await expect(completeGoogleCalendarOAuth('authorization-code', state)).rejects.toMatchObject({
      name: 'CloudNotActiveError',
      reason: 'cloud_not_active',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not read a stored Google connection without active Cloud', async () => {
    mockDb.getUserCreditSubscription.mockResolvedValue(null as never)

    await expect(getGoogleCalendarStatus('user-1')).rejects.toMatchObject({
      name: 'CloudNotActiveError',
      reason: 'cloud_not_active',
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('gives day composition a typed non-Cloud boundary without reading Google state', async () => {
    mockDb.getUserCreditSubscription.mockResolvedValue(null as never)

    await expect(getGoogleCalendarDayStatus('user-1')).resolves.toEqual({
      connected: false,
      reason: 'cloud_not_active',
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it.each([
    ['event read', () => syncGoogleCalendarEventsForDate('user-1', '2026-09-09')],
    ['timed Item sync', () => syncTimedTasksForDate('user-1', '2026-09-09')],
    ['event completion', () => updateExternalCalendarEventCompletion('user-1', 'event-1', true)],
    ['event schedule', () => updateExternalCalendarEventSchedule('user-1', 'event-1', {
      date: '2026-09-09',
      startTime: '10:00',
    })],
    ['owned event delete', () => deleteGoogleCalendarEvent('user-1', 'google-event-1')],
  ])('stops %s before any Calendar database or Google request', async (_label, operation) => {
    mockDb.getUserCreditSubscription.mockResolvedValue({ active: false } as never)
    const fetchSpy = jest.spyOn(global, 'fetch')

    await expect(operation()).rejects.toMatchObject({
      name: 'CloudNotActiveError',
      reason: 'cloud_not_active',
    })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
