import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Credits } from '../../src/credits'
import { Onboarding } from '../../src/onboarding'
import { Waitlist } from '../../src/waitlist'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    getUserByEmail: jest.fn(),
    getUserByGoogleSubject: jest.fn(),
    getUserByAppleSubject: jest.fn(),
    claimGuestAccount: jest.fn(),
  },
}))

jest.mock('../../src/credits', () => ({
  Credits: { grantSignupCredits: jest.fn() },
}))

jest.mock('../../src/onboarding', () => ({
  Onboarding: { seedNewUser: jest.fn() },
}))

jest.mock('../../src/waitlist', () => ({
  Waitlist: { authorizeSignup: jest.fn(), getSignupStatus: jest.fn() },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockCredits = Credits as jest.Mocked<typeof Credits>
const mockOnboarding = Onboarding as jest.Mocked<typeof Onboarding>
const mockWaitlist = Waitlist as jest.Mocked<typeof Waitlist>

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

const guestRow = {
  id: 'guest-1',
  email: null,
  name: 'Guest',
  role: 'user' as const,
  signup_method: 'guest' as const,
}

const claimedRow = {
  id: 'guest-1',
  email: 'someone@example.com',
  name: 'Someone',
  role: 'user' as const,
  signup_method: 'password' as const,
}

const guestToken = () => jwt.sign({ userId: guestRow.id }, JWT_SECRET, { expiresIn: '365d' })

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue(guestRow as never)
  mockDb.getUserByEmail.mockResolvedValue(null as never)
  mockDb.claimGuestAccount.mockResolvedValue(claimedRow as never)
})

describe('POST /api/auth/claim', () => {
  it('converts the Guest row in place and returns an account session', async () => {
    const response = await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'Someone@Example.com ', password: 'a-good-password', name: 'Someone' })

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      id: 'guest-1',
      email: 'someone@example.com',
      authMethod: 'password',
    })
    expect(response.body.token).toEqual(expect.any(String))

    // The whole design rests on this: same row, same id, so the Local day on the
    // device is still keyed correctly the instant the write commits.
    const [userId, changes] = mockDb.claimGuestAccount.mock.calls[0] as [string, Record<string, unknown>]
    expect(userId).toBe('guest-1')
    expect(changes).toMatchObject({ email: 'someone@example.com', signup_method: 'password' })
    expect(changes.password_hash).toEqual(expect.any(String))
    expect(changes.password_hash).not.toBe('a-good-password')
  })

  it('issues an account-length session, not the guest year', async () => {
    const response = await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'someone@example.com', password: 'a-good-password', name: 'Someone' })

    const decoded = jwt.verify(response.body.token, JWT_SECRET) as { exp: number; iat: number }
    // Expiry is affordable again the moment there is a password to sign back in
    // with (ADR-0010). Seven days, not 365.
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60)
  })

  it('refuses an address that already has an account, changing nothing', async () => {
    mockDb.getUserByEmail.mockResolvedValue({ id: 'other-1' } as never)

    const response = await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'taken@example.com', password: 'a-good-password', name: 'Someone' })

    expect(response.status).toBe(409)
    expect(response.body.reason).toBe('email_taken')
    expect(mockDb.claimGuestAccount).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    const response = await request(app)
      .post('/api/auth/claim')
      .send({ email: 'someone@example.com', password: 'a-good-password', name: 'Someone' })

    expect(response.status).toBe(401)
    expect(mockDb.claimGuestAccount).not.toHaveBeenCalled()
  })

  it('refuses a second claim on a row that is no longer a Guest', async () => {
    // The guarded UPDATE matched no rows: someone else claimed it first, or this
    // session already has an account.
    mockDb.claimGuestAccount.mockResolvedValue(null as never)

    const response = await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'someone@example.com', password: 'a-good-password', name: 'Someone' })

    expect(response.status).toBe(403)
    expect(response.body.reason).toBe('not_a_guest')
  })

  it('takes no signup slot and no founding seat', async () => {
    await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'someone@example.com', password: 'a-good-password', name: 'Someone' })

    // Entry is open (ADR-0012). Both of these were previously true of every
    // account-creating path, so they are asserted rather than assumed.
    expect(mockWaitlist.authorizeSignup).not.toHaveBeenCalled()
    expect(mockCredits.grantSignupCredits).not.toHaveBeenCalled()
  })

  it('does not seed onboarding, because settings are day data', async () => {
    await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'someone@example.com', password: 'a-good-password', name: 'Someone' })

    expect(mockOnboarding.seedNewUser).not.toHaveBeenCalled()
  })

  it('rejects a password too short to be one', async () => {
    const response = await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'someone@example.com', password: 'short', name: 'Someone' })

    expect(response.status).toBe(400)
    expect(mockDb.claimGuestAccount).not.toHaveBeenCalled()
  })
})
