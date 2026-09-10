import crypto from 'crypto'
import nock from 'nock'
import { reconcileGoogleCalendarItems } from '../src/calendar'
import { db, supabase } from '../src/supabase-client'

const mockConnection = jest.fn()
const mockTaskUpdate = jest.fn()
let taskRows: Record<string, unknown>[] = []

jest.mock('../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    getUserCreditSubscription: jest.fn(),
  },
  supabase: { from: jest.fn() },
}))

function encryptedToken(token: string): string {
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET!).digest()
  const iv = Buffer.alloc(12, 1)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.')
}

function chainResult(result: () => unknown) {
  const chain: Record<string, any> = {}
  for (const method of ['select', 'eq', 'in', 'is', 'not']) {
    chain[method] = jest.fn(() => chain)
  }
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject)
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
  nock.cleanAll()
  taskRows = []
  ;(db.getUserById as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'person@example.com' })
  ;(db.getUserCreditSubscription as jest.Mock).mockResolvedValue({ active: true })
  mockConnection.mockResolvedValue({
    data: {
      access_token_encrypted: encryptedToken('google-access-token'),
      refresh_token_encrypted: encryptedToken('google-refresh-token'),
      token_expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      disconnected_at: null,
    },
    error: null,
  })
  mockTaskUpdate.mockImplementation(() => chainResult(() => ({ error: null })))
  ;(supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'calendar_connections') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({ maybeSingle: mockConnection })),
          })),
        })),
      }
    }
    if (table === 'tasks') {
      return {
        select: jest.fn(() => chainResult(() => ({ data: taskRows, error: null }))),
        update: mockTaskUpdate,
      }
    }
    throw new Error(`Unexpected table ${table}`)
  })
})

afterEach(() => nock.cleanAll())

describe('automatic Google Calendar reconciliation', () => {
  it('creates one owned Google event from the authoritative server Item', async () => {
    taskRows = [{
      id: 'abcdef12-3456-7890-abcd-ef1234567890',
      user_id: 'user-1',
      title: 'Doctor',
      type: 'task',
      scheduled_date: '2026-09-10',
      start_time: '09:30',
      duration: 45,
      location: 'Clinic',
      deleted_at: null,
      google_event_id: null,
      google_sync_status: 'pending',
    }]

    nock('https://www.googleapis.com')
      .post('/calendar/v3/calendars/primary/events', (body) => {
        expect(body).toMatchObject({
          id: 'hfabcdef1234567890abcdef1234567890',
          summary: 'Doctor',
          extendedProperties: { private: {
            healthyflowTaskId: 'abcdef12-3456-7890-abcd-ef1234567890',
            healthyflowUserId: 'user-1',
          } },
        })
        return true
      })
      .reply(200, { id: 'hfabcdef1234567890abcdef1234567890' })

    await expect(reconcileGoogleCalendarItems('user-1', {
      itemIds: ['abcdef12-3456-7890-abcd-ef1234567890'],
      timeZone: 'Europe/Athens',
    })).resolves.toMatchObject({ state: 'synced', attempted: 1, synced: 1, removed: 0 })

    expect(mockTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      google_event_id: 'hfabcdef1234567890abcdef1234567890',
      synced_to_google: true,
      google_sync_status: 'synced',
    }))
  })

  it('does not mutate a Google event that is not owned by the Item', async () => {
    taskRows = [{
      id: 'task-1', user_id: 'user-1', title: 'Doctor', type: 'task',
      scheduled_date: '2026-09-10', start_time: '09:30', duration: 45,
      deleted_at: null, google_event_id: 'external-event', google_sync_status: 'synced',
    }]

    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events/external-event')
      .reply(200, {
        id: 'external-event', summary: 'Somebody else’s meeting',
        extendedProperties: { private: {} },
      })

    await expect(reconcileGoogleCalendarItems('user-1', {
      itemIds: ['task-1'], timeZone: 'Europe/Athens',
    })).resolves.toMatchObject({
      state: 'unavailable',
      failures: [{ itemId: 'task-1', reason: 'ownership_mismatch' }],
    })

    expect(nock.pendingMocks()).toEqual([])
  })

  it('removes the owned Google event when the Item is unscheduled', async () => {
    taskRows = [{
      id: 'task-1', user_id: 'user-1', title: 'Doctor', type: 'task',
      scheduled_date: '2026-09-10', start_time: null, duration: 45,
      deleted_at: null, google_event_id: 'owned-event', google_sync_status: 'synced',
    }]

    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events/owned-event')
      .reply(200, {
        id: 'owned-event',
        extendedProperties: { private: {
          healthyflowTaskId: 'task-1', healthyflowUserId: 'user-1',
        } },
      })
      .delete('/calendar/v3/calendars/primary/events/owned-event')
      .reply(204)

    await expect(reconcileGoogleCalendarItems('user-1', {
      itemIds: ['task-1'], timeZone: 'Europe/Athens',
    })).resolves.toMatchObject({ state: 'synced', attempted: 1, synced: 0, removed: 1 })

    expect(mockTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      google_event_id: null, synced_to_google: false, google_sync_status: 'skipped',
    }))
  })

  it('recovers an ambiguous create without inserting a duplicate event', async () => {
    taskRows = [{
      id: 'abcdef12-3456-7890-abcd-ef1234567890', user_id: 'user-1',
      title: 'Doctor', type: 'task', scheduled_date: '2026-09-10',
      start_time: '09:30', duration: 45, deleted_at: null,
      google_event_id: null, google_sync_status: 'failed',
    }]
    const eventId = 'hfabcdef1234567890abcdef1234567890'

    nock('https://www.googleapis.com')
      .post('/calendar/v3/calendars/primary/events')
      .reply(409, { error: { message: 'The requested identifier already exists.' } })
      .get(`/calendar/v3/calendars/primary/events/${eventId}`)
      .reply(200, {
        id: eventId,
        extendedProperties: { private: {
          healthyflowTaskId: 'abcdef12-3456-7890-abcd-ef1234567890',
          healthyflowUserId: 'user-1',
        } },
      })
      .patch(`/calendar/v3/calendars/primary/events/${eventId}`)
      .reply(200, { id: eventId })

    await expect(reconcileGoogleCalendarItems('user-1', {
      itemIds: [], timeZone: 'Europe/Athens',
    })).resolves.toMatchObject({ state: 'synced', attempted: 1, synced: 1 })

    expect(nock.pendingMocks()).toEqual([])
  })
})
