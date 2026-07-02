import express from 'express'
import {
  ForbiddenError,
  NotFoundError,
  WorkoutExerciseInputSchema,
  WorkoutExerciseItemQuerySchema,
  WorkoutExerciseUpdateSchema,
  WorkoutListQuerySchema,
  WorkoutSessionCreateSchema,
  WorkoutSessionUpdateSchema,
  Workouts,
} from '../workouts'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

function handleError(res: express.Response, err: unknown) {
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message })
  if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message })
  return res.status(500).json({ error: 'Database error' })
}

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = WorkoutListQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    res.json(await Workouts.listSessions(req.user.userId, parsed.data.date))
  } catch (err) {
    handleError(res, err)
  }
})

router.get('/exercises', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = WorkoutExerciseItemQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    res.json(await Workouts.listExerciseItems(req.user.userId, parsed.data))
  } catch (err) {
    handleError(res, err)
  }
})

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = WorkoutSessionCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    res.status(201).json(await Workouts.createSession(req.user.userId, parsed.data))
  } catch (err) {
    handleError(res, err)
  }
})

router.patch('/:sessionId', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = WorkoutSessionUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    res.json(await Workouts.updateSession(req.user.userId, req.params.sessionId, parsed.data))
  } catch (err) {
    handleError(res, err)
  }
})

router.delete('/:sessionId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await Workouts.deleteSession(req.user.userId, req.params.sessionId)
    res.status(204).end()
  } catch (err) {
    handleError(res, err)
  }
})

router.post('/:sessionId/exercises', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = WorkoutExerciseInputSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    res.status(201).json(await Workouts.addExercise(req.user.userId, req.params.sessionId, parsed.data))
  } catch (err) {
    handleError(res, err)
  }
})

router.patch('/exercises/:exerciseId', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = WorkoutExerciseUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    res.json(await Workouts.updateExercise(req.user.userId, req.params.exerciseId, parsed.data))
  } catch (err) {
    handleError(res, err)
  }
})

router.delete('/exercises/:exerciseId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await Workouts.deleteExercise(req.user.userId, req.params.exerciseId)
    res.status(204).end()
  } catch (err) {
    handleError(res, err)
  }
})

export { router as workoutRoutes }
