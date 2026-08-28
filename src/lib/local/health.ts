import AchievementContracts from '../../../backend/src/achievement-contracts'
import WorkoutContracts from '../../../backend/src/workout-contracts'
import {
  loadLocalDatabase,
  localId,
  mutateLocalDatabase,
  LocalStoreError,
  type LocalDatabase,
} from './store'

const { summarizeAchievement } = AchievementContracts
const { WorkoutSessionSchema } = WorkoutContracts

/**
 * Food, weight, training and progress, held on the device.
 *
 * `TARGET.md` calls these core rather than optional, so a Guest holds them
 * exactly as they hold their Items. Records are stored in the client shape (see
 * the Health-on-the-device design), which is why nothing here maps: what is
 * stored is what the services return.
 */

type Record_ = { id: string; userId: string; deletedAt?: string | null; [key: string]: unknown }
type DatedRecord = Record_ & { date: string }

/** Which array of the document a kind of record lives in. */
type HealthCollection =
  | 'calorieEntries'
  | 'calorieItems'
  | 'weightEntries'
  | 'workoutSessions'
  | 'workoutPlans'
  | 'workoutExerciseItems'
  | 'achievementDefinitions'
  | 'achievementEntries'

const nowIso = () => new Date().toISOString()

function collection<T extends Record_>(database: LocalDatabase, name: HealthCollection): T[] {
  return database[name] as unknown as T[]
}

/** Every live record of a kind. Deleted rows stay stored and are never returned. */
async function read<T extends Record_>(userId: string, name: HealthCollection): Promise<T[]> {
  return live(collection<T>(await loadLocalDatabase(userId), name))
}

const live = <T extends Record_>(rows: T[]): T[] => rows.filter((row) => !row.deletedAt)

