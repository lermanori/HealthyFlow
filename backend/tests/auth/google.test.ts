import request from 'supertest'
import { app } from '../../src/index'
import { db, supabase } from '../../src/supabase-client'
import { Credits } from '../../src/credits'
import { Onboarding } from '../../src/onboarding'
import { Waitlist } from '../../src/waitlist'

jest.mock('../../src/supabase-client', () => ({
  db: {
    createUser: jest.fn(),
    deleteUser: jest.fn(),
    getUserByEmail: jest.fn(),
    getUserByGoogleSubject: jest.fn(),
    linkGoogleIdentity: jest.fn(),
    clearPendingSignupInvite: jest.fn(),
    releasePublicSignupSlot: jest.fn(),
  },
  supabase: {
    auth: {
      getUser: jest.fn(),
      admin: {
        deleteUser: jest.fn(),
      },
    },
  },
}))

jest.mock('../../src/credits', () => ({
  Credits: {
    grantSignupCredits: jest.fn(),
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
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockCredits = Credits as jest.Mocked<typeof Credits>
const mockOnboarding = Onboarding as jest.Mocked<typeof Onboarding>
const mockWaitlist = Waitlist as jest.Mocked<typeof Waitlist>
const mockAuth = supabase.auth as jest.Mocked<typeof supabase.auth>

const googleUser = {
  id: 'google-subject-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'person@example.com',
  email_confirmed_at: '2026-07-29T00:00:00.000Z',
  phone: '',
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'Google Person' },
  identities: [{ provider: 'google' }],
  created_at: '2026-07-29T00:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.getUser.mockResolvedValue({
    data: { user: googleUser },
    error: null,
  } as never)
  mockDb.getUserByGoogleSubject.mockResolvedValue(null)
  mockDb.getUserByEmail.mockResolvedValue(null)
  mockCredits.grantSignupCredits.mockResolvedValue({
    credits: 250,
    cohort: 'founding',
    balance: 250,
    alreadyGranted: false,
  })
  mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: true, via: 'public' })
  mockDb.releasePublicSignupSlot.mockResolvedValue(true)
  mockOnboarding.seedNewUser.mockResolvedValue({} as never)
})

