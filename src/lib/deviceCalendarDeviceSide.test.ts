/**
 * The device→HealthyFlow direction through the real reconciler (#267).
 *
 * `deviceCalendarReconcile.test.ts` proves the decision in isolation. These
 * tests prove the reconciler acts on it: that a Calendar edit is reported as a
 * change for the Local day to absorb, that a deletion there deletes the Item,
 * and — most importantly — that a read which did not answer is never mistaken
 * for a deletion.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reconcileDeviceCalendarItems } from './deviceCalendar'

const SYNCED_AT = '2026-09-09T10:01:00.000Z'
const NOW = '2026-09-09T12:00:00.000Z'

const item = {
  id: 'item-1',
  title: 'Strength training',
  scheduledDate: '2026-09-09',
  startTime: '18:00',
  durationMinutes: 60,
  location: null,
  updatedAt: '2026-09-09T10:00:00.000Z',
  deleted: false,
}

const link = {
  itemId: 'item-1',
  eventIdentifier: 'event-1',
  status: 'synced' as const,
  error: null,
  itemUpdatedAt: '2026-09-09T10:00:00.000Z',
  // The event's stamp as last reconciled. Equal to the event's own means the
  // device side has not moved; a newer event stamp is what signals an edit.
  eventModifiedAt: SYNCED_AT,
  updatedAt: SYNCED_AT,
}

const presentEvent = {
  state: 'present' as const,
  eventIdentifier: 'event-1',
  title: 'Strength training',
  scheduledDate: '2026-09-09',
  startTime: '18:00',
  durationMinutes: 60,
  location: null,
  lastModifiedAt: SYNCED_AT,
}

function sync(overrides: Partial<{
  events: unknown[]
  upserts: unknown[]
  removals: string[]
}> = {}) {
  const upserts: unknown[] = []
  const removals: string[] = []
  return {
    upserts,
    removals,
    api: {
      upsert: async (input: unknown) => {
        upserts.push(input)
        return { state: 'synced' as const, eventIdentifier: 'event-1' }
      },
      readLinked: async () => ({
        state: 'read' as const,
        events: (overrides.events ?? [presentEvent]) as never,
      }),
      remove: async (identifier: string) => {
        removals.push(identifier)
        return { state: 'removed' as const }
      },
    },
  }
}

describe('a change made in iOS Calendar', () => {
  it('is reported for the Local day to absorb, and is not written back over', async () => {
    const harness = sync({
      events: [{ ...presentEvent, startTime: '19:00', lastModifiedAt: NOW }],
    })

    const result = await reconcileDeviceCalendarItems({
      items: [item], links: [link], sync: harness.api, now: NOW,
    })

    assert.equal(result.state, 'connected')
    assert.deepEqual(result.state === 'connected' ? result.deviceChanges : [], [{
      kind: 'update',
      itemId: 'item-1',
      title: 'Strength training',
      scheduledDate: '2026-09-09',
      startTime: '19:00',
      durationMinutes: 60,
      location: null,
    }])
    // The old behaviour: HealthyFlow's stale 18:00 written straight back.
    assert.deepEqual(harness.upserts, [])
  })

  it('leaves the Item watermark matching the row the caller will stamp', async () => {
    const harness = sync({
      events: [{ ...presentEvent, startTime: '19:00', lastModifiedAt: NOW }],
    })

    const result = await reconcileDeviceCalendarItems({
      items: [item], links: [link], sync: harness.api, now: NOW,
    })

    // Otherwise the next pass reads the applied change as a fresh Item edit and
    // writes it back to the Calendar it came from.
    assert.equal(result.state === 'connected' ? result.links[0]?.itemUpdatedAt : null, NOW)
  })

  it('deletes the linked Item when the event is gone', async () => {
    const harness = sync({
      events: [{ state: 'missing', eventIdentifier: 'event-1' }],
    })

    const result = await reconcileDeviceCalendarItems({
      items: [item], links: [link], sync: harness.api, now: NOW,
    })

    assert.deepEqual(
      result.state === 'connected' ? result.deviceChanges : [],
      [{ kind: 'delete', itemId: 'item-1' }],
    )
    assert.deepEqual(result.state === 'connected' ? result.links : [], [])
    // It must not be recreated in the same pass it was deleted in.
    assert.deepEqual(harness.upserts, [])
  })

  it('records a conflict and changes neither side when both moved at once', async () => {
    const harness = sync({
      events: [{ ...presentEvent, startTime: '19:00', lastModifiedAt: NOW }],
    })

    const result = await reconcileDeviceCalendarItems({
      items: [{ ...item, startTime: '20:00', updatedAt: NOW }],
      links: [link],
      sync: harness.api,
      now: NOW,
    })

    assert.deepEqual(result.state === 'connected' ? result.conflicts : [], ['item-1'])
    assert.equal(result.state === 'connected' ? result.links[0]?.status : null, 'conflict')
    assert.deepEqual(result.state === 'connected' ? result.deviceChanges : [], [])
    assert.deepEqual(harness.upserts, [])
  })

  it('conflicts rather than guessing when the Calendar reports no modification time', async () => {
    const harness = sync({
      events: [{ ...presentEvent, startTime: '19:00', lastModifiedAt: null }],
    })

    const result = await reconcileDeviceCalendarItems({
      items: [{ ...item, startTime: '20:00', updatedAt: NOW }],
      links: [link],
      sync: harness.api,
      now: NOW,
    })

    assert.equal(result.state === 'connected' ? result.links[0]?.status : null, 'conflict')
  })
})

describe('a read that did not answer', () => {
  it('is never mistaken for a deletion', async () => {
    // The native bridge answers for every identifier it is given, so an absent
    // entry means something went wrong. Deleting the person's Item on that
    // basis would be a failed read masquerading as an instruction.
    const harness = sync({ events: [] })

    const result = await reconcileDeviceCalendarItems({
      items: [item], links: [link], sync: harness.api, now: NOW,
    })

    assert.deepEqual(result.state === 'connected' ? result.deviceChanges : [], [])
    assert.equal(result.state === 'connected' ? result.links.length : 0, 1)
  })

  it('writes nothing at all when the whole read fails', async () => {
    const harness = sync()
    const failing = {
      ...harness.api,
      readLinked: async () => ({ state: 'failed' as const, reason: 'EventKit is unavailable.' }),
    }

    const result = await reconcileDeviceCalendarItems({
      items: [{ ...item, startTime: '20:00', updatedAt: NOW }],
      links: [link],
      sync: failing,
      now: NOW,
    })

    // Writing now could clobber a device edit that could not be seen.
    assert.deepEqual(harness.upserts, [])
    assert.deepEqual(result.state === 'connected' ? result.failures : [], ['item-1'])
    assert.equal(result.state === 'connected' ? result.links[0]?.status : null, 'failed')
  })

  it('reports a disconnected Calendar without touching the links', async () => {
    const harness = sync()
    const disconnected = {
      ...harness.api,
      readLinked: async () => ({ state: 'not_connected' as const, reason: 'denied' as const }),
    }

    const result = await reconcileDeviceCalendarItems({
      items: [item], links: [link], sync: disconnected, now: NOW,
    })

    assert.equal(result.state, 'not_connected')
    assert.deepEqual(result.links, [link])
  })
})

describe('reconciling when nothing has changed', () => {
  it('is idempotent — the second pass writes nothing', async () => {
    // The regression this file gained after shipping an infinite loop: the event
    // was compared against `link.updatedAt`, which is when *this device*
    // reconciled. Those are different quantities and never equal, so every pass
    // decided the device had changed, rewrote the Local day, fired the change
    // event, and reconciled again — forever.
    const harness = sync()
    const settled = { ...link, eventModifiedAt: presentEvent.lastModifiedAt }

    const first = await reconcileDeviceCalendarItems({
      items: [item], links: [settled], sync: harness.api, now: NOW,
    })
    assert.equal(first.state, 'connected')
    assert.deepEqual(first.state === 'connected' ? first.deviceChanges : [], [])
    assert.deepEqual(harness.upserts, [])

    const second = await reconcileDeviceCalendarItems({
      items: [item],
      links: first.state === 'connected' ? first.links : [],
      sync: harness.api,
      now: '2026-09-09T13:00:00.000Z',
    })

    assert.deepEqual(second.state === 'connected' ? second.deviceChanges : [], [])
    assert.deepEqual(harness.upserts, [])
    // Identical links mean the caller writes nothing, so no change event fires
    // and there is no next pass. That is what breaks the loop.
    assert.deepEqual(
      second.state === 'connected' ? second.links : null,
      first.state === 'connected' ? first.links : undefined,
    )
  })

  it('records an unseen event baseline once, then settles', async () => {
    const harness = sync()
    const noBaseline = { ...link, eventModifiedAt: null }

    const first = await reconcileDeviceCalendarItems({
      items: [item], links: [noBaseline], sync: harness.api, now: NOW,
    })

    // A link written before the baseline existed must not be read as "changed",
    // or upgrading would overwrite every Item with its event's values.
    assert.deepEqual(first.state === 'connected' ? first.deviceChanges : [], [])
    assert.equal(
      first.state === 'connected' ? first.links[0]?.eventModifiedAt : null,
      presentEvent.lastModifiedAt,
    )
  })
})

