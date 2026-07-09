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
  it('stamps lastSent before sending and sends the morning payload', async () => {
    mockDb.listAllRhythms.mockResolvedValue([
      { user_id: 'u1', rhythm: { timezone: 'America/New_York', morning: { enabled: true, time: '07:00' } } },
    ])
    const sendSpy = jest.spyOn(proactivity.proactivityInternals, 'sendPushToUser').mockResolvedValue()

    // 07:02 EDT = 11:02 UTC on Thursday 2026-07-09
    await proactivity.runProactivityTick(new Date('2026-07-09T11:02:00Z'), 5)

    // lastSent stamped for the morning touchpoint with the local date
    expect(mockDb.upsertUserRhythm).toHaveBeenCalledWith('u1', { morning: expect.objectContaining({ lastSent: '2026-07-09' }) })
    // stamp happens before the send
    const stampOrder = mockDb.upsertUserRhythm.mock.invocationCallOrder[0]
    const sendOrder = sendSpy.mock.invocationCallOrder[0]
    expect(stampOrder).toBeLessThan(sendOrder)
    // morning static payload deep-links to the kickoff
    expect(sendSpy).toHaveBeenCalledWith('u1', expect.objectContaining({ url: '/assistant?kickoff=morning' }))
  })

  it('sends nothing when no touchpoint is due', async () => {
    mockDb.listAllRhythms.mockResolvedValue([
      { user_id: 'u1', rhythm: { timezone: 'America/New_York', morning: { enabled: true, time: '07:00' } } },
    ])
    const sendSpy = jest.spyOn(proactivity.proactivityInternals, 'sendPushToUser').mockResolvedValue()
    await proactivity.runProactivityTick(new Date('2026-07-09T09:00:00Z'), 5) // 05:00 EDT
    expect(sendSpy).not.toHaveBeenCalled()
    expect(mockDb.upsertUserRhythm).not.toHaveBeenCalled()
  })
})
