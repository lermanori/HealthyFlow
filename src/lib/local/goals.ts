import GoalContracts, {
  type Goal,
  type GoalCreateInput,
  type GoalUpdateInput,
} from '../../../backend/src/goals-schema'
import { loadLocalDatabase, localId, LocalStoreError, mutateLocalDatabase } from './store'

const { GoalCreateInputSchema, GoalUpdateInputSchema, goalFromRow } = GoalContracts

export async function listLocalGoals(userId: string, includeArchived = false): Promise<Goal[]> {
  const database = await loadLocalDatabase(userId)
  return database.goals
    .filter((goal) => includeArchived || !goal.deleted_at)
    .map(goalFromRow)
}

export async function createLocalGoal(userId: string, input: GoalCreateInput): Promise<Goal> {
  const parsed = GoalCreateInputSchema.parse(input)
  const now = new Date().toISOString()
  const row = {
    id: localId(),
    user_id: userId,
    module: parsed.module,
    statement: parsed.statement,
    context: parsed.context ?? '',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
  return mutateLocalDatabase(userId, (database) => ({
    next: { ...database, goals: [...database.goals, row] },
    result: goalFromRow(row),
  }))
}

export async function updateLocalGoal(
  userId: string,
  goalId: string,
  input: GoalUpdateInput,
): Promise<Goal> {
  const parsed = GoalUpdateInputSchema.parse(input)
  return mutateLocalDatabase(userId, (database) => {
    const current = database.goals.find((goal) => goal.id === goalId)
    if (!current || current.user_id !== userId) {
      throw new LocalStoreError('That Goal is not held on this device.')
    }
    const updatedAt = new Date().toISOString()
    const updated = {
      ...current,
      ...(parsed.module !== undefined ? { module: parsed.module } : {}),
      ...(parsed.statement !== undefined ? { statement: parsed.statement } : {}),
      ...(parsed.context !== undefined ? { context: parsed.context } : {}),
      ...(parsed.archived !== undefined ? { deleted_at: parsed.archived ? updatedAt : null } : {}),
      updated_at: updatedAt,
    }
    return {
      next: {
        ...database,
        goals: database.goals.map((goal) => goal.id === goalId ? updated : goal),
      },
      result: goalFromRow(updated),
    }
  })
}
