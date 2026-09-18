import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { db } from '../supabase-client'
import { Credits } from '../credits'
import { Onboarding } from '../onboarding'
import { DEMO_PERSONAS, getDemoPersonaUser } from '../demo-personas'
import {
  AppleSessionSchema,
  Auth,
  AuthFlowError,
  GoogleSessionSchema,
  GUEST_SESSION_LIFETIME,
  issueSessionToken,
  sessionUser,
  type ClaimAccountInput,
} from '../auth'
import { authenticateToken, type AuthRequest } from '../middleware/auth'
import {
  canonicalEmail,
  challengeExpiry,
  challengeLink,
  checkChallenge,
  hashChallengeToken,
  issueChallengeToken,
  RESET_REQUEST_ACCEPTED,
  type ChallengeKind,
  type StoredChallenge,
} from '../auth-challenges'
import {
  appBaseUrl,
  passwordResetEmail,
  resendMailSender,
  verificationEmail,
  type MailSender,
  type MailSendResult,
} from '../mail'

const router = express.Router()

/** Swapped in tests; production always sends through Resend. */
let mailSender: MailSender = resendMailSender()
export function setMailSender(sender: MailSender) { mailSender = sender }
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

// Zod schema — single source of truth for signup input (CLAUDE.md)
const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  // Accepted and ignored: an invitation link from before entry opened (ADR-0012)
  // still reaches this form, and it needs nothing from the token.
  invite: z.string().min(1).optional(),
})

const DemoSessionSchema = z.object({
  persona: z.enum(DEMO_PERSONAS),
})

const GuestSessionSchema = z.strictObject({})

const ClaimSchema = z.object({
  // Trimmed before validating: a phone keyboard appends a space often enough
  // that refusing one is a 400 for a character the user cannot see.
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1),
})

const accountCreationBlockedInTestMode = () => process.env.HF_TEST_MODE === '1'
const testModeAccountCreationResponse = {
  error: 'Account creation is disabled in automated test mode.',
  reason: 'test_account_creation_disabled',
} as const

// ponytail: scoped to /signup only — don't rate-limit login or admin routes
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Default keyGenerator uses req.ip (IPv6-safe); requires app-level `trust proxy`
  // so req.ip reflects the real client behind Railway's proxy.
  message: { error: 'Too many signup attempts, please try again later.' },
})

// Same shape and budget as signup, but its own counter: a burst of people
// opening the app without an account must not lock real signups out, or vice
// versa.
const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
})

const providerSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again later.' },
})

async function recordLogin(userId: string) {
  try {
    if (typeof (db as Partial<typeof db>).recordUserLogin !== 'function') return
    await db.recordUserLogin(userId)
  } catch (error) {
    // Login history helps administration but must never block a valid sign-in.
    console.warn('Could not record user login:', error)
  }
}

// Public. Entry is open (ADR-0012), so `mode` is always `open`; the endpoint
// survives for the free-action offer and for builds that predate open entry,
// which hide Create account unless they read `open`. `remaining` is kept on the
// wire only because those builds require the field — no client reads it, and
// there is no seat count to report.
router.get('/signup-status', async (_req, res) => {
  try {
    const offer = await Credits.getLaunchOffer()
    return res.json({ mode: 'open', remaining: 0, offer })
  } catch (error) {
    console.error('Signup status error:', error)
    return res.status(500).json({ error: 'Could not read signup status' })
  }
})

// Public self-signup
router.post('/signup', signupLimiter, async (req, res) => {
  const parsed = SignupSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  if (accountCreationBlockedInTestMode()) {
    return res.status(403).json(testModeAccountCreationResponse)
  }
  const { email, password, name } = parsed.data

  try {
    const existing = await db.getUserByEmail(email)
    if (existing) {
      return res.status(409).json({ error: 'Email already taken' })
    }

    // Entry is open (ADR-0012): no seat is checked or taken, and any invitation
    // token the form still sends is ignored.
    const password_hash = await bcrypt.hash(password, 10)
    const user = await db.createUser({ email, name, password_hash })
    if (!user) throw new Error('Account insert returned no user')

    await Onboarding.seedNewUser(user.id)
    await recordLogin(user.id)

    // The account exists either way. A mail failure is reported rather than
    // rolled back or hidden: sending someone to their inbox for a link that was
    // never sent is worse than telling them it did not go out.
    const verification = await sendVerification(user)

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role ?? 'user',
        authMethod: user.signup_method ?? 'password',
        emailVerified: false,
      },
      token,
      verificationEmail: verification.state,
    })
  } catch (error) {
    console.error('Signup error:', error)
    return res.status(500).json({ error: 'Database error' })
  }
})

