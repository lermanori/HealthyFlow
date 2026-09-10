/**
 * Why this identity does or does not reach EventKit (#266).
 *
 * The architecture doc's claim that the founder account sits on the hosted
 * branch is an *inference* from one device report, not an observed fact. Every
 * entry path now calls `rememberLocalDayOwner`, so on paper every identity
 * selects the Local day — which means the useful thing to build first is not a
 * fix but a way to see the actual state on the device.
 *
 * Deliberately reports states and identifiers only. No tokens, no calendar
 * content, no credentials, no email addresses: an identity is described by
 * whether it has an email, never by which one.
 */

export type CalendarPathBranch = 'local' | 'hosted'

export type CalendarPathBlocker =
  | 'not_native'
  | 'no_session'
  | 'day_owner_not_remembered'
  | 'day_owner_mismatch'
  | 'day_user_not_selected'
  | 'calendar_not_connected'

export interface CalendarPathInput {
  isNativeIOS: boolean
  /** The signed-in identity. `email: null` is a Guest, and only a Guest. */
  user: { id: string; email: string | null } | null
  /** The module-level `dayUserId` that `onDevice` branches on. */
  dayUserId: string | null
  /** The persisted local-day owner marker, or null when absent. */
  rememberedOwnerId: string | null
  /** EventKit authorization as the native bridge last reported it. */
  calendarAuthorization: 'full_access' | 'not_determined' | 'restricted' | 'denied'
}

export interface CalendarPathDiagnosis {
  branch: CalendarPathBranch
  identity: 'guest' | 'account' | 'none'
  /** True only when a timed Item written now would actually reach EventKit. */
  reachesEventKit: boolean
  blockers: CalendarPathBlocker[]
}

export function calendarPathDiagnosis(input: CalendarPathInput): CalendarPathDiagnosis {
  const identity = input.user === null
    ? 'none'
    : input.user.email === null ? 'guest' : 'account'

  const blockers: CalendarPathBlocker[] = []
  if (!input.isNativeIOS) blockers.push('not_native')
  if (input.user === null) blockers.push('no_session')

  // A Guest holds the Local day by definition. An account holds it only when
  // this device remembers being its owner, which is the condition that decides
  // the whole branch — and therefore whether EventKit is ever called.
  if (identity === 'account') {
    if (input.rememberedOwnerId === null) blockers.push('day_owner_not_remembered')
    else if (input.rememberedOwnerId !== input.user!.id) blockers.push('day_owner_mismatch')
  }

  const branch: CalendarPathBranch = input.dayUserId === null ? 'hosted' : 'local'
  if (branch === 'hosted' && input.user !== null) blockers.push('day_user_not_selected')
  if (input.calendarAuthorization !== 'full_access') blockers.push('calendar_not_connected')

  return {
    branch,
    identity,
    reachesEventKit: blockers.length === 0,
    blockers,
  }
}

const BLOCKER_TEXT: Record<CalendarPathBlocker, string> = {
  not_native: 'Not the iPhone app, so EventKit does not exist here.',
  no_session: 'Nobody is signed in.',
  day_owner_not_remembered: 'This device does not remember holding this account’s day.',
  day_owner_mismatch: 'The remembered day owner is a different account.',
  day_user_not_selected: 'Writes are going to the server, not to the Local day.',
  calendar_not_connected: 'Calendar access has not been granted.',
}

/** One line per blocker, safe to display. Empty when the path is clear. */
export function calendarPathReasons(diagnosis: CalendarPathDiagnosis): string[] {
  return diagnosis.blockers.map((blocker) => BLOCKER_TEXT[blocker])
}
