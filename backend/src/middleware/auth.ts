import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'
import { db } from '../supabase-client'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export interface AuthRequest extends Request {
  user?: any
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' })
    }

    req.user = user
    next()
  })
}

export async function requireAdminRole(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId
    if (!userId) {
      return res.status(401).json({ error: 'Access token required' })
    }

    const user = await db.getUserById(userId)
    if (user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    next()
  } catch (error) {
    console.error('Admin role check failed:', error)
    return res.status(500).json({ error: 'Database error' })
  }
}
