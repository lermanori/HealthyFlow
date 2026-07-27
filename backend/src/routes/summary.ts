import express from 'express'
import { z } from 'zod'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { buildWeekSummary } from '../day-summary'

const router = express.Router()
const WeekSummaryQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  includePlanning: z.enum(['1']).optional(),
})

router.get('/week-summary', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = WeekSummaryQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  }

  const timeZoneHeader = req.header('x-client-time-zone')
  const timeZone = timeZoneHeader && timeZoneHeader.length <= 100 ? timeZoneHeader : null
  try {
    res.json(parsed.data.includePlanning === '1'
      ? await buildWeekSummary(
          req.user.userId,
          parsed.data.date,
          timeZone,
          { includePlanning: true }
        )
      : await buildWeekSummary(
          req.user.userId,
          parsed.data.date,
          timeZone
        ))
  } catch (error) {
    console.error('WeekSummary error:', error)
    res.status(500).json({ error: 'Failed to load the weekly plan' })
  }
})

export { router as summaryRoutes }
