import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getProjectById: jest.fn(),
    getProjectsByUserId: jest.fn(),
    getOpenTaskCountsByUserId: jest.fn(),
    createProject: jest.fn(),
    updateProject: jest.fn(),
    deleteWorkProjectSafely: jest.fn(),
    getTaskById: jest.fn(),
    getTasksByProjectId: jest.fn(),
    createTask: jest.fn(),
    updateTask: jest.fn(),
    softDeleteTask: jest.fn(),
    createFocusBlock: jest.fn(),
    getFocusBlockById: jest.fn(),
    getFocusBlocksByProjectId: jest.fn(),
    getStandaloneFocusBlocks: jest.fn(),
    updateFocusBlock: jest.fn(),
    getWorkSessionsByProjectId: jest.fn(),
    getStandaloneWorkSessions: jest.fn(),
    getWorkSessionById: jest.fn(),
    createWorkSession: jest.fn(),
    deleteWorkSession: jest.fn(),
    getWorkReviewsByIds: jest.fn(),
    completeWorkReview: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '33333333-3333-4333-8333-333333333333'
const BLOCK_ID = '44444444-4444-4444-8444-444444444444'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

const projectRow = {
  id: PROJECT_ID,
  user_id: USER_ID,
  name: 'InvoiceFlow',
  color: '#22d3ee',
  is_archived: false,
}

const taskRow = {
  id: TASK_ID,
  user_id: USER_ID,
  project_id: PROJECT_ID,
  title: 'Add production environment variable',
  completed: false,
  deferred_at: null,
  deleted_at: null,
}

