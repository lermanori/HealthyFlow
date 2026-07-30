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
    getUserByAppleSubject: jest.fn(),
    linkAppleIdentity: jest.fn(),
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

const appleUser = {
  id: 'apple-subject-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'apple-person@example.com',
  email_confirmed_at: '2026-07-30T00:00:00.000Z',
  phone: '',
  app_metadata: { provider: 'apple', providers: ['apple'] },
  user_metadata: {},
  identities: [{ provider: 'apple' }],
  created_at: '2026-07-30T00:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.getUser.mockResolvedValue({
    data: { user: appleUser },
    error: null,
  } as never)
  mockDb.getUserByAppleSubject.mockResolvedValue(null)
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

describe('POST /api/auth/apple', () => {
  it('links a verified Apple identity to an existing HealthyFlow account', async () => {
    mockDb.getUserByEmail.mockResolvedValue({
      id: 'existing-user',
      email: appleUser.email,
      name: 'Existing Person',
      password_hash: 'hash',
      role: 'user',
      signup_method: 'password',
    })

    const response = await request(app)
      .post('/api/auth/apple')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(200)
    expect(response.body.user.id).toBe('existing-user')
    expect(response.body.isNewUser).toBe(false)
    expect(mockDb.linkAppleIdentity).toHaveBeenCalledWith('existing-user', appleUser.id)
    expect(mockWaitlist.authorizeSignup).not.toHaveBeenCalled()
  })

  it('creates an Apple account with the native profile and grants onboarding once', async () => {
    mockDb.createUser.mockResolvedValue({
      id: 'new-apple-user',
      email: appleUser.email,
      name: 'Apple Person',
      role: 'user',
      signup_method: 'apple',
      apple_auth_subject: appleUser.id,
    })

    const response = await request(app)
      .post('/api/auth/apple')
      .send({ accessToken: 'supabase-access-token', displayName: 'Apple Person' })

    expect(response.status).toBe(200)
    expect(response.body.user.authMethod).toBe('apple')
    expect(response.body.isNewUser).toBe(true)
    expect(mockDb.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: appleUser.email,
      name: 'Apple Person',
      apple_auth_subject: appleUser.id,
      signup_method: 'apple',
      claimed_public_signup_slot: true,
    }))
    expect(mockCredits.grantSignupCredits).toHaveBeenCalledWith('new-apple-user')
    expect(mockOnboarding.seedNewUser).toHaveBeenCalledWith('new-apple-user')
  })

  it('continues an interrupted Apple signup idempotently', async () => {
    mockDb.getUserByAppleSubject.mockResolvedValue({
      id: 'new-apple-user',
      email: appleUser.email,
      name: 'Apple Person',
      role: 'user',
      signup_method: 'apple',
      apple_auth_subject: appleUser.id,
    })
    mockCredits.grantSignupCredits.mockResolvedValue({
      credits: 250,
      cohort: 'founding',
      balance: 250,
      alreadyGranted: true,
    })

    const response = await request(app)
      .post('/api/auth/apple')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(200)
    expect(response.body.isNewUser).toBe(false)
    expect(mockDb.createUser).not.toHaveBeenCalled()
    expect(mockOnboarding.seedNewUser).toHaveBeenCalledWith('new-apple-user')
  })

  it('rejects a Supabase session that is not an Apple identity', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: {
        user: {
          ...appleUser,
          app_metadata: { provider: 'google', providers: ['google'] },
          identities: [{ provider: 'google' }],
        },
      },
      error: null,
    } as never)

    const response = await request(app)
      .post('/api/auth/apple')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(401)
    expect(response.body.reason).toBe('provider_identity_invalid')
    expect(mockDb.createUser).not.toHaveBeenCalled()
  })

  it('blocks a disabled Apple account', async () => {
    mockDb.getUserByAppleSubject.mockResolvedValue({
      id: 'disabled-user',
      email: appleUser.email,
      name: 'Apple Person',
      role: 'user',
      signup_method: 'apple',
      apple_auth_subject: appleUser.id,
      disabled_at: '2026-07-30T10:00:00.000Z',
    })

    const response = await request(app)
      .post('/api/auth/apple')
      .send({ accessToken: 'supabase-access-token' })

    expect(response.status).toBe(403)
    expect(response.body.reason).toBe('account_disabled')
    expect(mockCredits.grantSignupCredits).not.toHaveBeenCalled()
  })
})
