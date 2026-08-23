import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { forgetLocalDayOwner, holdsLocalDay, rememberLocalDayOwner } from './services'
import {
  forgetSessionUser,
  rememberSessionUser,
  readRememberedSessionUser,
} from '../session'
import { memoryDriver, readLocalDayOwner, replaceLocalDay, setLocalStoreDriver, emptyLocalDatabase } from './store'

// A minimal localStorage, because node has none.
function installStorage() {
  const values = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

beforeEach(installStorage)

describe('which account this device holds a day for', () => {
  // The regression this file exists for. `isGuestSession` is `email === null`,
  // so the moment Claim sets an email the old rule flipped the day to the server
  // — where a freshly claimed account has nothing. Claiming would have looked
  // exactly like erasing the day.
  it('still holds the day for an account that was claimed from a Guest', () => {
    rememberLocalDayOwner('guest-1')

    assert.equal(holdsLocalDay({ id: 'guest-1', email: null }), true)
    assert.equal(holdsLocalDay({ id: 'guest-1', email: 'someone@example.com' }), true)
  })

  it('holds the day for a Guest who has not written one yet', () => {
    assert.equal(holdsLocalDay({ id: 'guest-2', email: null }), true)
  })

  it('does not hold the day for an account this device has never seen', () => {
    rememberLocalDayOwner('guest-1')

    // An existing account holder signing in on a fresh device. Their day is on
    // the server until the download exists, so reading an empty local document
    // would look like loss.
    assert.equal(holdsLocalDay({ id: 'someone-else', email: 'other@example.com' }), false)
    assert.equal(holdsLocalDay(null), false)
  })

  it('forgets on request, for a deletion the user asked for by name', () => {
    rememberLocalDayOwner('guest-1')
    forgetLocalDayOwner()

    assert.equal(holdsLocalDay({ id: 'guest-1', email: 'someone@example.com' }), false)
  })
})

describe('a Guest who signs in to an account, then reopens the app', () => {
  // The exact sequence a real user hit. Signing in changed the token, the day and
  // the day's owner — but the *remembered identity* was only ever written on
  // verify, so it stayed the Guest. Reopen with the server unreachable and the app
  // came back as the old Guest, holding a day owned by the new account, refusing
  // to sign in because the two did not match.
  const GUEST = 'guest-1'
  const ACCOUNT = 'account-1'
  const accountUser = {
    id: ACCOUNT,
    email: 'someone@example.com',
    name: 'Someone',
    role: 'user' as const,
    authMethod: 'password' as const,
  }

  beforeEach(() => {
    setLocalStoreDriver(memoryDriver(null))
    rememberSessionUser({
      id: GUEST, email: null, name: 'Guest', role: 'user', authMethod: 'guest',
    })
    rememberLocalDayOwner(GUEST)
  })

  it('remembers the account, not the guest it replaced', async () => {
    // What signing in does: the day becomes the account's, and so must the
    // identity this device remembers.
    await replaceLocalDay(emptyLocalDatabase(ACCOUNT))
    rememberLocalDayOwner(ACCOUNT)
    rememberSessionUser(accountUser)

    assert.equal(readRememberedSessionUser()?.id, ACCOUNT)
    assert.equal(await readLocalDayOwner(), ACCOUNT)
    // And the account still reads its own day, which is what broke.
    assert.equal(holdsLocalDay(accountUser), true)
  })

  it('never leaves the remembered identity and the day disagreeing', async () => {
    await replaceLocalDay(emptyLocalDatabase(ACCOUNT))
    rememberLocalDayOwner(ACCOUNT)
    rememberSessionUser(accountUser)

    const owner = await readLocalDayOwner()
    const remembered = readRememberedSessionUser()

    assert.equal(owner, remembered?.id)
  })

  it('forgets the identity when the session is given up', () => {
    forgetSessionUser()
    forgetLocalDayOwner()

    assert.equal(readRememberedSessionUser(), null)
    assert.equal(holdsLocalDay(accountUser), false)
  })
})
