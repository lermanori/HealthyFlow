/**
 * Cloud replicates the Local day. It never becomes the day (#268, ADR-0011/0012).
 *
 * This was asserted only by documentation until now: the free-v1 migration
 * deactivated every subscription on 2026-09-07, so no account could exercise the
 * Cloud path at all, and the founder's was only restored on 2026-09-11. Now that
 * sync genuinely works in both directions the server can write rows back into a
 * device's day, which is exactly when "replica" has to stop being a promise and
 * start being a property.
 *
 * The failure this guards against is the one #263 and #266 were opened for: an
 * account falling through to the hosted branch and appearing to have lost its
 * day.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, it } from 'node:test'
import { applyIncoming } from './sync'
import { holdsLocalDay, rememberLocalDayOwner } from './services'
import { emptyLocalDatabase, memoryDriver, setLocalStoreDriver, type LocalDatabase } from './store'

const ACCOUNT = 'account-1'
const EMAIL = 'someone@example.com'

function installStorage() {
  const values = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1', user_id: ACCOUNT, title: 'Written on the device',
  type: 'task', category: 'personal', scheduled_date: '2026-09-12',
  created_at: '2026-09-12T09:00:00.000Z', updated_at: '2026-09-12T09:00:00.000Z',
  ...overrides,
}) as unknown as LocalDatabase['tasks'][number]

beforeEach(() => {
  installStorage()
  setLocalStoreDriver(memoryDriver(null))
})

describe('holding Cloud does not change where the day lives', () => {
  it('decides the branch from identity and ownership alone', () => {
    rememberLocalDayOwner(ACCOUNT)

    // `holdsLocalDay` takes an id and an email. There is no parameter through
    // which a subscription could reach it, which is the point: an entitlement
    // must not be able to move someone's day.
    assert.equal(holdsLocalDay({ id: ACCOUNT, email: EMAIL }), true)
    assert.equal(holdsLocalDay({ id: ACCOUNT, email: null }), true)
  })

  it('keeps the Local-day layer free of any entitlement input', () => {
    for (const file of ['services.ts', 'store.ts', 'sync.ts', 'day.ts']) {
      const source = readFileSync(`src/lib/local/${file}`, 'utf8')
      const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

      assert.doesNotMatch(code, /subscription/i, `${file} reads an entitlement`)
      assert.doesNotMatch(code, /cloudActive/i, `${file} reads an entitlement`)
    }
  })

  it('selects the branch in one place, which never consults Cloud', () => {
    const auth = readFileSync('src/context/AuthContext.tsx', 'utf8')

    assert.match(auth, /setLocalDayUser\(holdsLocalDay\(userData\) \? userData!\.id : null/)
    assert.doesNotMatch(auth, /setLocalDayUser\([^)]*subscription/)
  })
})

describe('a sync reply cannot take the day away', () => {
  it('leaves an Item the server has never seen', () => {
    // The offline case: something written on the device that no exchange has
    // carried yet. An empty collection in the reply must mean "nothing new",
    // never "the server's copy of your day is empty".
    const database = { ...emptyLocalDatabase(ACCOUNT), tasks: [task()] }

    const next = applyIncoming(database, { tasks: [] } as never)

    assert.equal(next.tasks.length, 1)
    assert.equal(next.tasks[0]?.title, 'Written on the device')
  })

  it('leaves the whole day alone when the reply carries nothing at all', () => {
    const database = { ...emptyLocalDatabase(ACCOUNT), tasks: [task()] }

    const next = applyIncoming(database, {} as never)

    assert.deepEqual(next.tasks, database.tasks)
  })

  it('keeps the device copy when the server sends an older one', () => {
    const database = {
      ...emptyLocalDatabase(ACCOUNT),
      tasks: [task({ title: 'Edited here', updated_at: '2026-09-12T11:00:00.000Z' })],
    }

    const next = applyIncoming(database, {
      tasks: [task({ title: 'Stale server copy', updated_at: '2026-09-12T10:00:00.000Z' })],
    } as never)

    assert.equal(next.tasks[0]?.title, 'Edited here')
  })

  it('takes the server copy only when it is genuinely newer', () => {
    // Replication still has to work — this is a replica, not a one-way mirror.
    const database = {
      ...emptyLocalDatabase(ACCOUNT),
      tasks: [task({ title: 'Older here', updated_at: '2026-09-12T10:00:00.000Z' })],
    }

    const next = applyIncoming(database, {
      tasks: [task({ title: 'Newer elsewhere', updated_at: '2026-09-12T11:00:00.000Z' })],
    } as never)

    assert.equal(next.tasks[0]?.title, 'Newer elsewhere')
  })
})

describe('signing out keeps the day on the device', () => {
  it('drops the cache rather than the document, and keeps the owner marker', () => {
    const auth = readFileSync('src/context/AuthContext.tsx', 'utf8')
    const logout = auth.slice(auth.indexOf('const logout = '), auth.indexOf('const completeAccountDeletion'))

    // `resetLocalStore` clears the in-memory copy; `clearLocalDay` erases the
    // file. Only account deletion may do the latter — signing out must leave the
    // day where it is, or a sign-out reads as data loss.
    assert.match(logout, /resetLocalStore\(\)/)
    assert.doesNotMatch(logout, /clearLocalDay/)
    // And the marker stays, so signing back in reopens the same day rather than
    // treating this device as one that has never seen the account.
    assert.doesNotMatch(logout, /forgetLocalDayOwner/)
  })

  it('erases the day only when the account itself is deleted', () => {
    const auth = readFileSync('src/context/AuthContext.tsx', 'utf8')
    const deletion = auth.slice(auth.indexOf('const completeAccountDeletion'))

    assert.match(deletion, /clearLocalDay\(user\?\.id\)/)
    assert.match(deletion, /forgetLocalDayOwner\(\)/)
  })
})

describe('losing Cloud is not losing the day', () => {
  it('stops syncing without touching what is stored', () => {
    const hook = readFileSync('src/hooks/useCloudSync.ts', 'utf8')
    const gate = hook.slice(hook.indexOf('subscription.active'))

    // Revoking the entitlement returns early. If this branch ever gained a write
    // — a clear, a reset, a replace — then taking Cloud away would take the
    // person's day with it.
    assert.match(gate, /return/)
    assert.doesNotMatch(gate, /clearLocalDay|replaceLocalDay|resetLocalStore/)
  })
})
