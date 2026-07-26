import request from 'supertest'
import jwt from 'jsonwebtoken'

jest.mock('../src/day-summary', () => ({
  buildDaySummary: jest.fn(),
  getItemsForDay: jest.fn(),
  normalizeItemRows: jest.fn(),
  calorieRowToClient: jest.fn(),
  weightRowToClient: jest.fn(),
}))

import { app } from '../src/index'
import { buildDaySummary, getItemsForDay } from '../src/day-summary'
import type { DaySummaryItem } from '../src/day-summary-schema'

const USER_ID = 'user-1'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`
const mockedBuildDaySummary = buildDaySummary as jest.MockedFunction<typeof buildDaySummary>
const mockedGetItemsForDay = getItemsForDay as jest.MockedFunction<typeof getItemsForDay>

describe('DaySummary API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('validates the selected date and passes the client timezone to the service', async () => {
    mockedBuildDaySummary.mockResolvedValue({ version: 1, date: '2026-07-27' } as any)

    const response = await request(app)
      .get('/api/day-summary?date=2026-07-27')
      .set('Authorization', TOKEN)
      .set('X-Client-Time-Zone', 'Asia/Jerusalem')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ version: 1, date: '2026-07-27' })
    expect(mockedBuildDaySummary).toHaveBeenCalledWith(USER_ID, '2026-07-27', 'Asia/Jerusalem')
  })

  it('rejects an invalid date without invoking the service', async () => {
    const response = await request(app)
      .get('/api/day-summary?date=tomorrow')
      .set('Authorization', TOKEN)

    expect(response.status).toBe(400)
    expect(mockedBuildDaySummary).not.toHaveBeenCalled()
  })

  it('fails the endpoint when the required Item plan cannot load', async () => {
    mockedBuildDaySummary.mockRejectedValue(new Error('items unavailable'))

    const response = await request(app)
      .get('/api/day-summary?date=2026-07-27')
      .set('Authorization', TOKEN)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed to load the daily plan' })
  })

  it('uses the same canonical selected-day Item read as the Task route', async () => {
    const canonicalItems: DaySummaryItem[] = [{
      id: 'habit-parent-2026-07-27',
      title: 'Walk',
      type: 'habit',
      category: 'fitness',
      startTime: null,
      location: null,
      duration: 30,
      repeat: 'daily',
      completed: false,
      scheduledDate: '2026-07-27',
      createdAt: '2026-07-01T08:00:00.000Z',
      overdueNotified: false,
      isHabitInstance: true,
      originalHabitId: 'habit-parent',
      rolledOverFromTaskId: null,
      originalCreatedAt: null,
      completedAt: null,
      position: 2,
      googleEventId: null,
      syncedToGoogle: false,
      googleSyncStatus: 'skipped',
      habitInfo: {
        target: { value: 30, unit: 'minutes' },
        outcome: 'partial',
        progressTotal: 10,
      },
    }]
    mockedGetItemsForDay.mockResolvedValue(canonicalItems)

    const response = await request(app)
      .get('/api/tasks?date=2026-07-27')
      .set('Authorization', TOKEN)

    expect(response.status).toBe(200)
    expect(response.body).toEqual(canonicalItems)
    expect(mockedGetItemsForDay).toHaveBeenCalledWith(USER_ID, '2026-07-27')
  })
})
