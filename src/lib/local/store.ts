import { z } from 'zod'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import TaskContracts from '../../../backend/src/task-contracts'

const { CategorySchema, ItemTypeSchema } = TaskContracts

/**
 * Where a Guest's day actually lives.
 *
 * Free users' data is not hosted (`TARGET.md`), so the device is the source and
 * the server is not a fallback for it. Two consequences run through this file:
 *
 * 1. **Rows are stored in the server's own snake_case shape.** The same
 *    `composeDayTaskRows` and `itemRowToClient` in the browser-safe day core run
 *    over them, so a day rendered offline and a day rendered online are the same
 *    shape by construction rather than by convention — and Claim, when it lands,
 *    is an upload rather than a translation.
 * 2. **Records are born sync-ready.** Ids are generated on the device and every
 *    record carries `updated_at`. If the server assigned ids at claim time every
 *    local id would change on upload and a later sync would have no stable
 *    identity to reconcile against. This is the single decision that keeps
 *    "backup now, sync later" cheap, and it costs nothing today.
 */

export const LOCAL_DATABASE_VERSION = 2
const DOCUMENT_NAME = 'healthyflow-day.json'
/**
 * `Directory.Data` is `Library/NoCloud` on iOS: it survives app updates and is
 * excluded from iCloud backup. Excluded is the deliberate half — cross-device is
 * what the Cloud subscription sells, so a Guest's day reaching a second device
 * for free would be the product giving itself away.
 */
const DOCUMENT_DIRECTORY = Directory.Data

const nullableString = z.string().nullable().default(null)
const nullableNumber = z.number().nullable().default(null)

/**
 * One `tasks` row, written down for the first time.
 *
 * Deliberately permissive about extra keys: a row that has been round-tripped
 * through the server carries columns the device never sets, and dropping them on
 * read would quietly lose data. Unknown keys are preserved.
 */
export const LocalTaskRowSchema = z.looseObject({
  id: z.string().min(1),
  user_id: z.string().min(1),
  title: z.string(),
  type: ItemTypeSchema,
  category: CategorySchema,
  start_time: nullableString,
  location: nullableString,
  duration: nullableNumber,
  repeat_type: z.enum(['none', 'daily', 'weekly']).nullable().default('none'),
  completed: z.boolean().default(false),
  completed_at: nullableString,
  scheduled_date: nullableString,
  position: nullableNumber,
  original_habit_id: nullableString,
  habit_target_value: nullableNumber,
  habit_target_unit: nullableString,
  habit_outcome: z.enum(['pending', 'partial', 'completed', 'failed']).nullable().default(null),
  overdue_notified: z.boolean().default(false),
  rolled_over_from_task_id: nullableString,
  original_created_at: nullableString,
  deleted_at: nullableString,
  created_at: z.string(),
  updated_at: z.string(),
})
export type LocalTaskRow = z.infer<typeof LocalTaskRowSchema>

/** One `habit_progress_entries` row, keyed to the Habit instance it measures. */
export const LocalHabitProgressRowSchema = z.looseObject({
  id: z.string().min(1),
  habit_instance_id: z.string().min(1),
  amount: z.number().positive(),
  note: nullableString,
  created_at: z.string(),
  updated_at: z.string(),
})
export type LocalHabitProgressRow = z.infer<typeof LocalHabitProgressRowSchema>

/**
 * Health records, stored in the client shape rather than the server's.
 *
 * Items are stored as server rows because `itemRowToClient` and
 * `composeDayTaskRows` consume rows. Health is the other way round: the four
 * health services return client shapes, the day core spreads workout sessions and
 * reads achievement summaries in client shape, and `calorieRowToClient` and
 * `weightRowToClient` were already written to accept either. Each side stores
 * whatever shape its consumers already speak, so no mapping layer exists to get
 * wrong.
 *
 * Deliberately permissive about the fields themselves: these mirror interfaces in
 * `src/services/api.ts` that this file must not fork, so the schema pins identity
 * and the dates a day is composed from, and preserves the rest.
 */
