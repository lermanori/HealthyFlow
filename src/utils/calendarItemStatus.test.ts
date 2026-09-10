import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarItemStatus } from './calendarItemStatus'

test('a Device Calendar write reports Device Calendar, not Google', () => {
  assert.deepEqual(
    calendarItemStatus({ deviceCalendar: { status: 'synced', error: null } }),
    { provider: 'device', state: 'synced' },
  )
})

test('a failed Device Calendar write is visible, never rendered as absence', () => {
  assert.deepEqual(
    calendarItemStatus({
      deviceCalendar: { status: 'failed', error: 'Calendar access was revoked.' },
    }),
    { provider: 'device', state: 'failed', error: 'Calendar access was revoked.' },
  )
})

test('a failed Device Calendar write without a reason still states the failure', () => {
  const status = calendarItemStatus({ deviceCalendar: { status: 'failed', error: null } })

  assert.equal(status?.provider, 'device')
  assert.equal(status?.state, 'failed')
  // A missing reason must not collapse into a missing badge.
  assert.match(status && 'error' in status ? status.error : '', /Calendar/)
})

test('the device link wins over stale Google fields on the same Item', () => {
  // A row that once synced through the hosted Google path and now lives on a
  // Local day must report where it actually went, not where it used to go.
  assert.deepEqual(
    calendarItemStatus({
      deviceCalendar: { status: 'synced', error: null },
      syncedToGoogle: true,
      googleSyncStatus: 'synced',
    }),
    { provider: 'device', state: 'synced' },
  )
})

test('the hosted Google path keeps its own statuses when no device link exists', () => {
  assert.deepEqual(
    calendarItemStatus({ syncedToGoogle: true, googleSyncStatus: 'synced' }),
    { provider: 'google', state: 'synced' },
  )
  assert.deepEqual(
    calendarItemStatus({ googleSyncStatus: 'pending' }),
    { provider: 'google', state: 'pending' },
  )
  assert.deepEqual(
    calendarItemStatus({ googleSyncStatus: 'failed' }),
    { provider: 'google', state: 'failed' },
  )
})

test('an Item no provider handled shows nothing', () => {
  assert.equal(calendarItemStatus({}), null)
  // `skipped` is a decision not to sync, not a status worth asserting.
  assert.equal(calendarItemStatus({ googleSyncStatus: 'skipped' }), null)
})

test('a native Item with no device link never borrows a Google badge', () => {
  // The reported defect: a card claiming Google state on a device where the
  // Google adapter never ran. Absent both providers, the answer is silence.
  assert.equal(calendarItemStatus({ deviceCalendar: null, syncedToGoogle: false }), null)
})
