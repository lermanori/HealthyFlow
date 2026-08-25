import DaySummaryCore, {
  type DaySummaryDependencies,
} from '../../../backend/src/day-summary-core'
import type {
  DaySummary,
  DaySummaryItem,
} from '../../../backend/src/day-summary-schema'
import HabitContracts, { type HabitOutcome } from '../../../backend/src/habit-contracts'
import SettingsContracts, { type Settings } from '../../../backend/src/settings-schema'
import {
  localAchievements,
  localCalorieEntries,
  localWeightEntry,
  localWorkoutSessions,
} from './health'
import {
  loadLocalDatabase,
  localId,
  mutateLocalDatabase,
  LocalStoreError,
  type LocalDatabase,
  type LocalHabitProgressRow,
  type LocalTaskRow,
} from './store'

const { SettingsSchema } = SettingsContracts
const { deriveHabitOutcome, resolveHabitOutcomeRequest } = HabitContracts
const {
  buildDaySummaryCore,
  composeDayTaskRows,
  isCarryForwardRow,
  itemRowToClient,
  parseHabitInstanceId,
  sortTasksForTimeline,
} = DaySummaryCore

/**
 * A day composed on the device.
 *
 * Every source the day contract needs is answered from the local document and
 * assembled by the same `buildDaySummaryCore` the server calls, so an offline day
 * and an online day are the same shape by construction. What differs is only
 * where the rows came from.
 */

/**
 * The settings a locally-stored day starts from.
 *
 * Every module is on. Food, weight and training are core rather than optional
 * (`TARGET.md`), and the device now holds their records, so a Guest's day reports
 * them exactly as an account holder's does. Onboarding is complete because
 * onboarding seeds server-side settings, which a locally-held day does not have.
 */
export const LOCAL_SETTINGS_BASELINE: Partial<Settings> = {
  onboardingStatus: 'completed',
}

export function resolveLocalSettings(database: LocalDatabase): Settings {
  return SettingsSchema.parse({ ...LOCAL_SETTINGS_BASELINE, ...database.settings })
}

const nowIso = () => new Date().toISOString()

const liveRows = (database: LocalDatabase) => database.tasks.filter((row) => !row.deleted_at)

/** The three row sets `composeDayTaskRows` needs, filtered out of the document. */
function daySources(database: LocalDatabase, date: string) {
  const rows = liveRows(database)
  return {
    datedRows: rows.filter((row) => row.scheduled_date === date && !row.rolled_over_from_task_id),
    habitTemplates: rows.filter((row) => (
      row.type === 'habit' && row.repeat_type === 'daily' && !row.original_habit_id
    )),
    habitInstances: rows.filter((row) => row.scheduled_date === date && Boolean(row.original_habit_id)),
  }
}

function progressByInstance(database: LocalDatabase, instanceIds: string[]) {
  const wanted = new Set(instanceIds)
  const grouped: Record<string, LocalHabitProgressRow[]> = {}
  for (const entry of database.habitProgress) {
    if (!wanted.has(entry.habit_instance_id)) continue
    ;(grouped[entry.habit_instance_id] ??= []).push(entry)
  }
  for (const entries of Object.values(grouped)) {
    entries.sort((a, b) => a.created_at.localeCompare(b.created_at))
  }
  return grouped
}

export async function localItemsForDay(
  userId: string,
  date: string,
  timeZone?: string | null,
): Promise<DaySummaryItem[]> {
  const database = await loadLocalDatabase(userId)
  const datedRows = composeDayTaskRows(userId, date, daySources(database, date))
  const carryForward = liveRows(database).filter((row) => isCarryForwardRow(row, date))
  const rows = sortTasksForTimeline([...datedRows, ...carryForward])

  // Progress is measured against the row that holds the Habit's day, whether that
  // row is materialized or still virtual.
  const grouped = progressByInstance(database, rows.map((row) => String(row.id)))
  return rows.map((row) => {
    const chunkRows = grouped[String(row.id)] ?? []
    const progressTotal = chunkRows.reduce((sum, chunk) => sum + Number(chunk.amount), 0)
    return itemRowToClient(row, progressTotal, { timeZone, chunkRows })
  })
}

