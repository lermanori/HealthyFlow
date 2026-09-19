import fs from 'fs'
import path from 'path'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Credits } from '../../src/credits'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    getContactMessages: jest.fn(),
    updateContactMessageStatus: jest.fn(),
  },
}))

jest.mock('../../src/credits', () => ({
  Credits: {
    getAdminOverview: jest.fn(),
    setBalance: jest.fn(),
    updateSubscriptionPricing: jest.fn(),
    activateSubscription: jest.fn(),
    grantTopUp: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockCredits = Credits as jest.Mocked<typeof Credits>

const authHeader = (userId: string) =>
  `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET!)}`

beforeEach(() => {
  jest.clearAllMocks()
})

describe('token manager migrations', () => {
  it('adds roles, seeds lermanori admin, and creates billing settings', () => {
    const migration = fs.readFileSync(
      path.join(__dirname, '../../../supabase/migrations/20260624000002_add_roles_token_manager.sql'),
      'utf8'
    )

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'")
    expect(migration).toContain("WHERE lower(email) = 'lermanori@gmail.com'")
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ai_billing_settings')
  })
})

describe('admin API', () => {
  it('blocks non-admin users', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'user',
    })

    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', authHeader('user-1'))

    expect(res.status).toBe(403)
    expect(mockCredits.getAdminOverview).not.toHaveBeenCalled()
  })

  it('returns overview for admins', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })
    mockCredits.getAdminOverview.mockResolvedValue({
      activity: [],
    })

    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', authHeader('admin-1'))

    expect(res.status).toBe(200)
    expect(mockCredits.getAdminOverview).toHaveBeenCalled()
  })

  it('returns contact messages for admins', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })
    mockDb.getContactMessages.mockResolvedValue([
      {
        id: 'message-1',
        userId: 'user-1',
        userEmail: 'user@example.com',
        userName: 'User',
        kind: 'feedback',
        message: 'The morning flow feels great.',
        replyTo: null,
        status: 'pending',
        handledAt: null,
        handledBy: null,
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    ])

    const res = await request(app)
      .get('/api/admin/contact-messages')
      .set('Authorization', authHeader('admin-1'))

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(mockDb.getContactMessages).toHaveBeenCalledWith('pending')
  })

  it('marks contact messages handled for admins', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })
    mockDb.updateContactMessageStatus.mockResolvedValue({
      id: 'message-1',
      userId: 'user-1',
      userEmail: 'user@example.com',
      userName: 'User',
      kind: 'more_actions',
      message: 'Please add more actions.',
      replyTo: 'guest@example.com',
      status: 'handled',
      handledAt: '2026-07-02T00:00:00.000Z',
      handledBy: 'admin-1',
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    })

    const res = await request(app)
      .patch('/api/admin/contact-messages/message-1')
      .set('Authorization', authHeader('admin-1'))
      .send({ status: 'handled' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('handled')
    expect(mockDb.updateContactMessageStatus).toHaveBeenCalledWith('message-1', 'handled', 'admin-1')
  })

  describe('setting an action balance', () => {
    beforeEach(() => {
      mockDb.getUserById.mockResolvedValue({
        id: 'admin-1',
        email: 'lermanori@gmail.com',
        name: 'Admin',
        role: 'admin',
      })
    })

    it('applies a balance the admin saw unchanged, as that admin, with the note', async () => {
      mockCredits.setBalance.mockResolvedValue({ status: 'applied', balance: 30, delta: 18 })

      const res = await request(app)
        .patch('/api/admin/users/user-1/balance')
        .set('Authorization', authHeader('admin-1'))
        .send({ expectedBalance: 12, balance: 30, note: 'Founders Club request' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ balance: 30, delta: 18 })
      expect(mockCredits.setBalance).toHaveBeenCalledWith('user-1', {
        expected: 12,
        balance: 30,
        actorId: 'admin-1',
        note: 'Founders Club request',
      })
    })

    it('refuses, and says what it is now, when the balance moved since it was shown', async () => {
      mockCredits.setBalance.mockResolvedValue({ status: 'conflict', currentBalance: 27 })

      const res = await request(app)
        .patch('/api/admin/users/user-1/balance')
        .set('Authorization', authHeader('admin-1'))
        .send({ expectedBalance: 12, balance: 30 })

      expect(res.status).toBe(409)
      expect(res.body).toMatchObject({ reason: 'balance_changed', currentBalance: 27 })
    })

    it('will not overwrite blind: the balance the admin saw is required', async () => {
      const res = await request(app)
        .patch('/api/admin/users/user-1/balance')
        .set('Authorization', authHeader('admin-1'))
        .send({ balance: 30 })

      expect(res.status).toBe(400)
      expect(mockCredits.setBalance).not.toHaveBeenCalled()
    })
  })

  describe('the balance migration', () => {
    const sql = fs.readdirSync(path.join(__dirname, '../../../supabase/migrations'))
      .filter(name => name.endsWith('_admin_set_credit_balance.sql'))
      .map(name => fs.readFileSync(path.join(__dirname, '../../../supabase/migrations', name), 'utf8'))
      .join('\n')

    it('decides, writes and records in one locked database call', () => {
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION admin_set_credit_balance\(/)
      expect(sql).toMatch(/FOR UPDATE/)
      expect(sql).toMatch(/'conflict'/)
      expect(sql).toMatch(/INSERT INTO ai_usage_log[\s\S]*actor_user_id/)
      expect(sql).toMatch(/INSERT INTO admin_user_audit_log[\s\S]*'balance_set'/)
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION admin_set_credit_balance\(UUID, INTEGER, INTEGER, UUID, TEXT\) TO service_role/)
    })
  })

  it('still answers on the old token-manager paths for builds that predate the rename', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })
    mockCredits.getAdminOverview.mockResolvedValue({ activity: [] })

    const res = await request(app)
      .get('/api/admin/token-manager/overview')
      .set('Authorization', authHeader('admin-1'))

    expect(res.status).toBe(200)
    expect(mockCredits.getAdminOverview).toHaveBeenCalled()
  })

  it('no longer serves the unused system statistics', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })

    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', authHeader('admin-1'))

    expect(res.status).toBe(404)
  })

  it('no longer exposes the markup settings', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })

    const res = await request(app)
      .patch('/api/admin/token-manager/settings')
      .set('Authorization', authHeader('admin-1'))
      .send({ markupRate: 0.4, minMarkupTokens: 8 })

    expect(res.status).toBe(404)
  })

  it('does not expose subscription pricing in free v1', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })
    mockCredits.updateSubscriptionPricing.mockResolvedValue({
      promoActive: false,
      phase: 'regular',
      priceUsd: 19,
      topUpPriceUsd: 5,
      topUpCredits: 300,
      actionPrice: { text: 1, photo: 5, premium: 10 },
      foundingMemberLimit: 100,
    })

    const res = await request(app)
      .patch('/api/admin/token-manager/subscription-pricing')
      .set('Authorization', authHeader('admin-1'))
      .send({ promoActive: false })

    expect(res.status).toBe(404)
    expect(mockCredits.updateSubscriptionPricing).not.toHaveBeenCalled()
  })

  it('does not expose Cloud activation in free v1', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })
    mockCredits.activateSubscription.mockResolvedValue({
      balance: 600,
      pricing: {
        promoActive: true,
        phase: 'promo',
        priceUsd: 9,
        topUpPriceUsd: 5,
        topUpCredits: 300,
        actionPrice: { text: 1, photo: 5, premium: 10 },
        foundingMemberLimit: 100,
      },
      subscription: {
        active: true,
        pricePhase: 'promo',
        monthlyCredits: 0,
        renewalDate: '2026-08-01',
        lastMonthlyGrantAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    })

    const res = await request(app)
      .patch('/api/admin/token-manager/users/user-1/subscription')
      .set('Authorization', authHeader('admin-1'))
      .send({ active: true, grantMonthlyCredits: true })

    expect(res.status).toBe(404)
    expect(mockCredits.activateSubscription).not.toHaveBeenCalled()
  })

  it('does not expose paid top-ups in free v1', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })
    mockCredits.grantTopUp.mockResolvedValue({
      balance: 275,
      credits: 250,
      dollars: 5,
      pricing: {
        promoActive: true,
        phase: 'promo',
        priceUsd: 9,
        topUpPriceUsd: 5,
        topUpCredits: 300,
        actionPrice: { text: 1, photo: 5, premium: 10 },
        foundingMemberLimit: 100,
      },
    })

    const res = await request(app)
      .post('/api/admin/token-manager/users/user-1/top-up')
      .set('Authorization', authHeader('admin-1'))
      .send({ dollars: 5 })

    expect(res.status).toBe(404)
    expect(mockCredits.grantTopUp).not.toHaveBeenCalled()
  })
})
