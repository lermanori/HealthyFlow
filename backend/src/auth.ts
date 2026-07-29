import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import { Credits, type SignupCreditGrant } from './credits'
import { Onboarding } from './onboarding'
import { db, supabase } from './supabase-client'
import { Waitlist, type SignupAuthorization } from './waitlist'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export const GoogleSessionSchema = z.object({
  accessToken: z.string().min(1),
  invite: z.string().min(1).optional(),
})
export type GoogleSessionInput = z.infer<typeof GoogleSessionSchema>

type AppUser = {
  id: string
  email: string
  name: string
  role?: 'admin' | 'user' | null
  signup_method?: 'password' | 'google' | null
  google_auth_subject?: string | null
  pending_invite_token?: string | null
  disabled_at?: string | null
}

export class AuthFlowError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthFlowError'
  }
}

function appSession(user: AppUser) {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? 'user',
      authMethod: user.signup_method ?? 'password',
    },
    token: jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' }),
  }
}

function isVerifiedGoogleUser(user: SupabaseAuthUser) {
  const identityProviders = user.identities?.map(identity => identity.provider) ?? []
  const configuredProviders = Array.isArray(user.app_metadata.providers)
    ? user.app_metadata.providers
    : []
  return (
    user.app_metadata.provider === 'google' ||
    identityProviders.includes('google') ||
    configuredProviders.includes('google')
  ) && Boolean(user.email_confirmed_at)
}

function displayName(user: SupabaseAuthUser, email: string) {
  const metadataName = user.user_metadata.full_name ?? user.user_metadata.name
  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim().slice(0, 120)
  }
  return email.split('@')[0].slice(0, 120)
}

async function removeRejectedSupabaseUser(userId: string) {
  try {
    await supabase.auth.admin.deleteUser(userId)
  } catch (error) {
    console.warn('Could not remove rejected Supabase Auth user:', error)
  }
}

function accessError(authorization: Extract<SignupAuthorization, { allowed: false }>) {
  const messages = {
    closed: 'Registration is currently closed.',
    invite_invalid: 'This invitation is invalid.',
    invite_used: 'This invitation has already been used.',
    invite_expired: 'This invitation has expired.',
  } as const
  return new AuthFlowError(403, authorization.reason, messages[authorization.reason])
}

function requireEnabledUser(user: AppUser) {
  if (user.disabled_at) {
    throw new AuthFlowError(403, 'account_disabled', 'This HealthyFlow account is disabled.')
  }
}

async function finishGoogleSignup(user: AppUser): Promise<SignupCreditGrant> {
  // Both operations are idempotent. Calling them again completes an interrupted
  // first login without granting twice or re-opening completed onboarding.
  const signupCredits = await Credits.grantSignupCredits(user.id)
  await Onboarding.seedNewUser(user.id)
  return signupCredits
}

async function finishPendingInvite(user: AppUser) {
  if (!user.pending_invite_token) return
  const invite = await Waitlist.completeInviteSignup(user.pending_invite_token, user.id)
  if (!invite) {
    await db.deleteUser(user.id)
    if (user.google_auth_subject) {
      await removeRejectedSupabaseUser(user.google_auth_subject)
    }
    throw new AuthFlowError(403, 'invite_used', 'This invitation has already been used.')
  }
  await db.clearPendingSignupInvite(user.id)
}

async function linkExistingUser(user: AppUser, googleSubject: string) {
  try {
    await db.linkGoogleIdentity(user.id, googleSubject)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === '23505' || code === 'GOOGLE_IDENTITY_CONFLICT') {
      throw new AuthFlowError(
        409,
        'identity_conflict',
        'This Google account is already linked to another HealthyFlow account.',
      )
    }
    throw error
  }
}

export const Auth = {
  async exchangeGoogleSession(input: GoogleSessionInput) {
    let authUser: SupabaseAuthUser
    try {
      const { data, error } = await supabase.auth.getUser(input.accessToken)
      if (error || !data.user) {
        throw new AuthFlowError(401, 'provider_session_invalid', 'Google sign-in expired. Please try again.')
      }
      authUser = data.user
    } catch (error) {
      if (error instanceof AuthFlowError) throw error
      throw new AuthFlowError(503, 'provider_unavailable', 'Google sign-in is temporarily unavailable.')
    }

    if (!isVerifiedGoogleUser(authUser) || !authUser.email) {
      throw new AuthFlowError(401, 'provider_identity_invalid', 'Google did not provide a verified email address.')
    }

    const email = authUser.email.trim().toLowerCase()
    const bySubject = await db.getUserByGoogleSubject(authUser.id)
    if (bySubject) {
      requireEnabledUser(bySubject)
      if (bySubject.signup_method === 'google') {
        await finishPendingInvite(bySubject)
        const signupCredits = await finishGoogleSignup(bySubject)
        return {
          ...appSession(bySubject),
          isNewUser: !signupCredits.alreadyGranted,
          signupCredits,
        }
      }
      return { ...appSession(bySubject), isNewUser: false }
    }

    const byEmail = await db.getUserByEmail(email)
    if (byEmail) {
      requireEnabledUser(byEmail)
      await linkExistingUser(byEmail, authUser.id)
      return { ...appSession(byEmail), isNewUser: false }
    }

    const authorization = await Waitlist.authorizeSignup(input.invite)
    if (!authorization.allowed) {
      await removeRejectedSupabaseUser(authUser.id)
      throw accessError(authorization)
    }

    const passwordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 10)
    const user = await db.createUser({
      email,
      name: displayName(authUser, email),
      password_hash: passwordHash,
      google_auth_subject: authUser.id,
      signup_method: 'google',
      pending_invite_token: authorization.via === 'invite' ? authorization.inviteToken : undefined,
    })
    if (!user) {
      throw new AuthFlowError(500, 'account_creation_failed', 'Could not create your HealthyFlow account.')
    }

    await finishPendingInvite(user)

    const signupCredits = await finishGoogleSignup(user)
    return {
      ...appSession(user),
      isNewUser: true,
      signupCredits,
    }
  },
}
