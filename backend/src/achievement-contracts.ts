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

const numberOrNull = (value: unknown) => value == null ? null : Number(value)

/**
 * Row mappers that accept either shape.
 *
 * The server stores snake_case columns; a device stores the client shape it
 * already speaks (ADR-0011 and the Health-on-the-device design). Reading both
 * means one `summarizeAchievement` serves both sides — the same trick
 * `calorieRowToClient` and `weightRowToClient` already use.
 */
export const achievementDefinitionToClient = (row: any) => ({
  id: row.id,
  userId: row.user_id ?? row.userId,
  name: row.name,
  category: row.category ?? null,
  metricType: row.metric_type ?? row.metricType,
  unit: row.unit,
  betterDirection: row.better_direction ?? row.betterDirection,
  targetValue: numberOrNull(row.target_value ?? row.targetValue),
  archivedAt: row.archived_at ?? row.archivedAt ?? null,
  createdAt: row.created_at ?? row.createdAt,
  updatedAt: row.updated_at ?? row.updatedAt,
})

export const achievementEntryToClient = (row: any) => ({
  id: row.id,
  achievementId: row.achievement_id ?? row.achievementId,
  userId: row.user_id ?? row.userId,
  date: row.date,
  value: Number(row.value),
  supportingValue: numberOrNull(row.supporting_value ?? row.supportingValue),
  supportingUnit: row.supporting_unit ?? row.supportingUnit ?? null,
  notes: row.notes ?? null,
  createdAt: row.created_at ?? row.createdAt,
  updatedAt: row.updated_at ?? row.updatedAt,
})

function compareValues(direction: AchievementDirection, candidate: number, current: number) {
  return direction === 'higher' ? candidate > current : candidate < current
}

/**
 * What a run of entries says about one Achievement: where it stands, which way it
 * is moving, and how close the target is.
 *
 * Pure, and deliberately here rather than in `achievements.ts`, which imports the
 * database. A device composing Progress offline runs this exact function.
 */
export function summarizeAchievement(definitionRow: any, entryRows: any[]) {
  const entries = entryRows.map(achievementEntryToClient).sort((a, b) => a.date.localeCompare(b.date))
  const definition = achievementDefinitionToClient(definitionRow)
  const latest = entries[entries.length - 1] ?? null
  const previous = entries[entries.length - 2] ?? null
  const personalBest = entries.reduce<(typeof entries)[number] | null>((best, entry) => {
    if (!best) return entry
    return compareValues(definition.betterDirection, entry.value, best.value) ? entry : best
  }, null)

  const delta = latest && previous ? latest.value - previous.value : null
  const trendDirection: 'none' | 'up' | 'down' | 'flat' = delta == null
    ? 'none'
    : delta > 0
      ? 'up'
      : delta < 0
        ? 'down'
        : 'flat'
  const isImprovement = delta == null
    ? null
    : delta === 0
      ? false
      : definition.betterDirection === 'higher'
        ? delta > 0
        : delta < 0

  const targetProgress = latest && definition.targetValue
    ? definition.betterDirection === 'higher'
      ? Math.min(100, (latest.value / definition.targetValue) * 100)
      : Math.min(100, (definition.targetValue / latest.value) * 100)
    : null

  return {
    definition,
    entries,
    latest,
    previous,
    personalBest,
    trend: { delta, direction: trendDirection, isImprovement },
    targetProgress,
  }
}

/**
 * The other direction, for the sync exchange — beside the twins they mirror.
 */
export const achievementDefinitionToRow = (definition: any, userId: string) => ({
  id: String(definition.id),
  user_id: userId,
  name: String(definition.name ?? ''),
  category: definition.category ?? null,
  metric_type: definition.metricType ?? definition.metric_type,
  unit: String(definition.unit ?? ''),
  better_direction: definition.betterDirection ?? definition.better_direction,
  target_value: numberOrNull(definition.targetValue ?? definition.target_value),
  archived_at: definition.archivedAt ?? definition.archived_at ?? null,
  created_at: definition.createdAt ?? definition.created_at ?? null,
  updated_at: definition.updatedAt ?? definition.updated_at ?? null,
  deleted_at: definition.deletedAt ?? definition.deleted_at ?? null,
})

export const achievementEntryToRow = (entry: any, userId: string) => ({
  id: String(entry.id),
  user_id: userId,
  achievement_id: String(entry.achievementId ?? entry.achievement_id),
  date: String(entry.date),
  value: Number(entry.value),
  supporting_value: numberOrNull(entry.supportingValue ?? entry.supporting_value),
  supporting_unit: entry.supportingUnit ?? entry.supporting_unit ?? null,
  notes: entry.notes ?? null,
  created_at: entry.createdAt ?? entry.created_at ?? null,
  updated_at: entry.updatedAt ?? entry.updated_at ?? null,
  deleted_at: entry.deletedAt ?? entry.deleted_at ?? null,
})

const AchievementContracts = {
  AchievementEntrySchema,
  AchievementMetricTypeSchema,
  AchievementBetterDirectionSchema,
  AchievementDefinitionCreateSchema,
  AchievementDefinitionUpdateSchema,
  AchievementSummarySchema,
  achievementDefinitionToClient,
  achievementEntryToClient,
  achievementDefinitionToRow,
  achievementEntryToRow,
  summarizeAchievement,
}

export default AchievementContracts
