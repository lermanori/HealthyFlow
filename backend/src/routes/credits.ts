import express from 'express'
import { z } from 'zod'
import { Credits } from '../credits'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

const BalanceResponse = z.object({ balance: z.number().int() })

router.get('/balance', authenticateToken, async (req: AuthRequest, res) => {
  const balance = await Credits.getBalance(req.user.userId)
  res.json(BalanceResponse.parse({ balance }))
})

export { router as creditsRoutes }