function insert<T extends Record_>(userId: string, name: HealthCollection, record: Omit<T, 'id' | 'userId'>): Promise<T> {
  return mutateLocalDatabase(userId, (database) => {
    const timestamp = nowIso()
    const created = {
      ...record,
      id: localId(),
      userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as unknown as T
    return {
      next: { ...database, [name]: [...collection<T>(database, name), created] },
      result: created,
    }
  })
}

function amend<T extends Record_>(
  userId: string,
  name: HealthCollection,
  id: string,
  changes: Partial<T>,
): Promise<T> {
  return mutateLocalDatabase(userId, (database) => {
    const rows = collection<T>(database, name)
    // A deleted row is not there to be amended. Reviving one by editing it would
    // undo a deletion that has already travelled, without anyone asking.
    const existing = rows.find((row) => row.id === id && !row.deletedAt)
    if (!existing) throw new LocalStoreError(`Nothing on this device with id ${id}.`)
    const updated = { ...existing, ...changes, updatedAt: nowIso() } as T
    return {
      next: { ...database, [name]: rows.map((row) => (row.id === id ? updated : row)) },
      result: updated,
    }
  })
}

/**
 * Mark a record deleted rather than removing it.
 *
 * A removed row and a row that was never there are the same thing to anything
 * downstream, so a delete has to travel as data. Items have always done this;
 * health did not, and a sync would have resurrected every deleted meal without
 * reporting anything.
 */
function discard(userId: string, name: HealthCollection, id: string): Promise<void> {
  return mutateLocalDatabase(userId, (database) => {
    const rows = collection(database, name)
    if (!rows.some((row) => row.id === id && !row.deletedAt)) {
      throw new LocalStoreError(`Nothing on this device with id ${id}.`)
    }
    const timestamp = nowIso()
    return {
      next: {
        ...database,
        [name]: rows.map((row) => (
          row.id === id ? { ...row, deletedAt: timestamp, updatedAt: timestamp } : row
        )),
      },
      result: undefined,
    }
  })
}

const onDate = <T extends DatedRecord>(rows: T[], date: string) => rows.filter((row) => row.date === date)

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export async function localCalorieEntries(userId: string, date: string) {
  const entries = onDate(await read<DatedRecord>(userId, 'calorieEntries'), date)
  // The day places an entry by its clock time, falling back to when it was
  // logged, so the order the device returns has to match the server's.
  return [...entries].sort((a, b) => {
    const timeA = (a.time as string | null) ?? null
    const timeB = (b.time as string | null) ?? null
    if (timeA && timeB) return timeA.localeCompare(timeB)
    if (timeA) return -1
    if (timeB) return 1
    return String(a.createdAt).localeCompare(String(b.createdAt))
  })
}

export const createLocalCalorieEntry = (userId: string, input: Record<string, unknown>) =>
  insert(userId, 'calorieEntries', input as never)
export const updateLocalCalorieEntry = (userId: string, id: string, patch: Record<string, unknown>) =>
  amend(userId, 'calorieEntries', id, patch as never)
export const removeLocalCalorieEntry = (userId: string, id: string) =>
  discard(userId, 'calorieEntries', id)
export const localCalorieItems = (userId: string) => read(userId, 'calorieItems')

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

/** One weight per day, so a second entry for a date replaces the first. */
export async function localWeightEntry(userId: string, date: string) {
  return onDate(await read<DatedRecord>(userId, 'weightEntries'), date)[0] ?? null
}

/** The recent run of weights, newest first, with the change the page shows. */
export async function localWeightTrend(userId: string, limit = 30) {
  const all = await read<DatedRecord>(userId, 'weightEntries')
  const entries = [...all].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
  const latest = entries[0] ?? null
  const previous = entries[1] ?? null
  return {
    entries,
    latest,
    previous,
    deltaKg: latest && previous ? Number(latest.weightKg) - Number(previous.weightKg) : null,
  }
}

export async function createLocalWeightEntry(userId: string, input: Record<string, unknown>) {
  const existing = await localWeightEntry(userId, String(input.date))
  if (existing) return amend(userId, 'weightEntries', existing.id, input as never)
  return insert(userId, 'weightEntries', input as never)
}

export const updateLocalWeightEntry = (userId: string, id: string, patch: Record<string, unknown>) =>
  amend(userId, 'weightEntries', id, patch as never)
export const removeLocalWeightEntry = (userId: string, id: string) =>
  discard(userId, 'weightEntries', id)

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export async function localWorkoutSessions(userId: string, date?: string) {
  const sessions = await read<DatedRecord>(userId, 'workoutSessions')
  const scoped = date ? onDate(sessions, date) : sessions
  return [...scoped]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((session) => WorkoutSessionSchema.parse(session))
}

/**
 * Normalise one exercise to the shape the day contract demands.
 *
 * `DaySummaryWorkoutExerciseSchema` is `.strict()` and its measurements are
 * `positive().nullable()`, so every field has to be present, unknown keys have to
 * be gone, and a zero has to become null — zero sets is not a measurement, it is
 * the absence of one.
 */
function normalizedExercise(raw: unknown, ownerKey: 'sessionId' | 'planId', ownerId: string, index: number) {
  const exercise = (raw ?? {}) as Record<string, unknown>
  const measure = (value: unknown) => {
    const parsed = value == null ? null : Number(value)
    return parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  return {
    id: typeof exercise.id === 'string' && exercise.id ? exercise.id : localId(),
    [ownerKey]: ownerId,
    name: String(exercise.name ?? ''),
    sets: measure(exercise.sets),
    reps: measure(exercise.reps),
    weightKg: measure(exercise.weightKg),
    durationMinutes: measure(exercise.durationMinutes),
    distanceKm: measure(exercise.distanceKm),
    notes: (exercise.notes as string | null) ?? null,
    position: typeof exercise.position === 'number' ? exercise.position : index,
  }
}

/** Exercises live inside the session, so a session is created whole. */
export function createLocalWorkoutSession(userId: string, input: Record<string, unknown>) {
  const sessionId = localId()
  const exercises = Array.isArray(input.exercises) ? input.exercises : []
  return mutateLocalDatabase(userId, (database) => {
    const timestamp = nowIso()
    // Built field by field rather than spread: the day contract is strict, so a
    // stray key from the caller would fail the whole day rather than this write.
    const created = {
      id: sessionId,
      userId,
      date: String(input.date),
      title: (input.title as string | null) ?? null,
      notes: (input.notes as string | null) ?? null,
      exercises: exercises.map((exercise, index) => normalizedExercise(exercise, 'sessionId', sessionId, index)),
      createdAt: timestamp,
      updatedAt: timestamp,
    } as unknown as DatedRecord
    return {
      next: { ...database, workoutSessions: [...collection<DatedRecord>(database, 'workoutSessions'), created] },
      result: created,
    }
  })
}

export const updateLocalWorkoutSession = (userId: string, id: string, patch: Record<string, unknown>) =>
  amend(userId, 'workoutSessions', id, patch as never)
export const removeLocalWorkoutSession = (userId: string, id: string) =>
  discard(userId, 'workoutSessions', id)
export const localWorkoutExerciseItems = (userId: string) => read(userId, 'workoutExerciseItems')

async function sessionExercises(userId: string, sessionId: string) {
  const sessions = await read<DatedRecord>(userId, 'workoutSessions')
  const session = sessions.find((row) => row.id === sessionId)
  if (!session) throw new LocalStoreError(`No Workout session on this device with id ${sessionId}.`)
  return { session, exercises: (session.exercises as Record<string, unknown>[]) ?? [] }
}

/**
 * Find the session an exercise belongs to.
 *
 * The API addresses an exercise by its own id alone — the server can, because the
 * row carries `session_id`. Here the exercise lives inside its session, so the
 * lookup is a scan. It is a scan over one person's sessions, held in memory.
 */
async function owningSession(userId: string, exerciseId: string) {
  const sessions = await read<DatedRecord>(userId, 'workoutSessions')
  const session = sessions.find((row) =>
    ((row.exercises as Record<string, unknown>[]) ?? []).some((exercise) => exercise.id === exerciseId))
  if (!session) throw new LocalStoreError(`No exercise on this device with id ${exerciseId}.`)
  return { session, exercises: (session.exercises as Record<string, unknown>[]) ?? [] }
}

export async function addLocalWorkoutExercise(userId: string, sessionId: string, input: Record<string, unknown>) {
  const { exercises } = await sessionExercises(userId, sessionId)
  const added = normalizedExercise(input, 'sessionId', sessionId, exercises.length)
  await amend(userId, 'workoutSessions', sessionId, { exercises: [...exercises, added] } as never)
  // The API answers with the exercise, not the session it landed in.
  return added
}

export async function updateLocalWorkoutExercise(
  userId: string,
  exerciseId: string,
  patch: Record<string, unknown>,
) {
  const { session, exercises } = await owningSession(userId, exerciseId)
  const existing = exercises.find((exercise) => exercise.id === exerciseId) as Record<string, unknown>
  const updated = normalizedExercise(
    { ...existing, ...patch },
    'sessionId',
    session.id,
    Number(existing.position ?? 0),
  )
  await amend(userId, 'workoutSessions', session.id, {
    exercises: exercises.map((exercise) => (exercise.id === exerciseId ? updated : exercise)),
  } as never)
  return updated
}

export async function removeLocalWorkoutExercise(userId: string, exerciseId: string) {
  const { session, exercises } = await owningSession(userId, exerciseId)
  await amend(userId, 'workoutSessions', session.id, {
    exercises: exercises.filter((exercise) => exercise.id !== exerciseId),
  } as never)
}

export const localWorkoutPlans = (userId: string) => read(userId, 'workoutPlans')
export function createLocalWorkoutPlan(userId: string, input: Record<string, unknown>) {
  const planId = localId()
  const exercises = Array.isArray(input.exercises) ? input.exercises : []
  return mutateLocalDatabase(userId, (database) => {
    const timestamp = nowIso()
    const created = {
      ...input,
      id: planId,
      userId,
      exercises: exercises.map((exercise, index) => normalizedExercise(exercise, 'planId', planId, index)),
      createdAt: timestamp,
      updatedAt: timestamp,
    } as unknown as Record_
    return {
      next: { ...database, workoutPlans: [...collection<Record_>(database, 'workoutPlans'), created] },
      result: created,
    }
  })
}
export const updateLocalWorkoutPlan = (userId: string, id: string, patch: Record<string, unknown>) =>
  amend(userId, 'workoutPlans', id, patch as never)
export const removeLocalWorkoutPlan = (userId: string, id: string) =>
  discard(userId, 'workoutPlans', id)

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Every Achievement with its recent history, summarised.
 *
 * The summary comes from `summarizeAchievement` in the browser-safe contracts —
 * the same function the server calls — so a trend or a personal best reads the
 * same whether it was derived offline or online.
 */
export async function localAchievements(
  userId: string,
  options: { includeArchived?: boolean; entryLimit?: number } = {},
) {
  const database = await loadLocalDatabase(userId)
  const definitions = live(collection<Record_>(database, 'achievementDefinitions'))
  const allEntries = live(collection<DatedRecord>(database, 'achievementEntries'))
  const entryLimit = options.entryLimit ?? 60

  return definitions
    .filter((definition) => options.includeArchived || !definition.archivedAt)
    .map((definition) => {
      const entries = allEntries
        .filter((entry) => entry.achievementId === definition.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, entryLimit)
      return summarizeAchievement(definition, entries)
    })
}

export const createLocalAchievement = (userId: string, input: Record<string, unknown>) =>
  insert(userId, 'achievementDefinitions', { ...input, archivedAt: null } as never)

export function updateLocalAchievement(userId: string, id: string, patch: Record<string, unknown>) {
  const { archived, ...rest } = patch
  return amend(userId, 'achievementDefinitions', id, {
    ...rest,
    ...(archived === undefined ? {} : { archivedAt: archived ? nowIso() : null }),
  } as never)
}

export async function removeLocalAchievement(userId: string, id: string) {
  // Its entries go with it: an entry that points at nothing would be a record
  // nobody can read and nobody can delete. Marked, not removed, so the deletion
  // reaches the server the same way the definition's does.
  await mutateLocalDatabase(userId, (database) => {
    const timestamp = nowIso()
    return {
      next: {
        ...database,
        achievementEntries: collection<DatedRecord>(database, 'achievementEntries').map((entry) => (
          entry.achievementId === id && !entry.deletedAt
            ? { ...entry, deletedAt: timestamp, updatedAt: timestamp }
            : entry
        )),
      },
      result: undefined,
    }
  })
  return discard(userId, 'achievementDefinitions', id)
}

export async function addLocalAchievementEntry(userId: string, achievementId: string, input: Record<string, unknown>) {
  const entries = await read<DatedRecord>(userId, 'achievementEntries')
  const clash = entries.find((entry) => entry.achievementId === achievementId && entry.date === input.date)
  if (clash) {
    // The server refuses a second entry for the same day, and so does this. A
    // silent overwrite would lose a measurement the user recorded.
    throw new LocalStoreError('That Achievement already has an entry for this date.')
  }
  return insert(userId, 'achievementEntries', { ...input, achievementId } as never)
}

export const updateLocalAchievementEntry = (userId: string, entryId: string, patch: Record<string, unknown>) =>
  amend(userId, 'achievementEntries', entryId, patch as never)
export const removeLocalAchievementEntry = (userId: string, entryId: string) =>
  discard(userId, 'achievementEntries', entryId)
