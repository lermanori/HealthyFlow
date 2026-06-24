import crypto from 'crypto'
import nock from 'nock'
import { syncGoogleCalendarEventsForDate } from '../src/calendar'

const mockMaybeSingle = jest.fn()
const mockExternalUpdate = jest.fn()
const mockExternalUpsert = jest.fn()
const mockExternalSelectResult = jest.fn()
const mockTaskUpdate = jest.fn()

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

      if (table === 'tasks') {
        return {
          update: mockTaskUpdate,
        }
      }

      if (table === 'external_calendar_events') {
        return {
          update: mockExternalUpdate,
          upsert: mockExternalUpsert,
          select: mockExternalSelectResult,
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

  mockExternalUpdate.mockReturnValue(chainResult(
    { error: null },
    ['eq', 'in']
  ))
  mockExternalUpsert.mockResolvedValue({ error: null })
  mockExternalSelectResult.mockReturnValue(chainResult(
    { data: [], error: null },
    ['eq', 'is', 'gte', 'lt', 'order']
  ))
  mockTaskUpdate.mockReturnValue(chainResult(
    { error: null },
    ['eq']
  ))
})

afterEach(() => {
  nock.cleanAll()
})

describe('syncGoogleCalendarEventsForDate — task locations', () => {
  it('updates HealthyFlow-owned task locations from Google and keeps them out of imported events', async () => {
    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events')
      .query(true)
      .matchHeader('authorization', 'Bearer google-access-token')
      .reply(200, {
        items: [
          {
            id: 'hf-google-event',
            summary: 'HealthyFlow task',
            location: 'Google-side room',
            start: { dateTime: '2026-06-24T10:00:00+03:00' },
            end: { dateTime: '2026-06-24T10:30:00+03:00' },
            extendedProperties: {
              private: {
                healthyflowTaskId: 'task-1',
                healthyflowUserId: 'user-1',
              },
            },
          },
          {
            id: 'external-google-event',
            summary: 'Imported meeting',
            location: 'External room',
            start: { dateTime: '2026-06-24T11:00:00+03:00' },
            end: { dateTime: '2026-06-24T11:30:00+03:00' },
          },
        ],
      })

    await syncGoogleCalendarEventsForDate('user-1', '2026-06-24')

    expect(mockTaskUpdate).toHaveBeenCalledWith({ location: 'Google-side room' })
    const taskUpdateChain = mockTaskUpdate.mock.results[0].value
    expect(taskUpdateChain.eq).toHaveBeenCalledWith('id', 'task-1')
    expect(taskUpdateChain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(taskUpdateChain.eq).toHaveBeenCalledWith('type', 'task')

    expect(mockExternalUpsert).toHaveBeenCalledWith([
      expect.objectContaining({
        provider_event_id: 'external-google-event',
        location: 'External room',
      }),
    ], { onConflict: 'user_id,provider,provider_calendar_id,provider_event_id' })
    expect(mockExternalUpsert).not.toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ provider_event_id: 'hf-google-event' }),
      ]),
      expect.anything()
    )
  })

  it('clears HealthyFlow task location when Google has no location', async () => {
    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events')
      .query(true)
      .reply(200, {
        items: [
          {
            id: 'hf-google-event',
            summary: 'HealthyFlow task',
            start: { dateTime: '2026-06-24T10:00:00+03:00' },
            end: { dateTime: '2026-06-24T10:30:00+03:00' },
            extendedProperties: {
              private: {
                healthyflowTaskId: 'task-1',
              },
            },
          },
        ],
      })

    await syncGoogleCalendarEventsForDate('user-1', '2026-06-24')

    expect(mockTaskUpdate).toHaveBeenCalledWith({ location: null })
  })
})
