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

test('a conflict is its own state, distinct from a failed write', () => {
  // Nothing is broken — both sides were changed and neither could be shown to
  // be newer, so neither was applied. Rendering that as "Not in Calendar" would
  // say the write failed, which it did not.
  assert.deepEqual(
    calendarItemStatus({
      deviceCalendar: { status: 'conflict', error: 'Both were changed at once.' },
    }),
    { provider: 'device', state: 'conflict', error: 'Both were changed at once.' },
  )
})

test('a conflict without a stated reason still explains itself', () => {
  const status = calendarItemStatus({ deviceCalendar: { status: 'conflict', error: null } })

  assert.equal(status?.state, 'conflict')
  assert.match(status && 'error' in status ? status.error : '', /both changed/i)
})

test('the schema default is never rendered as a Google sync in progress', () => {
  // `day-summary-core` defaults googleSyncStatus to 'pending' for any row with
  // no stored value, so every Local Item carries it. A Guest on iPhone was shown
  // "Syncing to Google" for an integration that does not exist there.
  assert.equal(calendarItemStatus({ googleSyncStatus: 'pending' }), null)
  assert.equal(
    calendarItemStatus({ googleSyncStatus: 'pending', syncedToGoogle: false }),
    null,
  )
})

test('an Item written before Calendar access was revoked does not claim to be there', () => {
  // "The last write succeeded" is a fact about the past. The badge makes a claim
  // about the present, and the two diverge the moment access is revoked — so the
  // claim would otherwise stay frozen at its last truth forever (#273).
  assert.deepEqual(
    calendarItemStatus({ deviceCalendar: { status: 'unverified', error: null } }),
    {
      provider: 'device',
      state: 'unverified',
      error: 'HealthyFlow cannot see your Calendar right now, so it cannot confirm this Item is still there.',
    },
  )
})

test('unverified is its own state, distinct from failed and from conflict', () => {
  const states = (['synced', 'failed', 'conflict', 'unverified'] as const).map((status) =>
    calendarItemStatus({ deviceCalendar: { status, error: null } })?.state)

  // Never exported, exported and confirmed, exported and failed, exported and
  // unconfirmable are four different things and must not collapse into three.
  assert.deepEqual(states, ['synced', 'failed', 'conflict', 'unverified'])
  assert.equal(calendarItemStatus({}), null)
})
