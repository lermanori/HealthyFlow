import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { applyIncoming, collectDelta, runSync } from './sync'
import {
  LocalStoreError,
  emptyLocalDatabase,
  loadLocalDatabase,
  memoryDriver,
  setLocalStoreDriver,
  type LocalDatabase,
} from './store'

const USER = 'account-1'
const base = (): LocalDatabase => emptyLocalDatabase(USER)

const task = (over: Record<string, unknown> = {}) => ({
  id: 'task-1', user_id: USER, title: 'A task', type: 'task', category: 'work',
  created_at: '2026-08-23T09:00:00.000Z', updated_at: '2026-08-23T09:00:00.000Z',
  ...over,
}) as unknown as LocalDatabase['tasks'][number]

const weight = (over: Record<string, unknown> = {}) => ({
  id: 'weight-1', userId: USER, date: '2026-08-23', weightKg: 80,
  createdAt: '2026-08-23T09:00:00.000Z', updatedAt: '2026-08-23T09:00:00.000Z',
  ...over,
}) as unknown as LocalDatabase['weightEntries'][number]

beforeEach(() => {
  setLocalStoreDriver(memoryDriver(null))
})

describe('what the device sends', () => {
  it('sends everything when it has never synced', () => {
    const database = { ...base(), syncedAt: null, tasks: [task()] }

    assert.equal(collectDelta(database).tasks.length, 1)
  })

  it('sends only what changed since the watermark', () => {
    const database = {
      ...base(),
      syncedAt: '2026-08-23T10:00:00.000Z',
      tasks: [
        task({ id: 'old', updated_at: '2026-08-23T09:00:00.000Z' }),
        task({ id: 'new', updated_at: '2026-08-23T11:00:00.000Z' }),
      ],
    }

    assert.deepEqual(collectDelta(database).tasks.map((row) => row.id), ['new'])
  })

  it('sends a deletion, because it is a change like any other', () => {
    const database = {
      ...base(),
      syncedAt: '2026-08-23T10:00:00.000Z',
      tasks: [task({ deleted_at: '2026-08-23T11:00:00.000Z', updated_at: '2026-08-23T11:00:00.000Z' })],
    }

    assert.equal(collectDelta(database).tasks.length, 1)
  })

  it('sends a deleted health record too, in the shape the device stores', () => {
    const database = {
      ...base(),
      syncedAt: null,
      weightEntries: [weight({ deletedAt: '2026-08-23T11:00:00.000Z' })],
    }

    assert.equal((collectDelta(database).weightEntries[0] as { deletedAt?: string }).deletedAt,
      '2026-08-23T11:00:00.000Z')
  })

  it('sends nothing when nothing moved', () => {
    const database = { ...base(), syncedAt: '2026-08-23T10:00:00.000Z', tasks: [task()] }

    assert.equal(collectDelta(database).tasks.length, 0)
  })
})

describe('settings, which have one timestamp rather than one each', () => {
  it('sends them when they have changed since the watermark', () => {
    const database = {
      ...base(),
      syncedAt: '2026-08-23T10:00:00.000Z',
      settings: { calorieIntake: false },
      settingsUpdatedAt: '2026-08-23T11:00:00.000Z',
    }

    assert.deepEqual(collectDelta(database).settings, {
      calorieIntake: false, updated_at: '2026-08-23T11:00:00.000Z',
    })
  })

  it('leaves them alone when they have not', () => {
    const database = {
      ...base(),
      syncedAt: '2026-08-23T10:00:00.000Z',
      settings: { calorieIntake: false },
      settingsUpdatedAt: '2026-08-23T09:00:00.000Z',
    }

    assert.equal(collectDelta(database).settings, null)
  })

  it('sends nothing at all when this device has never set one', () => {
    // A first push from a device that never touched settings would otherwise
    // upload an empty object and wipe the settings the account already had.
    const database = { ...base(), syncedAt: null }

    assert.equal(collectDelta(database).settings, null)
  })

  it('takes the server’s when they are newer than this device’s', () => {
    const database = { ...base(), settings: { calorieIntake: false }, settingsUpdatedAt: '2026-08-23T09:00:00.000Z' }

    const next = applyIncoming(database, {
      settings: { calorieIntake: true, updated_at: '2026-08-23T11:00:00.000Z' },
    } as never)

    assert.deepEqual(next.settings, { calorieIntake: true })
  })

  it('keeps this device’s when they are the same age, as rows do', () => {
    const database = { ...base(), settings: { calorieIntake: false }, settingsUpdatedAt: '2026-08-23T11:00:00.000Z' }

    const next = applyIncoming(database, {
      settings: { calorieIntake: true, updated_at: '2026-08-23T11:00:00.000Z' },
    } as never)

    assert.deepEqual(next.settings, { calorieIntake: false })
  })
})