// Start without an account. A Guest is a `users` row with no email, holding a
// normal `{ userId }` session — every other route, credit and AI call already
// works on that principal unchanged.
router.post('/guest', guestLimiter, async (req, res) => {
  // Nothing is accepted here on purpose: a Guest supplies no details. Parsing
  // strictly means a client that sends some finds out, instead of being ignored.
  const parsed = GuestSessionSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ error: 'Starting without an account takes no details.' })
  }
  if (accountCreationBlockedInTestMode()) {
    return res.status(403).json(testModeAccountCreationResponse)
  }

  try {
    // `trust proxy` is set in index.ts, so req.ip is the client address behind
    // Railway's proxy rather than the proxy's own.
    const session = await Auth.startGuestSession(req.ip)
    await recordLogin(session.user.id)
    return res.json(session)
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return res.status(error.status).json({ error: error.message, reason: error.reason })
    }
    console.error('Guest session error:', error)
    return res.status(500).json({ error: 'Could not start without an account' })
  }
})

// Claim. The token is the identity — no user id in the body, so a caller can
// only ever claim their own row.
router.post('/claim', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = ClaimSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const session = await Auth.claimGuestAccount(req.user.userId, parsed.data as ClaimAccountInput)
    const verification = await sendVerification({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    })
    return res.json({ ...session, verificationEmail: verification.state })
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return res.status(error.status).json({ error: error.message, reason: error.reason })
    }
    console.error('Claim error:', error)
    return res.status(500).json({ error: 'Could not create your account' })
  }
})

router.post('/claim/:provider', authenticateToken, async (req: AuthRequest, res) => {
  const provider = req.params.provider
  if (provider !== 'google' && provider !== 'apple') {
    return res.status(404).json({ error: 'Unknown provider' })
  }
  const parsed = (provider === 'google' ? GoogleSessionSchema : AppleSessionSchema).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const session = await Auth.claimGuestAccountWithProvider(req.user.userId, provider, parsed.data)
    return res.json(session)
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return res.status(error.status).json({ error: error.message, reason: error.reason })
    }
    console.error('Provider claim error:', error)
    return res.status(500).json({ error: 'Could not create your account' })
  }
})

// Supabase Auth verifies the Google identity; HealthyFlow then applies its own
// access gate and returns the same app JWT used by password login.
router.post('/google', providerSessionLimiter, async (req, res) => {
  const parsed = GoogleSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Google sign-in data is missing.' })
  }
  if (accountCreationBlockedInTestMode()) {
    return res.status(403).json(testModeAccountCreationResponse)
  }

  try {
    const session = await Auth.exchangeGoogleSession(parsed.data)
    await recordLogin(session.user.id)
    return res.json(session)
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return res.status(error.status).json({ error: error.message, reason: error.reason })
    }
    console.error('Google sign-in error:', error)
    return res.status(500).json({ error: 'Could not finish Google sign-in.' })
  }
})

// The native iOS AuthenticationServices flow exchanges its Apple ID token for
// a short-lived Supabase session first. HealthyFlow verifies that session here,
// applies the same access gate as every other signup, and returns its app JWT.
router.post('/apple', providerSessionLimiter, async (req, res) => {
  const parsed = AppleSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Apple sign-in data is missing.' })
  }
  if (accountCreationBlockedInTestMode()) {
    return res.status(403).json(testModeAccountCreationResponse)
  }

  try {
    const session = await Auth.exchangeAppleSession(parsed.data)
    await recordLogin(session.user.id)
    return res.json(session)
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return res.status(error.status).json({ error: error.message, reason: error.reason })
    }
    console.error('Apple sign-in error:', error)
    return res.status(500).json({ error: 'Could not finish Apple sign-in.' })
  }
})

// Public persona demo session. This resets the persona's demo data to the current date
// before issuing a normal JWT, so the app itself remains the demo surface.
router.post('/demo-session', async (req, res) => {
  const parsed = DemoSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Unknown demo persona' })
  }
  if (accountCreationBlockedInTestMode()) {
    return res.status(403).json(testModeAccountCreationResponse)
  }

  try {
    const user = await getDemoPersonaUser(parsed.data.persona)
    await recordLogin(user.id)
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '2h' })
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role ?? 'user',
        authMethod: user.signup_method ?? 'password',
      },
      token,
      persona: parsed.data.persona,
    })
  } catch (error) {
    console.error('Demo session error:', error)
    return res.status(500).json({ error: 'Could not start demo session' })
  }
})

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  try {
    const user = await db.getUserByEmail(email)

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Verify password using bcrypt
    const isValidPassword = await bcrypt.compare(password, user.password_hash)

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    if (user.disabled_at) {
      return res.status(403).json({ error: 'This HealthyFlow account is disabled.', reason: 'account_disabled' })
    }

    await recordLogin(user.id)
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role ?? 'user',
        authMethod: user.signup_method ?? 'password',
      },
      token
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

