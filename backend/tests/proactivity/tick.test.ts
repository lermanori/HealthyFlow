jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) },
}))
jest.mock('../../src/supabase-client', () => ({
  db: {
    listAllRhythms: jest.fn(),
    upsertUserRhythm: jest.fn().mockResolvedValue({}),
    listPushSubscriptions: jest.fn().mockResolvedValue([]),
    deletePushSubscriptionByEndpoint: jest.fn(),
  },
}))

import { db } from '../../src/supabase-client'
import * as proactivity from '../../src/proactivity'

const mockDb = db as unknown as {
  listAllRhythms: jest.Mock
  upsertUserRhythm: jest.Mock
}

beforeEach(() => jest.clearAllMocks())

describe('runProactivityTick', () => {
  it('stamps lastSent before sending a dated review invitation', async () => {
    mockDb.listAllRhythms.mockResolvedValue([
      { user_id: 'u1', rhythm: { timezone: 'America/New_York', daily: { enabled: true, time: '20:30' } } },
    ])
    const sendSpy = jest.spyOn(proactivity.proactivityInternals, 'sendPushToUser').mockResolvedValue()

    // 20:32 EDT on Wednesday 2026-07-08
    await proactivity.runProactivityTick(new Date('2026-07-09T00:32:00Z'), 5)

    expect(mockDb.upsertUserRhythm).toHaveBeenCalledWith('u1', { daily: expect.objectContaining({ lastSent: '2026-07-08' }) })
    // stamp happens before the send
    const stampOrder = mockDb.upsertUserRhythm.mock.invocationCallOrder[0]
    const sendOrder = sendSpy.mock.invocationCallOrder[0]
    expect(stampOrder).toBeLessThan(sendOrder)
    expect(sendSpy).toHaveBeenCalledWith('u1', expect.objectContaining({ url: '/app/talk?review=daily&date=2026-07-08' }))
  })

  it('sends nothing when no touchpoint is due', async () => {
    mockDb.listAllRhythms.mockResolvedValue([
      { user_id: 'u1', rhythm: { timezone: 'America/New_York', daily: { enabled: true, time: '20:30' } } },
    ])
    const sendSpy = jest.spyOn(proactivity.proactivityInternals, 'sendPushToUser').mockResolvedValue()
    await proactivity.runProactivityTick(new Date('2026-07-09T09:00:00Z'), 5) // 05:00 EDT
    expect(sendSpy).not.toHaveBeenCalled()
    expect(mockDb.upsertUserRhythm).not.toHaveBeenCalled()
  })
})