const focusBlockRow = {
  id: BLOCK_ID,
  user_id: USER_ID,
  project_id: PROJECT_ID,
  task_ids: [TASK_ID],
  standalone_title: null,
  standalone_context: null,
  scheduled_date: '2026-08-04',
  start_time: '09:30:00',
  planned_minutes: 45,
  intended_outcome: 'Production login can be tested',
  intended_evidence: 'A passing production login smoke test',
  transition_minutes: 10,
  break_minutes: 5,
  status: 'planned',
  review_trigger: null,
  started_at: null,
  ended_at: null,
  created_at: '2026-08-03T08:00:00.000Z',
  updated_at: '2026-08-03T08:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('Work Focus block API', () => {
  it('creates a first-class scheduled Focus block without Talk', async () => {
    mockDb.getProjectById.mockResolvedValue(projectRow)
    mockDb.getTaskById.mockResolvedValue(taskRow)
    mockDb.createFocusBlock.mockResolvedValue(focusBlockRow)

    const response = await request(app)
      .post('/api/work/focus-blocks')
      .set('Authorization', TOKEN)
      .send({
        projectId: PROJECT_ID,
        taskIds: [TASK_ID],
        scheduledDate: '2026-08-04',
        startTime: '09:30',
        plannedMinutes: 45,
        intendedOutcome: 'Production login can be tested',
        intendedEvidence: 'A passing production login smoke test',
        transitionMinutes: 10,
        breakMinutes: 5,
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(expect.objectContaining({
      id: BLOCK_ID,
      projectId: PROJECT_ID,
      taskIds: [TASK_ID],
      scheduledDate: '2026-08-04',
      startTime: '09:30',
      plannedMinutes: 45,
      status: 'planned',
      startedAt: null,
      endedAt: null,
    }))
    expect(mockDb.createFocusBlock).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_ID,
      project_id: PROJECT_ID,
      task_ids: [TASK_ID],
      scheduled_date: '2026-08-04',
      start_time: '09:30',
    }))
  })

  it('persists start time and rejects an invalid repeated start', async () => {
    mockDb.getFocusBlockById
      .mockResolvedValueOnce(focusBlockRow)
      .mockResolvedValueOnce({ ...focusBlockRow, status: 'active', started_at: '2026-08-03T09:00:00.000Z' })
    mockDb.updateFocusBlock.mockResolvedValue({
      ...focusBlockRow,
      status: 'active',
      started_at: '2026-08-03T09:00:00.000Z',
      updated_at: '2026-08-03T09:00:00.000Z',
    })

    const started = await request(app)
      .post(`/api/work/focus-blocks/${BLOCK_ID}/transition`)
      .set('Authorization', TOKEN)
      .send({ action: 'start' })

    expect(started.status).toBe(200)
    expect(started.body.status).toBe('active')
    expect(Date.parse(started.body.startedAt)).not.toBeNaN()
    expect(mockDb.updateFocusBlock).toHaveBeenCalledWith(
      USER_ID,
      BLOCK_ID,
      expect.objectContaining({ status: 'active', started_at: expect.any(String) }),
    )

    const repeated = await request(app)
      .post(`/api/work/focus-blocks/${BLOCK_ID}/transition`)
      .set('Authorization', TOKEN)
      .send({ action: 'start' })

    expect(repeated.status).toBe(409)
    expect(repeated.body.error).toMatch(/Cannot start an active Focus block/)
    expect(mockDb.updateFocusBlock).toHaveBeenCalledTimes(1)
  })

  it('creates standalone Focus blocks without inventing a Project', async () => {
    mockDb.createFocusBlock.mockResolvedValue({
      ...focusBlockRow,
      project_id: null,
      task_ids: [],
      standalone_title: 'Prepare launch notes',
      standalone_context: 'Bounded one-off work',
    })

    const response = await request(app)
      .post('/api/work/focus-blocks')
      .set('Authorization', TOKEN)
      .send({
        projectId: null,
        taskIds: [],
        standaloneTitle: 'Prepare launch notes',
        standaloneContext: 'Bounded one-off work',
        scheduledDate: '2026-08-04',
        startTime: '11:00',
        plannedMinutes: 30,
        intendedOutcome: 'Launch notes are reviewable',
        intendedEvidence: 'A saved notes document',
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(expect.objectContaining({
      projectId: null,
      taskIds: [],
      standaloneTitle: 'Prepare launch notes',
    }))
    expect(mockDb.getProjectById).not.toHaveBeenCalled()
  })

  it('appends multiple Focus blocks instead of overwriting an earlier block', async () => {
    mockDb.getProjectById.mockResolvedValue(projectRow)
    mockDb.getTaskById.mockResolvedValue(taskRow)
    mockDb.createFocusBlock
      .mockResolvedValueOnce(focusBlockRow)
      .mockResolvedValueOnce({ ...focusBlockRow, id: '55555555-5555-4555-8555-555555555555' })

    const input = {
      projectId: PROJECT_ID,
      taskIds: [TASK_ID],
      scheduledDate: '2026-08-04',
      startTime: '09:30',
      plannedMinutes: 45,
      intendedOutcome: 'Production login can be tested',
      intendedEvidence: 'A passing production login smoke test',
    }
    const first = await request(app).post('/api/work/focus-blocks').set('Authorization', TOKEN).send(input)
    const second = await request(app).post('/api/work/focus-blocks').set('Authorization', TOKEN).send(input)

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(first.body.id).not.toBe(second.body.id)
    expect(mockDb.createFocusBlock).toHaveBeenCalledTimes(2)
    expect(mockDb.updateProject).not.toHaveBeenCalled()
  })

  it('supports active → reviewing → active → reviewing → canceled transitions', async () => {
    let current = { ...focusBlockRow, status: 'active', started_at: '2026-08-03T09:00:00.000Z' }
    mockDb.getFocusBlockById.mockImplementation(async () => current)
    mockDb.updateFocusBlock.mockImplementation(async (_userId, _id, updates: any) => {
      current = { ...current, ...updates }
      return current
    })

    for (const [action, status, trigger] of [
      ['blocked', 'reviewing', 'blocked'],
      ['continue', 'active', null],
      ['drift', 'reviewing', 'drifted'],
      ['cancel', 'canceled', 'drifted'],
    ] as const) {
      const response = await request(app)
        .post(`/api/work/focus-blocks/${BLOCK_ID}/transition`)
        .set('Authorization', TOKEN)
        .send({ action })
      expect(response.status).toBe(200)
      expect(response.body.status).toBe(status)
      expect(response.body.reviewTrigger).toBe(trigger)
    }
  })

  it('rejects attaching a Focus block to another user\'s Project', async () => {
    mockDb.getProjectById.mockResolvedValue({ ...projectRow, user_id: '99999999-9999-4999-8999-999999999999' })

    const response = await request(app)
      .post('/api/work/focus-blocks')
      .set('Authorization', TOKEN)
      .send({
        projectId: PROJECT_ID,
        taskIds: [TASK_ID],
        scheduledDate: '2026-08-04',
        startTime: '09:30',
        plannedMinutes: 45,
        intendedOutcome: 'Nope',
        intendedEvidence: 'Nope',
      })

    expect(response.status).toBe(403)
    expect(mockDb.createFocusBlock).not.toHaveBeenCalled()
  })
})