const HealthRecordSchema = z.looseObject({
  id: z.string().min(1),
  userId: z.string().min(1),
})

const DatedHealthRecordSchema = HealthRecordSchema.extend({
  date: z.string().min(1),
})

/**
 * The whole document.
 *
 * `settings` is stored as the patch the user has actually made rather than a
 * resolved Settings object, so a default that changes in a later release reaches
 * a Guest who never touched that toggle.
 */
export const LocalDatabaseSchema = z.object({
  version: z.literal(LOCAL_DATABASE_VERSION),
  userId: z.string().min(1),
  tasks: z.array(LocalTaskRowSchema).default([]),
  habitProgress: z.array(LocalHabitProgressRowSchema).default([]),
  settings: z.record(z.string(), z.unknown()).default({}),

  // Health. Food, weight and training are core rather than optional (TARGET.md),
  // so a Guest holds them exactly as they hold their Items.
  calorieEntries: z.array(DatedHealthRecordSchema).default([]),
  calorieItems: z.array(HealthRecordSchema).default([]),
  weightEntries: z.array(DatedHealthRecordSchema).default([]),
  // Sessions and plans carry their exercises inline, as the client shape does —
  // two arrays the server needs as separate tables and a device does not.
  workoutSessions: z.array(DatedHealthRecordSchema).default([]),
  workoutPlans: z.array(HealthRecordSchema).default([]),
  workoutExerciseItems: z.array(HealthRecordSchema).default([]),
  achievementDefinitions: z.array(HealthRecordSchema).default([]),
  achievementEntries: z.array(DatedHealthRecordSchema).default([]),
})
export type LocalDatabase = z.infer<typeof LocalDatabaseSchema>

export function emptyLocalDatabase(userId: string): LocalDatabase {
  return {
    version: LOCAL_DATABASE_VERSION,
    userId,
    tasks: [],
    habitProgress: [],
    settings: {},
    calorieEntries: [],
    calorieItems: [],
    weightEntries: [],
    workoutSessions: [],
    workoutPlans: [],
    workoutExerciseItems: [],
    achievementDefinitions: [],
    achievementEntries: [],
  }
}

/**
 * Reading and writing the document, and nothing else.
 *
 * `read` answers `null` when nothing has ever been written — a first open, which
 * is an empty day and not a failure. Anything that goes wrong while reading
 * throws, because a failed read is never an empty result: silently starting a
 * returning Guest on a blank day would destroy their only copy on the next write.
 */
export type LocalStoreDriver = {
  read: () => Promise<string | null>
  write: (contents: string) => Promise<void>
  /** Erase the document. Only ever called for an explicit, user-chosen deletion. */
  clear: () => Promise<void>
}

export const capacitorFilesystemDriver: LocalStoreDriver = {
  read: async () => {
    // Existence is checked by listing the directory rather than by catching the
    // read error, so "no document yet" is never confused with "the read broke".
    const listing = await Filesystem.readdir({ path: '', directory: DOCUMENT_DIRECTORY })
    if (!listing.files.some((entry) => entry.name === DOCUMENT_NAME)) return null
    const file = await Filesystem.readFile({
      path: DOCUMENT_NAME,
      directory: DOCUMENT_DIRECTORY,
      encoding: Encoding.UTF8,
    })
    return typeof file.data === 'string' ? file.data : await file.data.text()
  },
  write: async (contents) => {
    await Filesystem.writeFile({
      path: DOCUMENT_NAME,
      directory: DOCUMENT_DIRECTORY,
      encoding: Encoding.UTF8,
      data: contents,
    })
  },
  clear: async () => {
    const listing = await Filesystem.readdir({ path: '', directory: DOCUMENT_DIRECTORY })
    if (!listing.files.some((entry) => entry.name === DOCUMENT_NAME)) return
    await Filesystem.deleteFile({ path: DOCUMENT_NAME, directory: DOCUMENT_DIRECTORY })
  },
}

