import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Onboarding } from '../../src/onboarding'
import { Waitlist } from '../../src/waitlist'

// ponytail: mock db so tests are hermetic — no real Supabase calls
jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserByEmail: jest.fn(),
    getUserById: jest.fn(),
    createUser: jest.fn(),
    releasePublicSignupSlot: jest.fn(),
    claimSignupCreditGrant: jest.fn(),
    getFoundingSignupCreditGrantCount: jest.fn(),
  },
}))

jest.mock('../../src/onboarding', () => ({
  Onboarding: { seedNewUser: jest.fn() },
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

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
const DAY_SECONDS = 24 * 60 * 60

const guestRow = {
  id: 'guest-1',
  email: null,
  name: 'Guest',
  role: 'user' as const,
  signup_method: 'guest' as const,
}

function sessionLifetimeDays(token: string) {
  const decoded = jwt.decode(token) as { iat: number; exp: number }
  return Math.round((decoded.exp - decoded.iat) / DAY_SECONDS)
}

function guestToken(userId = guestRow.id) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '365d' })
}

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
  mockDb.createUser.mockResolvedValue(guestRow)
  mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: true, via: 'public' })
})

describe('POST /api/auth/guest', () => {
  it('creates a users row with no email and returns a normal session', async () => {
    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.0.1')

    expect(res.status).toBe(200)
    expect(res.body.user.email).toBeNull()
    expect(res.body.user.authMethod).toBe('guest')
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: null,
      name: 'Guest',
      signup_method: 'guest',
    }))
    // The session is a normal `{ userId }` principal — no guest token type.
    expect(jwt.verify(res.body.token, JWT_SECRET)).toMatchObject({ userId: 'guest-1' })
  })

  it('never claims a founding seat: the signup grant awards 250 credits and burns one of 100', async () => {
    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.0.2')

    expect(res.status).toBe(200)
    // claim_signup_credit_grant awards FOUNDING_SIGNUP_CREDITS while founding
    // seats remain, so routing a Guest through it would hand out five dollars of
    // credits instead of one and drain the founding count on the login page.
    expect(mockDb.claimSignupCreditGrant).not.toHaveBeenCalled()
    expect(res.body.signupCredits).toBeUndefined()
  })

  it('writes no day data: the row is identity and credits only', async () => {
    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.0.8')

    expect(res.status).toBe(200)
    // Onboarding seeding writes user settings, and a Guest's settings are their
    // own day data — it does not live on the server.
    expect(mockOnboarding.seedNewUser).not.toHaveBeenCalled()
  })

  it('is not a signup: no access gate, no public slot, no claimed seat', async () => {
    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.0.3')

    expect(res.status).toBe(200)
    expect(mockWaitlist.authorizeSignup).not.toHaveBeenCalled()
    expect(mockDb.createUser).toHaveBeenCalledWith(
      expect.not.objectContaining({ claimed_public_signup_slot: true }),
    )
  })

  it('issues a year-long session, because a Guest has no way to sign in again', async () => {
    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.0.4')

    expect(sessionLifetimeDays(res.body.token)).toBe(365)
  })

  it('rejects details it does not accept instead of ignoring them', async () => {
    const res = await request(app)
      .post('/api/auth/guest')
      .send({ email: 'someone@example.com' })
      .set('X-Forwarded-For', '30.0.0.5')

    expect(res.status).toBe(400)
    expect(mockDb.createUser).not.toHaveBeenCalled()
  })

  it('surfaces a failed account insert instead of returning a session', async () => {
    mockDb.createUser.mockResolvedValue(null)

    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.0.6')

    expect(res.status).toBe(500)
    expect(res.body.reason).toBe('guest_creation_failed')
    expect(res.body.token).toBeUndefined()
  })

  it('cannot create an account when the E2E backend is in test mode', async () => {
    process.env.HF_TEST_MODE = '1'
    try {
      const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.0.7')

      expect(res.status).toBe(403)
      expect(res.body.reason).toBe('test_account_creation_disabled')
      expect(mockDb.createUser).not.toHaveBeenCalled()
    } finally {
      delete process.env.HF_TEST_MODE
    }
  })

  it('rate limits like signup: 6th rapid request → 429', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.9.9.9')
    }

    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.9.9.9')

    expect(res.status).toBe(429)
  })
})

describe('GET /api/auth/verify — Guest session renewal', () => {
  it('re-issues a Guest session on every open, so an active Guest never expires out', async () => {
    mockDb.getUserById.mockResolvedValue(guestRow)

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${guestToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.email).toBeNull()
    expect(sessionLifetimeDays(res.body.token)).toBe(365)
  })

  it('does not renew an account session, which can always sign in again', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'user-1',
      email: 'someone@example.com',
      name: 'Someone',
      role: 'user' as const,
      signup_method: 'password' as const,
    })

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${jwt.sign({ userId: 'user-1' }, JWT_SECRET, { expiresIn: '7d' })}`)

    expect(res.status).toBe(200)
    expect(res.body.token).toBeUndefined()
  })
})
