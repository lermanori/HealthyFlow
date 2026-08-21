import AchievementContracts from '../../../backend/src/achievement-contracts'
import WorkoutContracts from '../../../backend/src/workout-contracts'
import {
  emptyLocalDatabase,
  type LocalDatabase,
} from './store'

const { achievementDefinitionToClient, achievementEntryToClient } = AchievementContracts
const {
  workoutSessionToClient,
  workoutPlanToClient,
  workoutExerciseItemToClient,
} = WorkoutContracts

/**
 * Taking an account's day onto this device.
 *
 * Signing in is not Claim. Claim converts the Guest's own row and moves nothing;
 * signing in abandons that row for an account that already exists, and the
 * account's day has to come **down** to the device, because local is the source
 * for everyone (ADR-0012).
 *
 * Two days then meet. Joining them is a union and cannot conflict — every id is
 * either client-generated or server-generated and no two can collide — but it can
 * produce *semantic* duplicates, two "Run 5k" habits where the person has one
 * habit. That is a real cost, it is why the choice is offered rather than made,
 * and the copy says so.
 */

type Rows = Record<string, unknown>[]

const rows = (value: unknown): Rows => (Array.isArray(value) ? (value as Rows) : [])
const numberOrNull = (value: unknown) => (value == null ? null : Number(value))

/** Group child rows by the parent id they point at. */
function groupBy(children: Rows, key: string): Record<string, Rows> {
  return children.reduce<Record<string, Rows>>((grouped, child) => {
    const parent = String(child[key])
    ;(grouped[parent] ??= []).push(child)
    return grouped
  }, {})
}

