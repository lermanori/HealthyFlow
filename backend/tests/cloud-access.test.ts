import { CloudAccess, CloudNotActiveError } from '../src/cloud-access'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    getUserCreditSubscription: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue({ id: 'user-1', email: 'person@example.com' } as never)
})

describe('CloudAccess', () => {
  it('reports an active subscription as active Cloud', async () => {
    mockDb.getUserCreditSubscription.mockResolvedValue({ active: true } as never)

    await expect(CloudAccess.read('user-1')).resolves.toEqual({ status: 'active' })
    await expect(CloudAccess.require('user-1')).resolves.toEqual({ status: 'active' })
  })

  it.each([
    ['an inactive subscription', { active: false }],
    ['no subscription row', null],
  ])('reports %s as Cloud not active', async (_label, subscription) => {
    mockDb.getUserCreditSubscription.mockResolvedValue(subscription as never)

    await expect(CloudAccess.read('user-1')).resolves.toEqual({ status: 'inactive' })
    await expect(CloudAccess.require('user-1')).rejects.toBeInstanceOf(CloudNotActiveError)
  })

  it('does not grant backend Cloud access to a Guest even if a subscription row is active', async () => {
    mockDb.getUserCreditSubscription.mockResolvedValue({ active: true } as never)
    mockDb.getUserById.mockResolvedValue({ id: 'guest-1', email: null } as never)

    await expect(CloudAccess.read('guest-1')).resolves.toEqual({ status: 'inactive' })
    await expect(CloudAccess.require('guest-1')).rejects.toBeInstanceOf(CloudNotActiveError)
  })

  it('does not turn an entitlement read failure into an inactive result', async () => {
    mockDb.getUserCreditSubscription.mockRejectedValue(new Error('subscription database unavailable'))

    await expect(CloudAccess.read('user-1')).rejects.toThrow('subscription database unavailable')
  })
})
