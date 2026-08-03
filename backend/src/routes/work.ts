import express from 'express'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { Work } from '../work'
import {
  ArchiveProjectInputSchema,
  CompleteWorkReviewInputSchema,
  CreateFocusBlockInputSchema,
  CreateTaskRecordInputSchema,
  CreateWorkProjectInputSchema,
  FocusBlockTransitionInputSchema,
  ProjectDetailsInputSchema,
  RecordWorkSessionInputSchema,
  UpdateTaskRecordInputSchema,
} from '../work-contracts'

const router = express.Router()

function respondError(res: express.Response, error: any) {
  const status = error?.status ?? 500
  res.status(status).json({ error: status === 500 ? 'Work write failed' : error.message })
}

const handle = (run: (req: AuthRequest) => Promise<unknown>, successStatus = 200) =>
  async (req: AuthRequest, res: express.Response) => {
    try {
      res.status(successStatus).json(await run(req))
    } catch (error) {
      respondError(res, error)
    }
  }

const validated = <T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: any } },
  run: (req: AuthRequest, body: T) => Promise<unknown>,
  successStatus = 200,
) => async (req: AuthRequest, res: express.Response) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  try {
    res.status(successStatus).json(await run(req, parsed.data))
  } catch (error) {
    respondError(res, error)
  }
}

router.get('/projects', authenticateToken, handle(req => Work.listProjects(req.user.userId)))
router.post('/projects', authenticateToken, validated(CreateWorkProjectInputSchema, (req, body) =>
  Work.createProject(req.user.userId, body), 201))
router.patch('/projects/:id', authenticateToken, validated(ProjectDetailsInputSchema, (req, body) =>
  Work.updateProject(req.user.userId, req.params.id, body)))
router.patch('/projects/:id/archive', authenticateToken, validated(ArchiveProjectInputSchema, (req, body) =>
  Work.archiveProject(req.user.userId, req.params.id, body.archived)))
router.delete('/projects/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await Work.deleteProject(req.user.userId, req.params.id)
    res.status(204).end()
  } catch (error) {
    respondError(res, error)
  }
})

// A null projectId is the real standalone scope; it is not represented by a
// synthetic Project record.
router.get('/scope', authenticateToken, handle(req => Work.getScope(
  req.user.userId,
  typeof req.query.projectId === 'string' && req.query.projectId ? req.query.projectId : null,
)))

router.post('/projects/:id/tasks', authenticateToken, validated(CreateTaskRecordInputSchema, (req, body) =>
  Work.addTask(req.user.userId, req.params.id, body), 201))
router.patch('/projects/:id/tasks/:taskId', authenticateToken, validated(UpdateTaskRecordInputSchema, (req, body) =>
  Work.updateTask(req.user.userId, req.params.id, req.params.taskId, body)))
router.delete('/projects/:id/tasks/:taskId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await Work.removeTask(req.user.userId, req.params.id, req.params.taskId)
    res.status(204).end()
  } catch (error) {
    respondError(res, error)
  }
})

router.post('/focus-blocks', authenticateToken, validated(CreateFocusBlockInputSchema, (req, body) =>
  Work.createFocusBlock(req.user.userId, body), 201))
router.post('/focus-blocks/:id/transition', authenticateToken, validated(FocusBlockTransitionInputSchema, (req, body) =>
  Work.transitionFocusBlock(req.user.userId, req.params.id, body)))
router.post('/focus-blocks/:id/review', authenticateToken, validated(CompleteWorkReviewInputSchema, (req, body) =>
  Work.completeReview(req.user.userId, req.params.id, body), 201))

router.post('/sessions', authenticateToken, validated(RecordWorkSessionInputSchema, (req, body) =>
  Work.recordSession(req.user.userId, body), 201))
router.delete('/sessions/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await Work.removeSession(req.user.userId, req.params.id)
    res.status(204).end()
  } catch (error) {
    respondError(res, error)
  }
})

export { router as workRoutes }