describe('what the device does with the reply', () => {
  it('keeps the more recently changed of a pair', () => {
    const database = { ...base(), tasks: [task({ title: 'Device copy', updated_at: '2026-08-23T11:00:00.000Z' })] }

    const next = applyIncoming(database, {
      tasks: [task({ title: 'Server copy', updated_at: '2026-08-23T10:00:00.000Z' })],
    } as never)

    assert.equal(next.tasks.length, 1)
    assert.equal(next.tasks[0].title, 'Device copy')
  })

  it('takes a row it has never seen', () => {
    const next = applyIncoming(base(), { tasks: [task({ id: 'from-another-phone' })] } as never)

    assert.deepEqual(next.tasks.map((row) => row.id), ['from-another-phone'])
  })

  it('takes a deletion made on another device', () => {
    const database = { ...base(), tasks: [task()] }

    const next = applyIncoming(database, {
      tasks: [task({ deleted_at: '2026-08-23T11:00:00.000Z', updated_at: '2026-08-23T11:00:00.000Z' })],
    } as never)

    assert.ok(next.tasks[0].deleted_at)
  })

  it('collapses a record the two devices gave different ids', () => {
    // Both phones logged today's weight while apart. That is one record, and
    // keeping both would fail the unique constraint on the next push.
    const database = { ...base(), weightEntries: [weight({ id: 'mine', updatedAt: '2026-08-23T09:00:00.000Z' })] }

    const next = applyIncoming(database, {
      weightEntries: [weight({ id: 'theirs', weightKg: 81, updatedAt: '2026-08-23T11:00:00.000Z' })],
    } as never)

    assert.equal(next.weightEntries.length, 1)
    assert.equal(next.weightEntries[0].id, 'theirs')
  })
})

describe('one exchange, end to end', () => {
  const exchangeReturning = (changed: Record<string, unknown>, syncedAt = '2026-08-23T12:00:00.000Z') =>
    async (body: unknown) => {
      sent.push(body)
      return { syncedAt, changed } as never
    }
  let sent: unknown[] = []

  beforeEach(() => { sent = [] })

  it('advances the watermark to the server’s clock', async () => {
    await runSync(USER, exchangeReturning({}))

    assert.equal((await loadLocalDatabase(USER)).syncedAt, '2026-08-23T12:00:00.000Z')
  })

  it('sends the watermark it last received', async () => {
    await runSync(USER, exchangeReturning({}))
    await runSync(USER, exchangeReturning({}, '2026-08-23T13:00:00.000Z'))

    assert.equal((sent[1] as { since: string }).since, '2026-08-23T12:00:00.000Z')
  })

  it('writes what came back, and can read it back afterwards', async () => {
    await runSync(USER, exchangeReturning({ tasks: [task({ id: 'from-the-server' })] }))

    const reloaded = await loadLocalDatabase(USER)
    assert.deepEqual(reloaded.tasks.map((row) => row.id), ['from-the-server'])
  })

  it('refuses to store a reply it could not read back, and does not advance', async () => {
    // A write that succeeds and cannot be read back is the worst failure
    // available: it reports saving a day while destroying access to it.
    await assert.rejects(
      () => runSync(USER, exchangeReturning({ tasks: [{ id: 'broken', title: 'No type at all' }] })),
      LocalStoreError,
    )

    assert.equal((await loadLocalDatabase(USER)).syncedAt, null)
  })

  it('leaves the watermark where it was when the exchange fails', async () => {
    // Offline is not a special case: nothing to retry, nothing to drain. The
    // next exchange simply carries the same delta plus whatever happened since.
    await assert.rejects(
      () => runSync(USER, async () => { throw new Error('Offline') }),
      /Offline/,
    )

    assert.equal((await loadLocalDatabase(USER)).syncedAt, null)
  })
})
