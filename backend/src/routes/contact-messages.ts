import express from 'express'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import {
  ContactMessageCreateSchema,
  ContactMessageSchema,
} from '../contact-message-contracts'

const router = express.Router()

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = ContactMessageCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const account = await db.getUserById(req.user.userId)
    if (account.email === null && !parsed.data.replyTo) {
      return res.status(400).json({ error: 'A reply-to email is required for a Guest.' })
    }
    const message = await db.createContactMessage({
      user_id: req.user.userId,
      kind: parsed.data.kind,
      message: parsed.data.message,
      reply_to: parsed.data.replyTo ?? null,
    })
    res.status(201).json(ContactMessageSchema.parse({
      id: message.id,
      userId: message.user_id,
      userEmail: account.email,
      userName: account.name,
      kind: message.kind,
      message: message.message,
      replyTo: message.reply_to,
      status: message.status,
      handledAt: message.handled_at,
      handledBy: message.handled_by,
      createdAt: message.created_at,
      updatedAt: message.updated_at,
    }))
  } catch (error) {
    console.error('Create contact message error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as contactMessageRoutes }
