import express from 'express'
import { z } from 'zod'
import { db } from '../supabase-client'
import { RhythmPatchSchema } from '../settings-schema'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import {
  RhythmSchema,
  NativePushRegistrationSchema,
  PushSubscriptionSchema,
  sendPushToUser,
} from '../proactivity'

const router = express.Router()

// GET /api/proactivity/rhythm — review schedule; old planning fields are ignored.
router.get('/rhythm', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const stored = await db.getUserRhythm(req.user.userId)
    res.json(RhythmSchema.parse(stored))
  } catch {
    res.status(500).json({ error: 'Database error' })
  }
})

// PUT /api/proactivity/rhythm — accepts a partial patch of the rhythm.
router.put('/rhythm', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = RhythmPatchSchema.safeParse(req.body)
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

// POST /api/proactivity/push/native/register
router.post('/push/native/register', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = NativePushRegistrationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  try {
    await db.addNativePushDevice({
      user_id: req.user.userId,
      device_token: parsed.data.deviceToken,
      platform: parsed.data.platform,
      app_id: parsed.data.appId,
    })
    res.status(201).json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Database error' })
  }
})

// DELETE /api/proactivity/push/native/register
router.delete('/push/native/register', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = NativePushRegistrationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  try {
    await db.deleteNativePushDevice(
      req.user.userId,
      parsed.data.deviceToken,
      parsed.data.appId,
    )
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
      url: '/talk',
    })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Failed to send test notification' })
  }
})

export { router as proactivityRoutes }