describe('Work review API', () => {
  const reviewingBlock = {
    ...focusBlockRow,
    status: 'reviewing',
    review_trigger: 'drifted',
    started_at: '2026-08-03T08:00:00.000Z',
    ended_at: '2026-08-03T08:30:00.000Z',
  }
  const reviewRow = {
    id: '66666666-6666-4666-8666-666666666666',
    user_id: USER_ID,
    focus_block_id: BLOCK_ID,
    trigger: 'drifted',
    what_changed: 'The environment variable was identified but not deployed.',
    evidence_produced: 'A failing smoke-test log',
    milestone_impact: 'unblocked',
    what_got_in_way: 'Missing deployment access',
    unnecessary_work: 'Read competitor notes',
    actual_minutes: 30,
    next_step: 'Request deployment access',
    attention: 'Drifted',
    confirmed_updates: {
      tasks: [{ taskId: TASK_ID, action: 'defer' }],
      project: { addBlocker: 'Missing deployment access', nextStep: 'Request deployment access' },
    },
    created_at: '2026-08-03T08:31:00.000Z',
  }
  const sessionRow = {
    id: '77777777-7777-4777-8777-777777777777',
    user_id: USER_ID,
    project_id: PROJECT_ID,
    focus_block_id: BLOCK_ID,
    review_id: reviewRow.id,
    task_ids: [TASK_ID],
    standalone_title: null,
    standalone_context: null,
    planned_minutes: 45,
    actual_minutes: 30,
    minutes: 30,
    outcome: reviewRow.what_changed,
    evidence: reviewRow.evidence_produced,
    attention: 'Drifted',
    blocker_info: reviewRow.what_got_in_way,
    drift_info: reviewRow.unnecessary_work,
    next_step: reviewRow.next_step,
    occurred_at: '2026-08-03T08:30:00.000Z',
    started_at: reviewingBlock.started_at,
    ended_at: reviewingBlock.ended_at,
  }

  const body = {
    whatChanged: reviewRow.what_changed,
    evidenceProduced: reviewRow.evidence_produced,
    milestoneImpact: 'unblocked',
    whatGotInWay: reviewRow.what_got_in_way,
    unnecessaryWork: reviewRow.unnecessary_work,
    actualMinutes: 30,
    nextStep: reviewRow.next_step,
    attention: 'Drifted',
    updates: reviewRow.confirmed_updates,
  }

  it('atomically creates exactly one structured review and Work session', async () => {
    mockDb.getFocusBlockById
      .mockResolvedValueOnce(reviewingBlock)
      .mockResolvedValueOnce({ ...reviewingBlock, status: 'completed' })
    mockDb.completeWorkReview.mockResolvedValue({
      focusBlockId: BLOCK_ID,
      reviewId: reviewRow.id,
      sessionId: sessionRow.id,
    })
    mockDb.getWorkSessionById.mockResolvedValue(sessionRow)
    mockDb.getWorkReviewsByIds.mockResolvedValue([reviewRow])

    const response = await request(app)
      .post(`/api/work/focus-blocks/${BLOCK_ID}/review`)
      .set('Authorization', TOKEN)
      .send(body)

    expect(response.status).toBe(201)
    expect(response.body.focusBlock.status).toBe('completed')
    expect(response.body.review).toEqual(expect.objectContaining({
      whatChanged: reviewRow.what_changed,
      attention: 'Drifted',
    }))
    expect(response.body.session).toEqual(expect.objectContaining({
      focusBlockId: BLOCK_ID,
      plannedMinutes: 45,
      actualMinutes: 30,
      taskIds: [TASK_ID],
    }))
    expect(mockDb.completeWorkReview).toHaveBeenCalledTimes(1)
    expect(mockDb.completeWorkReview).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      focusBlockId: BLOCK_ID,
      updates: {
        tasks: [{ taskId: TASK_ID, action: 'defer' }],
        project: { addBlocker: 'Missing deployment access', nextStep: 'Request deployment access' },
      },
    }))
    expect(mockDb.createWorkSession).not.toHaveBeenCalled()
    expect(mockDb.updateTask).not.toHaveBeenCalled()
    expect(mockDb.updateProject).not.toHaveBeenCalled()
  })

  it('surfaces transaction failure without attempting partial writes', async () => {
    mockDb.getFocusBlockById.mockResolvedValue(reviewingBlock)
    mockDb.completeWorkReview.mockRejectedValue(new Error('simulated transaction rollback'))

    const response = await request(app)
      .post(`/api/work/focus-blocks/${BLOCK_ID}/review`)
      .set('Authorization', TOKEN)
      .send(body)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Work write failed' })
    expect(mockDb.createWorkSession).not.toHaveBeenCalled()
    expect(mockDb.updateTask).not.toHaveBeenCalled()
    expect(mockDb.updateProject).not.toHaveBeenCalled()
  })

  it('records standalone historical Work separately from reviewed blocks', async () => {
    mockDb.createWorkSession.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888', user_id: USER_ID,
      project_id: null, focus_block_id: null, review_id: null, task_ids: [],
      standalone_title: 'Prepare release notes', standalone_context: 'One-off release work',
      planned_minutes: null, actual_minutes: 25, minutes: 25, outcome: 'Release notes drafted',
      evidence: 'Draft saved', attention: 'Focused', blocker_info: null, drift_info: null,
      next_step: 'Ask for review', occurred_at: '2026-08-03T11:00:00.000Z',
      started_at: null, ended_at: null,
    })

    const response = await request(app)
      .post('/api/work/sessions')
      .set('Authorization', TOKEN)
      .send({
        projectId: null,
        taskIds: [],
        standaloneTitle: 'Prepare release notes',
        standaloneContext: 'One-off release work',
        actualMinutes: 25,
        outcome: 'Release notes drafted',
        evidence: 'Draft saved',
        attention: 'Focused',
        nextStep: 'Ask for review',
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual(expect.objectContaining({
      projectId: null,
      focusBlockId: null,
      standaloneTitle: 'Prepare release notes',
      actualMinutes: 25,
    }))
    expect(mockDb.completeWorkReview).not.toHaveBeenCalled()
  })
})

