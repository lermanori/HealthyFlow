jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}))
jest.mock('../../src/supabase-client', () => ({
  db: {
    listPushSubscriptions: jest.fn(),
    deletePushSubscriptionByEndpoint: jest.fn(),
  },
}))

import webpush from 'web-push'
import { db } from '../../src/supabase-client'
import { sendPushToUser } from '../../src/proactivity'

const mockWebpush = webpush as jest.Mocked<typeof webpush>
const mockDb = db as unknown as {
  listPushSubscriptions: jest.Mock
  deletePushSubscriptionByEndpoint: jest.Mock
}

beforeEach(() => jest.clearAllMocks())

describe('sendPushToUser', () => {
  it('sends to every subscription with the given payload', async () => {
    mockDb.listPushSubscriptions.mockResolvedValue([
      { endpoint: 'https://push/a', p256dh: 'A', auth: 'a' },
      { endpoint: 'https://push/b', p256dh: 'B', auth: 'b' },
    ])
    mockWebpush.sendNotification.mockResolvedValue({} as any)

    await sendPushToUser('u1', { title: 'Hi', body: 'there', url: '/assistant?kickoff=morning' })

    expect(mockWebpush.sendNotification).toHaveBeenCalledTimes(2)
    const [subArg, payloadArg] = mockWebpush.sendNotification.mock.calls[0]
    expect(subArg).toEqual({ endpoint: 'https://push/a', keys: { p256dh: 'A', auth: 'a' } })
    expect(JSON.parse(payloadArg as string)).toEqual({ title: 'Hi', body: 'there', url: '/assistant?kickoff=morning' })
    expect(mockDb.deletePushSubscriptionByEndpoint).not.toHaveBeenCalled()
  })

  it('prunes a subscription that returns 410 Gone', async () => {
    mockDb.listPushSubscriptions.mockResolvedValue([
      { endpoint: 'https://push/dead', p256dh: 'D', auth: 'd' },
    ])
    mockWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }))

    await sendPushToUser('u1', { title: 'x', body: 'y', url: '/' })

    expect(mockDb.deletePushSubscriptionByEndpoint).toHaveBeenCalledWith('https://push/dead')
  })

  it('prunes on 404 too, and does not throw', async () => {
    mockDb.listPushSubscriptions.mockResolvedValue([
      { endpoint: 'https://push/404', p256dh: 'D', auth: 'd' },
    ])
    mockWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('nf'), { statusCode: 404 }))

    await expect(sendPushToUser('u1', { title: 'x', body: 'y', url: '/' })).resolves.toBeUndefined()
    expect(mockDb.deletePushSubscriptionByEndpoint).toHaveBeenCalledWith('https://push/404')
  })

  it('does NOT prune on a transient 500 error', async () => {
    mockDb.listPushSubscriptions.mockResolvedValue([
      { endpoint: 'https://push/flaky', p256dh: 'D', auth: 'd' },
    ])
    mockWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }))

    await sendPushToUser('u1', { title: 'x', body: 'y', url: '/' })
    expect(mockDb.deletePushSubscriptionByEndpoint).not.toHaveBeenCalled()
  })
})
