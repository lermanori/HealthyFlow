import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { db } from '../supabase-client'

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

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
        name: user.name
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
    const decoded = jwt.verify(token, JWT_SECRET) as any
    const user = await db.getUserById(decoded.userId)
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    res.json(user)
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