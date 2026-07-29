import express from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { Waitlist, WaitlistJoinSchema } from '../waitlist'
import { authenticateToken, requireAdminRole } from '../middleware/auth'
import { db } from '../supabase-client'

const router = express.Router()

// Same shape as the signup limiter: this endpoint is public and unauthenticated.
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

router.post('/', joinLimiter, async (req, res) => {
  const parsed = WaitlistJoinSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    await Waitlist.join(parsed.data)
    // Always the same response whether or not the email was already present, so
    // this endpoint cannot be used to test whether someone is on the list.
    return res.json({ joined: true })
  } catch (error) {
    console.error('Waitlist join error:', error)
    return res.status(500).json({ error: 'Could not join the waitlist' })
  }
})

// ---- Admin ----

export const SignupSeatSettingsSchema = z.object({
  publicSlotsOpen: z.number().int().min(0).max(10_000),
  publicSlotsClaimed: z.number().int().min(0).max(10_000),
}).refine(
  value => value.publicSlotsClaimed <= value.publicSlotsOpen,
  {
    message: 'Claimed seats cannot exceed the total public signup seats.',
    path: ['publicSlotsClaimed'],
  },
)
const AddEmailSchema = z.object({ email: z.string().email(), name: z.string().max(80).optional() })

router.get('/admin/entries', authenticateToken, requireAdminRole, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const entries = await db.listWaitlist(status)
    const invites = await db.listInvitesForWaitlist(entries.map((e: { id: string }) => e.id))
    const access = await db.getSignupAccess()
    res.json({ entries, invites, access })
  } catch (error) {
    console.error('Waitlist list error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.post('/admin/entries', authenticateToken, requireAdminRole, async (req, res) => {
  const parsed = AddEmailSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    // Reuses the public join path so manually added people are ordinary waitlist
    // rows — one mechanism for both "signed up" and "someone the owner knows".
    const { entry } = await Waitlist.join({ ...parsed.data, source: 'admin' })
    res.json({ entry })
  } catch (error) {
    console.error('Waitlist add error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.post('/admin/entries/:id/invite', authenticateToken, requireAdminRole, async (req, res) => {
  try {
    const invite = await Waitlist.createInviteFor(req.params.id)
    res.json({ invite })
  } catch (error) {
    console.error('Waitlist invite error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.delete('/admin/entries/:id', authenticateToken, requireAdminRole, async (req, res) => {
  try {
    await db.deleteWaitlistEntry(req.params.id)
    res.json({ deleted: true })
  } catch (error) {
    console.error('Waitlist delete error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.patch('/admin/slots', authenticateToken, requireAdminRole, async (req, res) => {
  const parsed = SignupSeatSettingsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const access = await db.updateSignupAccess({
      public_slots_open: parsed.data.publicSlotsOpen,
      public_slots_claimed: parsed.data.publicSlotsClaimed,
    })
    res.json({ access })
  } catch (error) {
    console.error('Waitlist slots error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

export const waitlistRoutes = router
