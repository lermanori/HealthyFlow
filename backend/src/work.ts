import { v4 as uuidv4 } from 'uuid'
import { db } from './supabase-client'
import {
  CompleteWorkReviewInput,
  CreateFocusBlockInput,
  CreateTaskRecordInput,
  CreateWorkProjectInput,
  DayFocusBlock,
  DayFocusBlockProjectSchema,
  EMPTY_PROJECT_CONTEXT,
  FocusBlock,
  FocusBlockTransitionInput,
  ProjectContext,
  ProjectContextSchema,
  ProjectDetailsInput,
  ProjectStatus,
  ProjectStatusSchema,
  RecordWorkSessionInput,
  ReviewCompletion,
  ReviewUpdatesSchema,
  TargetRelationSchema,
  TaskRecord,
  UpdateTaskRecordInput,
  WorkProject,
  WorkProjectSummary,
  WorkReview,
  WorkScope,
  WorkSession,
} from './work-contracts'

const DEFAULT_PROJECT_COLOR = '#a9c7b6'

const fail = (message: string, status: number) => Object.assign(new Error(message), { status })

function readContext(value: unknown): ProjectContext {
  const parsed = ProjectContextSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : EMPTY_PROJECT_CONTEXT
}

function readStatus(value: unknown): ProjectStatus {
  const parsed = ProjectStatusSchema.safeParse(value)
  return parsed.success ? parsed.data : 'Planned'
}

function toProject(row: any): WorkProject {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isArchived: Boolean(row.is_archived),
    status: readStatus(row.status),
    target: row.target ?? null,
    milestone: row.milestone ?? null,
    definitionOfDone: row.definition_of_done ?? null,
    deadline: row.deadline ?? null,
    context: readContext(row.context),
    createdAt: row.created_at ?? null,
  }
}

function toTaskRecord(row: any): TaskRecord {
  const relation = TargetRelationSchema.safeParse(row.target_relation)
  return {
    id: row.id,
    title: row.title,
    status: row.completed ? 'completed' : row.deferred_at ? 'deferred' : 'open',
    relation: relation.success ? relation.data : null,
    scheduledDate: row.scheduled_date ?? null,
    duration: row.duration ?? null,
  }
}

function toFocusBlock(row: any): FocusBlock {
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    taskIds: row.task_ids ?? [],
    standaloneTitle: row.standalone_title ?? null,
    standaloneContext: row.standalone_context ?? null,
    scheduledDate: row.scheduled_date,
    startTime: String(row.start_time).slice(0, 5),
    plannedMinutes: row.planned_minutes,
    intendedOutcome: row.intended_outcome,
    intendedEvidence: row.intended_evidence,
    transitionMinutes: row.transition_minutes ?? null,
    breakMinutes: row.break_minutes ?? null,
    status: row.status,
    reviewTrigger: row.review_trigger ?? null,
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toReview(row: any): WorkReview {
  return {
    id: row.id,
    focusBlockId: row.focus_block_id,
    trigger: row.trigger,
    whatChanged: row.what_changed,
    evidenceProduced: row.evidence_produced,
    milestoneImpact: row.milestone_impact,
    whatGotInWay: row.what_got_in_way,
    unnecessaryWork: row.unnecessary_work,
    actualMinutes: row.actual_minutes,
    nextStep: row.next_step,
    attention: row.attention,
    confirmedUpdates: ReviewUpdatesSchema.parse(row.confirmed_updates ?? {}),
    createdAt: row.created_at,
  }
}

function toWorkSession(row: any, review: WorkReview | null = null): WorkSession {
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    focusBlockId: row.focus_block_id ?? null,
    taskIds: row.task_ids ?? (row.task_id ? [row.task_id] : []),
    standaloneTitle: row.standalone_title ?? null,
    standaloneContext: row.standalone_context ?? null,
    plannedMinutes: row.planned_minutes ?? null,
    actualMinutes: row.actual_minutes ?? row.minutes,
    outcome: row.outcome,
    evidence: row.evidence ?? null,
    attention: row.attention,
    blockerInfo: row.blocker_info ?? row.note ?? null,
    driftInfo: row.drift_info ?? null,
    nextStep: row.next_step ?? null,
    occurredAt: row.occurred_at,
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
    review,
  }
}

async function ownedProject(userId: string, projectId: string) {
  const row = await db.getProjectById(projectId)
  if (!row) throw fail('Project not found', 404)
  if (row.user_id !== userId) throw fail('Forbidden', 403)
  return row
}

async function ownedTask(userId: string, taskId: string) {
  let row: any
  try {
    row = await db.getTaskById(taskId)
  } catch {
    throw fail('Task not found', 404)
  }
  if (!row || row.deleted_at) throw fail('Task not found', 404)
  if (row.user_id !== userId) throw fail('Forbidden', 403)
  return row
}

