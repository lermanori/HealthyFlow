import { v4 as uuidv4 } from 'uuid'
import { db } from './supabase-client'
import {
  GoalCreateInputSchema,
  GoalUpdateInputSchema,
  goalFromRow,
  type Goal,
  type GoalCreateInput,
  type GoalUpdateInput,
} from './goals-schema'

export * from './goals-schema'

export const Goals = {
  async list(userId: string, includeArchived = false): Promise<Goal[]> {
    const rows = await db.getGoalsByUserId(userId, includeArchived)
    return rows.map(goalFromRow)
  },

  async create(userId: string, input: GoalCreateInput): Promise<Goal> {
    const parsed = GoalCreateInputSchema.parse(input)
    const now = new Date().toISOString()
    return goalFromRow(await db.createGoal({
      id: uuidv4(),
      user_id: userId,
      module: parsed.module,
      statement: parsed.statement,
      context: parsed.context ?? '',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }))
  },

  async update(userId: string, goalId: string, input: GoalUpdateInput): Promise<Goal> {
    const parsed = GoalUpdateInputSchema.parse(input)
    const current = await db.getGoalById(goalId)
    if (!current || current.user_id !== userId) throw Object.assign(new Error('Goal not found'), { status: 404 })
    const updatedAt = new Date().toISOString()
    const row = await db.updateGoal(goalId, userId, {
      ...(parsed.module !== undefined ? { module: parsed.module } : {}),
      ...(parsed.statement !== undefined ? { statement: parsed.statement } : {}),
      ...(parsed.context !== undefined ? { context: parsed.context } : {}),
      ...(parsed.archived !== undefined ? { deleted_at: parsed.archived ? updatedAt : null } : {}),
      updated_at: updatedAt,
    })
    return goalFromRow(row)
  },
}
