/**
 * The EventKit bookkeeping must reach the surfaces that actually render cards.
 *
 * The first attempt at this joined the links onto `getTasks` only. Today renders
 * from the day summary, so nothing changed on the device and a synced Item still
 * showed no badge. These tests pin both entry points for that reason.
 */
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { createLocalTask } from './day'
import { localServices } from './services'
import { memoryDriver, mutateLocalDatabase, setLocalStoreDriver } from './store'

const USER = 'guest-1'
const TODAY = '2026-08-21'

async function itemWithLink(status: 'synced' | 'failed', error: string | null) {
  const row = await createLocalTask(USER, {
    title: 'Dentist',
    type: 'task',
    category: 'personal',
    startTime: '14:00',
    duration: 30,
    scheduledDate: TODAY,
  })
  await mutateLocalDatabase(USER, (current) => ({
    next: {
      ...current,
      deviceCalendarLinks: [{
        itemId: row.id,
        eventIdentifier: status === 'synced' ? 'event-1' : null,
        status,
        error,
        itemUpdatedAt: row.updated_at ?? row.created_at,
        eventModifiedAt: null,
        updatedAt: '2026-08-21T10:00:00.000Z',
      }],
    },
    result: undefined,
  }))
  return row.id
}

describe('Device Calendar status on the Local day', () => {
  beforeEach(() => {
    setLocalStoreDriver(memoryDriver(null))
  })

  it('reaches the day summary, which is what Today renders', async () => {
    const id = await itemWithLink('synced', null)

    const summary = await localServices.daySummary(USER, TODAY)
    const item = summary.items.find((candidate) => candidate.id === id) as
      | { deviceCalendar?: { status: string; error: string | null } | null }
      | undefined

    assert.deepEqual(item?.deviceCalendar, { status: 'synced', error: null })
  })

  it('reaches getTasks as well', async () => {
    const id = await itemWithLink('synced', null)

    const tasks = await localServices.getTasks(USER, TODAY)
    const task = tasks.find((candidate) => candidate.id === id) as
      | { deviceCalendar?: { status: string; error: string | null } | null }
      | undefined

    assert.deepEqual(task?.deviceCalendar, { status: 'synced', error: null })
  })

  it('carries a failed write through rather than dropping it', async () => {
    const id = await itemWithLink('failed', 'The default calendar is read-only.')

    const summary = await localServices.daySummary(USER, TODAY)
    const item = summary.items.find((candidate) => candidate.id === id) as
      | { deviceCalendar?: { status: string; error: string | null } | null }
      | undefined

    // A failed write reported as absence is the defect this whole slice removes.
    assert.deepEqual(item?.deviceCalendar, {
      status: 'failed',
      error: 'The default calendar is read-only.',
    })
  })

  it('leaves an Item EventKit never touched without a status', async () => {
    const row = await createLocalTask(USER, {
      title: 'Untracked',
      type: 'task',
      category: 'personal',
      startTime: '09:00',
      duration: 30,
      scheduledDate: TODAY,
    })

    const summary = await localServices.daySummary(USER, TODAY)
    const item = summary.items.find((candidate) => candidate.id === row.id) as
      | { deviceCalendar?: unknown }
      | undefined

    assert.equal(item?.deviceCalendar, undefined)
  })
})