const calorieEntryToClient = (row: Rows[number]) => ({
  id: String(row.id),
  userId: String(row.user_id),
  date: String(row.date),
  time: (row.time as string | null) ?? null,
  name: String(row.name ?? ''),
  calories: Number(row.calories),
  protein: numberOrNull(row.protein),
  carbs: numberOrNull(row.carbs),
  fat: numberOrNull(row.fat),
  quantity: (row.quantity as string | null) ?? null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

const calorieItemToClient = (row: Rows[number]) => ({
  id: String(row.id),
  userId: String(row.user_id),
  name: String(row.name ?? ''),
  normalizedName: String(row.normalized_name ?? ''),
  quantity: (row.quantity as string | null) ?? null,
  normalizedQuantity: String(row.normalized_quantity ?? ''),
  calories: Number(row.calories),
  protein: numberOrNull(row.protein),
  carbs: numberOrNull(row.carbs),
  fat: numberOrNull(row.fat),
  usageCount: Number(row.usage_count ?? 0),
  lastUsedAt: String(row.last_used_at ?? row.updated_at),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

const weightEntryToClient = (row: Rows[number]) => ({
  id: String(row.id),
  userId: String(row.user_id),
  date: String(row.date),
  weightKg: Number(row.weight_kg),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

/**
 * Read an account export into a Local day.
 *
 * Items and Habit progress are already in the shape the device stores them in —
 * they are server rows on both sides — so they pass through. Health is stored
 * client-shaped, so it is mapped here through the same functions the API uses,
 * which is why those live in `*-contracts.ts` rather than behind a database
 * import.
 *
 * Everything else in the export is deliberately dropped: Calendar connections,
 * assistant history, billing, API tokens and OAuth grants belong to the account on
 * the server, not to the day on the device.
 */
export function localDayFromExport(userId: string, exported: Record<string, unknown>): LocalDatabase {
  const health = (exported.health ?? {}) as Record<string, unknown>
  const sessionExercises = groupBy(rows(health.workoutSessionExercises), 'session_id')
  const planItems = groupBy(rows(health.workoutPlanItems), 'plan_id')

  return {
    ...emptyLocalDatabase(userId),
    tasks: rows(exported.items) as LocalDatabase['tasks'],
    habitProgress: rows(exported.habitProgress) as LocalDatabase['habitProgress'],
    // The export carries one settings row per account; the device stores the
    // patch, so the row's own bookkeeping columns are left behind.
    settings: settingsFromExport(rows(exported.settings)[0]),
    calorieEntries: rows(health.calorieEntries).map(calorieEntryToClient) as LocalDatabase['calorieEntries'],
    calorieItems: rows(health.calorieHistory).map(calorieItemToClient) as LocalDatabase['calorieItems'],
    weightEntries: rows(health.weightEntries).map(weightEntryToClient) as LocalDatabase['weightEntries'],
    workoutSessions: rows(health.workoutSessions).map((session) =>
      workoutSessionToClient(session, sessionExercises[String(session.id)] ?? [])) as LocalDatabase['workoutSessions'],
    workoutPlans: rows(health.workoutPlans).map((plan) =>
      workoutPlanToClient(plan, planItems[String(plan.id)] ?? [])) as LocalDatabase['workoutPlans'],
    workoutExerciseItems: rows(health.workoutExerciseHistory)
      .map(workoutExerciseItemToClient) as LocalDatabase['workoutExerciseItems'],
    achievementDefinitions: rows(health.achievementDefinitions)
      .map(achievementDefinitionToClient) as LocalDatabase['achievementDefinitions'],
    achievementEntries: rows(health.achievementEntries)
      .map(achievementEntryToClient) as LocalDatabase['achievementEntries'],
  }
}

/** The columns of a `user_settings` row that are actually settings. */
function settingsFromExport(row: Rows[number] | undefined): Record<string, unknown> {
  if (!row) return {}
  const { id: _id, user_id: _userId, created_at: _created, updated_at: _updated, ...settings } = row
  // The row is snake_case and the device stores the camelCase patch the client
  // sends, so only keys that already match are carried; anything else would be a
  // setting the app cannot read.
  return Object.fromEntries(Object.entries(settings).filter(([key]) => !key.includes('_')))
}

export type AdoptionChoice = 'keep_both' | 'discard_device'

/** What is at stake, in the numbers the person is being asked to weigh. */
export function countLocalDay(database: LocalDatabase) {
  return {
    items: database.tasks.filter((row) => !row.deleted_at && row.type !== 'habit').length,
    habits: database.tasks.filter((row) => !row.deleted_at && row.type === 'habit' && !row.original_habit_id).length,
    meals: database.calorieEntries.length,
    workouts: database.workoutSessions.length,
  }
}

/**
 * Put the account's day and the device's day together, or replace one with the
 * other.
 *
 * A union is safe on identity: ids are UUIDs from two generators and cannot
 * collide. What it cannot prevent is a person ending up with two of the same
 * habit, which is why `discard_device` exists and why the choice is theirs.
 *
 * Every kept device record is re-keyed to the account, because the document
 * belongs to one identity and `loadLocalDatabase` refuses one that does not match.
 */
export function adoptAccountDay(
  device: LocalDatabase,
  account: LocalDatabase,
  choice: AdoptionChoice,
): LocalDatabase {
  if (choice === 'discard_device') return account

  // Records arrive in two shapes — server rows key on `user_id`, health records
  // on `userId` — so whichever key a record carries is the one rewritten.
  const reKeyed = <T>(records: T[]): T[] =>
    records.map((record) => {
      const owned = record as Record<string, unknown>
      return {
        ...owned,
        ...('user_id' in owned ? { user_id: account.userId } : {}),
        ...('userId' in owned ? { userId: account.userId } : {}),
      } as T
    })

  return {
    ...account,
    // The account's settings win: they are the ones the person has been living
    // with, and two settings objects cannot be unioned meaningfully.
    settings: Object.keys(account.settings).length > 0 ? account.settings : device.settings,
    tasks: [...account.tasks, ...reKeyed(device.tasks)],
    habitProgress: [...account.habitProgress, ...reKeyed(device.habitProgress)],
    calorieEntries: [...account.calorieEntries, ...reKeyed(device.calorieEntries)],
    calorieItems: [...account.calorieItems, ...reKeyed(device.calorieItems)],
    weightEntries: [...account.weightEntries, ...reKeyed(device.weightEntries)],
    workoutSessions: [...account.workoutSessions, ...reKeyed(device.workoutSessions)],
    workoutPlans: [...account.workoutPlans, ...reKeyed(device.workoutPlans)],
    workoutExerciseItems: [...account.workoutExerciseItems, ...reKeyed(device.workoutExerciseItems)],
    achievementDefinitions: [...account.achievementDefinitions, ...reKeyed(device.achievementDefinitions)],
    achievementEntries: [...account.achievementEntries, ...reKeyed(device.achievementEntries)],
  }
}
