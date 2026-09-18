import request from 'supertest'
import { app } from '../../src/index'
import { db, supabase } from '../../src/supabase-client'
import { Onboarding } from '../../src/onboarding'

jest.mock('../../src/supabase-client', () => ({
  db: {
    createUser: jest.fn(),
    markEmailVerified: jest.fn(),
    deleteUser: jest.fn(),
    getUserByEmail: jest.fn(),
    getUserByGoogleSubject: jest.fn(),
    linkGoogleIdentity: jest.fn(),
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
    getLaunchOffer: jest.fn(),
  },
}))

jest.mock('../../src/onboarding', () => ({
  Onboarding: {
    seedNewUser: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockOnboarding = Onboarding as jest.Mocked<typeof Onboarding>
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
  })

  it('creates a new Google account with every public seat taken, and takes none', async () => {
    mockDb.createUser.mockResolvedValue({
      id: 'new-user',
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
    expect(response.body.isNewUser).toBe(true)
    expect(response.body.signupCredits).toBeUndefined()
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'person@example.com',
      google_auth_subject: googleUser.id,
      signup_method: 'google',
    }))
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.not.objectContaining({
      claimed_public_signup_slot: true,
    }))
    expect(mockOnboarding.seedNewUser).toHaveBeenCalledWith('new-user')
  })

  it('creates the account from an invitation sent before entry opened, needing nothing from it', async () => {
    mockDb.createUser.mockResolvedValue({
      id: 'new-user',
      email: 'person@example.com',
      name: 'Google Person',
      role: 'user',
      signup_method: 'google',
      google_auth_subject: googleUser.id,
    })

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token', invite: 'expired-long-ago' })

    expect(response.status).toBe(200)
    expect(response.body.isNewUser).toBe(true)
    expect(mockDb.deleteUser).not.toHaveBeenCalled()
  })

  it('removes the orphaned provider identity when Google account creation fails', async () => {
    mockDb.createUser.mockRejectedValue(new Error('insert failed'))

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(500)
    expect(mockAuth.admin.deleteUser).toHaveBeenCalledWith(googleUser.id)
  })

  it('completes an interrupted signup that still carries an old invitation, without redeeming it', async () => {
    mockDb.getUserByGoogleSubject.mockResolvedValue({
      id: 'new-user',
      email: 'person@example.com',
      name: 'Google Person',
      role: 'user',
      signup_method: 'google',
      google_auth_subject: googleUser.id,
      pending_invite_token: 'invite-1',
    })

    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(200)
    expect(mockDb.deleteUser).not.toHaveBeenCalled()
    expect(mockOnboarding.seedNewUser).toHaveBeenCalledWith('new-user')
  })

  it('completes an interrupted Google signup idempotently without another account', async () => {
    mockDb.getUserByGoogleSubject.mockResolvedValue({
      id: 'new-user',
      email: 'person@example.com',
      name: 'Google Person',
      role: 'user',
      signup_method: 'google',
    })
    const response = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(200)
    expect(response.body.isNewUser).toBe(false)
    expect(response.body.signupCredits).toBeUndefined()
    expect(mockDb.createUser).not.toHaveBeenCalled()
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
