import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { db } from '../supabase-client'
import { Credits, FREE_SIGNUP_CREDITS } from '../credits'
import { Onboarding } from '../onboarding'
import { DEMO_PERSONAS, getDemoPersonaUser } from '../demo-personas'

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

// Zod schema — single source of truth for signup input (CLAUDE.md)
const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
})

const DemoSessionSchema = z.object({
  persona: z.enum(DEMO_PERSONAS),
})

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

// Public self-signup
router.post('/signup', signupLimiter, async (req, res) => {
  const parsed = SignupSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  const { email, password, name } = parsed.data

  try {
    const existing = await db.getUserByEmail(email)
    if (existing) {
      return res.status(409).json({ error: 'Email already taken' })
    }

    const password_hash = await bcrypt.hash(password, 10)
    const user = await db.createUser({ email, name, password_hash })
    await Credits.grant(user.id, FREE_SIGNUP_CREDITS, 'signup_bonus')
    await Onboarding.seedNewUser(user.id)

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })
    return res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role ?? 'user' }, token })
  } catch (error) {
    console.error('Signup error:', error)
    return res.status(500).json({ error: 'Database error' })
  }
})

// Public persona demo session. This resets the persona's demo data to the current date
// before issuing a normal JWT, so the app itself remains the demo surface.
router.post('/demo-session', async (req, res) => {
  const parsed = DemoSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Unknown demo persona' })
  }

  try {
    const user = await getDemoPersonaUser(parsed.data.persona)
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '2h' })
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role ?? 'user',
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

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role ?? 'user'
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

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? 'user',
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

// Delete user (admin only)
router.delete('/users/:userId', async (req, res) => {
  const { adminToken } = req.query
  const { userId } = req.params

  if (adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  try {
    await db.deleteUser(userId)
    res.json({ success: true })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as authRoutes }
