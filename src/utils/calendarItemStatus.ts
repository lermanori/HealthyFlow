/**
 * Which Calendar provider actually handled this Item, and what it reported.
 *
 * An Item card must not describe an integration that did not run. On iPhone the
 * day is Local and Calendar is EventKit (ADR-0020); the backend Google adapter is
 * never called, so `syncedToGoogle` / `googleSyncStatus` describe nothing there.
 * On the hosted web path the reverse is true and there is no Device Calendar link.
 *
 * The provider that produced a record is the provider the card reports.
 */
export type CalendarItemStatus =
  | { provider: 'device'; state: 'synced' }
  | { provider: 'device'; state: 'failed'; error: string }
  | { provider: 'device'; state: 'conflict'; error: string }
  | { provider: 'google'; state: 'synced' | 'failed' }

export interface CalendarItemStatusInput {
  /** This device's EventKit bookkeeping for the Item, when one exists. */
  deviceCalendar?: { status: 'synced' | 'failed' | 'conflict'; error: string | null } | null
  syncedToGoogle?: boolean
  googleSyncStatus?: 'pending' | 'synced' | 'skipped' | 'failed'
}

const DEVICE_WRITE_FAILED = 'HealthyFlow could not write this Item to your iPhone Calendar.'
const DEVICE_CONFLICT = 'This Item and its Calendar event were both changed, so neither was applied.'

export function calendarItemStatus(input: CalendarItemStatusInput): CalendarItemStatus | null {
  // A Device Calendar link means EventKit ran for this Item on this device, so it
  // is the authority — including when it failed. A failed write reported as
  // absence is the specific dishonesty this function exists to remove.
  if (input.deviceCalendar) {
    // Both sides changed and the order could not be established, so neither was
    // applied (#267). Distinct from a failed write: nothing is broken, but the
    // person has to say which version they meant.
    if (input.deviceCalendar.status === 'conflict') {
      return {
        provider: 'device',
        state: 'conflict',
        error: input.deviceCalendar.error ?? DEVICE_CONFLICT,
      }
    }
    if (input.deviceCalendar.status === 'failed') {
      return {
        provider: 'device',
        state: 'failed',
        error: input.deviceCalendar.error ?? DEVICE_WRITE_FAILED,
      }
    }
    return { provider: 'device', state: 'synced' }
  }

  // No device link: fall back to the hosted Google integration, which is the only
  // other provider that can have run.
  //
  // `pending` is deliberately not a badge. `day-summary-core` defaults the field
  // to `'pending'` for any row without a stored value, so every Local Item
  // carries it — which made a Guest's card claim it was syncing to Google on a
  // device where the Google adapter does not exist. A status that is also the
  // schema default cannot be evidence that anything happened.
  //
  // `skipped` is a real decision not to sync, and also not worth a badge.
  if (input.googleSyncStatus === 'failed') return { provider: 'google', state: 'failed' }
  if (input.syncedToGoogle && input.googleSyncStatus === 'synced') {
    return { provider: 'google', state: 'synced' }
  }

  return null
}
