import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Onboarding } from '../../src/onboarding'

// ponytail: mock db so tests are hermetic — no real Supabase calls
jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
    getFoundingPriceMemberCount: jest.fn(),
  },
}))

jest.mock('../../src/onboarding', () => ({
  Onboarding: {
    seedNewUser: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockOnboarding = Onboarding as jest.Mocked<typeof Onboarding>

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getFoundingPriceMemberCount.mockResolvedValue(0)
})

describe('POST /api/auth/signup', () => {
  it('validates but cannot create an account when the E2E backend is in test mode', async () => {
    process.env.HF_TEST_MODE = '1'
    try {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'blocked@example.com', password: 'password1', name: 'Blocked' })
        .set('X-Forwarded-For', '10.20.30.40')

      expect(res.status).toBe(403)
      expect(res.body.reason).toBe('test_account_creation_disabled')
      expect(mockDb.getUserByEmail).not.toHaveBeenCalled()
      expect(mockDb.createUser).not.toHaveBeenCalled()
    } finally {
      delete process.env.HF_TEST_MODE
    }
  })

  it('new email signs up → 200 with JWT', async () => {
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({ id: 'user-1', email: 'new@example.com', name: 'Alice' })

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'password1', name: 'Alice' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.email).toBe('new@example.com')
    expect(res.body.signupCredits).toBeUndefined()
    expect(mockOnboarding.seedNewUser).toHaveBeenCalledWith('user-1')
  })

  it('duplicate email → 409', async () => {
    mockDb.getUserByEmail.mockResolvedValue({ id: 'existing', email: 'taken@example.com', name: 'Bob', password_hash: 'x' })

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'taken@example.com', password: 'password1', name: 'Bob' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already/i)
  })

  it('password < 8 chars → 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'short', name: 'Alice' })

    expect(res.status).toBe(400)
    expect(mockDb.createUser).not.toHaveBeenCalled()
  })

  it('invalid email format → 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', password: 'password1', name: 'Alice' })

    expect(res.status).toBe(400)
    expect(mockDb.createUser).not.toHaveBeenCalled()
  })

  it('rate limit: 6th rapid request → 429', async () => {
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({ id: 'u', email: 'x@x.com', name: 'X' })

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: `user${i}@example.com`, password: 'password1', name: 'X' })
        .set('X-Forwarded-For', '1.2.3.4')
    }

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'user6@example.com', password: 'password1', name: 'X' })
      .set('X-Forwarded-For', '1.2.3.4')

    expect(res.status).toBe(429)
  })
})

describe('POST /api/auth/signup — entry is open (ADR-0012)', () => {
  it('creates an account with every public seat taken, and takes none', async () => {
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({ id: 'user-1', email: 'late@example.com', name: 'Alice' })

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'late@example.com', password: 'password1', name: 'Alice' })
      .set('X-Forwarded-For', '10.0.0.1')

    expect(res.status).toBe(200)
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.not.objectContaining({
      claimed_public_signup_slot: true,
    }))
  })

  it('still accepts an invite sent before entry opened, and needs nothing from it', async () => {
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({ id: 'user-2', email: 'invited@example.com', name: 'Alice' })

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'invited@example.com', password: 'password1', name: 'Alice', invite: 'expired-long-ago' })
      .set('X-Forwarded-For', '10.0.0.2')

    expect(res.status).toBe(200)
  })
})

describe('GET /api/auth/signup-status', () => {
  it('is always open and never reads the seat counter', async () => {
    const res = await request(app).get('/api/auth/signup-status')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      mode: 'open',
      // Wire compatibility only: builds that predate open entry require the field.
      remaining: 0,
      offer: {
        foundingMemberLimit: 100,
        // Seats at the founding PRICE. Account creation grants no actions.
        foundingMembersRemaining: 100,
        monthlyFreeCredits: 15,
        foundingPriceUsd: 9,
        regularPriceUsd: 19,
        actionPrice: { text: 1, photo: 5, premium: 10 },
        subscriptionIncludes: {
          unlimitedText: true,
          textDailyCap: 100,
          photoMonthly: 100,
          premiumMonthly: 50,
        },
        topUpPriceUsd: 5,
        topUpCredits: 300,
      },
    })
  })
})

describe('POST /api/auth/register (admin-only, regression guard)', () => {
  it('still requires ADMIN_TOKEN', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'hacker@example.com', password: 'password1', name: 'Hacker' })

    expect(res.status).toBe(403)
  })

  it('works with correct ADMIN_TOKEN', async () => {
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({ id: 'u2', email: 'admin@example.com', name: 'Admin' })

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'admin@example.com', password: 'password1', name: 'Admin', adminToken: process.env.ADMIN_TOKEN || 'test-admin-token' })

    // Original /register returns user without JWT (existing behavior)
    expect(res.status).toBe(200)
    expect(res.body.user).toBeDefined()
  })

  it('does not create an admin-added account in E2E test mode', async () => {
    process.env.HF_TEST_MODE = '1'
    try {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'blocked-admin@example.com',
          password: 'password1',
          name: 'Blocked Admin',
          adminToken: process.env.ADMIN_TOKEN,
        })

      expect(res.status).toBe(403)
      expect(res.body.reason).toBe('test_account_creation_disabled')
      expect(mockDb.createUser).not.toHaveBeenCalled()
    } finally {
      delete process.env.HF_TEST_MODE
    }
  })
})

describe('other account-producing auth routes in E2E test mode', () => {
  it.each([
    ['/api/auth/google', { accessToken: 'test-provider-token' }],
    ['/api/auth/demo-session', { persona: 'maya' }],
  ])('blocks %s before it can create a user', async (path, body) => {
    process.env.HF_TEST_MODE = '1'
    try {
      const res = await request(app).post(path).send(body)
      expect(res.status).toBe(403)
      expect(res.body.reason).toBe('test_account_creation_disabled')
      expect(mockDb.createUser).not.toHaveBeenCalled()
    } finally {
      delete process.env.HF_TEST_MODE
    }
  })
})

describe('POST /api/auth/login disabled-account enforcement', () => {
  it('checks valid credentials but does not issue a session to a disabled user', async () => {
    mockDb.getUserByEmail.mockResolvedValue({
      id: 'disabled-user',
      email: 'disabled@example.com',
      name: 'Disabled User',
      password_hash: await bcrypt.hash('password1', 10),
      role: 'user',
      disabled_at: '2026-07-29T00:00:00.000Z',
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'disabled@example.com', password: 'password1' })

    expect(res.status).toBe(403)
    expect(res.body.reason).toBe('account_disabled')
    expect(res.body.token).toBeUndefined()
  })
})
