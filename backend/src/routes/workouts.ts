import express from 'express'
import {
  ForbiddenError,
  NotFoundError,
  WorkoutExerciseInputSchema,
  WorkoutExerciseItemQuerySchema,
  WorkoutExerciseUpdateSchema,
  WorkoutListQuerySchema,
  WorkoutPlanCreateSchema,
  WorkoutPlanGenerationRequestSchema,
  WorkoutPlanUpdateSchema,
  WorkoutSessionCreateSchema,
  WorkoutSessionUpdateSchema,
  Workouts,
} from '../workouts'
import { generateWorkoutPlanWithAi } from '../openai'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

function handleError(res: express.Response, err: unknown) {
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message })
  if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message })
  return res.status(500).json({ error: 'Database error' })
}

router.get('/plans', authenticateToken, async (req: AuthRequest, res) => {
  try {
    res.json(await Workouts.listPlans(req.user.userId))
  } catch (err) {
    handleError(res, err)
  }
})

router.post('/plans/generate', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = WorkoutPlanGenerationRequestSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const result = await generateWorkoutPlanWithAi({
      userId: req.user.userId,
      intent: parsed.data.intent,
    })
    if (result.ok) return res.json(result.value)
    if (result.code === 'insufficient_credits') {
      return res.status(402).json({ error: 'Insufficient AI tokens', code: 'insufficient_credits' })
    }
    if (result.code === 'unpriced_model') {
      return res.status(500).json({ error: 'AI model pricing is not configured', code: 'unpriced_model' })
    }
    if (result.code === 'billing_error') {
      return res.status(500).json({ error: 'AI billing failed', code: 'billing_error' })
    }
    return res.status(500).json({ error: 'Could not generate workout plan', code: 'ai_generation_failed' })
  } catch (err) {
    handleError(res, err)
  }
})

router.post('/plans', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = WorkoutPlanCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    res.status(201).json(await Workouts.createPlan(req.user.userId, parsed.data))
  } catch (err) {
    handleError(res, err)
  }
})

router.patch('/plans/:planId', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = WorkoutPlanUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    res.json(await Workouts.updatePlan(req.user.userId, req.params.planId, parsed.data))
  } catch (err) {
    handleError(res, err)
  }
})

router.delete('/plans/:planId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await Workouts.deletePlan(req.user.userId, req.params.planId)
    res.status(204).end()
  } catch (err) {
    handleError(res, err)
  }
})

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
