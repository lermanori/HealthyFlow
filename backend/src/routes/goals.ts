import express from 'express'
import { z } from 'zod'
import { authenticateToken, type AuthRequest } from '../middleware/auth'
import { GoalCreateInputSchema, GoalUpdateInputSchema, Goals } from '../goals'

const router = express.Router()
const GoalParamsSchema = z.object({ goalId: z.string().uuid() })
const GoalQuerySchema = z.object({ includeArchived: z.enum(['true', 'false']).optional() })

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  const query = GoalQuerySchema.safeParse(req.query)
  if (!query.success) return res.status(400).json({ error: 'Invalid Goal query' })
  try {
    res.json(await Goals.list(req.user.userId, query.data.includeArchived === 'true'))
  } catch (error) {
    console.error('Goals read error:', error)
    res.status(500).json({ error: 'Failed to load Goals' })
  }
})

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const input = GoalCreateInputSchema.safeParse(req.body)
  if (!input.success) return res.status(400).json({ error: input.error.issues[0]?.message ?? 'Invalid Goal' })
  try {
    res.status(201).json(await Goals.create(req.user.userId, input.data))
  } catch (error) {
    console.error('Goal create error:', error)
    res.status(500).json({ error: 'Failed to add Goal' })
  }
})

router.patch('/:goalId', authenticateToken, async (req: AuthRequest, res) => {
  const params = GoalParamsSchema.safeParse(req.params)
  const input = GoalUpdateInputSchema.safeParse(req.body)
  if (!params.success || !input.success) return res.status(400).json({ error: 'Invalid Goal update' })
  try {
    res.json(await Goals.update(req.user.userId, params.data.goalId, input.data))
  } catch (error: any) {
    if (error?.status === 404) return res.status(404).json({ error: 'Goal not found' })
    console.error('Goal update error:', error)
    res.status(500).json({ error: 'Failed to update Goal' })
  }
})

export { router as goalRoutes }
