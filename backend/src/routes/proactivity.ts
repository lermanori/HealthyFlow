import express from 'express'
import { z } from 'zod'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import {
  RhythmSchema,
  PushSubscriptionSchema,
  TOUCHPOINT_TYPES,
  buildKickoffMessage,
  sendPushToUser,
  type TouchpointType,
} from '../proactivity'

const router = express.Router()

// GET /api/proactivity/rhythm
router.get('/rhythm', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const stored = await db.getUserRhythm(req.user.userId)
    res.json(RhythmSchema.parse(stored))
  } catch {
    res.status(500).json({ error: 'Database error' })
  }
})

// PUT /api/proactivity/rhythm — accepts a partial patch of the rhythm.
const RhythmPatch = z.object({
  timezone: z.string(),
  morning: z.record(z.string(), z.unknown()),
  midday: z.record(z.string(), z.unknown()),
  weekly: z.record(z.string(), z.unknown()),
}).partial().strict()

router.put('/rhythm', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = RhythmPatch.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  try {
    const stored = await db.upsertUserRhythm(req.user.userId, parsed.data)
    res.json(RhythmSchema.parse(stored))
  } catch {
    res.status(500).json({ error: 'Database error' })
  }
})

// POST /api/proactivity/push/subscribe
router.post('/push/subscribe', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = PushSubscriptionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  try {
    await db.addPushSubscription({
      user_id: req.user.userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    })
    res.status(201).json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Database error' })
  }
})

// DELETE /api/proactivity/push/subscribe
const UnsubBody = z.object({ endpoint: z.string().url() })
router.delete('/push/subscribe', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = UnsubBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  try {
    await db.deletePushSubscriptionByEndpoint(parsed.data.endpoint)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Database error' })
  }
})

// POST /api/proactivity/test-notification
router.post('/test-notification', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await sendPushToUser(req.user.userId, {
      title: 'HealthyFlow test 🔔',
      body: 'Push is working. Tap to open the assistant.',
      url: '/talk?kickoff=morning',
    })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Failed to send test notification' })
  }
})

// GET /api/proactivity/kickoff?type=morning
router.get('/kickoff', authenticateToken, async (req: AuthRequest, res) => {
  const type = req.query.type
  if (typeof type !== 'string' || !TOUCHPOINT_TYPES.includes(type as TouchpointType)) {
    return res.status(400).json({ error: 'Invalid kickoff type' })
  }
  try {
    const message = await buildKickoffMessage(req.user.userId, type as TouchpointType)
    res.json({ message })
  } catch (err) {
    // No silent fallback — surface the failure so the assistant shows its error state.
    res.status(500).json({ error: 'Failed to build kickoff' })
  }
})

export { router as proactivityRoutes }
