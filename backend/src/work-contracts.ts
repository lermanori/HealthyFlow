import { z } from 'zod'

// Zod owns every Work shape shared by routes, services, persistence mapping,
// and the frontend. The module deliberately models plans, reviews, and actual
// Work sessions as separate records.

const id = z.string().uuid()
const line = z.string().trim().min(1).max(280)
const optionalText = (max: number) => z.string().trim().max(max).nullable()
const date = z.string().date()
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm')

export const TargetRelationSchema = z.enum([
  'Direct progress',
  'Unblocking',
  'Maintenance',
  'Optional polish',
  'Unrelated',
])
export type TargetRelation = z.infer<typeof TargetRelationSchema>

export const ProjectStatusSchema = z.enum(['Planned', 'Active', 'Paused', 'Done'])
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>

export const AttentionSchema = z.enum(['Focused', 'Mixed', 'Drifted'])
export type Attention = z.infer<typeof AttentionSchema>

export const TaskRecordStatusSchema = z.enum(['open', 'completed', 'deferred'])
export type TaskRecordStatus = z.infer<typeof TaskRecordStatusSchema>

export const FocusBlockStatusSchema = z.enum([
  'planned',
  'active',
  'reviewing',
  'completed',
  'canceled',
])
export type FocusBlockStatus = z.infer<typeof FocusBlockStatusSchema>

export const FocusBlockReviewTriggerSchema = z.enum(['finished', 'blocked', 'drifted'])
export type FocusBlockReviewTrigger = z.infer<typeof FocusBlockReviewTriggerSchema>

export const MilestoneImpactSchema = z.enum(['advanced', 'unblocked', 'both', 'neither'])
export type MilestoneImpact = z.infer<typeof MilestoneImpactSchema>

export const ProjectContextSchema = z.object({
  summary: z.string().trim().max(2000).default(''),
  blockers: z.array(line).max(20).default([]),
  constraints: z.array(line).max(20).default([]),
  nonGoals: z.array(line).max(20).default([]),
  decisions: z.array(line).max(20).default([]),
  links: z.array(line).max(20).default([]),
  nextStep: z.string().trim().max(280).default(''),
})
export type ProjectContext = z.infer<typeof ProjectContextSchema>

export const EMPTY_PROJECT_CONTEXT: ProjectContext = ProjectContextSchema.parse({})

export const WorkProjectSchema = z.object({
  id,
  name: z.string(),
  color: z.string(),
  isArchived: z.boolean(),
  status: ProjectStatusSchema,
  target: z.string().nullable(),
  milestone: z.string().nullable(),
  definitionOfDone: z.string().nullable(),
  deadline: z.string().nullable(),
  context: ProjectContextSchema,
  createdAt: z.string().nullable(),
})
export type WorkProject = z.infer<typeof WorkProjectSchema>

export const WorkProjectSummarySchema = WorkProjectSchema.pick({
  id: true,
  name: true,
  color: true,
  isArchived: true,
  status: true,
  target: true,
  deadline: true,
}).extend({
  openTaskCount: z.number().int().nonnegative(),
})
export type WorkProjectSummary = z.infer<typeof WorkProjectSummarySchema>

export const TaskRecordSchema = z.object({
  id,
  title: z.string(),
  status: TaskRecordStatusSchema,
  relation: TargetRelationSchema.nullable(),
  scheduledDate: z.string().nullable(),
  duration: z.number().nullable(),
})
export type TaskRecord = z.infer<typeof TaskRecordSchema>

