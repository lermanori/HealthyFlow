import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Onboarding } from '../../src/onboarding'
import { Waitlist } from '../../src/waitlist'

// ponytail: mock db so tests are hermetic — no real Supabase calls
jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
    releasePublicSignupSlot: jest.fn(),
    claimSignupCreditGrant: jest.fn(),
    getFoundingSignupCreditGrantCount: jest.fn(),
  },
}))

jest.mock('../../src/onboarding', () => ({
  Onboarding: {
    seedNewUser: jest.fn(),
  },
}))

jest.mock('../../src/waitlist', () => ({
  Waitlist: {
    authorizeSignup: jest.fn(),
    completeInviteSignup: jest.fn(),
    getSignupStatus: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockOnboarding = Onboarding as jest.Mocked<typeof Onboarding>
const mockWaitlist = Waitlist as jest.Mocked<typeof Waitlist>

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.claimSignupCreditGrant.mockResolvedValue({
    credits: 250,
    cohort: 'founding',
    balance: 250,
    alreadyGranted: false,
  })
  mockDb.getFoundingSignupCreditGrantCount.mockResolvedValue(0)
  mockDb.releasePublicSignupSlot.mockResolvedValue(true)
  // Default to an open public slot so the pre-existing tests below still exercise
  // the happy path; the gating tests override this per case.
  mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: true, via: 'public' })
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
    expect(res.body.signupCredits).toEqual({
      credits: 250,
      cohort: 'founding',
      balance: 250,
      alreadyGranted: false,
    })
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.objectContaining({
      claimed_public_signup_slot: true,
    }))
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

describe('POST /api/auth/signup — access gating', () => {
  it('403s with a waitlist payload when registration is closed', async () => {
    mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: false, reason: 'closed' })
    mockDb.getUserByEmail.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'closed@example.com', password: 'password1', name: 'Alice' })
      .set('X-Forwarded-For', '10.0.0.1')

    expect(res.status).toBe(403)
    expect(res.body.reason).toBe('closed')
    expect(mockDb.createUser).not.toHaveBeenCalled()
  })

  it('allows signup with a valid invite and redeems it', async () => {
    mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: true, via: 'invite', inviteToken: 't1' })
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({ id: 'user-1', email: 'invited@example.com', name: 'Alice' })

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'invited@example.com', password: 'password1', name: 'Alice', invite: 't1' })
      .set('X-Forwarded-For', '10.0.0.2')

    expect(res.status).toBe(200)
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.objectContaining({
      claimed_public_signup_slot: false,
    }))
    expect(mockWaitlist.completeInviteSignup).toHaveBeenCalledWith('t1', 'user-1')
  })

  it('403s on an already-redeemed invite', async () => {
    mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: false, reason: 'invite_used' })
    mockDb.getUserByEmail.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'used@example.com', password: 'password1', name: 'Alice', invite: 't1' })
      .set('X-Forwarded-For', '10.0.0.3')

    expect(res.status).toBe(403)
    expect(res.body.reason).toBe('invite_used')
  })

  it('does not consume a slot when the email is already taken', async () => {
    mockDb.getUserByEmail.mockResolvedValue({ id: 'existing', email: 'taken@example.com', name: 'Bob', password_hash: 'x' })

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'taken@example.com', password: 'password1', name: 'Bob' })
      .set('X-Forwarded-For', '10.0.0.4')

    expect(res.status).toBe(409)
    expect(mockWaitlist.authorizeSignup).not.toHaveBeenCalled()
  })

  it('public signup does not attempt an invite redemption', async () => {
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({ id: 'user-2', email: 'pub@example.com', name: 'Pub' })

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'pub@example.com', password: 'password1', name: 'Pub' })
      .set('X-Forwarded-For', '10.0.0.5')

    expect(res.status).toBe(200)
    expect(mockWaitlist.completeInviteSignup).not.toHaveBeenCalled()
  })

  it('returns a reserved public seat when account creation fails', async () => {
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockRejectedValue(new Error('insert failed'))

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'failed@example.com', password: 'password1', name: 'Failed' })
      .set('X-Forwarded-For', '10.0.0.6')

    expect(res.status).toBe(500)
    expect(mockDb.releasePublicSignupSlot).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/auth/signup-status', () => {
  it('returns mode and remaining without exposing the waitlist', async () => {
    mockWaitlist.getSignupStatus.mockResolvedValue({ mode: 'open', remaining: 7 })

    const res = await request(app).get('/api/auth/signup-status')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      mode: 'open',
      remaining: 7,
      offer: {
        foundingMemberLimit: 100,
        // Seats at the founding PRICE. The welcome grant is the same for everyone.
        foundingMembersRemaining: 100,
        welcomeCredits: 50,
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
