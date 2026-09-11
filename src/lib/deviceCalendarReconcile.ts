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
 * Each side is compared against its own last-seen value: the Item against
 * `itemUpdatedAt`, the event against `eventModifiedAt`. Comparing the event
 * against `updatedAt` — when *this device* reconciled — is what made every pass
 * believe the device had changed and rewrite the day in a loop.
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
  /** The event's modification time when it was last reconciled, if ever seen. */
  eventModifiedAt: string | null
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

  // Against the event's own last-seen modification time — never against
  // `updatedAt`, which is when this device reconciled. Those are different
  // quantities and are essentially never equal, which made every pass believe
  // the device had changed and rewrite the day in a loop.
  //
  // No baseline means this link predates the record, not that anything moved:
  // claiming a change there would overwrite the Item with the event's values on
  // the first pass after an upgrade.
  const eventMoved = event.state === 'missing'
    || (link.eventModifiedAt !== null && event.lastModifiedAt !== link.eventModifiedAt)
  // A deletion is a divergence from the linked state whether or not the row's
  // timestamp moved with it, so it is not inferred from `updatedAt`.
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
