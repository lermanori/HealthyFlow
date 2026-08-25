import {
  changedAt,
  identityOf,
  isFromTheFuture,
  mergeRows,
  SYNC_FUTURE_TOLERANCE_MS,
  SYNC_IDENTITY,
} from '../../src/sync-contracts'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'row-1', updated_at: '2026-08-23T10:00:00.000Z', title: 'Server copy', ...over,
})

describe('merging one row against another', () => {
  it('keeps the more recently changed of the two', () => {
    const merged = mergeRows(
      [row()],
      [row({ updated_at: '2026-08-23T11:00:00.000Z', title: 'Device copy' })],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].title).toBe('Device copy')
  })

  it('keeps the stored row when the incoming one is older', () => {
    const merged = mergeRows(
      [row()],
      [row({ updated_at: '2026-08-23T09:00:00.000Z', title: 'Stale device copy' })],
    )
    expect(merged[0].title).toBe('Server copy')
  })

  it('gives an exact tie to the device, on both sides of the exchange', () => {
    // Saying "whichever arrived last" would mean opposite things on the server
    // and on the device, and the two would disagree about the same pair forever.
    const merged = mergeRows([row()], [row({ title: 'Device copy' })])
    expect(merged[0].title).toBe('Device copy')
  })

  it('carries a deletion like any other change', () => {
    const merged = mergeRows(
      [row()],
      [row({ updated_at: '2026-08-23T11:00:00.000Z', deleted_at: '2026-08-23T11:00:00.000Z' })],
    )
    expect(merged[0].deleted_at).toBe('2026-08-23T11:00:00.000Z')
  })

  it('keeps rows that exist on only one side', () => {
    const merged = mergeRows([row({ id: 'only-server' })], [row({ id: 'only-device' })])
    expect(merged.map((r) => r.id).sort()).toEqual(['only-device', 'only-server'])
  })

  it('reads camelCase as readily as snake_case', () => {
    // Items are stored as server rows and health in the client shape, so the rule
    // has to read both or it only works for half the day.
    const merged = mergeRows(
      [{ id: 'a', updatedAt: '2026-08-23T10:00:00.000Z', name: 'Server' }],
      [{ id: 'a', updatedAt: '2026-08-23T11:00:00.000Z', name: 'Device' }],
    )
    expect(merged[0].name).toBe('Device')
  })

  it('falls back to when a row was created if it has never been updated', () => {
    expect(changedAt({ id: 'a', created_at: '2026-08-23T10:00:00.000Z' }))
      .toBe('2026-08-23T10:00:00.000Z')
  })
})

describe('two rows that are the same record under a different id', () => {
  // Four tables carry a unique constraint on a natural key. Two devices will
  // independently coin different ids for the same key, and an upsert on the id
  // would then violate the constraint and fail the whole exchange.
  it('collapses a weight logged for the same date on two devices', () => {
    const merged = mergeRows(
      [{ id: 'server-id', date: '2026-08-23', weight_kg: 80, updated_at: '2026-08-23T10:00:00.000Z' }],
      [{ id: 'device-id', date: '2026-08-23', weightKg: 81, updatedAt: '2026-08-23T11:00:00.000Z' }],
      SYNC_IDENTITY.weightEntries,
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('device-id')
  })

  it('leaves a different date alone', () => {
    const merged = mergeRows(
      [{ id: 'a', date: '2026-08-23', updated_at: '2026-08-23T10:00:00.000Z' }],
      [{ id: 'b', date: '2026-08-24', updated_at: '2026-08-23T11:00:00.000Z' }],
      SYNC_IDENTITY.weightEntries,
    )
    expect(merged).toHaveLength(2)
  })

  it('reads a natural key in either shape', () => {
    expect(identityOf({ id: 'a', achievement_id: 'ach-1', date: '2026-08-23' }, SYNC_IDENTITY.achievementEntries))
      .toBe(identityOf({ id: 'b', achievementId: 'ach-1', date: '2026-08-23' }, SYNC_IDENTITY.achievementEntries))
  })

  it('keys on the id where a table has no natural key', () => {
    expect(SYNC_IDENTITY.tasks).toEqual(['id'])
    expect(identityOf({ id: 'task-1', title: 'Anything' }, SYNC_IDENTITY.tasks)).toBe('task-1')
  })
})

describe('a clock that is wrong', () => {
  it('refuses a row dated well beyond the server now', () => {
    const now = new Date('2026-08-23T10:00:00.000Z')
    const ahead = new Date(now.getTime() + SYNC_FUTURE_TOLERANCE_MS + 60_000).toISOString()
    expect(isFromTheFuture({ id: 'a', updated_at: ahead }, now)).toBe(true)
  })

  it('tolerates ordinary drift', () => {
    const now = new Date('2026-08-23T10:00:00.000Z')
    const slight = new Date(now.getTime() + 60_000).toISOString()
    expect(isFromTheFuture({ id: 'a', updated_at: slight }, now)).toBe(false)
  })

  it('does not call an unreadable timestamp a wrong clock', () => {
    // An unparseable date is a broken row, not an early one. It is refused where
    // rows are validated, not silently treated as a clock problem.
    expect(isFromTheFuture({ id: 'a', updated_at: 'not a date' }, new Date())).toBe(false)
  })
})
