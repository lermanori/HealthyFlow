import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ReminderItem } from '../../backend/src/task-contracts'
import { deriveReminders, localDateKey } from './reminderCandidates'

// 2026-08-17 09:00 local time. Every case below is expressed relative to this.
const NOW = new Date(2026, 7, 17, 9, 0, 0)
const TODAY = '2026-08-17'
const YESTERDAY = '2026-08-16'
const TOMORROW = '2026-08-18'

function item(overrides: Partial<ReminderItem> & { id: string }): ReminderItem {
  return {
    title: `Item ${overrides.id}`,
    startTime: '09:10',
    completed: false,
    scheduledDate: TODAY,
    overdueNotified: false,
    ...overrides,
  }
}

describe('localDateKey', () => {
  it('uses local calendar components, not the UTC date', () => {
    // 23:30 local on the 17th is already the 18th in UTC for UTC-N zones; the
    // reminder day must follow the wall clock the user is reading.
    assert.equal(localDateKey(new Date(2026, 7, 17, 23, 30)), '2026-08-17')
    assert.equal(localDateKey(new Date(2026, 0, 5, 0, 15)), '2026-01-05')
  })
})

describe('upcoming reminders', () => {
  it('fires within fifteen minutes of a start time scheduled today', () => {
    const { reminders } = deriveReminders([item({ id: 'a', startTime: '09:10' })], NOW, new Set())

    assert.deepEqual(reminders, [
      { id: 'upcoming-a', taskTitle: 'Item a', time: '09:10', type: 'upcoming' },
    ])
  })

  it('stays silent for a start time more than fifteen minutes out', () => {
    const { reminders } = deriveReminders([item({ id: 'a', startTime: '09:30' })], NOW, new Set())

    assert.deepEqual(reminders, [])
  })

  it('ignores a matching clock time scheduled for a different day', () => {
    const { reminders } = deriveReminders(
      [item({ id: 'a', startTime: '09:10', scheduledDate: TOMORROW })],
      NOW,
      new Set()
    )

    assert.deepEqual(reminders, [])
  })
})

describe('overdue reminders', () => {
  it('fires more than thirty minutes after a start time scheduled today', () => {
    const { reminders, overdueToNotify } = deriveReminders(
      [item({ id: 'a', startTime: '08:20' })],
      NOW,
      new Set()
    )

    assert.deepEqual(reminders, [
      { id: 'overdue-a', taskTitle: 'Item a', time: '08:20', type: 'overdue' },
    ])
    assert.deepEqual(overdueToNotify, ['a'])
  })

  // Issue #20: an item left behind on an earlier day is exactly the case the
  // overdue branch exists for, so it must survive any scoping of the query.
  it('fires for a previous day that was never notified', () => {
    const { reminders, overdueToNotify } = deriveReminders(
      [item({ id: 'a', startTime: '08:20', scheduledDate: YESTERDAY })],
      NOW,
      new Set()
    )

    assert.deepEqual(reminders, [
      { id: 'overdue-a', taskTitle: 'Item a', time: '08:20', type: 'overdue' },
    ])
    assert.deepEqual(overdueToNotify, ['a'])
  })

  // Documents existing behaviour, not ideal behaviour: the elapsed check only
  // compares clock times, so a previous day's 14:00 item stays quiet until
  // 14:30 on the current day. It still has to be in the payload the whole time,
  // because it fires later the same day without any row changing.
  it('waits for the clock time to pass before firing for a previous day', () => {
    const args = [item({ id: 'a', startTime: '14:00', scheduledDate: YESTERDAY })] as const

    assert.deepEqual(deriveReminders([...args], NOW, new Set()).reminders, [])

    const afterGrace = new Date(2026, 7, 17, 14, 31)
    assert.deepEqual(deriveReminders([...args], afterGrace, new Set()).reminders, [
      { id: 'overdue-a', taskTitle: 'Item a', time: '14:00', type: 'overdue' },
    ])
  })

  it('stays silent within the thirty minute grace period', () => {
    const { reminders } = deriveReminders([item({ id: 'a', startTime: '08:40' })], NOW, new Set())

    assert.deepEqual(reminders, [])
  })

  it('stays silent once the server has recorded the notification', () => {
    const { reminders, overdueToNotify } = deriveReminders(
      [item({ id: 'a', startTime: '08:20', scheduledDate: YESTERDAY, overdueNotified: true })],
      NOW,
      new Set()
    )

    assert.deepEqual(reminders, [])
    assert.deepEqual(overdueToNotify, [])
  })

  it('stays silent once notified earlier in this session', () => {
    const { reminders, overdueToNotify } = deriveReminders(
      [item({ id: 'a', startTime: '08:20' })],
      NOW,
      new Set(['a'])
    )

    assert.deepEqual(reminders, [])
    assert.deepEqual(overdueToNotify, [])
  })
})

describe('items the reminder surface never acts on', () => {
  it('ignores completed items', () => {
    const { reminders } = deriveReminders(
      [
        item({ id: 'a', startTime: '09:10', completed: true }),
        item({ id: 'b', startTime: '08:20', completed: true }),
      ],
      NOW,
      new Set()
    )

    assert.deepEqual(reminders, [])
  })

  it('ignores untimed items', () => {
    const { reminders } = deriveReminders(
      [item({ id: 'a', startTime: null, scheduledDate: YESTERDAY })],
      NOW,
      new Set()
    )

    assert.deepEqual(reminders, [])
  })

  it('ignores backlog items with no scheduled date', () => {
    const { reminders } = deriveReminders(
      [item({ id: 'a', startTime: '08:20', scheduledDate: null })],
      NOW,
      new Set()
    )

    assert.deepEqual(reminders, [])
  })
})