/** An in-process driver, for tests and for the day core's own unit coverage. */
export function memoryDriver(initial: string | null = null): LocalStoreDriver & { contents: string | null } {
  const driver = {
    contents: initial,
    read: async () => driver.contents,
    write: async (contents: string) => { driver.contents = contents },
    clear: async () => { driver.contents = null },
  }
  return driver
}

let driver: LocalStoreDriver = capacitorFilesystemDriver
let loaded: LocalDatabase | null = null

/**
 * Point the store at a different driver, discarding anything already loaded.
 *
 * The whole document is held in memory once loaded: composing a day reads seven
 * days of Items, and re-reading the file seven times to answer one question would
 * be absurd. Writes go through to the driver immediately.
 */
export function setLocalStoreDriver(next: LocalStoreDriver) {
  driver = next
  loaded = null
}

export function resetLocalStore() {
  loaded = null
}

/**
 * Whether this device is holding a day.
 *
 * Used to tell an orphaned Guest apart from a first-time visitor: if a session
 * cannot be restored while a document is still sitting here, someone's day is
 * stranded and the app has to say so rather than bounce them to a sign-in screen
 * they have no way to pass (ADR-0010).
 */
export async function localDayExists(): Promise<boolean> {
  return (await driver.read()) !== null
}

/**
 * Erase the day on this device.
 *
 * Only for a deletion the user asked for by name. A Guest's day exists in one
 * place, so nothing else may reach this — not a failed read, not a session that
 * could not be restored, not a sign-out.
 */
export async function clearLocalDay(): Promise<void> {
  await driver.clear()
  loaded = null
}

export async function loadLocalDatabase(userId: string): Promise<LocalDatabase> {
  if (loaded && loaded.userId === userId) return loaded

  const contents = await driver.read()
  if (contents === null) {
    loaded = emptyLocalDatabase(userId)
    return loaded
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch (cause) {
    throw new LocalStoreError('The day stored on this device could not be read.', { cause })
  }

  const result = LocalDatabaseSchema.safeParse(upgraded(parsed))
  if (!result.success) {
    throw new LocalStoreError('The day stored on this device is not in a shape this version understands.', {
      cause: result.error,
    })
  }
  if (result.data.userId !== userId) {
    // The document belongs to someone else. Overwriting it would destroy a day
    // that is the only copy of itself, so this stops rather than guesses.
    throw new LocalStoreError('The day stored on this device belongs to a different session.')
  }

  loaded = result.data
  return loaded
}

/**
 * Bring an older document up to the current version.
 *
 * Version 1 held Items, Habit progress and settings; version 2 adds health. A
 * version-1 document *is* a version-2 document with no health in it, so the
 * upgrade is the eight empty arrays the schema already defaults, plus the version
 * stamp. Anything the code does not recognise still throws rather than being read
 * as an empty day.
 */
function upgraded(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null) return parsed
  const document = parsed as { version?: unknown }
  if (document.version === 1) return { ...document, version: LOCAL_DATABASE_VERSION }
  return parsed
}

export class LocalStoreError extends Error {
  readonly cause?: unknown
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'LocalStoreError'
    this.cause = options?.cause
  }
}

/**
 * Apply a change and persist it.
 *
 * The in-memory copy is only advanced once the write has succeeded, so a failed
 * write leaves the app reading what is actually on disk rather than a change that
 * exists nowhere.
 */
export async function mutateLocalDatabase<T>(
  userId: string,
  change: (database: LocalDatabase) => { next: LocalDatabase; result: T },
): Promise<T> {
  const current = await loadLocalDatabase(userId)
  const { next, result } = change(current)
  await driver.write(JSON.stringify(next))
  loaded = next
  return result
}

/**
 * A client-generated identifier.
 *
 * `crypto.randomUUID` needs iOS 15.4, and one of the app target's two build
 * configurations still declares a 15.0 floor, so the fallback derives a v4 UUID
 * from `getRandomValues` rather than from anything weaker.
 */
export function localId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
