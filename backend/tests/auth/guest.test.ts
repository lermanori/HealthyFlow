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
    reserveGuestGrantIp: jest.fn(),
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
  mockDb.releasePublicSignupSlot.mockResolvedValue(true)
  mockDb.createUser.mockResolvedValue(guestRow)
  mockDb.reserveGuestGrantIp.mockResolvedValue(true)
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

  it('starts without a welcome credit grant', async () => {
    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.0.2')

    expect(res.status).toBe(200)
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

// ADR-0023 — the once-ever Guest grant is reserved per network, because "once"
// keyed only to the users row is defeated by deleting and reinstalling the app.
describe('POST /api/auth/guest — network grant reservation', () => {
  it('marks the Guest eligible when this network has no live reservation', async () => {
    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.1.1')

    expect(res.status).toBe(200)
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.objectContaining({
      guest_grant_ip_reserved: true,
    }))
  })

  it('keys the reservation to a derived value, never the address itself', async () => {
    await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.1.2')

    const [ipHash, windowHours] = mockDb.reserveGuestGrantIp.mock.calls[0]
    expect(ipHash).toMatch(/^[0-9a-f]{64}$/)
    expect(ipHash).not.toContain('30.0.1.2')
    expect(windowHours).toBe(24)
  })

  it('lets a second Guest on the same network in, but without the action grant', async () => {
    mockDb.reserveGuestGrantIp.mockResolvedValue(false)

    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.1.3')

    // Entry is not the grant. Losing the reservation withholds ten AI actions;
    // it must never cost someone the Local day they came for.
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBeNull()
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.objectContaining({
      guest_grant_ip_reserved: false,
    }))
  })

  it('withholds the grant when the reservation breaks, rather than paying it out', async () => {
    mockDb.reserveGuestGrantIp.mockRejectedValue(new Error('reservation store unreachable'))

    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '30.0.1.4')

    // A failed read is not an empty result: an unreachable reservation store
    // must not be read as "this network is free", which would reopen farming
    // for exactly as long as the outage lasts.
    expect(res.status).toBe(200)
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.objectContaining({
      guest_grant_ip_reserved: false,
    }))
  })
})
