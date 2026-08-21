import type {
  DaySummary,
  DaySummaryItem,
} from '../../../backend/src/day-summary-schema'
import type { ReminderItem } from '../../../backend/src/task-contracts'
import type { Settings } from '../../../backend/src/settings-schema'
import DaySummaryCore from '../../../backend/src/day-summary-core'
import {
  addLocalHabitProgress,
  buildLocalDaySummary,
  completeLocalTask,
  createLocalTask,
  deleteLocalHabitProgress,
  deleteLocalTask,
  localItemsForDay,
  readLocalSettings,
  reorderLocalTasks,
  setLocalHabitOutcome,
  updateLocalHabitProgress,
  updateLocalSettings,
  updateLocalTask,
  type LocalDeleteScope,
  type LocalHabitProgress,
  type LocalTaskInput,
  type LocalTaskUpdates,
} from './day'
import { LocalStoreError, mutateLocalDatabase, type LocalTaskRow } from './store'
import {
  addLocalAchievementEntry,
  addLocalWorkoutExercise,
  createLocalAchievement,
  createLocalCalorieEntry,
  createLocalWeightEntry,
  createLocalWorkoutPlan,
  createLocalWorkoutSession,
  localAchievements,
  localCalorieEntries,
  localCalorieItems,
  localWeightEntry,
  localWeightTrend,
  localWorkoutExerciseItems,
  localWorkoutPlans,
  localWorkoutSessions,
  removeLocalAchievement,
  removeLocalAchievementEntry,
  removeLocalCalorieEntry,
  removeLocalWeightEntry,
  removeLocalWorkoutExercise,
  removeLocalWorkoutPlan,
  removeLocalWorkoutSession,
  updateLocalAchievement,
  updateLocalAchievementEntry,
  updateLocalCalorieEntry,
  updateLocalWeightEntry,
  updateLocalWorkoutExercise,
  updateLocalWorkoutPlan,
  updateLocalWorkoutSession,
} from './health'

/**
 * The device answering the same questions the API answers.
 *
 * Everything here returns the shape `src/services/api.ts` already returns, so a
 * Guest's Today, backlog and Habits run through the pages unchanged. Nothing in
 * this file reaches the network, and nothing invents a value it does not hold —
 * a source the device cannot answer throws rather than returning an empty result.
 */

/** Which account's day this device is holding, or null when the day is hosted. */
let dayUserId: string | null = null

/**
 * Which account this device has written a Local day for.
 *
 * Held separately from the document because the axios request interceptor and
 * `AuthContext` both need the answer synchronously, and reading the document is
 * async. Written once when a guest session starts; **Claim never touches it,
 * because Claim never changes the `userId`** — which is what keeps a claimed
 * account reading its own day.
 */
const LOCAL_DAY_OWNER_KEY = 'healthyflow-local-day-owner-v1'

export function rememberLocalDayOwner(userId: string) {
  localStorage.setItem(LOCAL_DAY_OWNER_KEY, userId)
}

export function forgetLocalDayOwner() {
  localStorage.removeItem(LOCAL_DAY_OWNER_KEY)
}

/**
 * Whether this device holds the signed-in user's day.
 *
 * True for a Guest, whose day is local by definition even before they write one,
 * and true for an account this device already holds a day for.
 *
 * The second half is not a nicety. The rule used to be "local when the user is a
 * Guest", and a Guest is an account with no email — so the instant Claim set an
 * email the day flipped to the server, where a freshly claimed account has
 * nothing. Claiming would have looked exactly like erasing the day.
 *
 * False for an account this device has never seen: their day is on the server
 * until the download exists, and reading an empty local document would look just
 * as much like loss from the other direction.
 */
export function holdsLocalDay(user: { id: string; email: string | null } | null): boolean {
  if (!user) return false
  if (user.email === null) return true
  return localStorage.getItem(LOCAL_DAY_OWNER_KEY) === user.id
}

/**
 * Point the day at the device, or back at the server. Called from `AuthContext`
 * whenever the signed-in identity changes.
 */
export function setLocalDayUser(userId: string | null) {
  dayUserId = userId
}

export function localDayUser(): string | null {
  return dayUserId
}

/**
 * Route one service call to the device when the day lives there.
 *
 * The local branch receives the account id it is composing for; the hosted branch
 * is the existing HTTP call, untouched.
 */
export function onDevice<A extends unknown[], R>(
  local: (userId: string, ...args: A) => Promise<R>,
  hosted: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args: A) => {
    const userId = dayUserId
    return userId === null ? hosted(...args) : local(userId, ...args)
  }
}

/**
 * A stored row as the REST routes return it.
 *
 * Deliberately the same mapping `POST /tasks` performs, so a page cannot tell
 * which side answered.
 */
