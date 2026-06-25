import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db } from './supabase-client'

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

export type AchievementDefinitionCreate = z.infer<typeof AchievementDefinitionCreateSchema>
export type AchievementDefinitionUpdate = z.infer<typeof AchievementDefinitionUpdateSchema>
export type AchievementEntryCreate = z.infer<typeof AchievementEntryCreateSchema>
export type AchievementEntryUpdate = z.infer<typeof AchievementEntryUpdateSchema>
export type AchievementDirection = z.infer<typeof AchievementBetterDirectionSchema>

export class DuplicateAchievementEntryError extends Error {
  constructor() {
    super('Achievement already has an entry for this date')
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message)
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('Forbidden')
  }
}

const numberOrNull = (value: unknown) => value == null ? null : Number(value)

export const achievementDefinitionToClient = (row: any) => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  category: row.category ?? null,
  metricType: row.metric_type,
  unit: row.unit,
  betterDirection: row.better_direction,
  targetValue: numberOrNull(row.target_value),
  archivedAt: row.archived_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const achievementEntryToClient = (row: any) => ({
  id: row.id,
  achievementId: row.achievement_id,
  userId: row.user_id,
  date: row.date,
  value: Number(row.value),
  supportingValue: numberOrNull(row.supporting_value),
  supportingUnit: row.supporting_unit ?? null,
  notes: row.notes ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

function compareValues(direction: AchievementDirection, candidate: number, current: number) {
  return direction === 'higher' ? candidate > current : candidate < current
}

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
  const trendDirection = delta == null ? 'none' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
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

export const Achievements = {
  async list(userId: string, options: { includeArchived: boolean; entryLimit: number }) {
    const definitions = await db.getAchievementDefinitions(userId, options.includeArchived)
    const summaries = await Promise.all(
      definitions.map(async (definition: any) => {
        const entries = await db.getAchievementEntries(definition.id, userId, options.entryLimit)
        return summarizeAchievement(definition, entries.reverse())
      })
    )
    return summaries
  },

  async createDefinition(userId: string, input: AchievementDefinitionCreate) {
    const row = await db.createAchievementDefinition({
      id: uuidv4(),
      user_id: userId,
      name: input.name,
      category: input.category ?? null,
      metric_type: input.metricType,
      unit: input.unit,
      better_direction: input.betterDirection,
      target_value: input.targetValue ?? null,
    })
    return achievementDefinitionToClient(row)
  },

  async updateDefinition(userId: string, achievementId: string, input: AchievementDefinitionUpdate) {
    const existing = await db.getAchievementDefinitionById(achievementId)
    if (!existing) throw new NotFoundError()
    if (existing.user_id !== userId) throw new ForbiddenError()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.name !== undefined) updates.name = input.name
    if (input.category !== undefined) updates.category = input.category
    if (input.metricType !== undefined) updates.metric_type = input.metricType
    if (input.unit !== undefined) updates.unit = input.unit
    if (input.betterDirection !== undefined) updates.better_direction = input.betterDirection
    if (input.targetValue !== undefined) updates.target_value = input.targetValue
    if (input.archived !== undefined) updates.archived_at = input.archived ? new Date().toISOString() : null

    const row = await db.updateAchievementDefinition(achievementId, updates)
    return achievementDefinitionToClient(row)
  },

  async deleteDefinition(userId: string, achievementId: string) {
    const existing = await db.getAchievementDefinitionById(achievementId)
    if (!existing) throw new NotFoundError()
    if (existing.user_id !== userId) throw new ForbiddenError()
    await db.deleteAchievementDefinition(achievementId)
  },

  async createEntry(userId: string, achievementId: string, input: AchievementEntryCreate) {
    const definition = await db.getAchievementDefinitionById(achievementId)
    if (!definition) throw new NotFoundError('Achievement not found')
    if (definition.user_id !== userId) throw new ForbiddenError()

    const existing = await db.getAchievementEntryByDay(achievementId, userId, input.date)
    if (existing) throw new DuplicateAchievementEntryError()

    const row = await db.createAchievementEntry({
      id: uuidv4(),
      achievement_id: achievementId,
      user_id: userId,
      date: input.date,
      value: input.value,
      supporting_value: input.supportingValue ?? null,
      supporting_unit: input.supportingUnit ?? null,
      notes: input.notes ?? null,
    })
    return achievementEntryToClient(row)
  },

  async updateEntry(userId: string, entryId: string, input: AchievementEntryUpdate) {
    const existing = await db.getAchievementEntryById(entryId)
    if (!existing) throw new NotFoundError()
    if (existing.user_id !== userId) throw new ForbiddenError()

    if (input.date && input.date !== existing.date) {
      const sameDay = await db.getAchievementEntryByDay(existing.achievement_id, userId, input.date)
      if (sameDay && sameDay.id !== entryId) throw new DuplicateAchievementEntryError()
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.date !== undefined) updates.date = input.date
    if (input.value !== undefined) updates.value = input.value
    if (input.supportingValue !== undefined) updates.supporting_value = input.supportingValue
    if (input.supportingUnit !== undefined) updates.supporting_unit = input.supportingUnit
    if (input.notes !== undefined) updates.notes = input.notes

    const row = await db.updateAchievementEntry(entryId, updates)
    return achievementEntryToClient(row)
  },

  async deleteEntry(userId: string, entryId: string) {
    const existing = await db.getAchievementEntryById(entryId)
    if (!existing) throw new NotFoundError()
    if (existing.user_id !== userId) throw new ForbiddenError()
    await db.deleteAchievementEntry(entryId)
  },
}
