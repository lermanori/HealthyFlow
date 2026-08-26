import { z } from 'zod'

/**
 * The exchange, and the one rule it runs on — browser-safe.
 *
 * The request and the response are the same shape on purpose: it forces one merge
 * implementation instead of two. `composeDayTaskRows`, `deriveHabitOutcome` and
 * `summarizeAchievement` all exist because a rule was written twice and drifted,
 * and each cost a bug before it was noticed.
 *
 * **The wire speaks the device's shape.** Items and Habit progress travel as
 * server rows because both sides store them that way; health travels in the
 * client shape, because that is what the device's document holds (ADR-0011).
 * The server translates at its own boundary — it is the side with a relational
 * schema to adapt to, and putting the mapping there keeps `mergeRows` working
 * over one shape per collection and keeps what comes back readable by
 * `LocalDatabaseSchema`.
 */

const SyncRowSchema = z.looseObject({
  id: z.string().min(1),
  updated_at: z.string().optional(),
  updatedAt: z.string().optional(),
  created_at: z.string().optional(),
  createdAt: z.string().optional(),
}).refine((row) => {
  const value = row.updated_at ?? row.updatedAt ?? row.created_at ?? row.createdAt
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}, 'Every synced record needs a valid change timestamp.')

/** Everything that travels, by collection. Rows are opaque here; the merge only reads ids and times. */
export const SyncPayloadSchema = z.object({
  tasks: z.array(SyncRowSchema).default([]),
  habitProgress: z.array(SyncRowSchema).default([]),
  calorieEntries: z.array(SyncRowSchema).default([]),
  calorieItems: z.array(SyncRowSchema).default([]),
  weightEntries: z.array(SyncRowSchema).default([]),
  workoutSessions: z.array(SyncRowSchema).default([]),
  workoutPlans: z.array(SyncRowSchema).default([]),
  workoutExerciseItems: z.array(SyncRowSchema).default([]),
  achievementDefinitions: z.array(SyncRowSchema).default([]),
  achievementEntries: z.array(SyncRowSchema).default([]),
  goals: z.array(SyncRowSchema).default([]),
  /**
   * Settings are a patch object, not rows, so they sync as one record with one
   * timestamp. Last write wins for the whole object: merging individual keys
   * would mean a schema for something already small enough to lose whole.
   */
  settings: z.looseObject({}).nullable().default(null),
})
export type SyncPayload = z.infer<typeof SyncPayloadSchema>

export const SyncRequestSchema = z.object({
  since: z.string().nullable(),
  changed: SyncPayloadSchema,
})
export type SyncRequest = z.infer<typeof SyncRequestSchema>

export const SyncResponseSchema = z.object({
  syncedAt: z.string(),
  changed: SyncPayloadSchema,
})
export type SyncResponse = z.infer<typeof SyncResponseSchema>

export const SYNC_COLLECTIONS = [
  'tasks', 'habitProgress', 'calorieEntries', 'calorieItems', 'weightEntries',
  'workoutSessions', 'workoutPlans', 'workoutExerciseItems',
  'achievementDefinitions', 'achievementEntries', 'goals',
] as const
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number]

/** A device more than this far ahead of the server is wrong, not early. */
export const SYNC_FUTURE_TOLERANCE_MS = 5 * 60 * 1000

/** A row as the merge sees it: an identity and whatever else it carries. */
export type SyncRow = { id: string; [key: string]: unknown }
type Row = SyncRow

/**
 * What makes two rows the same row.
 *
 * Usually the id, which the device generates precisely so a record can be written
 * twice without becoming two records. Four tables are different: they carry a
 * unique constraint on a natural key, so two devices that each log today's weight
 * while apart produce two ids for one row. Upserting those on the id violates the
 * constraint and fails the whole exchange; treating the natural key as the
 * identity collapses them the same way Postgres would.
 *
 * Stated without `user_id`, which every one of those constraints also includes:
 * a device's document belongs to one person, so there is nothing to disambiguate
 * on this side. The server adds it back for its own `ON CONFLICT`.
 */
export const SYNC_IDENTITY: Record<SyncCollection, readonly string[]> = {
  tasks: ['id'],
  habitProgress: ['id'],
  calorieEntries: ['id'],
  // UNIQUE (user_id, normalized_name, normalized_quantity)
  calorieItems: ['normalized_name', 'normalized_quantity'],
  // UNIQUE (user_id, date)
  weightEntries: ['date'],
  workoutSessions: ['id'],
  workoutPlans: ['id'],
  // UNIQUE (user_id, normalized_name)
  workoutExerciseItems: ['normalized_name'],
  // UNIQUE (user_id, achievement_id, date)
  achievementEntries: ['achievement_id', 'date'],
  achievementDefinitions: ['id'],
  goals: ['id'],
}

/** `normalized_name` and `normalizedName` are the same field in two shapes. */
const camelCase = (name: string) => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())

/** One field of a row, in whichever shape the row is stored. */
export function field(row: Row, name: string): unknown {
  return row[name] ?? row[camelCase(name)]
}

/**
 * When a row last changed, in whichever shape it is stored.
 *
 * Items are kept as server rows and health in the client shape (ADR-0011 and the
 * Health-on-the-device design), so this reads both or it only works for half the
 * day.
 */
export function changedAt(row: Row): string {
  return String(row.updated_at ?? row.updatedAt ?? row.created_at ?? row.createdAt ?? '')
}

/** The key two rows have to share to be the same record. */
export function identityOf(row: Row, identity: readonly string[] = ['id']): string {
  return identity.map((name) => String(field(row, name) ?? '')).join('\0')
}

/**
 * Whether a row claims to have changed further ahead than a clock can drift.
 *
 * Storing one would let a device with a wrong clock win every conflict until real
 * time caught up. Refusing it costs one sync instead. A timestamp that cannot be
 * read at all is a broken row rather than an early one, and is refused where rows
 * are validated rather than being reported as a clock problem.
 */
export function isFromTheFuture(row: Row, now: Date): boolean {
  const at = Date.parse(changedAt(row))
  if (Number.isNaN(at)) return false
  return at > now.getTime() + SYNC_FUTURE_TOLERANCE_MS
}

/**
 * Union two sets of rows by identity, keeping the more recently changed of any pair.
 *
 * `fromDevice` is applied second so an exact tie goes to the device — the same
 * rule, stated the same way, wherever this runs. "Whichever arrived last" would
 * mean opposite things on the two sides and they would never agree.
 */
export function mergeRows(
  stored: Row[],
  fromDevice: Row[],
  identity: readonly string[] = ['id'],
): Row[] {
  const merged = new Map<string, Row>()
  for (const row of [...stored, ...fromDevice]) {
    const key = identityOf(row, identity)
    const existing = merged.get(key)
    if (!existing || changedAt(row) >= changedAt(existing)) merged.set(key, row)
  }
  return [...merged.values()]
}

const SyncContracts = {
  SyncPayloadSchema,
  SyncRequestSchema,
  SyncResponseSchema,
  SYNC_COLLECTIONS,
  SYNC_FUTURE_TOLERANCE_MS,
  SYNC_IDENTITY,
  field,
  changedAt,
  identityOf,
  isFromTheFuture,
  mergeRows,
}

export default SyncContracts
