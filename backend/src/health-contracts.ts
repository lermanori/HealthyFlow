/**
 * Health records in their two storage shapes, and the mapping between them.
 *
 * The server keeps snake_case columns; the device keeps the client shape it
 * already speaks (ADR-0011 and the Health-on-the-device design). Nothing needed
 * to cross that line until the sync exchange did, and when it does the mapping
 * has to run in *both* directions — which is the half that did not exist.
 *
 * Browser-safe, and deliberately paired: each `*ToRow` sits beside the
 * `*ToClient` it has to stay consistent with, because the failure mode of this
 * codebase is a rule written twice in two files and drifting. The workout and
 * Achievement pairs live in `workout-contracts.ts` and `achievement-contracts.ts`
 * for the same reason — beside their existing twins.
 *
 * The three `*ToClient` here were private to `src/lib/local/adopt.ts`. They are
 * shared rather than copied, so the day a column is added it is added once.
 */

type Row = Record<string, any>

const numberOrNull = (value: unknown) => (value == null ? null : Number(value))
const textOrNull = (value: unknown) => (value == null ? null : String(value))

/**
 * Carry a deletion onto a record coming down from the server.
 *
 * Only when it is actually set. `DaySummarySchema` is strict and spreads a
 * workout session straight through, so an unconditional `deletedAt: null` would
 * fail the whole day rather than this record.
 */
export function withDeletion<T extends object>(client: T, row: Row): T {
  const deletedAt = row.deleted_at ?? row.deletedAt ?? null
  return deletedAt ? { ...client, deletedAt } : client
}

/** What the sync writes back into a row, in the shape every table shares. */
export function rowBookkeeping(record: Row, userId: string) {
  return {
    id: String(record.id),
    user_id: userId,
    created_at: record.createdAt ?? record.created_at ?? null,
    updated_at: record.updatedAt ?? record.updated_at ?? null,
    deleted_at: record.deletedAt ?? record.deleted_at ?? null,
  }
}

// ---------------------------------------------------------------------------
// Calorie entries
// ---------------------------------------------------------------------------

export const calorieEntryToClient = (row: Row) => withDeletion({
  id: String(row.id),
  userId: String(row.user_id ?? row.userId),
  date: String(row.date),
  time: textOrNull(row.time),
  name: String(row.name ?? ''),
  calories: Number(row.calories),
  protein: numberOrNull(row.protein),
  carbs: numberOrNull(row.carbs),
  fat: numberOrNull(row.fat),
  quantity: textOrNull(row.quantity),
  createdAt: String(row.created_at ?? row.createdAt),
  updatedAt: String(row.updated_at ?? row.updatedAt),
}, row)

export const calorieEntryToRow = (record: Row, userId: string) => ({
  ...rowBookkeeping(record, userId),
  date: String(record.date),
  time: textOrNull(record.time),
  name: String(record.name ?? ''),
  calories: Number(record.calories ?? 0),
  protein: numberOrNull(record.protein),
  carbs: numberOrNull(record.carbs),
  fat: numberOrNull(record.fat),
  quantity: textOrNull(record.quantity),
})

// ---------------------------------------------------------------------------
// Calorie items — the reusable food history
// ---------------------------------------------------------------------------

export const calorieItemToClient = (row: Row) => withDeletion({
  id: String(row.id),
  userId: String(row.user_id ?? row.userId),
  name: String(row.name ?? ''),
  normalizedName: String(row.normalized_name ?? row.normalizedName ?? ''),
  quantity: textOrNull(row.quantity),
  normalizedQuantity: String(row.normalized_quantity ?? row.normalizedQuantity ?? ''),
  calories: Number(row.calories),
  protein: numberOrNull(row.protein),
  carbs: numberOrNull(row.carbs),
  fat: numberOrNull(row.fat),
  usageCount: Number(row.usage_count ?? row.usageCount ?? 0),
  lastUsedAt: String(row.last_used_at ?? row.lastUsedAt ?? row.updated_at ?? row.updatedAt),
  createdAt: String(row.created_at ?? row.createdAt),
  updatedAt: String(row.updated_at ?? row.updatedAt),
}, row)

export const calorieItemToRow = (record: Row, userId: string) => ({
  ...rowBookkeeping(record, userId),
  name: String(record.name ?? ''),
  // The unique key the table is indexed on. The device never authors a calorie
  // item — they only ever arrive by download — so the normalization that came
  // with one is the server's own and is kept. The fallback is for a record that
  // somehow carries none: a missing unique key would fail the whole exchange.
  normalized_name: String(record.normalizedName ?? record.normalized_name ?? record.name ?? '')
    .trim().toLowerCase(),
  quantity: textOrNull(record.quantity),
  normalized_quantity: String(record.normalizedQuantity ?? record.normalized_quantity ?? '')
    .trim().toLowerCase(),
  calories: Number(record.calories ?? 0),
  protein: numberOrNull(record.protein),
  carbs: numberOrNull(record.carbs),
  fat: numberOrNull(record.fat),
  usage_count: Number(record.usageCount ?? record.usage_count ?? 1),
  last_used_at: record.lastUsedAt ?? record.last_used_at ?? null,
})

// ---------------------------------------------------------------------------
// Weight entries
// ---------------------------------------------------------------------------

export const weightEntryToClient = (row: Row) => withDeletion({
  id: String(row.id),
  userId: String(row.user_id ?? row.userId),
  date: String(row.date),
  weightKg: Number(row.weight_kg ?? row.weightKg),
  createdAt: String(row.created_at ?? row.createdAt),
  updatedAt: String(row.updated_at ?? row.updatedAt),
}, row)

export const weightEntryToRow = (record: Row, userId: string) => ({
  ...rowBookkeeping(record, userId),
  date: String(record.date),
  weight_kg: Number(record.weightKg ?? record.weight_kg ?? 0),
})

const HealthContracts = {
  withDeletion,
  rowBookkeeping,
  calorieEntryToClient,
  calorieEntryToRow,
  calorieItemToClient,
  calorieItemToRow,
  weightEntryToClient,
  weightEntryToRow,
}

export default HealthContracts
