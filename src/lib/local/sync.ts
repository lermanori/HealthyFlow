import SyncContracts, { type SyncCollection } from '../../../backend/src/sync-contracts'
import {
  LocalDatabaseSchema,
  LocalStoreError,
  loadLocalDatabase,
  mutateLocalDatabase,
  type LocalDatabase,
} from './store'

const { SYNC_COLLECTIONS, SYNC_IDENTITY, changedAt, mergeRows } = SyncContracts

/**
 * The device half of the exchange.
 *
 * The same `mergeRows` the server runs, with the same identity per collection, so
 * a row that loses here loses there too. Two implementations of one rule is the
 * mistake this codebase has already paid for three times.
 */

type Row = { id: string; [key: string]: unknown }

/** What one side sends: every collection, plus settings as one record. */
export type SyncDelta = Record<SyncCollection, Row[]> & { settings: Record<string, unknown> | null }
/** What arrives. Partial, because a collection that did not change is simply absent. */
export type SyncIncoming = Partial<SyncDelta>

/**
 * Everything this device changed since the server last saw it.
 *
 * A null watermark means nothing has been synced, so the delta is the whole day —
 * the same exchange, not a separate first-push mechanism.
 */
export function collectDelta(database: LocalDatabase): SyncDelta {
  const since = database.syncedAt
  const delta: Record<string, unknown> = {}
  for (const collection of SYNC_COLLECTIONS) {
    const rows = (database[collection] ?? []) as Row[]
    delta[collection] = since ? rows.filter((row) => changedAt(row) > since) : [...rows]
  }

  // Settings are one record with one timestamp, not rows, so they are compared
  // whole. Nothing is sent when this device has never set one: a first push would
  // otherwise upload an empty object and wipe the settings the account had.
  const held = Object.keys(database.settings).length > 0
  const moved = !since
    || (database.settingsUpdatedAt !== null && database.settingsUpdatedAt > since)
  delta.settings = held && moved
    ? { ...database.settings, updated_at: database.settingsUpdatedAt }
    : null

  return delta as SyncDelta
}

/**
 * Fold the server's reply into the document.
 *
 * Nothing is written here — this is the pure half, so the merge can be tested
 * without a driver and so a document that fails to validate never reaches disk.
 */
export function applyIncoming(database: LocalDatabase, incoming: SyncIncoming): LocalDatabase {
  const next = { ...database } as unknown as Record<string, unknown>

  for (const collection of SYNC_COLLECTIONS) {
    const arrived = (incoming[collection] ?? []) as Row[]
    if (arrived.length === 0) continue
    next[collection] = mergeRows(
      (database[collection] ?? []) as Row[],
      arrived,
      SYNC_IDENTITY[collection],
    )
  }

  const arrivedSettings = (incoming.settings ?? null) as Record<string, unknown> | null
  if (arrivedSettings) {
    const { updated_at: serverAt, ...patch } = arrivedSettings
    const deviceAt = database.settingsUpdatedAt
    // Whole-object last-write-wins, and a tie goes to the device — the same rule
    // rows follow, for the same reason: it is where the person was working.
    if (!deviceAt || String(serverAt ?? '') > deviceAt) {
      next.settings = patch
      next.settingsUpdatedAt = (serverAt as string | undefined) ?? deviceAt
    }
  }

  return next as unknown as LocalDatabase
}

/**
 * Run one exchange.
 *
 * Offline is not a special case: the call fails, the watermark does not advance,
 * and the next exchange carries whatever accumulated. There is nothing to retry
 * and no queue to drain.
 *
 * The merge and the watermark land in **one** write. Advancing the watermark
 * separately would mean a failure between the two could mark rows as seen that
 * were never stored, and those rows would never be sent again.
 */
export async function runSync(
  userId: string,
  exchange: (body: { since: string | null; changed: SyncDelta }) => Promise<{
    syncedAt: string
    changed: SyncIncoming
  }>,
): Promise<void> {
  const database = await loadLocalDatabase(userId)
  const reply = await exchange({ since: database.syncedAt, changed: collectDelta(database) })

  await mutateLocalDatabase(userId, (current) => {
    const merged = { ...applyIncoming(current, reply.changed), syncedAt: reply.syncedAt }
    // Validated before it is written, because this is the write carrying records
    // this device did not create. A document that saves and cannot be read back
    // destroys access to a day while reporting that it stored one — which is
    // exactly what signing in once did.
    const checked = LocalDatabaseSchema.safeParse(merged)
    if (!checked.success) {
      throw new LocalStoreError(
        'The day the server sent back could not be saved to this iPhone in a shape it can read back.',
        { cause: checked.error, reason: 'unknown_version' },
      )
    }
    return { next: checked.data, result: undefined }
  })
}
