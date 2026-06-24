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
  },
}))

jest.mock('../../src/credits', () => ({
  Credits: {
    getTokenManagerOverview: jest.fn(),
    setBalance: jest.fn(),
    updateBillingSettings: jest.fn(),
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

describe('admin token-manager API', () => {
  it('blocks non-admin users', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'user',
    })

    const res = await request(app)
      .get('/api/admin/token-manager/overview')
      .set('Authorization', authHeader('user-1'))

    expect(res.status).toBe(403)
    expect(mockCredits.getTokenManagerOverview).not.toHaveBeenCalled()
  })

  it('returns overview for admins', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })
    mockCredits.getTokenManagerOverview.mockResolvedValue({
      users: [],
      settings: { appTokensPerUsd: 1000, markupRate: 0.25, minMarkupTokens: 5 },
      totals: {
        today: {
          requestCount: 0,
          billedTokens: 0,
          markupTokens: 0,
          baseTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalOpenAiTokens: 0,
        },
        thisWeek: {
          requestCount: 0,
          billedTokens: 0,
          markupTokens: 0,
          baseTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalOpenAiTokens: 0,
        },
        thisMonth: {
          requestCount: 0,
          billedTokens: 0,
          markupTokens: 0,
          baseTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalOpenAiTokens: 0,
        },
      },
      activity: [],
    })

    const res = await request(app)
      .get('/api/admin/token-manager/overview')
      .set('Authorization', authHeader('admin-1'))

    expect(res.status).toBe(200)
    expect(mockCredits.getTokenManagerOverview).toHaveBeenCalled()
  })

  it('sets a final user balance for admins', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })
    mockCredits.setBalance.mockResolvedValue({ balance: 1234, delta: 234 })

    const res = await request(app)
      .patch('/api/admin/token-manager/users/user-1/balance')
      .set('Authorization', authHeader('admin-1'))
      .send({ balance: 1234 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ balance: 1234, delta: 234 })
    expect(mockCredits.setBalance).toHaveBeenCalledWith('user-1', 1234)
  })

  it('updates billing settings for admins', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'lermanori@gmail.com',
      name: 'Admin',
      role: 'admin',
    })
    mockCredits.updateBillingSettings.mockResolvedValue({
      appTokensPerUsd: 1000,
      markupRate: 0.4,
      minMarkupTokens: 8,
    })

    const res = await request(app)
      .patch('/api/admin/token-manager/settings')
      .set('Authorization', authHeader('admin-1'))
      .send({ markupRate: 0.4, minMarkupTokens: 8 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ appTokensPerUsd: 1000, markupRate: 0.4, minMarkupTokens: 8 })
    expect(mockCredits.updateBillingSettings).toHaveBeenCalledWith({ markupRate: 0.4, minMarkupTokens: 8 })
  })
})
