/**
 * The invariant that decides whether a timed Item ever reaches EventKit (#266).
 *
 * `useDeviceCalendarSync` exits when `localDayUser()` is null, so an identity on
 * the hosted branch never calls EventKit at all — no failed write, no badge,
 * nothing. That silence is what made the original fault so hard to place, and it
 * is why this is pinned end to end rather than only at `holdsLocalDay`.
 *
 * Observed on a physical iPhone 2026-09-10: Guest, newly claimed, returning
 * free, restored session and the founder account all report branch `local` and
 * reach EventKit, for manual and Talk-confirmed Items alike. These tests exist
 * so that stays true.
 */
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  forgetLocalDayOwner,
  holdsLocalDay,
  localDayUser,
  rememberLocalDayOwner,
  rememberedLocalDayOwner,
  restoreAccountDayForSession,
  setLocalDayUser,
} from './services'
import { calendarPathDiagnosis } from './calendarPathDiagnostics'
import { memoryDriver, setLocalStoreDriver } from './store'

const ACCOUNT = 'account-1'
const EMAIL = 'someone@example.com'

function installStorage() {
  const values = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

/** The diagnosis for whoever the module currently considers the day's owner. */
function currentPath(user: { id: string; email: string | null } | null) {
  return calendarPathDiagnosis({
    isNativeIOS: true,
    calendarAuthorization: 'full_access',
    user,
    dayUserId: localDayUser(),
    rememberedOwnerId: rememberedLocalDayOwner(),
  })
}

beforeEach(() => {
  installStorage()
  setLocalStoreDriver(memoryDriver(null))
  setLocalDayUser(null)
})

describe('every iPhone identity reaches EventKit', () => {
  it('a Guest is on the Local branch from the moment they start', () => {
    rememberLocalDayOwner('guest-1')
    setLocalDayUser('guest-1', null)

    assert.deepEqual(currentPath({ id: 'guest-1', email: null }), {
      identity: 'guest',
      branch: 'local',
      reachesEventKit: true,
      blockers: [],
    })
  })

  it('an account claimed from a Guest keeps the branch it already had', () => {
    // Claim does not change the id, so nothing should move. The old rule keyed
    // on `email === null` and flipped this identity to the server mid-session.
    rememberLocalDayOwner('guest-1')
    setLocalDayUser('guest-1', EMAIL)

    assert.equal(currentPath({ id: 'guest-1', email: EMAIL }).reachesEventKit, true)
  })

  it('a restored session lands on the Local branch and reaches EventKit', async () => {
    const result = await restoreAccountDayForSession({
      user: { id: ACCOUNT, email: EMAIL, name: 'Restored', role: 'user', authMethod: 'password' },
      token: 'verified-token',
      downloadArchive: async () => ({ items: [] }),
    })

    assert.equal(result.state, 'downloaded')
    assert.equal(localDayUser(), ACCOUNT)
    assert.equal(currentPath({ id: ACCOUNT, email: EMAIL }).reachesEventKit, true)
  })

  it('a failed restoration reports the hosted branch instead of claiming reach', async () => {
    await assert.rejects(restoreAccountDayForSession({
      user: { id: ACCOUNT, email: EMAIL, name: 'Restored', role: 'user', authMethod: 'password' },
      token: 'verified-token',
      downloadArchive: async () => { throw new Error('archive unavailable') },
    }))

    // The day was not placed, so writes would go to the server. Saying so is the
    // whole point: an unreachable EventKit must never look like a reachable one.
    const path = currentPath({ id: ACCOUNT, email: EMAIL })
    assert.equal(path.branch, 'hosted')
    assert.equal(path.reachesEventKit, false)
    assert.ok(path.blockers.includes('day_user_not_selected'))
  })

  it('names the hosted branch when the day owner is forgotten', () => {
    rememberLocalDayOwner(ACCOUNT)
    setLocalDayUser(ACCOUNT, EMAIL)
    assert.equal(currentPath({ id: ACCOUNT, email: EMAIL }).reachesEventKit, true)

    // Signing out forgets the marker. A later session that skipped restoration
    // would sit here — the exact regression #266 was opened to catch.
    forgetLocalDayOwner()
    setLocalDayUser(null)

    const path = currentPath({ id: ACCOUNT, email: EMAIL })
    assert.equal(path.branch, 'hosted')
    assert.deepEqual(path.blockers, ['day_owner_not_remembered', 'day_user_not_selected'])
    assert.equal(holdsLocalDay({ id: ACCOUNT, email: EMAIL }), false)
  })
})
