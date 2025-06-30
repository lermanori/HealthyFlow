import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { db } from '../db/database'

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body

  db.get(
    'SELECT * FROM users WHERE email = ?',
    [email],
    async (err, user: any) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' })
      }

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      // For demo purposes, we'll accept the demo password
      const isValidPassword = email === 'demo@healthyflow.com' && password === 'demo123'

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
    }
  )
})

// Verify token
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    
    db.get(
      'SELECT id, email, name FROM users WHERE id = ?',
      [decoded.userId],
      (err, user) => {
        if (err || !user) {
          return res.status(401).json({ error: 'Invalid token' })
        }

        res.json(user)
      }
    )
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export { router as authRoutes }