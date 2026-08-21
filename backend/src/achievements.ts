import { v4 as uuidv4 } from 'uuid'
import { db } from './supabase-client'
import {
  achievementDefinitionToClient,
  achievementEntryToClient,
  summarizeAchievement,
  type AchievementDefinitionCreate,
  type AchievementDefinitionUpdate,
  type AchievementEntryCreate,
  type AchievementEntryUpdate,
} from './achievement-contracts'

export * from './achievement-contracts'

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