function rowToClient(row: LocalTaskRow) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    category: row.category,
    startTime: row.start_time,
    location: row.location,
    duration: row.duration ?? undefined,
    repeat: row.repeat_type ?? 'none',
    completed: row.completed,
    scheduledDate: row.scheduled_date,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    overdueNotified: row.overdue_notified,
    rolledOverFromTaskId: row.rolled_over_from_task_id ?? undefined,
    originalCreatedAt: row.original_created_at ?? undefined,
    position: row.position,
    ...(row.original_habit_id ? {
      isHabitInstance: true,
      originalHabitId: row.original_habit_id,
    } : {}),
    ...(row.type === 'habit' ? {
      habitInfo: {
        target: row.habit_target_value == null
          ? null
          : { value: row.habit_target_value, unit: row.habit_target_unit },
        outcome: row.habit_outcome ?? (row.completed ? 'completed' : 'pending'),
        progressTotal: 0,
      },
    } : {}),
  }
}

function itemToClient(item: DaySummaryItem) {
  if (item.category === null) {
    // Every locally-written row carries a category, so this cannot happen without
    // the document having been edited by something else. Saying so beats guessing.
    throw new LocalStoreError(`The Item ${item.id} on this device has no category.`)
  }
  return { ...item, category: item.category, duration: item.duration ?? undefined }
}

function progressToClient(progress: LocalHabitProgress) {
  return {
    habit: {
      ...rowToClient(progress.instance),
      habitInfo: {
        target: progress.instance.habit_target_value == null
          ? null
          : { value: progress.instance.habit_target_value, unit: progress.instance.habit_target_unit },
        outcome: progress.outcome,
        progressTotal: progress.total,
      },
    },
    entries: progress.entries.map((entry) => ({
      id: entry.id,
      amount: entry.amount,
      note: entry.note,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    })),
  }
}

export const localServices = {
  daySummary: (userId: string, date: string): Promise<DaySummary> =>
    buildLocalDaySummary(userId, date, Intl.DateTimeFormat().resolvedOptions().timeZone),

  getTasks: async (userId: string, date?: string) => {
    if (!date) {
      // Every caller passes a day. An undated read would have to mean "everything
      // ever", which no surface asks for and which no server route returns either.
      throw new LocalStoreError('Reading Items from this device needs a date.')
    }
    return (await localItemsForDay(userId, date)).map(itemToClient)
  },

  getReminderItems: async (userId: string, today: string): Promise<ReminderItem[]> => {
    const items = await localItemsForDay(userId, today)
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      startTime: item.startTime,
      completed: item.completed,
      scheduledDate: item.scheduledDate,
      overdueNotified: item.overdueNotified,
    }))
  },

  addTask: async (userId: string, input: LocalTaskInput) =>
    rowToClient(await createLocalTask(userId, input)),

  updateTask: async (
    userId: string,
    id: string,
    updates: LocalTaskUpdates,
    editScope?: 'instance' | 'habit',
  ) => rowToClient(await updateLocalTask(userId, id, updates, editScope)),

  completeTask: async (userId: string, id: string) =>
    rowToClient(await completeLocalTask(userId, id)),

  deleteTask: (userId: string, id: string, scope?: LocalDeleteScope) =>
    deleteLocalTask(userId, id, scope),

  reorderTasks: (userId: string, ids: string[]) => reorderLocalTasks(userId, ids),

  /**
   * Undo a materialization that a failed drag transaction left behind.
   *
   * The row is removed outright rather than soft-deleted: it was never a day the
   * user chose, only a side effect of a drag that did not complete.
   */
  rollbackDragMaterialization: (userId: string, id: string, input: { virtualId: string }) =>
    mutateLocalDatabase(userId, (database) => {
      const row = database.tasks.find((candidate) => candidate.id === id)
      if (!row) throw new LocalStoreError(`No Item on this device with id ${id}.`)
      if (row.original_habit_id === null || !input.virtualId.startsWith(`${row.original_habit_id}-`)) {
        throw new LocalStoreError('That row is not the Habit instance the drag materialized.')
      }
      return {
        next: {
          ...database,
          tasks: database.tasks.filter((candidate) => candidate.id !== id),
          habitProgress: database.habitProgress.filter((entry) => entry.habit_instance_id !== id),
        },
        result: undefined,
      }
    }),

  getHabitProgress: async (userId: string, id: string, date?: string) => {
    // Reading progress must not materialize anything, so an untouched Habit day
    // reports the empty record its virtual instance stands for.
    const day = DaySummaryCore.parseHabitInstanceId(id)?.date ?? date
    if (!day) throw new LocalStoreError('Reading a Habit needs the day it belongs to.')
    const items = await localItemsForDay(userId, day)
    const item = items.find((candidate) => candidate.id === id || candidate.originalHabitId === id)
    if (!item || item.type !== 'habit') {
      throw new LocalStoreError(`No Habit on this device with id ${id}.`)
    }
    return {
      habit: itemToClient(item),
      entries: (item.habitInfo?.chunks ?? []).map((chunk) => ({
        id: chunk.id,
        amount: chunk.amount,
        note: chunk.note,
        createdAt: chunk.loggedTime ?? '',
        updatedAt: chunk.loggedTime ?? '',
      })),
    }
  },

  addHabitProgress: async (userId: string, id: string, input: { amount: number; note?: string | null }) =>
    progressToClient(await addLocalHabitProgress(userId, id, input)),

  updateHabitProgress: async (
    userId: string,
    id: string,
    entryId: string,
    input: { amount?: number; note?: string | null; date?: string },
  ) => progressToClient(await updateLocalHabitProgress(userId, id, entryId, input)),

  deleteHabitProgress: async (userId: string, id: string, entryId: string, date?: string) =>
    progressToClient(await deleteLocalHabitProgress(userId, id, entryId, date)),

  setHabitOutcome: async (
    userId: string,
    id: string,
    outcome: 'pending' | 'completed' | 'failed',
    date?: string,
  ) => progressToClient(await setLocalHabitOutcome(userId, id, outcome, date)),

  getSettings: (userId: string): Promise<Settings> => readLocalSettings(userId),

  updateSettings: (userId: string, patch: Partial<Settings>): Promise<Settings> =>
    updateLocalSettings(userId, patch),
}

