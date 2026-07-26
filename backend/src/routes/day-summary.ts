import express from 'express'
import { z } from 'zod'
import { buildDaySummary } from '../day-summary'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()
const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = QuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  }

  const timeZoneHeader = req.header('x-client-time-zone')
  const timeZone = timeZoneHeader && timeZoneHeader.length <= 100 ? timeZoneHeader : null

  try {
    res.json(await buildDaySummary(req.user.userId, parsed.data.date, timeZone))
  } catch (error) {
    console.error('DaySummary error:', error)
    res.status(500).json({ error: 'Failed to load the daily plan' })
  }
})

export { router as daySummaryRoutes }
