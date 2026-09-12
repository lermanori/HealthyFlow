/**
 * The two watermarks, and why they are two.
 *
 * `syncedAt` answers "what has the server handed me?" and is the server's clock.
 * `pushedAt` answers "what have I uploaded?" and is this device's. They used to
 * be one value, so a change stamped below a server clock running ahead was
 * dropped from every future delta — permanently, because `updated_at` never
 * moves again.
 */
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { createLocalTask, deleteLocalTask } from './day'
import { runSync } from './sync'
import { loadLocalDatabase, memoryDriver, setLocalStoreDriver } from './store'

const USER = 'account-1'
const empty = {
  tasks: [], habitProgress: [], goals: [], calorieEntries: [], calorieItems: [],
  weightEntries: [], workoutSessions: [], workoutPlans: [],
  workoutExerciseItems: [], achievementDefinitions: [], achievementEntries: [],
  settings: null,
}

/** A server whose clock sits `skewMs` ahead of this device. */
function server(skewMs: number) {
  const seen: { since: string | null; tasks: unknown[] }[] = []
  const replied: string[] = []
  return {
    seen,
    replied,
    exchange: async (body: { since: string | null; changed: { tasks: unknown[] } }) => {
      seen.push({ since: body.since, tasks: body.changed.tasks })
      const syncedAt = new Date(Date.now() + skewMs).toISOString()
      replied.push(syncedAt)
      return { syncedAt, changed: empty }
    },
  }
}

async function createSyncDeleteSync(skewMs: number) {
  setLocalStoreDriver(memoryDriver(null))
  const row = await createLocalTask(USER, {
    title: 'test event', type: 'task', category: 'personal',
    startTime: '16:20', duration: 15, scheduledDate: '2026-09-11',
  })
  const s = server(skewMs)
  await runSync(USER, s.exchange as never)
  await new Promise((resolve) => setTimeout(resolve, 5))
  await deleteLocalTask(USER, row.id)
  await runSync(USER, s.exchange as never)
  return { seen: s.seen, replied: s.replied, database: await loadLocalDatabase(USER) }
}

describe('a delete pushed after a sync', () => {
  beforeEach(() => { setLocalStoreDriver(memoryDriver(null)) })

  it('is sent when the server clock matches the device', async () => {
    const { seen } = await createSyncDeleteSync(0)

    assert.equal(seen[1].tasks.length, 1)
  })

  it('is still sent when the server clock runs an hour ahead', async () => {
    // The regression: the device stored the server's `syncedAt` as its push
    // watermark, which sat past its own unsent changes.
    const { seen } = await createSyncDeleteSync(60 * 60 * 1000)

    assert.equal(seen[1].tasks.length, 1)
  })

  it('keeps asking the server for what it has, on the server’s clock', async () => {
    const skew = 60 * 60 * 1000
    const { seen, replied, database } = await createSyncDeleteSync(skew)

    // `since` on the wire is the pull watermark: what the *server* should hand
    // back. That one must stay the server's own reading — the value it gave us
    // last time, not anything this device made up.
    assert.equal(seen[0].since, null)
    assert.equal(seen[1].since, replied[0])
    assert.equal(database.syncedAt, replied[1])

    // And the push watermark is this device's, so it trails the skewed server.
    assert.ok(database.pushedAt !== null && database.pushedAt < database.syncedAt!)
  })

  it('sends everything when the device has never pushed', async () => {
    // A document written before the split has no `pushedAt`, so it re-uploads
    // the whole day — which is also what recovers rows the old comparison
    // stranded.
    setLocalStoreDriver(memoryDriver(null))
    await createLocalTask(USER, {
      title: 'stranded', type: 'task', category: 'personal',
      startTime: '09:00', duration: 30, scheduledDate: '2026-09-11',
    })
    const s = server(0)

    await runSync(USER, s.exchange as never)

    assert.equal(s.seen[0].since, null)
    assert.equal(s.seen[0].tasks.length, 1)
  })
})
