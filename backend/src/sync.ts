import { supabase } from './supabase-client'
import AchievementContracts from './achievement-contracts'
import HealthContracts from './health-contracts'
import WorkoutContracts from './workout-contracts'
import {
  isFromTheFuture,
  SYNC_COLLECTIONS,
  SYNC_IDENTITY,
  type SyncCollection,
  type SyncRequest,
  type SyncResponse,
  type SyncRow,
} from './sync-contracts'

/**
 * One exchange: take what the device changed, give back what the server has.
 *
 * The watermark returned is the server's own clock. A device clock decides which
 * of two edits was later — that is about when a person did something — but it must
 * never decide what has already been seen, or a skewed clock either misses rows
 * forever or re-sends everything every time.
 *
 * The wire speaks the device's shape (see `sync-contracts.ts`), so the mapping
 * between that and the relational schema happens here, at the side that has the
 * relational schema. Items and Habit progress need none — they are server rows on
 * both sides.
 */

const { calorieEntryToClient, calorieEntryToRow, calorieItemToClient, calorieItemToRow,
  weightEntryToClient, weightEntryToRow, withDeletion } = HealthContracts
const { workoutSessionToClient, workoutSessionToRows, workoutPlanToClient, workoutPlanToRows,
  workoutExerciseItemToClient, workoutExerciseItemToRow } = WorkoutContracts
const { achievementDefinitionToClient, achievementDefinitionToRow,
  achievementEntryToClient, achievementEntryToRow } = AchievementContracts

type Row = Record<string, any>

const TABLES: Record<SyncCollection, string> = {
  tasks: 'tasks',
  habitProgress: 'habit_progress_entries',
  calorieEntries: 'calorie_entries',
  calorieItems: 'calorie_items',
  weightEntries: 'weight_entries',
  workoutSessions: 'workout_sessions',
  workoutPlans: 'workout_plans',
  workoutExerciseItems: 'workout_exercise_items',
  achievementDefinitions: 'achievement_definitions',
  achievementEntries: 'achievement_entries',
}

/**
 * The two collections whose records are not one row.
 *
 * A device keeps a session's exercises inside the session; the server keeps them
 * in their own table, keyed to the parent.
 */
const CHILDREN: Partial<Record<SyncCollection, { table: string; parent: string }>> = {
  workoutSessions: { table: 'workout_session_exercises', parent: 'session_id' },
  workoutPlans: { table: 'workout_plan_items', parent: 'plan_id' },
}

/**
 * How each collection crosses the line, in both directions.
 *
 * `toClient` takes a server row (plus its children where it has any); `toRows`
 * takes what the device sent and returns the parent row and its children. Items
 * and Habit progress pass through untouched — the identity mapping is written
 * out rather than special-cased so every collection is reachable the same way.
 */
const SHAPES: Record<SyncCollection, {
  toClient: (row: Row, children: Row[]) => Row
  toRows: (record: Row, userId: string) => { row: Row; exercises?: Row[] }
}> = {
  tasks: {
    toClient: (row) => row,
    toRows: (record, userId) => ({ row: { ...record, user_id: userId } }),
  },
  habitProgress: {
    toClient: (row) => row,
    toRows: (record, userId) => ({ row: { ...record, user_id: userId } }),
  },
  calorieEntries: {
    toClient: (row) => calorieEntryToClient(row),
    toRows: (record, userId) => ({ row: calorieEntryToRow(record, userId) }),
  },
  calorieItems: {
    toClient: (row) => calorieItemToClient(row),
    toRows: (record, userId) => ({ row: calorieItemToRow(record, userId) }),
  },
  weightEntries: {
    toClient: (row) => weightEntryToClient(row),
    toRows: (record, userId) => ({ row: weightEntryToRow(record, userId) }),
  },
  workoutSessions: {
    toClient: (row, children) => withDeletion(workoutSessionToClient(row, children), row),
    toRows: (record, userId) => workoutSessionToRows(record, userId),
  },
  workoutPlans: {
    toClient: (row, children) => withDeletion(workoutPlanToClient(row, children), row),
    toRows: (record, userId) => workoutPlanToRows(record, userId),
  },
  workoutExerciseItems: {
    toClient: (row) => withDeletion(workoutExerciseItemToClient(row), row),
    toRows: (record, userId) => ({ row: workoutExerciseItemToRow(record, userId) }),
  },
  achievementDefinitions: {
    toClient: (row) => withDeletion(achievementDefinitionToClient(row), row),
    toRows: (record, userId) => ({ row: achievementDefinitionToRow(record, userId) }),
  },
  achievementEntries: {
    toClient: (row) => withDeletion(achievementEntryToClient(row), row),
    toRows: (record, userId) => ({ row: achievementEntryToRow(record, userId) }),
  },
}

export class SyncClockError extends Error {
  constructor(public readonly collection: string) {
    super('A record was dated further ahead than a clock can drift.')
    this.name = 'SyncClockError'
  }
}