// Verify token
router.get('/verify', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
    const user = await db.getUserById(decoded.userId)
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    if (user.disabled_at) {
      return res.status(403).json({ error: 'Account is disabled.', reason: 'account_disabled' })
    }

    res.json({
      ...sessionUser(user),
      // A Guest cannot sign in again, so their session is the only key to their
      // row. Re-issue it on every verified open — anyone who opens the app
      // within a year never expires out of their own credits (ADR-0010).
      ...(user.email ? {} : { token: issueSessionToken(user.id, GUEST_SESSION_LIFETIME) }),
    })
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
})

// Register new user (admin only)
router.post('/register', async (req, res) => {
  const { email, password, name, adminToken } = req.body

  // Check admin token
  if (adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' })
  }
  if (accountCreationBlockedInTestMode()) {
    return res.status(403).json(testModeAccountCreationResponse)
  }

  try {
    // Check if user already exists
    const existingUser = await db.getUserByEmail(email)
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user
    const user = await db.createUser({
      email,
      name,
      password_hash: passwordHash
    })

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

// Get all users (admin only)
// ── Email verification and self-serve recovery (#235) ────────────────────────
//
// Deliberately separate from `/users/:userId/reset-password`, which takes
// ADMIN_TOKEN and a new password directly. Exposing that publicly would be a
// password change with no proof of address at all.

const RequestResetSchema = z.object({ email: z.string().trim().email() })
const CompleteResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})
const ConfirmEmailSchema = z.object({ token: z.string().min(1) })

/**
 * Asking the server to send recovery mail.
 *
 * Tight, because each accepted request sends real mail and because this is the
 * endpoint an address-harvester would hammer.
 */
const recoveryRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
})

/**
 * Spending a link, on its own budget.
 *
 * Sharing one counter with the requests above would mean a few clicks on a stale
 * link used up the allowance for asking for a fresh one — locking someone out of
 * recovery by trying to recover. It is still capped: the token is 256 random
 * bits, so this is a brake on abuse, not the thing keeping guesses out.
 */
const recoveryRedeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
})

async function issueChallenge(
  user: { id: string; email: string; name: string },
  kind: ChallengeKind,
) {
  const { token, tokenHash } = issueChallengeToken()
  await db.createEmailChallenge({
    user_id: user.id,
    kind,
    token_hash: tokenHash,
    email: canonicalEmail(user.email),
    expires_at: challengeExpiry(kind),
  })

  const link = challengeLink(appBaseUrl(), kind, token)
  const body = kind === 'verify_email'
    ? verificationEmail(link, user.name)
    : passwordResetEmail(link, user.name)

  return mailSender.send({ to: user.email, ...body })
}

/**
 * Issue and send a verification link, for a path that has just created an
 * account. Never throws: the account is already real, so a mail problem is
 * reported to the caller instead of failing a signup that succeeded.
 */
async function sendVerification(
  user: { id: string; email: string | null; name: string },
): Promise<MailSendResult> {
  if (!user.email) return { state: 'unavailable', reason: 'This account has no address.' }
  try {
    return await issueChallenge({ id: user.id, email: user.email, name: user.name }, 'verify_email')
  } catch (error) {
    console.error('Verification send error:', error)
    return { state: 'unavailable', reason: 'Could not send a verification email.' }
  }
}

/**
 * Send a fresh verification link to the signed-in account.
 *
 * Provider accounts are not asked: Google and Apple verified the address before
 * it ever reached HealthyFlow, and asking again would be asking someone to prove
 * what is already proven.
 */
router.post('/verify-email/send', authenticateToken, recoveryRequestLimiter, async (req: AuthRequest, res) => {
  try {
    const user = await db.getUserById(req.user.userId)
    if (!user.email) {
      return res.status(400).json({ error: 'A Guest has no address to verify.', reason: 'no_email' })
    }
    if (user.signup_method === 'google' || user.signup_method === 'apple') {
      return res.json({ state: 'already_verified', reason: 'provider_verified' })
    }

    const sent = await issueChallenge({ id: user.id, email: user.email, name: user.name }, 'verify_email')
    if (sent.state === 'unavailable') {
      // A failed send is not a sent mail. Saying "check your inbox" here would
      // leave someone waiting for a link that does not exist.
      return res.status(503).json({ error: sent.reason, reason: 'mail_unavailable' })
    }
    return res.json({ state: 'sent' })
  } catch (error) {
    console.error('Verification send error:', error)
    return res.status(500).json({ error: 'Could not send a verification email.' })
  }
})

