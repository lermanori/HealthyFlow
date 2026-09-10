/**
 * Which side of a linked Item/Calendar-event pair wins (#267, ADR-0020).
 *
 * Reconciliation used to run one way: HealthyFlow wrote its value over EventKit
 * unconditionally, so an edit made in iOS Calendar was silently reverted and a
 * deletion there left an Item pointing at nothing.
 *
 * This layer decides only. It performs no reads or writes, which is what lets
 * every branch — especially the ones that must change nothing — be proved
 * without a device.
 *
 * Change detection uses the watermarks `DeviceCalendarLink` already carries:
 * `itemUpdatedAt` is the Item's `updated_at` at the last successful sync, and
 * `updatedAt` is when that sync ran. A side moved if its current stamp is later
 * than the watermark it was synced at.
 */

export interface ReconcileItemState {
  id: string
  title: string
  scheduledDate: string | null
  startTime: string | null
  durationMinutes: number
  location: string | null
  updatedAt: string
  deleted: boolean
}

export type ReconcileEventState =
  | { state: 'missing' }
  | {
      state: 'present'
      eventIdentifier: string
      title: string
      scheduledDate: string
      startTime: string
      durationMinutes: number
      location: string | null
      /** EventKit's `lastModifiedDate`, as an ISO string. */
      lastModifiedAt: string
    }

export interface ReconcileLinkState {
  itemId: string
  eventIdentifier: string | null
  itemUpdatedAt: string
  updatedAt: string
}

export type ReconcileConflictReason = 'indeterminate_order' | 'invalid_timestamp'

export type ReconcileDecision =
  | { action: 'none' }
  | { action: 'write_to_calendar' }
  | { action: 'apply_to_item'; event: Extract<ReconcileEventState, { state: 'present' }> }
  | { action: 'delete_item' }
  | { action: 'delete_event' }
  | { action: 'conflict'; reason: ReconcileConflictReason }

function instant(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/** Whether the two sides describe the same commitment. */
function agree(
  item: ReconcileItemState,
  event: Extract<ReconcileEventState, { state: 'present' }>,
): boolean {
  return item.title === event.title
    && item.scheduledDate === event.scheduledDate
    && item.startTime === event.startTime
    && item.durationMinutes === event.durationMinutes
    && (item.location ?? null) === (event.location ?? null)
}

export function reconcileLinkedRecord(input: {
  item: ReconcileItemState
  event: ReconcileEventState
  link: ReconcileLinkState
}): ReconcileDecision {
  const { item, event, link } = input

  // A deletion is a divergence from the linked state whether or not the row's
  // timestamp moved with it, so it is not inferred from `updatedAt`.
  const eventMoved = event.state === 'missing' || event.lastModifiedAt !== link.updatedAt
  const itemMoved = item.deleted || item.updatedAt !== link.itemUpdatedAt

  // Both sides are already gone. They agree; there is nothing to raise.
  if (item.deleted && event.state === 'missing') return { action: 'none' }

  // Only one side moved — no ordering question to answer.
  if (!itemMoved && !eventMoved) return { action: 'none' }
  if (itemMoved && !eventMoved) {
    return item.deleted ? { action: 'delete_event' } : { action: 'write_to_calendar' }
  }
  if (!itemMoved && eventMoved) {
    return event.state === 'missing'
      ? { action: 'delete_item' }
      : { action: 'apply_to_item', event }
  }

  // Both moved. If they happen to agree there is nothing to choose between, so
  // asking the person to resolve it would be noise.
  if (event.state === 'present' && !item.deleted && agree(item, event)) {
    return { action: 'none' }
  }

  const itemAt = instant(item.updatedAt)
  const eventAt = event.state === 'present' ? instant(event.lastModifiedAt) : null

  // A missing event carries no modification time, so a race against a deletion
  // can never be ordered. Deleting the person's calendar entry — or resurrecting
  // one they removed — on a guess is the worst available outcome.
  if (itemAt === null || eventAt === null) {
    return {
      action: 'conflict',
      reason: itemAt === null || event.state === 'present'
        ? 'invalid_timestamp'
        : 'indeterminate_order',
    }
  }

  if (itemAt === eventAt) return { action: 'conflict', reason: 'indeterminate_order' }

  if (itemAt > eventAt) {
    return item.deleted ? { action: 'delete_event' } : { action: 'write_to_calendar' }
  }
  return { action: 'apply_to_item', event: event as Extract<ReconcileEventState, { state: 'present' }> }
}