async function rowsChangedSince(table: string, userId: string, since: string | null): Promise<Row[]> {
  let query = supabase.from(table).select('*').eq('user_id', userId)
  if (since) query = query.gt('updated_at', since)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Row[]
}

async function childrenOf(table: string, parent: string, ids: string[]): Promise<Record<string, Row[]>> {
  if (ids.length === 0) return {}
  const { data, error } = await supabase.from(table).select('*').in(parent, ids)
  if (error) throw error
  return ((data ?? []) as Row[]).reduce<Record<string, Row[]>>((grouped, child) => {
    ;(grouped[String(child[parent])] ??= []).push(child)
    return grouped
  }, {})
}

/**
 * What Postgres should treat as "the same row".
 *
 * The id, except for the four tables carrying a unique constraint on a natural
 * key — there, two devices produce two ids for one record and an upsert on the id
 * violates the constraint. `SYNC_IDENTITY` states the key without `user_id`,
 * because a device's document belongs to one person; the constraint includes it,
 * so it goes back on here.
 */
function conflictTarget(collection: SyncCollection): string {
  const identity = SYNC_IDENTITY[collection]
  if (identity.length === 1 && identity[0] === 'id') return 'id'
  return ['user_id', ...identity].join(',')
}

async function acceptRows(collection: SyncCollection, userId: string, records: Row[]) {
  if (records.length === 0) return

  const mapped = records.map((record) => SHAPES[collection].toRows(record, userId))
  const { error } = await supabase
    .from(TABLES[collection])
    .upsert(mapped.map((entry) => entry.row), { onConflict: conflictTarget(collection) })
  if (error) throw error

  const child = CHILDREN[collection]
  if (!child) return

  // Children are replaced, not merged: they have no identity of their own on the
  // device, where they live inside their parent. Upserted first and the leftovers
  // removed second, so a failure between the two leaves a stale extra exercise
  // rather than a session that lost all of them.
  for (const entry of mapped) {
    const exercises = entry.exercises ?? []
    if (exercises.length > 0) {
      const { error: childError } = await supabase
        .from(child.table)
        .upsert(exercises, { onConflict: 'id' })
      if (childError) throw childError
    }
    let removal = supabase.from(child.table).delete().eq(child.parent, entry.row.id)
    if (exercises.length > 0) {
      removal = removal.not('id', 'in', `(${exercises.map((exercise) => exercise.id).join(',')})`)
    }
    const { error: removalError } = await removal
    if (removalError) throw removalError
  }
}

/** The settings row, which is one JSONB object rather than rows. */
async function settingsChangedSince(userId: string, since: string | null): Promise<Row | null> {
  let query = supabase.from('user_settings').select('*').eq('user_id', userId)
  if (since) query = query.gt('updated_at', since)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as Row
  return { ...(row.settings ?? {}), updated_at: row.updated_at }
}

async function exchange(userId: string, input: SyncRequest): Promise<SyncResponse> {
  const now = new Date()

  // Checked before anything is written, so a bad clock costs one exchange rather
  // than poisoning rows that then win every conflict until real time catches up.
  for (const collection of SYNC_COLLECTIONS) {
    for (const row of input.changed[collection]) {
      if (isFromTheFuture(row as SyncRow, now)) throw new SyncClockError(collection)
    }
  }
  if (input.changed.settings && isFromTheFuture(
    { id: 'settings', ...input.changed.settings } as SyncRow, now,
  )) {
    throw new SyncClockError('settings')
  }

  // Read before write, so the response carries what the server held rather than
  // what this device just sent it. Sending a device its own rows back is harmless
  // but wasteful, and it hides whether the pull half actually works.
  const before = {} as SyncResponse['changed']
  for (const collection of SYNC_COLLECTIONS) {
    const rows = await rowsChangedSince(TABLES[collection], userId, input.since)
    const child = CHILDREN[collection]
    const children = child
      ? await childrenOf(child.table, child.parent, rows.map((row) => String(row.id)))
      : {}
    ;(before as Record<string, unknown>)[collection] = rows.map((row) =>
      SHAPES[collection].toClient(row, children[String(row.id)] ?? []))
  }
  before.settings = await settingsChangedSince(userId, input.since)

  for (const collection of SYNC_COLLECTIONS) {
    await acceptRows(collection, userId, input.changed[collection] as Row[])
  }

  if (input.changed.settings) {
    // One row, one JSONB column, one timestamp. Last write wins for the whole
    // object: merging individual keys would mean a schema for something already
    // small enough to lose whole.
    const { updated_at: _updatedAt, ...settings } = input.changed.settings as Row
    const { error } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: userId, settings, updated_at: now.toISOString() },
        { onConflict: 'user_id' },
      )
    if (error) throw error
  }

  return { syncedAt: now.toISOString(), changed: before }
}

export const Sync = { exchange }