/**
 * The device holds health records in the client shape, and this is where that is
 * asserted.
 *
 * The document's health schemas pin identity and the dates a day is composed
 * from, and preserve the rest — because the full shapes are interfaces in
 * `src/services/api.ts` that this store must not fork. So the store's static type
 * is deliberately looser than the caller's, and one named assertion at the
 * boundary is more honest than a cast at every call site.
 */
export const asClientShape = <T>(value: Promise<unknown>) => value as Promise<T>

/**
 * Health, answered from the device.
 *
 * Records are stored client-shaped, so these return what they hold. The one
 * method that stays hosted is `generatePlan`: it is an AI call, server-keyed and
 * credit-metered, and `TARGET.md` exempts AI from the offline refusal explicitly.
 */
export const localHealthServices = {
  calorieList: (userId: string, date: string) => localCalorieEntries(userId, date),
  calorieCreate: (userId: string, entry: Record<string, unknown>) => createLocalCalorieEntry(userId, entry),
  calorieUpdate: (userId: string, id: string, patch: Record<string, unknown>) =>
    updateLocalCalorieEntry(userId, id, patch),
  calorieRemove: (userId: string, id: string) => removeLocalCalorieEntry(userId, id),
  calorieItems: (userId: string) => localCalorieItems(userId),

  weightByDate: (userId: string, date: string) => localWeightEntry(userId, date),
  weightRecent: (userId: string, limit?: number) => localWeightTrend(userId, limit),
  weightCreate: (userId: string, entry: Record<string, unknown>) => createLocalWeightEntry(userId, entry),
  weightUpdate: (userId: string, id: string, patch: Record<string, unknown>) =>
    updateLocalWeightEntry(userId, id, patch),
  weightRemove: (userId: string, id: string) => removeLocalWeightEntry(userId, id),

  workoutPlans: (userId: string) => localWorkoutPlans(userId),
  workoutCreatePlan: (userId: string, plan: Record<string, unknown>) => createLocalWorkoutPlan(userId, plan),
  workoutUpdatePlan: (userId: string, id: string, patch: Record<string, unknown>) =>
    updateLocalWorkoutPlan(userId, id, patch),
  workoutRemovePlan: (userId: string, id: string) => removeLocalWorkoutPlan(userId, id),
  workoutList: (userId: string, date?: string) => localWorkoutSessions(userId, date),
  workoutCreate: (userId: string, session: Record<string, unknown>) => createLocalWorkoutSession(userId, session),
  workoutUpdate: (userId: string, id: string, patch: Record<string, unknown>) =>
    updateLocalWorkoutSession(userId, id, patch),
  workoutRemove: (userId: string, id: string) => removeLocalWorkoutSession(userId, id),
  workoutAddExercise: (userId: string, sessionId: string, exercise: Record<string, unknown>) =>
    addLocalWorkoutExercise(userId, sessionId, exercise),
  workoutUpdateExercise: (userId: string, exerciseId: string, patch: Record<string, unknown>) =>
    updateLocalWorkoutExercise(userId, exerciseId, patch),
  workoutRemoveExercise: (userId: string, exerciseId: string) =>
    removeLocalWorkoutExercise(userId, exerciseId),
  workoutItems: (userId: string) => localWorkoutExerciseItems(userId),

  achievementList: (userId: string, options?: { includeArchived?: boolean; entryLimit?: number }) =>
    localAchievements(userId, options),
  achievementCreate: (userId: string, definition: Record<string, unknown>) =>
    createLocalAchievement(userId, definition),
  achievementUpdate: (userId: string, id: string, patch: Record<string, unknown>) =>
    updateLocalAchievement(userId, id, patch),
  achievementRemove: (userId: string, id: string) => removeLocalAchievement(userId, id),
  achievementAddEntry: (userId: string, id: string, entry: Record<string, unknown>) =>
    addLocalAchievementEntry(userId, id, entry),
  achievementUpdateEntry: (userId: string, entryId: string, patch: Record<string, unknown>) =>
    updateLocalAchievementEntry(userId, entryId, patch),
  achievementRemoveEntry: (userId: string, entryId: string) =>
    removeLocalAchievementEntry(userId, entryId),
}
