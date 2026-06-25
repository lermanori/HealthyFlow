import express from 'express'
import {
  AchievementDefinitionCreateSchema,
  AchievementDefinitionUpdateSchema,
  AchievementEntryCreateSchema,
  AchievementEntryUpdateSchema,
  AchievementListQuerySchema,
  Achievements,
  DuplicateAchievementEntryError,
  ForbiddenError,
  NotFoundError,
} from '../achievements'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

function handleError(res: express.Response, err: unknown) {
  if (err instanceof DuplicateAchievementEntryError) {
    return res.status(409).json({ error: err.message })
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message })
  }
  if (err instanceof ForbiddenError) {
    return res.status(403).json({ error: err.message })
  }
  return res.status(500).json({ error: 'Database error' })
}

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = AchievementListQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const summaries = await Achievements.list(req.user.userId, parsed.data)
    res.json(summaries)
  } catch (err) {
    handleError(res, err)
  }
})

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = AchievementDefinitionCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const definition = await Achievements.createDefinition(req.user.userId, parsed.data)
    res.status(201).json(definition)
  } catch (err) {
    handleError(res, err)
  }
})

router.patch('/:achievementId', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = AchievementDefinitionUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const definition = await Achievements.updateDefinition(req.user.userId, req.params.achievementId, parsed.data)
    res.json(definition)
  } catch (err) {
    handleError(res, err)
  }
})

router.delete('/:achievementId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await Achievements.deleteDefinition(req.user.userId, req.params.achievementId)
    res.status(204).end()
  } catch (err) {
    handleError(res, err)
  }
})

router.post('/:achievementId/entries', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = AchievementEntryCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const entry = await Achievements.createEntry(req.user.userId, req.params.achievementId, parsed.data)
    res.status(201).json(entry)
  } catch (err) {
    handleError(res, err)
  }
})

router.patch('/entries/:entryId', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = AchievementEntryUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const entry = await Achievements.updateEntry(req.user.userId, req.params.entryId, parsed.data)
    res.json(entry)
  } catch (err) {
    handleError(res, err)
  }
})

router.delete('/entries/:entryId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await Achievements.deleteEntry(req.user.userId, req.params.entryId)
    res.status(204).end()
  } catch (err) {
    handleError(res, err)
  }
})

export { router as achievementRoutes }
