import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { db } from '../supabase-client'
import { Credits } from '../credits'
import { Onboarding } from '../onboarding'
import { Waitlist } from '../waitlist'
import { DEMO_PERSONAS, getDemoPersonaUser } from '../demo-personas'
import {
  AppleSessionSchema,
  Auth,
  AuthFlowError,
  GoogleSessionSchema,
  GUEST_SESSION_LIFETIME,
  issueSessionToken,
  sessionUser,
} from '../auth'

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

// Zod schema — single source of truth for signup input (CLAUDE.md)
const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  invite: z.string().min(1).optional(),
})

const DemoSessionSchema = z.object({
  persona: z.enum(DEMO_PERSONAS),
})

const GuestSessionSchema = z.strictObject({})

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

// Public: lets the landing page and LoginPage choose between the signup form and
// the waitlist form. Deliberately exposes no invite tokens or waitlist contents.
router.get('/signup-status', async (_req, res) => {
  try {
    const [status, offer] = await Promise.all([
      Waitlist.getSignupStatus(),
      Credits.getLaunchOffer(),
    ])
    return res.json({ ...status, offer })
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

  let publicSlotReserved = false
  let accountCreated = false
  try {
    const existing = await db.getUserByEmail(email)
    if (existing) {
      return res.status(409).json({ error: 'Email already taken' })
    }

    // Access gate. Checked after the duplicate-email check so a returning user
    // never burns a public slot, and before user creation so a refusal creates
    // nothing. A valid invite always passes and does not consume a slot.
    const authorization = await Waitlist.authorizeSignup(parsed.data.invite)
    if (!authorization.allowed) {
      return res.status(403).json({
        error: 'Registration is currently closed.',
        reason: authorization.reason,
      })
    }
    publicSlotReserved = authorization.via === 'public'

    const password_hash = await bcrypt.hash(password, 10)
    const user = await db.createUser({
      email,
      name,
      password_hash,
      claimed_public_signup_slot: publicSlotReserved,
    })
    if (!user) throw new Error('Account insert returned no user')
    accountCreated = true

    if (authorization.via === 'invite') {
      await Waitlist.completeInviteSignup(authorization.inviteToken, user.id)
    }

    const signupCredits = await Credits.grantSignupCredits(user.id)
    await Onboarding.seedNewUser(user.id)
    await recordLogin(user.id)

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role ?? 'user',
        authMethod: user.signup_method ?? 'password',
      },
      token,
      signupCredits,
    })
  } catch (error) {
    if (publicSlotReserved && !accountCreated) {
      try {
        await db.releasePublicSignupSlot()
      } catch (releaseError) {
        console.error('Could not release failed signup slot reservation:', releaseError)
      }
    }
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
    const session = await Auth.startGuestSession()
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