export const FocusBlockSchema = z.object({
  id,
  projectId: id.nullable(),
  taskIds: z.array(id),
  standaloneTitle: z.string().nullable(),
  standaloneContext: z.string().nullable(),
  scheduledDate: date,
  startTime: time,
  plannedMinutes: z.number().int().positive(),
  intendedOutcome: z.string(),
  intendedEvidence: z.string(),
  transitionMinutes: z.number().int().nonnegative().nullable(),
  breakMinutes: z.number().int().nonnegative().nullable(),
  status: FocusBlockStatusSchema,
  reviewTrigger: FocusBlockReviewTriggerSchema.nullable(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type FocusBlock = z.infer<typeof FocusBlockSchema>

// A Focus block as Today needs it: the block plus just enough denormalised
// Project and Task context to render and review a row without a second request.
// `slot` is resolved here rather than in the browser because every wall-clock
// value on Today is resolved server-side, where the user's timezone is known.
export const DayFocusBlockProjectSchema = WorkProjectSchema.pick({
  id: true,
  name: true,
  color: true,
  target: true,
  milestone: true,
})
export type DayFocusBlockProject = z.infer<typeof DayFocusBlockProjectSchema>

export const DayFocusBlockSchema = FocusBlockSchema.extend({
  slot: z.string().regex(/^([01]\d|2[0-3]):00$/, 'Expected an hour slot'),
  project: DayFocusBlockProjectSchema.nullable(),
  tasks: z.array(TaskRecordSchema),
})
export type DayFocusBlock = z.infer<typeof DayFocusBlockSchema>

export const TaskReviewActionSchema = z.enum(['complete', 'reopen', 'defer', 'reactivate'])
export type TaskReviewAction = z.infer<typeof TaskReviewActionSchema>

export const ReviewUpdatesSchema = z.object({
  tasks: z.array(z.object({ taskId: id, action: TaskReviewActionSchema })).max(20).default([]),
  project: z.object({
    addBlocker: line.optional(),
    nextStep: z.string().trim().max(280).optional(),
    milestone: z.string().trim().max(280).optional(),
  }).default({}),
})
export type ReviewUpdates = z.infer<typeof ReviewUpdatesSchema>

export const WorkReviewSchema = z.object({
  id,
  focusBlockId: id,
  trigger: FocusBlockReviewTriggerSchema,
  whatChanged: z.string(),
  evidenceProduced: z.string(),
  milestoneImpact: MilestoneImpactSchema,
  whatGotInWay: z.string(),
  unnecessaryWork: z.string(),
  actualMinutes: z.number().int().nonnegative(),
  nextStep: z.string(),
  attention: AttentionSchema,
  confirmedUpdates: ReviewUpdatesSchema,
  createdAt: z.string(),
})
export type WorkReview = z.infer<typeof WorkReviewSchema>

export const WorkSessionSchema = z.object({
  id,
  projectId: id.nullable(),
  focusBlockId: id.nullable(),
  taskIds: z.array(id),
  standaloneTitle: z.string().nullable(),
  standaloneContext: z.string().nullable(),
  plannedMinutes: z.number().int().positive().nullable(),
  actualMinutes: z.number().int().nonnegative(),
  outcome: z.string(),
  evidence: z.string().nullable(),
  attention: AttentionSchema,
  blockerInfo: z.string().nullable(),
  driftInfo: z.string().nullable(),
  nextStep: z.string().nullable(),
  occurredAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  review: WorkReviewSchema.nullable(),
})
export type WorkSession = z.infer<typeof WorkSessionSchema>

export const WorkScopeSchema = z.object({
  project: WorkProjectSchema.nullable(),
  tasks: z.array(TaskRecordSchema),
  focusBlocks: z.array(FocusBlockSchema),
  sessions: z.array(WorkSessionSchema),
})
export type WorkScope = z.infer<typeof WorkScopeSchema>

// ---- Route inputs ----

export const CreateWorkProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().min(1).max(32).optional(),
  target: optionalText(280).optional(),
  milestone: optionalText(280).optional(),
  definitionOfDone: optionalText(280).optional(),
  deadline: date.nullable().optional(),
  status: ProjectStatusSchema.optional(),
  context: ProjectContextSchema.partial().optional(),
})
export type CreateWorkProjectInput = z.infer<typeof CreateWorkProjectInputSchema>

export const ProjectDetailsInputSchema = CreateWorkProjectInputSchema.partial().refine(
  value => Object.keys(value).length > 0,
  'No Project changes supplied',
)
export type ProjectDetailsInput = z.infer<typeof ProjectDetailsInputSchema>

export const ArchiveProjectInputSchema = z.object({ archived: z.boolean() })
export type ArchiveProjectInput = z.infer<typeof ArchiveProjectInputSchema>

export const CreateTaskRecordInputSchema = z.object({
  title: z.string().trim().min(1).max(280),
  relation: TargetRelationSchema,
  duration: z.number().int().positive().max(1440).nullable().optional(),
  scheduledDate: date.nullable().optional(),
})
export type CreateTaskRecordInput = z.infer<typeof CreateTaskRecordInputSchema>

export const UpdateTaskRecordInputSchema = z.object({
  title: z.string().trim().min(1).max(280).optional(),
  relation: TargetRelationSchema.optional(),
  status: TaskRecordStatusSchema.optional(),
}).refine(value => Object.keys(value).length > 0, 'No Task changes supplied')
export type UpdateTaskRecordInput = z.infer<typeof UpdateTaskRecordInputSchema>

export const CreateFocusBlockInputSchema = z.object({
  projectId: id.nullable().default(null),
  taskIds: z.array(id).max(20).default([]),
  standaloneTitle: optionalText(120).optional(),
  standaloneContext: optionalText(2000).optional(),
  scheduledDate: date,
  startTime: time,
  plannedMinutes: z.number().int().positive().max(1440),
  intendedOutcome: z.string().trim().min(1).max(500),
  intendedEvidence: z.string().trim().min(1).max(500),
  transitionMinutes: z.number().int().min(0).max(180).nullable().optional(),
  breakMinutes: z.number().int().min(0).max(180).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.projectId && value.taskIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['taskIds'], message: 'A Project Focus block needs at least one Task' })
  }
  if (!value.projectId && !value.standaloneTitle?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['standaloneTitle'], message: 'Standalone Work needs a title' })
  }
})
export type CreateFocusBlockInput = z.infer<typeof CreateFocusBlockInputSchema>

