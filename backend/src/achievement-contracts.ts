import { z } from 'zod'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const AchievementMetricTypeSchema = z.enum(['reps', 'weight', 'duration', 'distance', 'custom'])
export const AchievementBetterDirectionSchema = z.enum(['higher', 'lower'])

export const AchievementDefinitionCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80).nullable().optional(),
  metricType: AchievementMetricTypeSchema,
  unit: z.string().trim().min(1).max(32),
  betterDirection: AchievementBetterDirectionSchema,
  targetValue: z.number().positive().nullable().optional(),
})

export const AchievementDefinitionUpdateSchema = AchievementDefinitionCreateSchema.partial().extend({
  archived: z.boolean().optional(),
})

const AchievementEntryBaseSchema = z.object({
  date: z.string().regex(DATE_RE),
  value: z.number().positive(),
  supportingValue: z.number().positive().nullable().optional(),
  supportingUnit: z.string().trim().min(1).max(32).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})

export const AchievementEntryCreateSchema = AchievementEntryBaseSchema.refine(
  (data) => (data.supportingValue == null && data.supportingUnit == null) || (data.supportingValue != null && data.supportingUnit != null),
  { message: 'supportingValue and supportingUnit must be provided together' }
)

export const AchievementEntryUpdateSchema = AchievementEntryBaseSchema.partial().refine(
  (data) => {
    const hasValue = data.supportingValue !== undefined && data.supportingValue !== null
    const hasUnit = data.supportingUnit !== undefined && data.supportingUnit !== null
    return hasValue === hasUnit || (data.supportingValue === undefined && data.supportingUnit === undefined)
  },
  { message: 'supportingValue and supportingUnit must be provided together' }
)

export const AchievementListQuerySchema = z.object({
  includeArchived: z.coerce.boolean().default(false),
  entryLimit: z.coerce.number().int().min(1).max(100).default(30),
})

export const AchievementDefinitionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  metricType: AchievementMetricTypeSchema,
  unit: z.string(),
  betterDirection: AchievementBetterDirectionSchema,
  targetValue: z.number().positive().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const AchievementEntrySchema = z.object({
  id: z.string(),
  achievementId: z.string(),
  userId: z.string(),
  date: z.string().regex(DATE_RE),
  value: z.number().positive(),
  supportingValue: z.number().positive().nullable(),
  supportingUnit: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const AchievementSummarySchema = z.object({
  definition: AchievementDefinitionSchema,
  entries: z.array(AchievementEntrySchema),
  latest: AchievementEntrySchema.nullable(),
  previous: AchievementEntrySchema.nullable(),
  personalBest: AchievementEntrySchema.nullable(),
  trend: z.object({
    delta: z.number().nullable(),
    direction: z.enum(['none', 'up', 'down', 'flat']),
    isImprovement: z.boolean().nullable(),
  }),
  targetProgress: z.number().nullable(),
})

export type AchievementDefinitionCreate = z.infer<typeof AchievementDefinitionCreateSchema>
export type AchievementDefinitionUpdate = z.infer<typeof AchievementDefinitionUpdateSchema>
export type AchievementEntryCreate = z.infer<typeof AchievementEntryCreateSchema>
export type AchievementEntryUpdate = z.infer<typeof AchievementEntryUpdateSchema>
export type AchievementDirection = z.infer<typeof AchievementBetterDirectionSchema>