/** Spend a verification link. */
router.post('/verify-email/confirm', recoveryRedeemLimiter, async (req, res) => {
  const parsed = ConfirmEmailSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'A verification token is required.' })
  }

  try {
    const stored = await db.getEmailChallengeByHash('verify_email', hashChallengeToken(parsed.data.token))
    const check = checkChallenge(stored as StoredChallenge | null)
    if (check.state !== 'usable') {
      return res.status(400).json({ error: 'This link is no longer usable.', reason: check.state })
    }
    if (!await db.consumeEmailChallenge(check.challenge.id)) {
      // Lost a race with another use of the same link.
      return res.status(400).json({ error: 'This link is no longer usable.', reason: 'already_used' })
    }

    await db.markEmailVerified(check.challenge.user_id)
    return res.json({ state: 'verified' })
  } catch (error) {
    console.error('Verification confirm error:', error)
    return res.status(500).json({ error: 'Could not confirm this address.' })
  }
})

/**
 * Ask for a reset link.
 *
 * The answer never changes, so this cannot be used to learn which addresses have
 * accounts. A mail-provider failure is the one exception: it is reported, because
 * silence would leave someone waiting for mail that was never sent.
 */
router.post('/password/reset-request', recoveryRequestLimiter, async (req, res) => {
  const parsed = RequestResetSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'A valid email address is required.' })
  }

  try {
    const user = await db.getUserByEmail(canonicalEmail(parsed.data.email))

    // A provider account has no password to reset; an absent account has no
    // anything. Both answer exactly as a real request does.
    const resettable = user
      && user.email
      && user.disabled_at == null
      && user.signup_method !== 'google'
      && user.signup_method !== 'apple'

    if (resettable) {
      const sent = await issueChallenge(
        { id: user.id, email: user.email, name: user.name },
        'reset_password',
      )
      if (sent.state === 'unavailable') {
        return res.status(503).json({ error: sent.reason, reason: 'mail_unavailable' })
      }
    }

    return res.json({ state: 'accepted', message: RESET_REQUEST_ACCEPTED })
  } catch (error) {
    console.error('Reset request error:', error)
    return res.status(500).json({ error: 'Could not start a password reset.' })
  }
})

/** Spend a reset link and set the new password. */
router.post('/password/reset', recoveryRedeemLimiter, async (req, res) => {
  const parsed = CompleteResetSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const stored = await db.getEmailChallengeByHash('reset_password', hashChallengeToken(parsed.data.token))
    const check = checkChallenge(stored as StoredChallenge | null)
    if (check.state !== 'usable') {
      return res.status(400).json({ error: 'This link is no longer usable.', reason: check.state })
    }
    if (!await db.consumeEmailChallenge(check.challenge.id)) {
      return res.status(400).json({ error: 'This link is no longer usable.', reason: 'already_used' })
    }

    await db.updateUserPassword(check.challenge.user_id, await bcrypt.hash(parsed.data.password, 10))
    // Reaching the link proves the address, so there is nothing left to verify.
    await db.markEmailVerified(check.challenge.user_id)
    return res.json({ state: 'reset' })
  } catch (error) {
    console.error('Reset completion error:', error)
    return res.status(500).json({ error: 'Could not reset this password.' })
  }
})

router.get('/users', async (req, res) => {
  const { adminToken } = req.query

  if (adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  try {
    const users = await db.getAllUsers()
    res.json(users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? 'user',
      created_at: user.created_at
    })))
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

// Reset user password (admin only)
router.post('/users/:userId/reset-password', async (req, res) => {
  const { adminToken, newPassword } = req.body
  const { userId } = req.params

  if (adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required' })
  }

  try {
    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10)
    
    // Update user's password
    await db.updateUserPassword(userId, passwordHash)
    
    res.json({ success: true, message: 'Password reset successfully' })
  } catch (error) {
    console.error('Reset password error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

// The legacy query-token deletion route bypassed previews and account
// protections. Keep a clear response for old callers without leaving the
// destructive path active.
router.delete('/users/:userId', (_req, res) => {
  return res.status(410).json({
    error: 'Use the authenticated admin user-management flow.',
  })
})

export { router as authRoutes }
