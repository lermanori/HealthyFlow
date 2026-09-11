/**
 * Granting and revoking Cloud from User management (#268).
 *
 * v1 sells no Cloud, and `20260907170000_disable_v1_cloud.sql` deactivated every
 * subscription — which left the founder "legacy exception" the docs describe with
 * no row behind it. This is the operator switch that makes it real and revocable
 * without hand-editing the database.
 */
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    getUserCreditSubscription: jest.fn(),
    upsertUserCreditSubscription: jest.fn(),
  },
  supabase: { from: jest.fn() },
}))

const mockDb = db as jest.Mocked<typeof db>
const ADMIN = `Bearer ${jwt.sign({ userId: 'admin-1' }, process.env.JWT_SECRET!)}`
const PERSON = `Bearer ${jwt.sign({ userId: 'person-1' }, process.env.JWT_SECRET!)}`

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockImplementation(async (id: string) => ({
    id,
    email: `${id}@example.com`,
    role: id === 'admin-1' ? 'admin' : 'user',
  }) as never)
  mockDb.getUserCreditSubscription.mockResolvedValue(null as never)
  mockDb.upsertUserCreditSubscription.mockImplementation(async (row: any) => row as never)
})

describe('PATCH /api/admin/token-manager/users/:userId/cloud', () => {
  it('grants Cloud to an account that never held a subscription', async () => {
    const response = await request(app)
      .patch('/api/admin/token-manager/users/person-1/cloud')
      .set('Authorization', ADMIN)
      .send({ active: true })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ userId: 'person-1', active: true })
    expect(mockDb.upsertUserCreditSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'person-1', active: true }),
    )
  })

  it('keeps the terms an existing subscription already had', async () => {
    mockDb.getUserCreditSubscription.mockResolvedValue({
      user_id: 'person-1',
      active: false,
      price_phase: 'regular',
      monthly_credits: 300,
      renewal_date: '2026-10-01',
      last_monthly_grant_at: '2026-09-01',
    } as never)

    await request(app)
      .patch('/api/admin/token-manager/users/person-1/cloud')
      .set('Authorization', ADMIN)
      .send({ active: true })

    // Revoking and restoring must not quietly change what the account was
    // entitled to.
    expect(mockDb.upsertUserCreditSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        price_phase: 'regular',
        monthly_credits: 300,
        renewal_date: '2026-10-01',
      }),
    )
  })

  it('revokes Cloud', async () => {
    const response = await request(app)
      .patch('/api/admin/token-manager/users/person-1/cloud')
      .set('Authorization', ADMIN)
      .send({ active: false })

    expect(response.body).toEqual({ userId: 'person-1', active: false })
  })

  it('refuses a caller who is not an admin', async () => {
    const response = await request(app)
      .patch('/api/admin/token-manager/users/person-1/cloud')
      .set('Authorization', PERSON)
      .send({ active: true })

    expect(response.status).toBe(403)
    expect(mockDb.upsertUserCreditSubscription).not.toHaveBeenCalled()
  })

  it('refuses a body that does not say which way', async () => {
    const response = await request(app)
      .patch('/api/admin/token-manager/users/person-1/cloud')
      .set('Authorization', ADMIN)
      .send({})

    expect(response.status).toBe(400)
    expect(mockDb.upsertUserCreditSubscription).not.toHaveBeenCalled()
  })
})
