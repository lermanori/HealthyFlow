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
  | { provider: 'google'; state: 'synced' | 'failed' | 'pending' }

export interface CalendarItemStatusInput {
  /** This device's EventKit bookkeeping for the Item, when one exists. */
  deviceCalendar?: { status: 'synced' | 'failed'; error: string | null } | null
  syncedToGoogle?: boolean
  googleSyncStatus?: 'pending' | 'synced' | 'skipped' | 'failed'
}

const DEVICE_WRITE_FAILED = 'HealthyFlow could not write this Item to your iPhone Calendar.'

export function calendarItemStatus(input: CalendarItemStatusInput): CalendarItemStatus | null {
  // A Device Calendar link means EventKit ran for this Item on this device, so it
  // is the authority — including when it failed. A failed write reported as
  // absence is the specific dishonesty this function exists to remove.
  if (input.deviceCalendar) {
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
  // other provider that can have run. `skipped` is a real decision not to sync,
  // not a status worth a badge.
  if (input.googleSyncStatus === 'failed') return { provider: 'google', state: 'failed' }
  if (input.googleSyncStatus === 'pending') return { provider: 'google', state: 'pending' }
  if (input.syncedToGoogle && input.googleSyncStatus === 'synced') {
    return { provider: 'google', state: 'synced' }
  }

  return null
}
