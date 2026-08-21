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
 * Point the day at the device, or back at the server.
 *
 * A Guest is an account with no email, and their day is not hosted (`TARGET.md`),
 * so this follows the signed-in identity rather than a separate flag. Called from
 * `AuthContext` whenever that identity changes.
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
