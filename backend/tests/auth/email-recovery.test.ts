/**
 * Email verification and self-serve recovery (#235).
 *
 * Every case here is about a link that should *not* work, or about what a
 * stranger can learn by asking. The happy path is one test; the rest are the
 * reasons this feature is worth writing carefully.
 */
import request from 'supertest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { setMailSender } from '../../src/routes/auth'
import { recordingMailSender } from '../../src/mail'
import { hashChallengeToken, RESET_REQUEST_ACCEPTED } from '../../src/auth-challenges'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    getUserByEmail: jest.fn(),
    createEmailChallenge: jest.fn(),
    getEmailChallengeByHash: jest.fn(),
    consumeEmailChallenge: jest.fn(),
    markEmailVerified: jest.fn(),
    updateUserPassword: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

const passwordUser = {
  id: 'user-1',
  email: 'person@example.com',
  name: 'Person',
  role: 'user' as const,
  signup_method: 'password' as const,
  disabled_at: null,
  email_verified_at: null,
}

/** A live challenge row, as the table would hold it. */
function liveChallenge(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'challenge-1',
    user_id: passwordUser.id,
    kind: 'reset_password',
    email: passwordUser.email,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    consumed_at: null,
    superseded_at: null,
    ...over,
  }
}

function tokenFor(res: { sent: { text: string }[] }, index = 0): string {
  const match = res.sent[index].text.match(/token=([A-Za-z0-9_-]+)/)
  if (!match) throw new Error(`No token in mail body: ${res.sent[index].text}`)
  return decodeURIComponent(match[1])
}

let mail: ReturnType<typeof recordingMailSender>

/**
 * A request from its own client address.
 *
 * These routes are rate-limited per IP. Without this, tests would start failing
 * on the limiter rather than on what they assert — and the limiter would look
 * like it worked when the assertions had stopped meaning anything.
 */
