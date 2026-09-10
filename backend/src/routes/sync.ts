import express from 'express'
import { CloudAccess, isCloudNotActiveError } from '../cloud-access'
import { Sync, SyncClockError, SyncOwnershipError } from '../sync'
import { SyncRequestSchema } from '../sync-contracts'
import { authenticateToken, type AuthRequest } from '../middleware/auth'
import { reconcileGoogleCalendarItems } from '../calendar'

const router = express.Router()

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = SyncRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    // Cloud is what hosting is sold as, so this is a boundary rather than a
    // failure: a free account's day is never hosted (TARGET.md, ADR-0012).
    // One entitlement row, plus the account identity only when that entitlement
    // is active — not `Credits.getCreditSummary`, which runs five queries
    // including a month of usage logs. This gate runs on every exchange.
    await CloudAccess.require(req.user.userId)

    const exchange = await Sync.exchange(req.user.userId, parsed.data)
    let calendarReconciliation
    try {
      calendarReconciliation = await reconcileGoogleCalendarItems(req.user.userId, {
        itemIds: parsed.data.changed.tasks.map((row) => row.id),
        timeZone: req.header('x-client-time-zone') || undefined,
      })
    } catch (error) {
      console.error('Google Calendar reconciliation error after Cloud exchange:', error)
      calendarReconciliation = {
        state: 'unavailable' as const,
        attempted: 0,
        synced: 0,
        removed: 0,
        failures: [{ itemId: 'calendar', reason: 'calendar_reconciliation_unavailable' as const }],
      }
    }
    return res.json({ ...exchange, calendarReconciliation })
  } catch (error) {
    if (isCloudNotActiveError(error)) {
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
