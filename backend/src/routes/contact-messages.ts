import express from 'express'
import { z } from 'zod'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

const ContactMessageSchema = z.object({
  kind: z.enum(['subscribe', 'topup']),
  message: z.string().trim().min(1).max(1000),
})

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = ContactMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const message = await db.createContactMessage({
      user_id: req.user.userId,
      kind: parsed.data.kind,
      message: parsed.data.message,
    })
    res.status(201).json(message)
  } catch (error) {
    console.error('Create contact message error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as contactMessageRoutes }
