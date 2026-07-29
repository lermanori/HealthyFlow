import request from 'supertest'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Onboarding } from '../../src/onboarding'
import { Waitlist } from '../../src/waitlist'

// ponytail: mock db so tests are hermetic — no real Supabase calls
jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
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
  // Default to an open public slot so the pre-existing tests below still exercise
  // the happy path; the gating tests override this per case.
  mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: true, via: 'public' })
})

describe('POST /api/auth/signup', () => {
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
        foundingMembersRemaining: 100,
        onboardingCredits: 250,
        foundingOnboardingCredits: 250,
        standardOnboardingCredits: 50,
        foundingPriceUsd: 9,
        regularPriceUsd: 19,
        monthlyCredits: 500,
        topUpPriceUsd: 5,
        topUpCredits: 250,
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
})
