import express from 'express'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { Onboarding } from '../onboarding'

const router = express.Router()

router.post('/complete', authenticateToken, async (req: AuthRequest, res) => {
  try {
    res.json(await Onboarding.complete(req.user.userId))
  } catch (error) {
    console.error('Complete onboarding error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.post('/skip', authenticateToken, async (req: AuthRequest, res) => {
  try {
    res.json(await Onboarding.skip(req.user.userId))
  } catch (error) {
    console.error('Skip onboarding error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as onboardingRoutes }
