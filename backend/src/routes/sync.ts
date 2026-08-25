import express from 'express'
import { db } from '../supabase-client'
import { Sync, SyncClockError, SyncOwnershipError } from '../sync'
import { SyncRequestSchema } from '../sync-contracts'
import { authenticateToken, type AuthRequest } from '../middleware/auth'

const router = express.Router()

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = SyncRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    // Cloud is what hosting is sold as, so this is a boundary rather than a
    // failure: a free account's day is never hosted (TARGET.md, ADR-0012).
    // One row, not `Credits.getCreditSummary`, which runs five queries including
    // a month of usage logs. This gate runs on every exchange.
    const subscription = await db.getUserCreditSubscription(req.user.userId)
    if (!subscription?.active) {
      return res.status(403).json({
        error: 'Cloud is not active on this account.',
        reason: 'cloud_not_active',
      })
    }

    return res.json(await Sync.exchange(req.user.userId, parsed.data))
  } catch (error) {
    // Every message names what actually failed. "Check your connection" was shown
    // twice this week for problems that had nothing to do with the network, and a
    // sync that cannot say why it stopped is a sync nobody can fix.
    if (error instanceof SyncClockError) {
      return res.status(409).json({
        error: 'This device’s clock is too far ahead to sync safely.',
        reason: 'device_clock_ahead',
      })
    }
    if (error instanceof SyncOwnershipError) {
      return res.status(409).json({
        error: 'A record on this device conflicts with another account.',
        reason: 'record_owner_conflict',
      })
    }
    console.error('Sync error:', error)
    return res.status(500).json({
      error: 'This day could not be synced with the server.',
      reason: 'sync_failed',
    })
  }
})

export { router as syncRoutes }
