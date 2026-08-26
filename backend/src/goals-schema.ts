import { z } from 'zod'

export const GoalModuleSchema = z.enum([
  'whole_day',
  'work',
  'tasks',
  'habits',
  'nutrition',
  'workouts',
  'progress',
])
export type GoalModule = z.infer<typeof GoalModuleSchema>

export const GOAL_MODULES: ReadonlyArray<{
  id: GoalModule
  label: string
  description: string
}> = [
  { id: 'whole_day', label: 'Whole day', description: 'Direction that spans more than one part of life.' },
  { id: 'work', label: 'Work', description: 'Direction shared across Projects; each Project still keeps its own target.' },
  { id: 'tasks', label: 'Items', description: 'What your one-shot Tasks should move toward.' },
  { id: 'habits', label: 'Habits', description: 'The longer direction behind repeated practice.' },
  { id: 'nutrition', label: 'Food', description: 'What eating and Calorie entries should support.' },
  { id: 'workouts', label: 'Training', description: 'What Workout sessions should build toward.' },
  { id: 'progress', label: 'Progress', description: 'What measurements and Achievement targets should clarify.' },
]

export const GoalContextTextSchema = z.string().trim().max(4000)
const StoredGoalDateTimeSchema = z.string().datetime({ offset: true })

export const GoalSchema = z.object({
  id: z.string().uuid(),
  module: GoalModuleSchema,
  statement: z.string().trim().min(1).max(500),
  context: GoalContextTextSchema.default(''),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
}).strict()
export type Goal = z.infer<typeof GoalSchema>

export const GoalCreateInputSchema = z.object({
  module: GoalModuleSchema,
  statement: z.string().trim().min(1).max(500),
  context: GoalContextTextSchema.optional(),
}).strict()
export type GoalCreateInput = z.infer<typeof GoalCreateInputSchema>

export const GoalUpdateInputSchema = z.object({
  module: GoalModuleSchema.optional(),
  statement: z.string().trim().min(1).max(500).optional(),
  context: GoalContextTextSchema.optional(),
  archived: z.boolean().optional(),
}).strict().refine(
  value => Object.values(value).some(candidate => candidate !== undefined),
  'A Goal update needs at least one change.',
)
export type GoalUpdateInput = z.infer<typeof GoalUpdateInputSchema>

export const GoalRowSchema = z.looseObject({
  id: z.string().uuid(),
  user_id: z.string().min(1),
  module: GoalModuleSchema,
  statement: z.string().trim().min(1).max(500),
  context: GoalContextTextSchema.default(''),
  created_at: StoredGoalDateTimeSchema,
  updated_at: StoredGoalDateTimeSchema,
  deleted_at: StoredGoalDateTimeSchema.nullable().default(null),
})
export type GoalRow = z.infer<typeof GoalRowSchema>

export function goalFromRow(value: unknown): Goal {
  const row = GoalRowSchema.parse(value)
  return GoalSchema.parse({
    id: row.id,
    module: row.module,
    statement: row.statement,
    context: row.context,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    archivedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
  })
}

export function goalModuleLabel(module: GoalModule) {
  return GOAL_MODULES.find((candidate) => candidate.id === module)?.label ?? module
}

export const GoalContextSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), records: z.array(GoalSchema).max(50) }).strict(),
  z.object({ status: z.literal('unavailable') }).strict(),
])
export type GoalContext = z.infer<typeof GoalContextSchema>

const GoalContracts = {
  GoalModuleSchema,
  GoalContextTextSchema,
  GoalSchema,
  GoalCreateInputSchema,
  GoalUpdateInputSchema,
  GoalRowSchema,
  GoalContextSchema,
  GOAL_MODULES,
  goalFromRow,
  goalModuleLabel,
}

export default GoalContracts