describe('Work ownership scoping', () => {
  it('scopes Project Tasks and Work sessions by user_id as well as project_id', async () => {
    mockDb.getProjectById.mockResolvedValue(projectRow)
    mockDb.getTasksByProjectId.mockResolvedValue([])
    mockDb.getFocusBlocksByProjectId.mockResolvedValue([])
    mockDb.getWorkSessionsByProjectId.mockResolvedValue([])
    mockDb.getWorkReviewsByIds.mockResolvedValue([])

    const response = await request(app)
      .get(`/api/work/scope?projectId=${PROJECT_ID}`)
      .set('Authorization', TOKEN)

    expect(response.status).toBe(200)
    expect(mockDb.getTasksByProjectId).toHaveBeenCalledWith(USER_ID, PROJECT_ID)
    expect(mockDb.getFocusBlocksByProjectId).toHaveBeenCalledWith(USER_ID, PROJECT_ID)
    expect(mockDb.getWorkSessionsByProjectId).toHaveBeenCalledWith(USER_ID, PROJECT_ID)
  })

  it('reloads an active Focus block from persisted started_at', async () => {
    mockDb.getProjectById.mockResolvedValue(projectRow)
    mockDb.getTasksByProjectId.mockResolvedValue([taskRow])
    mockDb.getFocusBlocksByProjectId.mockResolvedValue([{
      ...focusBlockRow,
      status: 'active',
      started_at: '2026-08-03T09:00:00.000Z',
    }])
    mockDb.getWorkSessionsByProjectId.mockResolvedValue([])
    mockDb.getWorkReviewsByIds.mockResolvedValue([])

    const response = await request(app)
      .get(`/api/work/scope?projectId=${PROJECT_ID}`)
      .set('Authorization', TOKEN)

    expect(response.status).toBe(200)
    expect(response.body.focusBlocks[0]).toEqual(expect.objectContaining({
      id: BLOCK_ID,
      status: 'active',
      startedAt: '2026-08-03T09:00:00.000Z',
    }))
  })

  it('loads standalone Focus blocks and Work sessions without a Project', async () => {
    mockDb.getStandaloneFocusBlocks.mockResolvedValue([{
      ...focusBlockRow,
      project_id: null,
      task_ids: [],
      standalone_title: 'Prepare launch notes',
    }])
    mockDb.getStandaloneWorkSessions.mockResolvedValue([{
      id: '88888888-8888-4888-8888-888888888888', user_id: USER_ID,
      project_id: null, focus_block_id: null, review_id: null, task_ids: [],
      standalone_title: 'Earlier launch notes', standalone_context: 'Historical context',
      planned_minutes: null, actual_minutes: 20, minutes: 20, outcome: 'Notes drafted',
      evidence: null, attention: 'Focused', blocker_info: null, drift_info: null,
      next_step: null, occurred_at: '2026-08-02T09:00:00.000Z', started_at: null, ended_at: null,
    }])
    mockDb.getWorkReviewsByIds.mockResolvedValue([])

    const response = await request(app).get('/api/work/scope').set('Authorization', TOKEN)
    expect(response.status).toBe(200)
    expect(response.body.project).toBeNull()
    expect(response.body.focusBlocks[0].standaloneTitle).toBe('Prepare launch notes')
    expect(response.body.sessions[0]).toEqual(expect.objectContaining({ projectId: null, actualMinutes: 20 }))
  })

  it('does not view, update, or delete another user\'s Work records', async () => {
    const otherUser = '99999999-9999-4999-8999-999999999999'
    mockDb.getProjectById.mockResolvedValue({ ...projectRow, user_id: otherUser })

    const view = await request(app)
      .get(`/api/work/scope?projectId=${PROJECT_ID}`)
      .set('Authorization', TOKEN)
    const update = await request(app)
      .patch(`/api/work/projects/${PROJECT_ID}/tasks/${TASK_ID}`)
      .set('Authorization', TOKEN)
      .send({ title: 'Hacked' })
    const remove = await request(app)
      .delete(`/api/work/projects/${PROJECT_ID}/tasks/${TASK_ID}`)
      .set('Authorization', TOKEN)

    expect(view.status).toBe(403)
    expect(update.status).toBe(403)
    expect(remove.status).toBe(403)
    expect(mockDb.updateTask).not.toHaveBeenCalled()
    expect(mockDb.softDeleteTask).not.toHaveBeenCalled()
  })
})