/**
 * The nine sources, answered locally.
 *
 * Calendar reports `not_connected` because that is true: a Guest has connected no
 * Calendar, which is outside the system's world rather than a failed read, so
 * Capacity stays `complete` (CONTEXT.md). `getCalendarEvents` therefore cannot be
 * reached — and throws rather than returning `[]` if it ever is, because an empty
 * result would claim the day has no obligations.
 *
 * Focus blocks are genuinely empty: Work is parked behind a release flag and
 * nothing on a device can create one.
 *
 * Everything else comes off the document. A read that fails still throws — one
 * module failing must not fail the whole day, but it must not report `not_logged`
 * either.
 */
export function localDaySummaryDependencies(): DaySummaryDependencies {
  return {
    itemsForDay: localItemsForDay,
    getSettings: async (userId) => resolveLocalSettings(await loadLocalDatabase(userId)),
    getCalendarStatus: async () => ({ connected: false }),
    getCalendarEvents: async (): Promise<never> => {
      throw new LocalStoreError('Calendar is not stored on this device, and an empty result would be a lie.')
    },
    getCalorieEntries: localCalorieEntries,
    getWeightEntry: localWeightEntry,
    getWorkoutSessions: (userId, date) => localWorkoutSessions(userId, date),
    getAchievements: localAchievements,
    listDayFocusBlocks: async () => [],
  }
}

