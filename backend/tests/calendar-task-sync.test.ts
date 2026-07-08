import crypto from 'crypto'
import nock from 'nock'
import { syncTaskToGoogleCalendar } from '../src/calendar'

const mockMaybeSingle = jest.fn()
const mockConnectionUpdate = jest.fn()

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id'
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret'

jest.mock('../src/supabase-client', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table !== 'calendar_connections') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        update: mockConnectionUpdate,
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: mockMaybeSingle,
            })),
          })),
        })),
      }
    }),
  },
}))

function encryptedToken(token: string): string {
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET!).digest()
  const iv = Buffer.alloc(12, 1)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.')
}

beforeEach(() => {
  jest.clearAllMocks()
  nock.cleanAll()
  mockConnectionUpdate.mockReturnValue({
    eq: jest.fn().mockReturnThis(),
    error: null,
  })
  mockMaybeSingle.mockResolvedValue({
    data: {
      access_token_encrypted: encryptedToken('google-access-token'),
      refresh_token_encrypted: encryptedToken('google-refresh-token'),
      token_expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      disconnected_at: null,
    },
    error: null,
  })
})

afterEach(() => {
  nock.cleanAll()
})

describe('syncTaskToGoogleCalendar', () => {
  it('syncs a Hebrew timed nutrition task with an off-hour start time', async () => {
    nock('https://www.googleapis.com')
      .post('/calendar/v3/calendars/primary/events', (body) => {
        expect(body).toMatchObject({
          summary: 'לקנות אוכל מהבלאק סלמי',
          start: {
            dateTime: '2026-07-08T14:52:00',
            timeZone: 'Europe/Athens',
          },
          end: {
            dateTime: '2026-07-08T15:07:00',
            timeZone: 'Europe/Athens',
          },
          extendedProperties: {
            private: {
              healthyflowTaskId: 'task-1',
              healthyflowUserId: 'user-1',
            },
          },
        })
        return true
      })
      .matchHeader('authorization', 'Bearer google-access-token')
      .reply(200, {
        id: 'google-event-1',
        summary: 'לקנות אוכל מהבלאק סלמי',
      })

    await expect(syncTaskToGoogleCalendar({
      id: 'task-1',
      user_id: 'user-1',
      title: 'לקנות אוכל מהבלאק סלמי',
      type: 'task',
      category: 'nutrition',
      start_time: '14:52',
      duration: 15,
      scheduled_date: '2026-07-08',
      google_event_id: null,
      location: null,
    } as any, 'Europe/Athens')).resolves.toEqual({
      googleEventId: 'google-event-1',
      synced: true,
      status: 'synced',
    })
  })

  it('marks Google disconnected when refresh fails with invalid_grant', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        access_token_encrypted: encryptedToken('expired-google-access-token'),
        refresh_token_encrypted: encryptedToken('revoked-google-refresh-token'),
        token_expiry: new Date(Date.now() - 60 * 1000).toISOString(),
        disconnected_at: null,
      },
      error: null,
    })

    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply(400, {
        error: 'invalid_grant',
        error_description: 'Token has been expired or revoked.',
      })

    await expect(syncTaskToGoogleCalendar({
      id: 'task-1',
      user_id: 'user-1',
      title: 'לקנות אוכל מהבלאק סלמי',
      type: 'task',
      start_time: '14:52',
      duration: 15,
      scheduled_date: '2026-07-08',
      google_event_id: null,
      location: null,
    }, 'Europe/Athens')).rejects.toThrow('Google Calendar is not connected')

    expect(mockConnectionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      disconnected_at: expect.any(String),
      updated_at: expect.any(String),
    }))
  })
})
