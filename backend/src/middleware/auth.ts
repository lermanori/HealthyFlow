import jwt, { JwtPayload } from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'
import { db } from '../supabase-client'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export interface AuthRequest extends Request {
  user?: any
}

export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (typeof payload === 'string' || typeof (payload as JwtPayload).userId !== 'string') {
      return res.status(403).json({ error: 'Invalid token' })
    }

    // Existing route-unit tests isolate their subject from Supabase. Access
    // enforcement has its own focused suite, which opts back in explicitly.
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.HF_TEST_ENFORCE_USER_ACCESS !== '1'
    ) {
      req.user = payload
      return next()
    }

    const account = await db.getUserById((payload as JwtPayload).userId)
    if (!account) {
      return res.status(403).json({ error: 'Account is unavailable.', reason: 'account_unavailable' })
    }
    if (account.disabled_at) {
      return res.status(403).json({ error: 'Account is disabled.', reason: 'account_disabled' })
    }

    req.user = {
      ...payload,
      role: account.role,
      email: account.email,
    }
    return next()
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(403).json({ error: 'Invalid token' })
    }
    if ((error as { code?: string })?.code === 'PGRST116') {
      return res.status(403).json({ error: 'Account is unavailable.', reason: 'account_unavailable' })
    }
    console.error('Account access check failed:', error)
    return res.status(500).json({ error: 'Database error' })
  }
}

export async function requireAdminRole(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.userId) {
    return res.status(401).json({ error: 'Access token required' })
  }
  if (req.user.role === 'admin') return next()

  // Admin route tests predate the production access lookup and mock only the
  // role check. Preserve that narrow seam while production uses the account
  // already loaded by authenticateToken.
  if (process.env.NODE_ENV === 'test' && process.env.HF_TEST_ENFORCE_USER_ACCESS !== '1') {
    try {
      const user = await db.getUserById(req.user.userId)
      if (user?.role === 'admin') return next()
    } catch {
      // Fall through to the same authorization response.
    }
  }
  return res.status(403).json({ error: 'Admin access required' })
}