async function ownedTaskInProject(userId: string, projectId: string, taskId: string) {
  const row = await ownedTask(userId, taskId)
  if (row.project_id !== projectId) throw fail('Task does not belong to this Project', 404)
  return row
}

async function ownedFocusBlock(userId: string, focusBlockId: string) {
  const row = await db.getFocusBlockById(userId, focusBlockId)
  if (!row) throw fail('Focus block not found', 404)
  return row
}

async function validateTaskReferences(userId: string, projectId: string | null, taskIds: string[]) {
  await Promise.all(taskIds.map(async taskId => {
    const task = await ownedTask(userId, taskId)
    if (projectId && task.project_id !== projectId) {
      throw fail('Every referenced Task must belong to the Focus block Project', 400)
    }
    if (!projectId && task.project_id) {
      throw fail('Standalone Work can only reference unassigned Tasks', 400)
    }
  }))
}

async function sessionsWithReviews(userId: string, rows: any[]): Promise<WorkSession[]> {
  const reviewIds = rows.map(row => row.review_id).filter(Boolean)
  const reviewRows = await db.getWorkReviewsByIds(userId, reviewIds)
  const reviews = new Map(reviewRows.map((row: any) => [row.id, toReview(row)]))
  return rows.map(row => toWorkSession(row, row.review_id ? reviews.get(row.review_id) ?? null : null))
}

async function assembleScope(userId: string, projectId: string | null): Promise<WorkScope> {
  if (projectId) {
    const projectRow = await ownedProject(userId, projectId)
    const [taskRows, blockRows, sessionRows] = await Promise.all([
      db.getTasksByProjectId(userId, projectId),
      db.getFocusBlocksByProjectId(userId, projectId),
      db.getWorkSessionsByProjectId(userId, projectId),
    ])
    return {
      project: toProject(projectRow),
      tasks: taskRows.map(toTaskRecord),
      focusBlocks: blockRows.map(toFocusBlock),
      sessions: await sessionsWithReviews(userId, sessionRows),
    }
  }

  const [blockRows, sessionRows] = await Promise.all([
    db.getStandaloneFocusBlocks(userId),
    db.getStandaloneWorkSessions(userId),
  ])
  return {
    project: null,
    tasks: [],
    focusBlocks: blockRows.map(toFocusBlock),
    sessions: await sessionsWithReviews(userId, sessionRows),
  }
}