let clientIps = 0
function post(path: string) {
  clientIps += 1
  return request(app).post(path).set('X-Forwarded-For', `203.0.113.${clientIps % 250}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  mail = recordingMailSender()
  setMailSender(mail)
  mockDb.createEmailChallenge.mockResolvedValue({ id: 'challenge-1' } as never)
  mockDb.consumeEmailChallenge.mockResolvedValue(true)
  mockDb.markEmailVerified.mockResolvedValue(undefined as never)
  mockDb.updateUserPassword.mockResolvedValue(undefined as never)
})

describe('POST /api/auth/password/reset-request', () => {
  it('sends a reset link and stores only a hash of it', async () => {
    mockDb.getUserByEmail.mockResolvedValue(passwordUser as never)

    const res = await post('/api/auth/password/reset-request')
      .send({ email: 'person@example.com' })

    expect(res.status).toBe(200)
    expect(res.body.message).toBe(RESET_REQUEST_ACCEPTED)
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].to).toBe('person@example.com')

    // The row must not be able to reconstruct the link. If the token itself were
    // stored, a database read would be an account takeover.
    const stored = mockDb.createEmailChallenge.mock.calls[0][0]
    const token = tokenFor(mail)
    expect(stored.token_hash).toBe(hashChallengeToken(token))
    expect(stored.token_hash).not.toBe(token)
    expect(JSON.stringify(stored)).not.toContain(token)
  })

  it('answers a stranger exactly as it answers a real account', async () => {
    mockDb.getUserByEmail.mockResolvedValue(passwordUser as never)
    const known = await post('/api/auth/password/reset-request')
      .send({ email: 'person@example.com' })

    mockDb.getUserByEmail.mockResolvedValue(null)
    const unknown = await post('/api/auth/password/reset-request')
      .send({ email: 'nobody@example.com' })

    // Identical status and body: this endpoint cannot be used to enumerate who
    // has an account.
    expect(unknown.status).toBe(known.status)
    expect(unknown.body).toEqual(known.body)
    expect(mail.sent).toHaveLength(1)
  })

  it('answers a Google account the same way, and sends nothing', async () => {
    mockDb.getUserByEmail.mockResolvedValue({
      ...passwordUser,
      signup_method: 'google',
      email_verified_at: '2026-01-01T00:00:00.000Z',
    } as never)

    const res = await post('/api/auth/password/reset-request')
      .send({ email: 'person@example.com' })

    expect(res.status).toBe(200)
    expect(res.body.message).toBe(RESET_REQUEST_ACCEPTED)
    // There is no password to reset, and saying so would reveal how they signed up.
    expect(mail.sent).toHaveLength(0)
    expect(mockDb.createEmailChallenge).not.toHaveBeenCalled()
  })

  it('reports a mail-provider outage instead of claiming a link is on its way', async () => {
    mockDb.getUserByEmail.mockResolvedValue(passwordUser as never)
    setMailSender(recordingMailSender({ state: 'unavailable', reason: 'Mail provider returned 500.' }))

    const res = await post('/api/auth/password/reset-request')
      .send({ email: 'person@example.com' })

    // Silence here would leave someone waiting for mail that was never sent.
    expect(res.status).toBe(503)
    expect(res.body.reason).toBe('mail_unavailable')
  })
})

describe('POST /api/auth/password/reset', () => {
  it('sets the new password and marks the address proven', async () => {
    mockDb.getEmailChallengeByHash.mockResolvedValue(liveChallenge() as never)

    const res = await post('/api/auth/password/reset')
      .send({ token: 'some-token', password: 'a-new-password' })

    expect(res.status).toBe(200)
    expect(res.body.state).toBe('reset')

    const [userId, hash] = mockDb.updateUserPassword.mock.calls[0]
    expect(userId).toBe(passwordUser.id)
    expect(await bcrypt.compare('a-new-password', hash)).toBe(true)
    // Reaching the link proves the address, so there is nothing left to verify.
    expect(mockDb.markEmailVerified).toHaveBeenCalledWith(passwordUser.id)
  })

  it('refuses a password shorter than the signup contract allows', async () => {
    mockDb.getEmailChallengeByHash.mockResolvedValue(liveChallenge() as never)

    const res = await post('/api/auth/password/reset')
      .send({ token: 'some-token', password: 'short' })

    expect(res.status).toBe(400)
    // A recovery path that accepts a weaker password than signup is a way around
    // the rule, not a convenience.
    expect(mockDb.updateUserPassword).not.toHaveBeenCalled()
    expect(mockDb.consumeEmailChallenge).not.toHaveBeenCalled()
  })

  it.each([
    ['expired', { expires_at: new Date(Date.now() - 1000).toISOString() }],
    ['already_used', { consumed_at: new Date().toISOString() }],
    ['superseded', { superseded_at: new Date().toISOString() }],
  ])('refuses a %s link, and says which', async (reason, over) => {
    mockDb.getEmailChallengeByHash.mockResolvedValue(liveChallenge(over) as never)

    const res = await post('/api/auth/password/reset')
      .send({ token: 'some-token', password: 'a-new-password' })

    expect(res.status).toBe(400)
    // Each refusal sends a person somewhere different. Collapsing them into one
    // message makes all of them unhelpful.
    expect(res.body.reason).toBe(reason)
    expect(mockDb.updateUserPassword).not.toHaveBeenCalled()
  })

  it('refuses a token that matches nothing', async () => {
    mockDb.getEmailChallengeByHash.mockResolvedValue(null)

    const res = await post('/api/auth/password/reset')
      .send({ token: 'invented', password: 'a-new-password' })

    expect(res.status).toBe(400)
    expect(res.body.reason).toBe('unknown')
    expect(mockDb.updateUserPassword).not.toHaveBeenCalled()
  })

  it('lets only one of two simultaneous uses through', async () => {
    mockDb.getEmailChallengeByHash.mockResolvedValue(liveChallenge() as never)
    // The row still reads as live for both callers; the conditional UPDATE is
    // what actually decides, and it can only win once.
    mockDb.consumeEmailChallenge
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const [first, second] = await Promise.all([
      post('/api/auth/password/reset').send({ token: 't', password: 'a-new-password' }),
      post('/api/auth/password/reset').send({ token: 't', password: 'other-password' }),
    ])

    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 400])
    expect(mockDb.updateUserPassword).toHaveBeenCalledTimes(1)
  })

  it('does not accept a verification token as a reset token', async () => {
    mockDb.getEmailChallengeByHash.mockResolvedValue(null)

    await post('/api/auth/password/reset')
      .send({ token: 'a-verify-token', password: 'a-new-password' })

    // The lookup is scoped by kind, so a link that only proves an address can
    // never be spent as a password change.
    expect(mockDb.getEmailChallengeByHash).toHaveBeenCalledWith('reset_password', expect.any(String))
  })
})

describe('email verification', () => {
  it('sends a link to a signed-in password account', async () => {
    mockDb.getUserById.mockResolvedValue(passwordUser as never)

    const res = await post('/api/auth/verify-email/send')
      .set('Authorization', `Bearer ${jwt.sign({ userId: passwordUser.id }, JWT_SECRET)}`)

    expect(res.status).toBe(200)
    expect(mail.sent).toHaveLength(1)
    expect(mockDb.createEmailChallenge.mock.calls[0][0].kind).toBe('verify_email')
  })

  it('does not ask a Google account to prove what Google proved', async () => {
    mockDb.getUserById.mockResolvedValue({ ...passwordUser, signup_method: 'google' } as never)

    const res = await post('/api/auth/verify-email/send')
      .set('Authorization', `Bearer ${jwt.sign({ userId: passwordUser.id }, JWT_SECRET)}`)

    expect(res.status).toBe(200)
    expect(res.body.state).toBe('already_verified')
    expect(mail.sent).toHaveLength(0)
  })

  it('tells a Guest there is no address to verify', async () => {
    mockDb.getUserById.mockResolvedValue({ ...passwordUser, email: null, signup_method: 'guest' } as never)

    const res = await post('/api/auth/verify-email/send')
      .set('Authorization', `Bearer ${jwt.sign({ userId: passwordUser.id }, JWT_SECRET)}`)

    expect(res.status).toBe(400)
    expect(res.body.reason).toBe('no_email')
  })

  it('marks the address proven when the link is opened', async () => {
    mockDb.getEmailChallengeByHash.mockResolvedValue(liveChallenge({ kind: 'verify_email' }) as never)

    const res = await post('/api/auth/verify-email/confirm')
      .send({ token: 'some-token' })

    expect(res.status).toBe(200)
    expect(res.body.state).toBe('verified')
    expect(mockDb.markEmailVerified).toHaveBeenCalledWith(passwordUser.id)
  })

  it('refuses a second use of the same verification link', async () => {
    mockDb.getEmailChallengeByHash.mockResolvedValue(liveChallenge({ kind: 'verify_email' }) as never)
    mockDb.consumeEmailChallenge.mockResolvedValue(false)

    const res = await post('/api/auth/verify-email/confirm')
      .send({ token: 'some-token' })

    expect(res.status).toBe(400)
    expect(res.body.reason).toBe('already_used')
    expect(mockDb.markEmailVerified).not.toHaveBeenCalled()
  })
})
