import express from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import {
  buildAccountExport,
  DURABLE_E2E_USER_EMAIL,
  getAccountCredentials,
} from '../account-data'
import { db, supabase } from '../supabase-client'
import { revokeGoogleAuthorization } from '../calendar'

const router = express.Router()

const DeleteAccountSchema = z.object({
  password: z.string().optional().default(''),
  confirmation: z.literal('DELETE'),
})

const deleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: AuthRequest) => String(req.user.userId),
  message: { error: 'Too many deletion attempts. Try again in 15 minutes.' },
})

router.use(authenticateToken)

router.get('/export', async (req: AuthRequest, res) => {
  try {
    const archive = await buildAccountExport(req.user.userId)
    const date = new Date().toISOString().slice(0, 10)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Disposition', `attachment; filename="healthyflow-export-${date}.json"`)
    return res.json(archive)
  } catch (error) {
    console.error('Account export failed:', error)
    return res.status(500).json({ error: 'Could not create account export' })
  }
})

router.delete('/', deleteLimiter, async (req: AuthRequest, res) => {
  const parsed = DeleteAccountSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Type DELETE exactly.' })

  try {
    const user = await getAccountCredentials(req.user.userId)
    const normalizedEmail = user.email.trim().toLowerCase()
    if (
      user.role === 'admin' ||
      normalizedEmail === DURABLE_E2E_USER_EMAIL ||
      normalizedEmail === 'demo@healthyflow.com' ||
      normalizedEmail.startsWith('demo-')
    ) {
      return res.status(403).json({
        error: 'Administrator, demo, and durable test accounts cannot be deleted here.',
      })
    }
    if (user.signup_method !== 'google') {
      if (!parsed.data.password) {
        return res.status(400).json({ error: 'Enter your password and type DELETE exactly.' })
      }
      const passwordMatches = await bcrypt.compare(parsed.data.password, user.password_hash)
      if (!passwordMatches) return res.status(401).json({ error: 'Current password is incorrect.' })
    }

    const warnings: string[] = []
    try {
      await revokeGoogleAuthorization(user.id)
    } catch (error) {
      console.warn('Google authorization revocation failed during deletion:', error)
      warnings.push('google-revocation-failed')
    }
    await db.deleteUser(user.id)
    if (user.google_auth_subject) {
      try {
        const { error } = await supabase.auth.admin.deleteUser(user.google_auth_subject)
        if (error) throw error
      } catch (error) {
        console.warn('Supabase Auth deletion failed during account deletion:', error)
        warnings.push('supabase-auth-deletion-failed')
      }
    }
    return res.json({ deleted: true, warnings })
  } catch (error) {
    console.error('Account deletion failed:', error)
    return res.status(500).json({ error: 'Could not delete account' })
  }
})

export { router as accountRoutes }