export const Work = {
  async listProjects(userId: string): Promise<WorkProjectSummary[]> {
    const [rows, openCounts] = await Promise.all([
      db.getProjectsByUserId(userId),
      db.getOpenTaskCountsByUserId(userId),
    ])
    return (rows ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      status: readStatus(row.status),
      target: row.target ?? null,
      deadline: row.deadline ?? null,
      isArchived: Boolean(row.is_archived),
      openTaskCount: openCounts.get(row.id) ?? 0,
    }))
  },

  getScope(userId: string, projectId: string | null): Promise<WorkScope> {
    return assembleScope(userId, projectId)
  },

  /**
   * Every Focus block scheduled for one day, across all Projects, denormalised
   * for Today. Three queries regardless of how many blocks the day holds.
   *
   * A referenced Task that has since been deleted is simply absent from `tasks`
   * — the block is still returned rather than hidden or its Task invented.
   */
  async listDayFocusBlocks(userId: string, date: string): Promise<DayFocusBlock[]> {
    const blockRows = await db.getFocusBlocksByDate(userId, date)
    if (blockRows.length === 0) return []

    const taskIds = [...new Set(blockRows.flatMap((row: any) => row.task_ids ?? []))] as string[]
    const [taskRows, projectRows] = await Promise.all([
      db.getTasksByIds(userId, taskIds),
      db.getProjectsByUserId(userId),
    ])

    const tasksById = new Map(taskRows.map((row: any) => [row.id, toTaskRecord(row)]))
    const projectsById = new Map(
      (projectRows ?? []).map((row: any) => [row.id, DayFocusBlockProjectSchema.parse(toProject(row))]),
    )

    return blockRows.map((row: any) => {
      const block = toFocusBlock(row)
      return {
        ...block,
        slot: `${block.startTime.slice(0, 2)}:00`,
        project: block.projectId ? projectsById.get(block.projectId) ?? null : null,
        tasks: block.taskIds.map(taskId => tasksById.get(taskId)).filter((task): task is TaskRecord => Boolean(task)),
      }
    })
  },

  async createProject(userId: string, input: CreateWorkProjectInput): Promise<WorkProject> {
    const row = await db.createProject({
      id: uuidv4(),
      user_id: userId,
      name: input.name,
      description: null,
      color: input.color ?? DEFAULT_PROJECT_COLOR,
      is_archived: false,
      status: input.status ?? 'Planned',
      target: input.target ?? null,
      milestone: input.milestone ?? null,
      definition_of_done: input.definitionOfDone ?? null,
      deadline: input.deadline ?? null,
      context: ProjectContextSchema.parse(input.context ?? {}),
    })
    return toProject(row)
  },

  async updateProject(userId: string, projectId: string, input: ProjectDetailsInput): Promise<WorkProject> {
    const existing = await ownedProject(userId, projectId)
    const updates: Record<string, unknown> = {}
    if (input.name !== undefined) updates.name = input.name
    if (input.color !== undefined) updates.color = input.color
    if (input.target !== undefined) updates.target = input.target
    if (input.milestone !== undefined) updates.milestone = input.milestone
    if (input.definitionOfDone !== undefined) updates.definition_of_done = input.definitionOfDone
    if (input.deadline !== undefined) updates.deadline = input.deadline
    if (input.status !== undefined) updates.status = input.status
    if (input.context !== undefined) {
      updates.context = ProjectContextSchema.parse({ ...readContext(existing.context), ...input.context })
    }
    return toProject(await db.updateProject(projectId, updates))
  },

  async archiveProject(userId: string, projectId: string, archived: boolean): Promise<WorkProject> {
    await ownedProject(userId, projectId)
    return toProject(await db.updateProject(projectId, { is_archived: archived }))
  },

  async deleteProject(userId: string, projectId: string): Promise<void> {
    await ownedProject(userId, projectId)
    try {
      await db.deleteWorkProjectSafely(userId, projectId)
    } catch (error: any) {
      if (String(error?.message).includes('active Focus block')) {
        throw fail('Cancel or complete the active Focus block before deleting this Project', 409)
      }
      throw error
    }
  },

  async addTask(userId: string, projectId: string, input: CreateTaskRecordInput): Promise<TaskRecord> {
    await ownedProject(userId, projectId)
    const row = await db.createTask({
      id: uuidv4(),
      user_id: userId,
      title: input.title,
      type: 'task',
      category: 'work',
      project_id: projectId,
      target_relation: input.relation,
      duration: input.duration ?? null,
      scheduled_date: input.scheduledDate ?? null,
      repeat_type: 'none',
      completed: false,
    })
    return toTaskRecord(row)
  },

  async updateTask(userId: string, projectId: string, taskId: string, input: UpdateTaskRecordInput): Promise<TaskRecord> {
    await ownedProject(userId, projectId)
    await ownedTaskInProject(userId, projectId, taskId)
    const updates: Record<string, unknown> = {}
    if (input.title !== undefined) updates.title = input.title
    if (input.relation !== undefined) updates.target_relation = input.relation
    if (input.status !== undefined) {
      updates.completed = input.status === 'completed'
      updates.completed_at = input.status === 'completed' ? new Date().toISOString() : null
      updates.deferred_at = input.status === 'deferred' ? new Date().toISOString() : null
    }
    return toTaskRecord(await db.updateTask(taskId, updates))
  },

  async removeTask(userId: string, projectId: string, taskId: string): Promise<void> {
    await ownedProject(userId, projectId)
    await ownedTaskInProject(userId, projectId, taskId)
    await db.softDeleteTask(taskId)
  },

  async createFocusBlock(userId: string, input: CreateFocusBlockInput): Promise<FocusBlock> {
    if (input.projectId) await ownedProject(userId, input.projectId)
    await validateTaskReferences(userId, input.projectId, input.taskIds)
    const row = await db.createFocusBlock({
      id: uuidv4(),
      user_id: userId,
      project_id: input.projectId,
      task_ids: input.taskIds,
      standalone_title: input.projectId ? null : input.standaloneTitle,
      standalone_context: input.projectId ? null : input.standaloneContext ?? null,
      scheduled_date: input.scheduledDate,
      start_time: input.startTime,
      planned_minutes: input.plannedMinutes,
      intended_outcome: input.intendedOutcome,
      intended_evidence: input.intendedEvidence,
      transition_minutes: input.transitionMinutes ?? null,
      break_minutes: input.breakMinutes ?? null,
      status: 'planned',
    })
    return toFocusBlock(row)
  },

  /**
   * Remove a Focus block that never became work.
   *
   * A block that produced a Work session is history, not a plan — the session
   * is the durable record and the database refuses the delete anyway
   * (work_sessions.focus_block_id is ON DELETE RESTRICT). An in-flight block is
   * refused too: `cancel` is the honest verb for abandoning work you started.
   */
  async deleteFocusBlock(userId: string, focusBlockId: string): Promise<void> {
    const block = await ownedFocusBlock(userId, focusBlockId)
    if (block.status === 'active' || block.status === 'reviewing') {
      throw fail(`Cancel the ${block.status} Focus block before deleting it`, 409)
    }
    if (block.status === 'completed') {
      throw fail('A completed Focus block is kept as the Work session it produced', 409)
    }
    await db.deleteFocusBlock(userId, focusBlockId)
  },

  async transitionFocusBlock(
    userId: string,
    focusBlockId: string,
    input: FocusBlockTransitionInput,
  ): Promise<FocusBlock> {
    const block = await ownedFocusBlock(userId, focusBlockId)
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {}

    if (input.action === 'start' && block.status === 'planned') {
      Object.assign(updates, { status: 'active', started_at: now, ended_at: null, review_trigger: null })
    } else if (['finish', 'blocked', 'drift'].includes(input.action) && block.status === 'active') {
      const trigger = input.action === 'finish' ? 'finished' : input.action === 'blocked' ? 'blocked' : 'drifted'
      Object.assign(updates, { status: 'reviewing', review_trigger: trigger, ended_at: now })
    } else if (input.action === 'continue' && block.status === 'reviewing') {
      Object.assign(updates, { status: 'active', review_trigger: null, ended_at: null })
    } else if (input.action === 'cancel' && ['planned', 'active', 'reviewing'].includes(block.status)) {
      Object.assign(updates, { status: 'canceled', ended_at: block.started_at ? now : null })
    } else {
      const article = /^[aeiou]/.test(block.status) ? 'an' : 'a'
      throw fail(`Cannot ${input.action} ${article} ${block.status} Focus block`, 409)
    }

    return toFocusBlock(await db.updateFocusBlock(userId, focusBlockId, updates))
  },

  async completeReview(
    userId: string,
    focusBlockId: string,
    input: CompleteWorkReviewInput,
  ): Promise<ReviewCompletion> {
    const block = await ownedFocusBlock(userId, focusBlockId)
    if (block.status !== 'reviewing' || !block.review_trigger) {
      throw fail('Focus block must be reviewing before its review can be completed', 409)
    }
    const referenced = new Set<string>(block.task_ids ?? [])
    if (input.updates.tasks.some(update => !referenced.has(update.taskId))) {
      throw fail('Review updates may only change referenced Tasks', 400)
    }
    if (!block.project_id && Object.keys(input.updates.project).length > 0) {
      throw fail('Standalone Work has no Project to update', 400)
    }

    const result = await db.completeWorkReview({
      userId,
      focusBlockId,
      review: {
        whatChanged: input.whatChanged,
        evidenceProduced: input.evidenceProduced,
        milestoneImpact: input.milestoneImpact,
        whatGotInWay: input.whatGotInWay,
        unnecessaryWork: input.unnecessaryWork,
        actualMinutes: input.actualMinutes,
        nextStep: input.nextStep,
        attention: input.attention,
      },
      updates: input.updates,
    })

    const [focusRow, sessionRow, reviewRows] = await Promise.all([
      db.getFocusBlockById(userId, result.focusBlockId),
      db.getWorkSessionById(userId, result.sessionId),
      db.getWorkReviewsByIds(userId, [result.reviewId]),
    ])
    if (!focusRow || !sessionRow || reviewRows.length !== 1) {
      throw fail('Completed review could not be reloaded', 500)
    }
    const review = toReview(reviewRows[0])
    return { focusBlock: toFocusBlock(focusRow), review, session: toWorkSession(sessionRow, review) }
  },

  async recordSession(userId: string, input: RecordWorkSessionInput): Promise<WorkSession> {
    if (input.projectId) await ownedProject(userId, input.projectId)
    await validateTaskReferences(userId, input.projectId, input.taskIds)
    const row = await db.createWorkSession({
      user_id: userId,
      project_id: input.projectId,
      focus_block_id: null,
      review_id: null,
      task_ids: input.taskIds,
      standalone_title: input.projectId ? null : input.standaloneTitle,
      standalone_context: input.projectId ? null : input.standaloneContext ?? null,
      planned_minutes: input.plannedMinutes ?? null,
      actual_minutes: input.actualMinutes,
      minutes: input.actualMinutes,
      outcome: input.outcome,
      evidence: input.evidence ?? null,
      attention: input.attention,
      blocker_info: input.blockerInfo ?? null,
      drift_info: input.driftInfo ?? null,
      next_step: input.nextStep ?? null,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      started_at: input.startedAt ?? null,
      ended_at: input.endedAt ?? null,
    })
    return toWorkSession(row)
  },

  async removeSession(userId: string, sessionId: string): Promise<void> {
    const session = await db.getWorkSessionById(userId, sessionId)
    if (!session) throw fail('Work session not found', 404)
    await db.deleteWorkSession(userId, sessionId)
  },
}

export default Work