describe('Work Project API', () => {
  const fullProjectRow = {
    ...projectRow,
    status: 'Active',
    target: 'Ship InvoiceFlow',
    milestone: 'Production login works',
    definition_of_done: 'Review-ready build is uploaded',
    deadline: '2026-08-08',
    context: {
      summary: 'Authentication is the current boundary.',
      blockers: ['Missing environment variable'],
      constraints: ['No new dependencies'],
      nonGoals: ['Visual polish'],
      decisions: ['Use the current auth provider'],
      links: ['https://example.com/runbook'],
      nextStep: 'Add the production environment variable',
    },
    created_at: '2026-08-03T07:00:00.000Z',
  }

  it('creates, fully edits, archives, restores, and safely deletes a Project', async () => {
    mockDb.createProject.mockResolvedValue({ ...fullProjectRow, status: 'Planned' })
    mockDb.getProjectById.mockResolvedValue(fullProjectRow)
    mockDb.updateProject
      .mockResolvedValueOnce(fullProjectRow)
      .mockResolvedValueOnce({ ...fullProjectRow, is_archived: true })
      .mockResolvedValueOnce({ ...fullProjectRow, is_archived: false })
    mockDb.deleteWorkProjectSafely.mockResolvedValue({ deleted: true, projectId: PROJECT_ID })

    const create = await request(app)
      .post('/api/work/projects')
      .set('Authorization', TOKEN)
      .send({ name: 'InvoiceFlow', target: 'Ship InvoiceFlow' })
    expect(create.status).toBe(201)

    const edit = await request(app)
      .patch(`/api/work/projects/${PROJECT_ID}`)
      .set('Authorization', TOKEN)
      .send({
        name: 'InvoiceFlow',
        status: 'Active',
        target: fullProjectRow.target,
        milestone: fullProjectRow.milestone,
        definitionOfDone: fullProjectRow.definition_of_done,
        deadline: fullProjectRow.deadline,
        context: fullProjectRow.context,
      })
    expect(edit.status).toBe(200)
    expect(edit.body).toEqual(expect.objectContaining({
      name: 'InvoiceFlow',
      status: 'Active',
      definitionOfDone: fullProjectRow.definition_of_done,
      context: fullProjectRow.context,
    }))

    const archive = await request(app)
      .patch(`/api/work/projects/${PROJECT_ID}/archive`)
      .set('Authorization', TOKEN)
      .send({ archived: true })
    const restore = await request(app)
      .patch(`/api/work/projects/${PROJECT_ID}/archive`)
      .set('Authorization', TOKEN)
      .send({ archived: false })
    expect(archive.body.isArchived).toBe(true)
    expect(restore.body.isArchived).toBe(false)

    const remove = await request(app)
      .delete(`/api/work/projects/${PROJECT_ID}`)
      .set('Authorization', TOKEN)
    expect(remove.status).toBe(204)
    expect(mockDb.deleteWorkProjectSafely).toHaveBeenCalledWith(USER_ID, PROJECT_ID)
  })
})

