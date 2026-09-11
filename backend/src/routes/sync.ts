import express from 'express'
import { CloudAccess, isCloudNotActiveError } from '../cloud-access'
import { Sync, SyncClockError, SyncOwnershipError } from '../sync'
import { SyncRequestSchema } from '../sync-contracts'
import { authenticateToken, type AuthRequest } from '../middleware/auth'
import { logger } from '../utils/logger'

const router = express.Router()

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  // The request arriving at all is the first thing worth knowing: a sync that
  // never leaves the device looks exactly like one the server refused.
  logger.debug('[sync] POST /api/sync', { userId: req.user.userId })

  const parsed = SyncRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    logger.debug('[sync] rejected an unreadable body', {
      userId: req.user.userId,
      reason: parsed.error.issues[0].message,
    })
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    // Cloud is what hosting is sold as, so this is a boundary rather than a
    // failure: a free account's day is never hosted (TARGET.md, ADR-0012).
    // One entitlement row, plus the account identity only when that entitlement
    // is active — not `Credits.getCreditSummary`, which runs five queries
    // including a month of usage logs. This gate runs on every exchange.
    await CloudAccess.require(req.user.userId)

    const result = await Sync.exchange(req.user.userId, parsed.data)
    logger.debug('[sync] 200', { userId: req.user.userId, syncedAt: result.syncedAt })
    return res.json(result)
  } catch (error) {
    if (isCloudNotActiveError(error)) {
      logger.debug('[sync] 403 cloud_not_active', { userId: req.user.userId })
      return res.status(403).json({ error: error.message, reason: error.reason })
    }
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
