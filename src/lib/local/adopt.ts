import AchievementContracts from '../../../backend/src/achievement-contracts'
import HealthContracts from '../../../backend/src/health-contracts'
import SyncContracts from '../../../backend/src/sync-contracts'
import WorkoutContracts from '../../../backend/src/workout-contracts'
import {
  emptyLocalDatabase,
  type LocalDatabase,
} from './store'

const { achievementDefinitionToClient, achievementEntryToClient } = AchievementContracts
const { SYNC_IDENTITY, mergeRows } = SyncContracts
const {
  calorieEntryToClient,
  calorieItemToClient,
  weightEntryToClient,
  withDeletion,
} = HealthContracts
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
 * Two days then meet, and they overlap far more than they look like they should.
 * The first time someone signs in, the two are genuinely separate and no id can
 * collide. Every time after, the device is holding *the account's own day* — so
 * every row collides with itself, one copy carrying whatever was done on the
 * device since. Joining by concatenation would duplicate the entire account.
 *
 * So the join is by identity, and the more recently changed row wins. What it
 * still cannot resolve is a *semantic* duplicate — two "Run 5k" habits where the
 * person has one habit — which is why the choice is offered rather than made, and
 * why the copy says so.
 */

type Rows = Record<string, unknown>[]

const rows = (value: unknown): Rows => (Array.isArray(value) ? (value as Rows) : [])

const sinceCreated = (row: Rows[number]) => ({
  ...row,
  updated_at: row.updated_at ?? row.created_at,
})

/** Group child rows by the parent id they point at. */
function groupBy(children: Rows, key: string): Record<string, Rows> {
  return children.reduce<Record<string, Rows>>((grouped, child) => {
    const parent = String(child[key])
    ;(grouped[parent] ??= []).push(child)
    return grouped
  }, {})
}

/**
 * Read an account export into a Local day.
 *
 * Items and Habit progress are already in the shape the device stores them in —
 * they are server rows on both sides — so they pass through. Health is stored
 * client-shaped, so it is mapped here through the same functions the API uses,
 * which is why those live in `*-contracts.ts` rather than behind a database
 * import.
 *
 * A deletion is carried, not dropped. The server's health tables gained
 * `deleted_at` when sync did, and a mapper that built only the live fields would
 * bring every deleted meal back to life on the device that downloaded them.
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
    // `updated_at` is device bookkeeping and the server's tables have no such
    // column, so it is filled from the last time the row is known to have
    // changed rather than left absent or invented.
    tasks: rows(exported.items).map(sinceCreated) as LocalDatabase['tasks'],
    habitProgress: rows(exported.habitProgress).map(sinceCreated) as LocalDatabase['habitProgress'],
    // The export carries one settings row per account; the device stores the
    // patch, so the row's own bookkeeping columns are left behind.
    settings: settingsFromExport(rows(exported.settings)[0]),
    calorieEntries: rows(health.calorieEntries).map(calorieEntryToClient) as LocalDatabase['calorieEntries'],
    calorieItems: rows(health.calorieHistory).map(calorieItemToClient) as LocalDatabase['calorieItems'],
    weightEntries: rows(health.weightEntries).map(weightEntryToClient) as LocalDatabase['weightEntries'],
    workoutSessions: rows(health.workoutSessions).map((session) => withDeletion(
      workoutSessionToClient(session, sessionExercises[String(session.id)] ?? []), session,
    )) as LocalDatabase['workoutSessions'],
    workoutPlans: rows(health.workoutPlans).map((plan) => withDeletion(
      workoutPlanToClient(plan, planItems[String(plan.id)] ?? []), plan,
    )) as LocalDatabase['workoutPlans'],
    workoutExerciseItems: rows(health.workoutExerciseHistory)
      .map((row) => withDeletion(workoutExerciseItemToClient(row), row)) as LocalDatabase['workoutExerciseItems'],
    achievementDefinitions: rows(health.achievementDefinitions)
      .map((row) => withDeletion(achievementDefinitionToClient(row), row)) as LocalDatabase['achievementDefinitions'],
    achievementEntries: rows(health.achievementEntries)
      .map((row) => withDeletion(achievementEntryToClient(row), row)) as LocalDatabase['achievementEntries'],
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

/**
 * Union two sets of records, keeping the more recently changed of any pair.
 *
 * The device is processed second, so a tie goes to it — it is where the person was
 * working, and a server copy that has not moved should not undo them.
 *
 * `mergeRows` rather than a copy of it: this is the same rule the sync exchange
 * runs on both sides, and a rule written twice in this codebase has drifted every
 * time. It also brings the natural-key identity with it, which matters here for
 * the same reason it matters there — an account and a device that each hold
 * today's weight hold *one* record under two ids, and keeping both would fail the
 * first upsert that followed.
 */
function merged<T>(collection: keyof typeof SYNC_IDENTITY, fromAccount: T[], fromDevice: T[]): T[] {
  return mergeRows(
    fromAccount as never,
    fromDevice as never,
    SYNC_IDENTITY[collection],
  ) as unknown as T[]
}

export type AdoptionChoice = 'keep_both' | 'discard_device'

/** What is at stake, in the numbers the person is being asked to weigh. */
export function countLocalDay(database: LocalDatabase) {
  return {
    items: database.tasks.filter((row) => !row.deleted_at && row.type !== 'habit').length,
    habits: database.tasks.filter((row) => !row.deleted_at && row.type === 'habit' && !row.original_habit_id).length,
    // Health soft-deletes now, so a deleted meal is still a stored row. Counting
    // it would overstate what is at stake in the one place the number has to be
    // exact: the person is weighing this against losing it.
    meals: database.calorieEntries.filter((row) => !row.deletedAt).length,
    workouts: database.workoutSessions.filter((row) => !row.deletedAt).length,
  }
}

/**
 * Put the account's day and the device's day together, or replace one with the
 * other.
 *
 * The union joins by identity, not by concatenation. Ids only fail to collide the
 * *first* time someone signs in; every time after, the device is holding the
 * account's own day, so every row collides with itself. What the union still
 * cannot prevent is a *semantic* duplicate — two "Run 5k" habits where the person
 * has one habit — which is why `discard_device` exists and why the choice is theirs.
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
    tasks: merged('tasks', account.tasks, reKeyed(device.tasks)),
    habitProgress: merged('habitProgress', account.habitProgress, reKeyed(device.habitProgress)),
    calorieEntries: merged('calorieEntries', account.calorieEntries, reKeyed(device.calorieEntries)),
    calorieItems: merged('calorieItems', account.calorieItems, reKeyed(device.calorieItems)),
    weightEntries: merged('weightEntries', account.weightEntries, reKeyed(device.weightEntries)),
    workoutSessions: merged('workoutSessions', account.workoutSessions, reKeyed(device.workoutSessions)),
    workoutPlans: merged('workoutPlans', account.workoutPlans, reKeyed(device.workoutPlans)),
    workoutExerciseItems: merged('workoutExerciseItems', account.workoutExerciseItems, reKeyed(device.workoutExerciseItems)),
    achievementDefinitions: merged('achievementDefinitions', account.achievementDefinitions, reKeyed(device.achievementDefinitions)),
    achievementEntries: merged('achievementEntries', account.achievementEntries, reKeyed(device.achievementEntries)),
  }
}