describe('Work Project Task API', () => {
  it('edits alignment and supports every explicit Task state transition', async () => {
    let current = { ...taskRow, target_relation: 'Unblocking' }
    mockDb.getProjectById.mockResolvedValue(projectRow)
    mockDb.getTaskById.mockImplementation(async () => current)
    mockDb.createTask.mockResolvedValue(current)
    mockDb.updateTask.mockImplementation(async (_id, updates: any) => {
      current = { ...current, ...updates }
      return current
    })
    mockDb.softDeleteTask.mockResolvedValue(undefined)

    const created = await request(app)
      .post(`/api/work/projects/${PROJECT_ID}/tasks`)
      .set('Authorization', TOKEN)
      .send({ title: current.title, relation: 'Unblocking' })
    expect(created.status).toBe(201)
    expect(created.body.relation).toBe('Unblocking')

    const edited = await request(app)
      .patch(`/api/work/projects/${PROJECT_ID}/tasks/${TASK_ID}`)
      .set('Authorization', TOKEN)
      .send({ title: 'Deploy the production environment variable', relation: 'Direct progress' })
    expect(edited.body).toEqual(expect.objectContaining({
      title: 'Deploy the production environment variable',
      relation: 'Direct progress',
    }))

    for (const [status, expected] of [
      ['completed', 'completed'],
      ['open', 'open'],
      ['deferred', 'deferred'],
      ['open', 'open'],
    ] as const) {
      const response = await request(app)
        .patch(`/api/work/projects/${PROJECT_ID}/tasks/${TASK_ID}`)
        .set('Authorization', TOKEN)
        .send({ status })
      expect(response.status).toBe(200)
      expect(response.body.status).toBe(expected)
    }

    const remove = await request(app)
      .delete(`/api/work/projects/${PROJECT_ID}/tasks/${TASK_ID}`)
      .set('Authorization', TOKEN)
    expect(remove.status).toBe(204)
    expect(mockDb.softDeleteTask).toHaveBeenCalledWith(TASK_ID)
  })
})