export function buildLocalDaySummary(
  userId: string,
  date: string,
  timeZone: string | null | undefined,
  now?: Date,
): Promise<DaySummary> {
  return buildDaySummaryCore(userId, date, timeZone, {
    now,
    dependencies: localDaySummaryDependencies(),
  })
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type LocalTaskInput = {
  title: string
  type: LocalTaskRow['type']
  category: LocalTaskRow['category']
  startTime?: string | null
  location?: string | null
  duration?: number | null
  repeat?: 'none' | 'daily' | 'weekly' | null
  scheduledDate?: string | null
  habitTarget?: { value: number; unit: string } | null
}

function nextPosition(database: LocalDatabase, scheduledDate: string) {
  const positions = liveRows(database)
    .filter((row) => row.scheduled_date === scheduledDate && row.position != null)
    .map((row) => row.position as number)
  return positions.length === 0 ? 0 : Math.max(...positions) + 1
}

/**
 * Create an Item.
 *
 * The two write-boundary rules from ADR-0002 hold here exactly as they do on the
 * server: a start time implies a day, and a daily Habit is an undated template
 * whose days are instances.
 */
export async function createLocalTask(userId: string, input: LocalTaskInput): Promise<LocalTaskRow> {
  const startTime = input.startTime ?? null
  let scheduledDate = input.scheduledDate ?? null
  if (startTime && !scheduledDate) scheduledDate = new Date().toISOString().slice(0, 10)

  return mutateLocalDatabase(userId, (database) => {
    const timestamp = nowIso()
    const row = LocalTaskRowFrom({
      id: localId(),
      user_id: userId,
      title: input.title,
      type: input.type,
      category: input.category,
      start_time: startTime,
      location: input.type === 'task' ? input.location ?? null : null,
      duration: input.duration ?? null,
      repeat_type: input.repeat ?? 'none',
      scheduled_date: input.type === 'habit' ? null : scheduledDate,
      position: input.type !== 'habit' && !startTime && scheduledDate
        ? nextPosition(database, scheduledDate)
        : null,
      habit_target_value: input.habitTarget?.value ?? null,
      habit_target_unit: input.habitTarget?.unit ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    })
    return {
      next: { ...database, tasks: [...database.tasks, row] },
      result: row,
    }
  })
}

function LocalTaskRowFrom(partial: Partial<LocalTaskRow> & Pick<LocalTaskRow, 'id' | 'user_id' | 'title' | 'type' | 'category' | 'created_at' | 'updated_at'>): LocalTaskRow {
  return {
    start_time: null,
    location: null,
    duration: null,
    repeat_type: 'none',
    completed: false,
    completed_at: null,
    scheduled_date: null,
    position: null,
    original_habit_id: null,
    habit_target_value: null,
    habit_target_unit: null,
    habit_outcome: null,
    overdue_notified: false,
    rolled_over_from_task_id: null,
    original_created_at: null,
    deleted_at: null,
    ...partial,
  }
}

function requireRow(database: LocalDatabase, id: string): LocalTaskRow {
  const row = liveRows(database).find((candidate) => candidate.id === id)
  if (!row) throw new LocalStoreError(`No Item on this device with id ${id}.`)
  return row
}

function replaceRow(database: LocalDatabase, row: LocalTaskRow): LocalDatabase {
  return {
    ...database,
    tasks: database.tasks.map((candidate) => (candidate.id === row.id ? row : candidate)),
  }
}

/**
 * Materialize the real row for a Habit's day (ADR-0001).
 *
 * Idempotent: at most one row per Habit per day, and an existing row is updated
 * with only the supplied overrides — so completing a Habit that was dragged keeps
 * its time, and dragging a completed one keeps it completed.
 */
function materializeHabitInstance(
  database: LocalDatabase,
  userId: string,
  templateId: string,
  date: string,
  overrides: Partial<LocalTaskRow>,
): { next: LocalDatabase; row: LocalTaskRow } {
  const existing = liveRows(database).find((row) => (
    row.original_habit_id === templateId && row.scheduled_date === date
  ))
  const timestamp = nowIso()
  if (existing) {
    const row = { ...existing, ...overrides, updated_at: timestamp }
    return { next: replaceRow(database, row), row }
  }

  const template = requireRow(database, templateId)
  const row = LocalTaskRowFrom({
    ...template,
    id: localId(),
    user_id: userId,
    original_habit_id: templateId,
    scheduled_date: date,
    completed: false,
    completed_at: null,
    habit_outcome: 'pending',
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  })
  return { next: { ...database, tasks: [...database.tasks, row] }, row }
}

export type LocalTaskUpdates = Partial<{
  title: string
  category: LocalTaskRow['category']
  startTime: string | null
  location: string | null
  duration: number | null
  scheduledDate: string | null
  position: number | null
  completed: boolean
  overdueNotified: boolean
}>

function rowOverrides(updates: LocalTaskUpdates): Partial<LocalTaskRow> {
  const overrides: Partial<LocalTaskRow> = {}
  if (updates.title !== undefined) overrides.title = updates.title
  if (updates.category !== undefined) overrides.category = updates.category
  if (updates.startTime !== undefined) overrides.start_time = updates.startTime
  if (updates.location !== undefined) overrides.location = updates.location
  if (updates.duration !== undefined) overrides.duration = updates.duration
  if (updates.scheduledDate !== undefined) overrides.scheduled_date = updates.scheduledDate
  if (updates.position !== undefined) overrides.position = updates.position
  if (updates.overdueNotified !== undefined) overrides.overdue_notified = updates.overdueNotified
  if (updates.completed !== undefined) {
    overrides.completed = updates.completed
    overrides.completed_at = updates.completed ? nowIso() : null
  }
  return overrides
}

/**
 * A pure drag touches only positional fields. An explicit edit also sends title,
 * category, duration or a date — which is what decides whether a drag on a
 * recurring Habit's parent materializes a per-day instance or mutates the
 * template's default (ADR-0001).
 */
function isPureDrag(overrides: Partial<LocalTaskRow>): boolean {
  const keys = Object.keys(overrides)
  return keys.length > 0 && keys.every((key) => key === 'start_time' || key === 'position')
}

/** The three identities a Habit interaction can name, resolved to one shape. */
function habitIdentity(database: LocalDatabase, id: string) {
  const virtual = parseHabitInstanceId(id)
  const row = liveRows(database).find((candidate) => candidate.id === (virtual?.originalHabitId ?? id))
  if (!row || row.type !== 'habit') return null

  if (virtual) return { templateId: row.id, instance: null as LocalTaskRow | null, date: virtual.date }
  if (row.original_habit_id) {
    return { templateId: row.original_habit_id, instance: row, date: row.scheduled_date }
  }
  if (row.repeat_type) return { templateId: row.id, instance: null as LocalTaskRow | null, date: row.scheduled_date }
  return null
}

/**
 * Edit an Item.
 *
 * The Habit branch mirrors the server rule for rule: a drag is always a per-day
 * override and never touches the template; `editScope: 'habit'` writes the
 * template *and* the selected day so the change is visible immediately, while
 * other materialized days stay as the historical snapshots they are; and the
 * default `'instance'` scope materializes the day carrying the edit.
 */
export function updateLocalTask(
  userId: string,
  id: string,
  updates: LocalTaskUpdates,
  editScope: 'instance' | 'habit' = 'instance',
): Promise<LocalTaskRow> {
  return mutateLocalDatabase(userId, (database) => {
    const overrides = rowOverrides(updates)
    if (Object.keys(overrides).length === 0) {
      throw new LocalStoreError('No valid fields to update.')
    }

    const habit = habitIdentity(database, id)
    if (!habit) {
      const row = requireRow(database, id)
      // Normalize at the write boundary (ADR-0002): giving a Someday Task a start
      // time with no date schedules it for today.
      if (overrides.start_time && updates.scheduledDate === undefined && !row.scheduled_date) {
        overrides.scheduled_date = new Date().toISOString().slice(0, 10)
      }
      const updated = { ...row, ...overrides, updated_at: nowIso() }
      return { next: replaceRow(database, updated), result: updated }
    }

    // A Habit has no location: it is a repeating intention, not a place.
    delete overrides.location
    if (Object.keys(overrides).length === 0) {
      throw new LocalStoreError('No valid fields to update.')
    }

    if (isPureDrag(overrides)) {
      if (habit.instance) {
        const updated = { ...habit.instance, ...overrides, updated_at: nowIso() }
        return { next: replaceRow(database, updated), result: updated }
      }
      if (!habit.date) throw new LocalStoreError('Placing a Habit needs the day it belongs to.')
      // `completed` is deliberately omitted so dragging a completed day keeps it so.
      const { next, row } = materializeHabitInstance(database, userId, habit.templateId, habit.date, overrides)
      return { next, result: row }
    }

    if (editScope === 'habit') {
      // A recurring Habit has no single date, so the template never takes one.
      const { scheduled_date: _ignored, ...templateOverrides } = overrides
      const template = requireRow(database, habit.templateId)
      const updatedTemplate = { ...template, ...templateOverrides, updated_at: nowIso() }
      const withTemplate = replaceRow(database, updatedTemplate)
      if (!habit.date) return { next: withTemplate, result: updatedTemplate }

      const { next, row } = materializeHabitInstance(
        withTemplate, userId, habit.templateId, habit.date, templateOverrides,
      )
      return { next, result: row }
    }

    const date = overrides.scheduled_date || habit.date
    if (!date) throw new LocalStoreError('Editing a Habit day needs the day it belongs to.')
    if (habit.instance) {
      const updated = { ...habit.instance, ...overrides, updated_at: nowIso() }
      return { next: replaceRow(database, updated), result: updated }
    }
    const { next, row } = materializeHabitInstance(database, userId, habit.templateId, date, overrides)
    return { next, result: row }
  })
}

export function completeLocalTask(userId: string, id: string): Promise<LocalTaskRow> {
  return updateLocalTask(userId, id, { completed: true })
}

export type LocalDeleteScope = 'instance' | 'habit'

/**
 * Soft-delete, always.
 *
 * `deleted_at` rather than removal keeps the row available to a later Claim and
 * matches what the server stores, so the two never disagree about what happened.
 */
export function deleteLocalTask(
  userId: string,
  id: string,
  scope: LocalDeleteScope = 'instance',
): Promise<void> {
  return mutateLocalDatabase(userId, (database) => {
    const timestamp = nowIso()
    const target = liveRows(database).find((row) => row.id === id)
    const virtual = target ? null : parseHabitInstanceId(id)
    const templateId = scope === 'habit'
      ? (target?.original_habit_id ?? target?.id ?? virtual?.originalHabitId ?? null)
      : null

    if (scope === 'habit' && templateId) {
      // Deleting the Habit takes the template and every instance of it with it.
      const doomed = new Set(
        liveRows(database)
          .filter((row) => row.id === templateId || row.original_habit_id === templateId)
          .map((row) => row.id),
      )
      if (doomed.size === 0) throw new LocalStoreError(`No Habit on this device with id ${id}.`)
      return {
        next: {
          ...database,
          tasks: database.tasks.map((row) => (
            doomed.has(row.id) ? { ...row, deleted_at: timestamp, updated_at: timestamp } : row
          )),
        },
        result: undefined,
      }
    }

    if (!target) {
      // A virtual Habit instance has no row to delete, so there is nothing to do
      // and nothing was lost. Saying so is not the same as inventing a success on
      // a real id, which is why the unresolvable case still throws.
      if (virtual) return { next: database, result: undefined }
      throw new LocalStoreError(`No Item on this device with id ${id}.`)
    }

    return {
      next: replaceRow(database, { ...target, deleted_at: timestamp, updated_at: timestamp }),
      result: undefined,
    }
  })
}

/** Batch-persist Anytime backlog order; ids ordered front-to-back. */
export function reorderLocalTasks(userId: string, ids: string[]): Promise<void> {
  return mutateLocalDatabase(userId, (database) => {
    const position = new Map(ids.map((id, index) => [id, index]))
    const timestamp = nowIso()
    return {
      next: {
        ...database,
        tasks: database.tasks.map((row) => (
          position.has(row.id)
            ? { ...row, position: position.get(row.id) as number, updated_at: timestamp }
            : row
        )),
      },
      result: undefined,
    }
  })
}

export type LocalHabitProgress = {
  /** The materialized row the entries hang off — a Habit's day, made real. */
  instance: LocalTaskRow
  entries: LocalHabitProgressRow[]
  total: number
  outcome: HabitOutcome
}

function progressTotalFor(database: LocalDatabase, instanceId: string) {
  const entries = progressByInstance(database, [instanceId])[instanceId] ?? []
  return { entries, total: entries.reduce((sum, entry) => sum + Number(entry.amount), 0) }
}

function habitProgressFor(database: LocalDatabase, row: LocalTaskRow): LocalHabitProgress {
  const { entries, total } = progressTotalFor(database, row.id)
  return {
    instance: row,
    entries,
    total,
    outcome: row.habit_outcome ?? (row.completed ? 'completed' : 'pending'),
  }
}

/**
 * Settle a Habit's day against what has actually been measured, and write it.
 *
 * The same `deriveHabitOutcome` the server applies, so a Habit at 15 of 20
 * minutes reads `partial` whether the entry was recorded online or offline.
 */
function applyDerivedOutcome(database: LocalDatabase, row: LocalTaskRow): { next: LocalDatabase; result: LocalHabitProgress } {
  const { entries, total } = progressTotalFor(database, row.id)
  const outcome = deriveHabitOutcome(total, row.habit_target_value)
  const settled: LocalTaskRow = {
    ...row,
    habit_outcome: outcome,
    completed: outcome === 'completed',
    completed_at: outcome === 'completed' ? nowIso() : null,
    updated_at: nowIso(),
  }
  return {
    next: replaceRow(database, settled),
    result: { instance: settled, entries, total, outcome },
  }
}

/**
 * Resolve a Habit reference to the real row its day is measured on.
 *
 * The reference may be a virtual instance id (`<templateId>-<YYYY-MM-DD>`), a
 * materialized instance id, or the template's own id with the day supplied
 * separately — the same three forms the server's `resolveInstance` accepts. All
 * three end at a materialized row, because a progress entry has to point at
 * something durable: measuring a Habit is a placement (ADR-0001).
 */
function resolveHabitInstance(
  database: LocalDatabase,
  userId: string,
  reference: string,
  date?: string,
): { next: LocalDatabase; row: LocalTaskRow } {
  const virtual = parseHabitInstanceId(reference)
  const templateId = virtual?.originalHabitId ?? reference
  const instanceDate = virtual?.date ?? date

  const row = liveRows(database).find((candidate) => candidate.id === templateId)
    ?? liveRows(database).find((candidate) => candidate.id === reference)
  if (!row) throw new LocalStoreError(`No Habit on this device with id ${reference}.`)
  if (row.type !== 'habit') throw new LocalStoreError(`The Item ${reference} is not a Habit.`)

  // Already an instance: it is its own day.
  if (row.original_habit_id) return { next: database, row }

  if (!instanceDate) throw new LocalStoreError('Measuring a Habit needs the day it belongs to.')
  return materializeHabitInstance(database, userId, row.id, instanceDate, {})
}

/**
 * Record progress against a Habit's day.
 *
 * Measuring a Habit is a placement, so the virtual instance becomes a real row
 * here — a progress entry has to point at something durable.
 */
export function addLocalHabitProgress(
  userId: string,
  id: string,
  input: { amount: number; note?: string | null; date?: string },
): Promise<LocalHabitProgress> {
  return mutateLocalDatabase(userId, (database) => {
    const { next, row } = resolveHabitInstance(database, userId, id, input.date)
    if (row.habit_target_value == null) {
      throw new LocalStoreError('Binary Habits do not accept progress.')
    }
    const timestamp = nowIso()
    const entry: LocalHabitProgressRow = {
      id: localId(),
      habit_instance_id: row.id,
      amount: input.amount,
      note: input.note ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    }
    const withEntry: LocalDatabase = { ...next, habitProgress: [...next.habitProgress, entry] }
    const settled = applyDerivedOutcome(withEntry, row)
    return { next: settled.next, result: settled.result }
  })
}

export function updateLocalHabitProgress(
  userId: string,
  id: string,
  entryId: string,
  input: { amount?: number; note?: string | null; date?: string },
): Promise<LocalHabitProgress> {
  return mutateLocalDatabase(userId, (database) => {
    const { row } = resolveHabitInstance(database, userId, id, input.date)
    const existing = database.habitProgress.find((entry) => entry.id === entryId)
    if (!existing || existing.habit_instance_id !== row.id) {
      throw new LocalStoreError(`No progress entry on this device with id ${entryId}.`)
    }
    const updated: LocalHabitProgressRow = {
      ...existing,
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      updated_at: nowIso(),
    }
    const next: LocalDatabase = {
      ...database,
      habitProgress: database.habitProgress.map((entry) => (entry.id === entryId ? updated : entry)),
    }
    const settled = applyDerivedOutcome(next, row)
    return { next: settled.next, result: settled.result }
  })
}

export function deleteLocalHabitProgress(
  userId: string,
  id: string,
  entryId: string,
  date?: string,
): Promise<LocalHabitProgress> {
  return mutateLocalDatabase(userId, (database) => {
    const { row } = resolveHabitInstance(database, userId, id, date)
    const existing = database.habitProgress.find((entry) => entry.id === entryId)
    if (!existing || existing.habit_instance_id !== row.id) {
      throw new LocalStoreError(`No progress entry on this device with id ${entryId}.`)
    }
    const next: LocalDatabase = {
      ...database,
      habitProgress: database.habitProgress.filter((entry) => entry.id !== entryId),
    }
    const settled = applyDerivedOutcome(next, row)
    return { next: settled.next, result: settled.result }
  })
}

/**
 * Settle a Habit's day the way the user asked, where that is honest.
 *
 * Marking a measured Habit done short of its target tops the record up with a
 * real entry rather than overriding the number, and marking one Not done when the
 * target is already met is refused — both decided by the same
 * `resolveHabitOutcomeRequest` the server uses.
 */
export function setLocalHabitOutcome(
  userId: string,
  id: string,
  outcome: 'pending' | 'completed' | 'failed',
  date?: string,
): Promise<LocalHabitProgress> {
  return mutateLocalDatabase(userId, (database) => {
    const { next, row } = resolveHabitInstance(database, userId, id, date)
    const { total } = progressTotalFor(next, row.id)
    const decision = resolveHabitOutcomeRequest({
      requested: outcome,
      total,
      target: row.habit_target_value,
    })

    if (decision.kind === 'refuse') throw new LocalStoreError(decision.reason)

    if (decision.kind === 'top_up') {
      const timestamp = nowIso()
      const withTopUp: LocalDatabase = {
        ...next,
        habitProgress: [...next.habitProgress, {
          id: localId(),
          habit_instance_id: row.id,
          amount: decision.amount,
          note: decision.note,
          created_at: timestamp,
          updated_at: timestamp,
        }],
      }
      const settled = applyDerivedOutcome(withTopUp, row)
      return { next: settled.next, result: settled.result }
    }

    const settled: LocalTaskRow = {
      ...row,
      habit_outcome: decision.outcome,
      completed: decision.outcome === 'completed',
      completed_at: decision.outcome === 'completed' ? nowIso() : null,
      updated_at: nowIso(),
    }
    const applied = replaceRow(next, settled)
    return { next: applied, result: habitProgressFor(applied, settled) }
  })
}

export async function readLocalSettings(userId: string): Promise<Settings> {
  return resolveLocalSettings(await loadLocalDatabase(userId))
}

export function updateLocalSettings(userId: string, patch: Partial<Settings>): Promise<Settings> {
  return mutateLocalDatabase(userId, (database) => {
    const next: LocalDatabase = {
      ...database,
      settings: { ...database.settings, ...patch },
      // Settings are one record, not rows, so this is the only timestamp they
      // have. Without it they would appear in a first push and never in a delta.
      settingsUpdatedAt: new Date().toISOString(),
    }
    return { next, result: resolveLocalSettings(next) }
  })
}
