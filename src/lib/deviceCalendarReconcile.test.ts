/**
 * Which side of a linked Item/event pair wins, and when neither may (#267).
 *
 * Reconciliation is one-way today: HealthyFlow writes its value over EventKit,
 * so an edit made in iOS Calendar is silently reverted and a deletion there
 * leaves an Item pointing at nothing. This is the decision layer that fixes it,
 * kept pure so every branch — including the ones that must change nothing — is
 * provable without a device.
 *
 * `DeviceCalendarLink` already carries both watermarks needed to tell what moved:
 * `itemUpdatedAt` is the Item's `updated_at` at the last successful sync, and
 * `updatedAt` is when that sync happened.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reconcileLinkedRecord } from './deviceCalendarReconcile'

const SYNCED_AT = '2026-09-10T10:00:00.000Z'

const item = {
  id: 'item-1',
  title: 'Dentist',
  scheduledDate: '2026-09-10',
  startTime: '14:00',
  durationMinutes: 30,
  location: null,
  updatedAt: SYNCED_AT,
  deleted: false,
}

const event = {
  state: 'present' as const,
  eventIdentifier: 'event-1',
  title: 'Dentist',
  scheduledDate: '2026-09-10',
  startTime: '14:00',
  durationMinutes: 30,
  location: null,
  lastModifiedAt: SYNCED_AT,
}

const link = {
  itemId: 'item-1',
  eventIdentifier: 'event-1',
  itemUpdatedAt: SYNCED_AT,
  // The event's modification time as last reconciled — the baseline the event is
  // compared against. Equal to the event's own stamp means "nothing moved".
  eventModifiedAt: SYNCED_AT,
  updatedAt: SYNCED_AT,
}

describe('reconciling one linked Item and its Calendar event', () => {
  it('does nothing when neither side moved', () => {
    assert.deepEqual(reconcileLinkedRecord({ item, event, link }), { action: 'none' })
  })

  it('writes to the Calendar when only the Item moved', () => {
    const moved = { ...item, startTime: '15:00', updatedAt: '2026-09-10T11:00:00.000Z' }

    assert.deepEqual(reconcileLinkedRecord({ item: moved, event, link }), {
      action: 'write_to_calendar',
    })
  })

  it('applies the Calendar edit to the Item when only the event moved', () => {
    // The behaviour that does not exist today: the device-side edit currently
    // gets overwritten with HealthyFlow's older value.
    const edited = {
      ...event,
      startTime: '16:00',
      lastModifiedAt: '2026-09-10T11:00:00.000Z',
    }

    assert.deepEqual(reconcileLinkedRecord({ item, event: edited, link }), {
      action: 'apply_to_item',
      event: edited,
    })
  })

  it('deletes the Item when its event is gone from the Calendar', () => {
    assert.deepEqual(
      reconcileLinkedRecord({ item, event: { state: 'missing' }, link }),
      { action: 'delete_item' },
    )
  })

  it('removes the event when the Item was deleted', () => {
    assert.deepEqual(
      reconcileLinkedRecord({ item: { ...item, deleted: true }, event, link }),
      { action: 'delete_event' },
    )
  })

  it('needs no action when both sides are already gone', () => {
    assert.deepEqual(
      reconcileLinkedRecord({
        item: { ...item, deleted: true },
        event: { state: 'missing' },
        link,
      }),
      { action: 'none' },
    )
  })

  describe('when both sides changed, the last save wins', () => {
    it('takes the Item when it saved later', () => {
      const laterItem = { ...item, startTime: '15:00', updatedAt: '2026-09-10T12:00:00.000Z' }
      const earlierEvent = { ...event, startTime: '16:00', lastModifiedAt: '2026-09-10T11:00:00.000Z' }

      assert.deepEqual(
        reconcileLinkedRecord({ item: laterItem, event: earlierEvent, link }),
        { action: 'write_to_calendar' },
      )
    })

    it('takes the Calendar when it saved later', () => {
      const earlierItem = { ...item, startTime: '15:00', updatedAt: '2026-09-10T11:00:00.000Z' }
      const laterEvent = { ...event, startTime: '16:00', lastModifiedAt: '2026-09-10T12:00:00.000Z' }

      assert.deepEqual(
        reconcileLinkedRecord({ item: earlierItem, event: laterEvent, link }),
        { action: 'apply_to_item', event: laterEvent },
      )
    })
  })

  describe('what must never be guessed', () => {
    it('surfaces a conflict when both saved at the same instant with different values', () => {
      const at = '2026-09-10T12:00:00.000Z'
      const changedItem = { ...item, startTime: '15:00', updatedAt: at }
      const changedEvent = { ...event, startTime: '16:00', lastModifiedAt: at }

      assert.deepEqual(
        reconcileLinkedRecord({ item: changedItem, event: changedEvent, link }),
        { action: 'conflict', reason: 'indeterminate_order' },
      )
    })

    it('treats an identical simultaneous save as settled, not as a conflict', () => {
      // Both sides agree on the value. There is nothing to choose between, so
      // demanding the person resolve it would be noise.
      const at = '2026-09-10T12:00:00.000Z'

      assert.deepEqual(
        reconcileLinkedRecord({
          item: { ...item, startTime: '15:00', updatedAt: at },
          event: { ...event, startTime: '15:00', lastModifiedAt: at },
          link,
        }),
        { action: 'none' },
      )
    })

    it('surfaces a conflict rather than trusting an unparseable Calendar timestamp', () => {
      const changedItem = { ...item, startTime: '15:00', updatedAt: '2026-09-10T12:00:00.000Z' }
      const changedEvent = { ...event, startTime: '16:00', lastModifiedAt: 'not-a-date' }

      assert.deepEqual(
        reconcileLinkedRecord({ item: changedItem, event: changedEvent, link }),
        { action: 'conflict', reason: 'invalid_timestamp' },
      )
    })

    it('surfaces a conflict rather than trusting an unparseable Item timestamp', () => {
      const changedItem = { ...item, startTime: '15:00', updatedAt: 'not-a-date' }
      const changedEvent = { ...event, startTime: '16:00', lastModifiedAt: '2026-09-10T12:00:00.000Z' }

      assert.deepEqual(
        reconcileLinkedRecord({ item: changedItem, event: changedEvent, link }),
        { action: 'conflict', reason: 'invalid_timestamp' },
      )
    })

    it('does not resolve a conflict just because one side is only a deletion', () => {
      const at = '2026-09-10T12:00:00.000Z'

      // The Item was deleted while the event was edited, at the same instant.
      // Deleting the person's calendar entry on a coin flip is the worst
      // available outcome, so neither side moves.
      assert.deepEqual(
        reconcileLinkedRecord({
          item: { ...item, deleted: true, updatedAt: at },
          event: { ...event, startTime: '16:00', lastModifiedAt: at },
          link,
        }),
        { action: 'conflict', reason: 'indeterminate_order' },
      )
    })
  })
})