describe('POST /api/auth/google', () => {
  it('signs in an existing password user even when new registration is closed', async () => {
    mockDb.getUserByEmail.mockResolvedValue({
      id: 'existing-user',
      email: 'person@example.com',
      name: 'Existing Person',
      password_hash: 'hash',
      role: 'user',
      signup_method: 'password',
    })

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(200)
    expect(response.body.user.id).toBe('existing-user')
    expect(response.body.token).toEqual(expect.any(String))
    expect(response.body.isNewUser).toBe(false)
    expect(mockDb.linkGoogleIdentity).toHaveBeenCalledWith('existing-user', googleUser.id)
    expect(mockWaitlist.authorizeSignup).not.toHaveBeenCalled()
    expect(mockCredits.grantSignupCredits).not.toHaveBeenCalled()
  })

  it('retains a valid invitation through account creation and grants onboarding once', async () => {
    mockWaitlist.authorizeSignup.mockResolvedValue({
      allowed: true,
      via: 'invite',
      inviteToken: 'invite-1',
    })
    mockDb.createUser.mockResolvedValue({
      id: 'new-user',
      email: 'person@example.com',
      name: 'Google Person',
      role: 'user',
      signup_method: 'google',
      google_auth_subject: googleUser.id,
      pending_invite_token: 'invite-1',
    })
    mockWaitlist.completeInviteSignup.mockResolvedValue({ token: 'invite-1' } as never)

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token', invite: 'invite-1' })

    expect(response.status).toBe(200)
    expect(response.body.isNewUser).toBe(true)
    expect(response.body.signupCredits.credits).toBe(250)
    expect(mockWaitlist.authorizeSignup).toHaveBeenCalledWith('invite-1')
    expect(mockWaitlist.completeInviteSignup).toHaveBeenCalledWith('invite-1', 'new-user')
    expect(mockDb.clearPendingSignupInvite).toHaveBeenCalledWith('new-user')
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'person@example.com',
      google_auth_subject: googleUser.id,
      signup_method: 'google',
      pending_invite_token: 'invite-1',
      claimed_public_signup_slot: false,
    }))
    expect(mockCredits.grantSignupCredits).toHaveBeenCalledTimes(1)
    expect(mockOnboarding.seedNewUser).toHaveBeenCalledWith('new-user')
  })

  it('records ownership of a public seat for a new Google account', async () => {
    mockDb.createUser.mockResolvedValue({
      id: 'new-public-user',
      email: 'person@example.com',
      name: 'Google Person',
      role: 'user',
      signup_method: 'google',
      google_auth_subject: googleUser.id,
    })

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(200)
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.objectContaining({
      claimed_public_signup_slot: true,
    }))
  })

  it('returns a reserved public seat when Google account creation fails', async () => {
    mockDb.createUser.mockRejectedValue(new Error('insert failed'))

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(500)
    expect(mockDb.releasePublicSignupSlot).toHaveBeenCalledTimes(1)
    expect(mockAuth.admin.deleteUser).toHaveBeenCalledWith(googleUser.id)
  })

  it('redeems the persisted invitation before completing an interrupted signup', async () => {
    mockDb.getUserByGoogleSubject.mockResolvedValue({
      id: 'new-user',
      email: 'person@example.com',
      name: 'Google Person',
      role: 'user',
      signup_method: 'google',
      google_auth_subject: googleUser.id,
      pending_invite_token: 'invite-1',
    })
    mockWaitlist.completeInviteSignup.mockResolvedValue({ token: 'invite-1' } as never)

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(200)
    expect(mockWaitlist.completeInviteSignup).toHaveBeenCalledWith('invite-1', 'new-user')
    expect(mockDb.clearPendingSignupInvite).toHaveBeenCalledWith('new-user')
    expect(mockCredits.grantSignupCredits).toHaveBeenCalledTimes(1)
  })

  it('completes an interrupted Google signup idempotently without another account', async () => {
    mockDb.getUserByGoogleSubject.mockResolvedValue({
      id: 'new-user',
      email: 'person@example.com',
      name: 'Google Person',
      role: 'user',
      signup_method: 'google',
    })
    mockCredits.grantSignupCredits.mockResolvedValue({
      credits: 250,
      cohort: 'founding',
      balance: 250,
      alreadyGranted: true,
    })

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(200)
    expect(response.body.isNewUser).toBe(false)
    expect(response.body.signupCredits.alreadyGranted).toBe(true)
    expect(mockDb.createUser).not.toHaveBeenCalled()
    expect(mockWaitlist.authorizeSignup).not.toHaveBeenCalled()
    expect(mockCredits.grantSignupCredits).toHaveBeenCalledTimes(1)
    expect(mockOnboarding.seedNewUser).toHaveBeenCalledWith('new-user')
  })

  it('does not issue a session for a disabled Google-linked account', async () => {
    mockDb.getUserByGoogleSubject.mockResolvedValue({
      id: 'disabled-user',
      email: 'person@example.com',
      name: 'Google Person',
      role: 'user',
      signup_method: 'google',
      google_auth_subject: googleUser.id,
      disabled_at: '2026-07-29T00:00:00.000Z',
    })

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(403)
    expect(response.body.reason).toBe('account_disabled')
    expect(response.body.token).toBeUndefined()
    expect(mockCredits.grantSignupCredits).not.toHaveBeenCalled()
  })

  it.each([
    ['closed', 'Registration is currently closed.'],
    ['invite_invalid', 'This invitation is invalid.'],
    ['invite_used', 'This invitation has already been used.'],
    ['invite_expired', 'This invitation has expired.'],
  ] as const)('rejects a new user when access is %s and removes the orphaned auth user', async (reason, message) => {
    mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: false, reason })

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token', invite: reason === 'closed' ? undefined : 'invite-1' })

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: message, reason })
    expect(mockDb.createUser).not.toHaveBeenCalled()
    expect(mockAuth.admin.deleteUser).toHaveBeenCalledWith(googleUser.id)
  })

  it('returns a clear duplicate-account conflict', async () => {
    mockDb.getUserByEmail.mockResolvedValue({
      id: 'existing-user',
      email: 'person@example.com',
      name: 'Existing Person',
      role: 'user',
      signup_method: 'password',
    })
    mockDb.linkGoogleIdentity.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }))

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(409)
    expect(response.body.reason).toBe('identity_conflict')
  })

  it('rejects a non-Google or unverified Supabase identity', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: {
        user: {
          ...googleUser,
          email_confirmed_at: undefined,
          app_metadata: { provider: 'email', providers: ['email'] },
          identities: [{ provider: 'email' }],
        },
      },
      error: null,
    } as never)

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(401)
    expect(response.body.reason).toBe('provider_identity_invalid')
  })

  it('surfaces Supabase network failures without creating an account', async () => {
    mockAuth.getUser.mockRejectedValue(new Error('network down'))

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(503)
    expect(response.body.reason).toBe('provider_unavailable')
    expect(mockDb.createUser).not.toHaveBeenCalled()
  })
})
