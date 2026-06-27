import crypto from 'crypto'
import nock from 'nock'
import { updateExternalCalendarEventSchedule } from '../src/calendar'

const mockMaybeSingle = jest.fn()
const mockExternalSelect = jest.fn()
const mockExternalUpdate = jest.fn()

jest.mock('../src/supabase-client', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'calendar_connections') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: mockMaybeSingle,
              })),
            })),
          })),
        }
      }

      if (table === 'external_calendar_events') {
        return {
          select: mockExternalSelect,
          update: mockExternalUpdate,
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  },
}))

function chainResult(result: unknown, methods: string[]) {
  const chain: Record<string, jest.Mock> = {}
  for (const method of methods) {
    chain[method] = jest.fn(() => chain)
  }
  Object.assign(chain, result)
  return chain
}

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

  mockMaybeSingle.mockResolvedValue({
    data: {
      access_token_encrypted: encryptedToken('google-access-token'),
      refresh_token_encrypted: encryptedToken('google-refresh-token'),
      token_expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      disconnected_at: null,
    },
    error: null,
  })

  mockExternalSelect.mockReturnValue(chainResult({
    data: {
      id: 'external-row-1',
      provider: 'google',
      provider_calendar_id: 'primary',
      provider_event_id: 'google-event-1',
      title: 'Imported meeting',
      description: null,
      location: 'Room A',
      start_at: '2026-06-24T08:00:00.000Z',
      end_at: '2026-06-24T09:00:00.000Z',
      all_day: false,
      status: 'confirmed',
      html_link: 'https://calendar.google/event',
      completed: false,
      completed_at: null,
      raw: {
        id: 'google-event-1',
        start: { dateTime: '2026-06-24T11:00:00+03:00' },
        end: { dateTime: '2026-06-24T12:00:00+03:00' },
      },
    },
    error: null,
  }, ['eq', 'is', 'single']))
})

afterEach(() => {
  nock.cleanAll()
})

describe('updateExternalCalendarEventSchedule', () => {
  it('patches Google Calendar and updates the imported event row with the returned schedule', async () => {
    nock('https://www.googleapis.com')
      .patch('/calendar/v3/calendars/primary/events/google-event-1', (body) => {
        expect(body).toMatchObject({
          start: { dateTime: '2026-06-24T14:00:00', timeZone: 'Asia/Jerusalem' },
          end: { dateTime: '2026-06-24T15:00:00', timeZone: 'Asia/Jerusalem' },
        })
        return true
      })
      .matchHeader('authorization', 'Bearer google-access-token')
      .reply(200, {
        id: 'google-event-1',
        etag: 'etag-2',
        summary: 'Imported meeting',
        location: 'Room A',
        start: { dateTime: '2026-06-24T14:00:00+03:00' },
        end: { dateTime: '2026-06-24T15:00:00+03:00' },
        status: 'confirmed',
        htmlLink: 'https://calendar.google/event-updated',
      })

    mockExternalUpdate.mockReturnValue(chainResult({
      data: {
        id: 'external-row-1',
        provider: 'google',
        provider_calendar_id: 'primary',
        provider_event_id: 'google-event-1',
        title: 'Imported meeting',
        description: null,
        location: 'Room A',
        start_at: '2026-06-24T11:00:00.000Z',
        end_at: '2026-06-24T12:00:00.000Z',
        all_day: false,
        status: 'confirmed',
        html_link: 'https://calendar.google/event-updated',
        completed: false,
        completed_at: null,
        raw: {
          id: 'google-event-1',
          start: { dateTime: '2026-06-24T14:00:00+03:00' },
          end: { dateTime: '2026-06-24T15:00:00+03:00' },
        },
      },
      error: null,
    }, ['eq', 'eq', 'is', 'select', 'single']))

    const result = await updateExternalCalendarEventSchedule('user-1', 'external-row-1', {
      date: '2026-06-24',
      startTime: '14:00',
      timeZone: 'Asia/Jerusalem',
    })

    expect(mockExternalUpdate).toHaveBeenCalledWith(expect.objectContaining({
      start_at: '2026-06-24T11:00:00.000Z',
      end_at: '2026-06-24T12:00:00.000Z',
      all_day: false,
      html_link: 'https://calendar.google/event-updated',
    }))
    expect(result.localStartTime).toBe('14:00')
    expect(result.localEndTime).toBe('15:00')
  })
})