export const FocusBlockTransitionInputSchema = z.object({
  action: z.enum(['start', 'finish', 'blocked', 'drift', 'continue', 'cancel']),
})
export type FocusBlockTransitionInput = z.infer<typeof FocusBlockTransitionInputSchema>

export const CompleteWorkReviewInputSchema = z.object({
  whatChanged: z.string().trim().min(1).max(2000),
  evidenceProduced: z.string().trim().max(2000).default(''),
  milestoneImpact: MilestoneImpactSchema,
  whatGotInWay: z.string().trim().max(2000).default(''),
  unnecessaryWork: z.string().trim().max(2000).default(''),
  actualMinutes: z.number().int().min(0).max(1440),
  nextStep: z.string().trim().min(1).max(280),
  attention: AttentionSchema,
  updates: ReviewUpdatesSchema.default({ tasks: [], project: {} }),
})
export type CompleteWorkReviewInput = z.infer<typeof CompleteWorkReviewInputSchema>

export const RecordWorkSessionInputSchema = z.object({
  projectId: id.nullable().default(null),
  taskIds: z.array(id).max(20).default([]),
  standaloneTitle: optionalText(120).optional(),
  standaloneContext: optionalText(2000).optional(),
  plannedMinutes: z.number().int().positive().max(1440).nullable().optional(),
  actualMinutes: z.number().int().min(0).max(1440),
  outcome: z.string().trim().min(1).max(2000),
  evidence: optionalText(2000).optional(),
  attention: AttentionSchema,
  blockerInfo: optionalText(2000).optional(),
  driftInfo: optionalText(2000).optional(),
  nextStep: optionalText(280).optional(),
  occurredAt: z.string().datetime().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  endedAt: z.string().datetime().nullable().optional(),
}).superRefine((value, ctx) => {
  if (!value.projectId && !value.standaloneTitle?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['standaloneTitle'], message: 'Standalone Work needs a title' })
  }
})
export type RecordWorkSessionInput = z.infer<typeof RecordWorkSessionInputSchema>

export const ReviewCompletionSchema = z.object({
  focusBlock: FocusBlockSchema,
  review: WorkReviewSchema,
  session: WorkSessionSchema,
})
export type ReviewCompletion = z.infer<typeof ReviewCompletionSchema>

const WorkContracts = {
  TargetRelationSchema,
  ProjectStatusSchema,
  AttentionSchema,
  TaskRecordStatusSchema,
  FocusBlockStatusSchema,
  FocusBlockReviewTriggerSchema,
  MilestoneImpactSchema,
  ProjectContextSchema,
  WorkProjectSchema,
  WorkProjectSummarySchema,
  TaskRecordSchema,
  FocusBlockSchema,
  DayFocusBlockProjectSchema,
  DayFocusBlockSchema,
  WorkReviewSchema,
  WorkSessionSchema,
  WorkScopeSchema,
  CreateWorkProjectInputSchema,
  ProjectDetailsInputSchema,
  ArchiveProjectInputSchema,
  CreateTaskRecordInputSchema,
  UpdateTaskRecordInputSchema,
  CreateFocusBlockInputSchema,
  FocusBlockTransitionInputSchema,
  CompleteWorkReviewInputSchema,
  RecordWorkSessionInputSchema,
  ReviewCompletionSchema,
}

export default WorkContracts
