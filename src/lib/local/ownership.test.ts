import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { forgetLocalDayOwner, holdsLocalDay, rememberLocalDayOwner, setLocalDayUser } from './services'
import { updateLocalSettings } from './day'
import {
  forgetSessionUser,
  rememberSessionUser,
  readRememberedSessionUser,
} from '../session'
import {
  heldDayRecovery,
  memoryDriver,
  opensWithoutSession,
  readLocalDayIdentity,
  replaceLocalDay,
  setLocalStoreDriver,
  emptyLocalDatabase,
} from './store'

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
    assert.equal((await readLocalDayIdentity())?.id, ACCOUNT)
    // And the account still reads its own day, which is what broke.
    assert.equal(holdsLocalDay(accountUser), true)
  })

  it('never leaves the remembered identity and the day disagreeing', async () => {
    await replaceLocalDay(emptyLocalDatabase(ACCOUNT))
    rememberLocalDayOwner(ACCOUNT)
    rememberSessionUser(accountUser)

    const owner = (await readLocalDayIdentity())?.id
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

describe('what the document says about its owner', () => {
  const GUEST = 'guest-9'
  const ACCOUNT = 'account-9'

  beforeEach(() => {
    setLocalStoreDriver(memoryDriver(null))
    setLocalDayUser(null, null)
  })

  it('records the owner\u2019s email, so a logged-out account is not mistaken for a Guest', async () => {
    setLocalDayUser(ACCOUNT, 'someone@example.com')
    await updateLocalSettings(ACCOUNT, { calorieIntake: false })

    assert.equal((await readLocalDayIdentity())?.ownerEmail, 'someone@example.com')
  })

  it('records nothing for a Guest, who has no email by definition', async () => {
    setLocalDayUser(GUEST, null)
    await updateLocalSettings(GUEST, { calorieIntake: false })

    assert.equal((await readLocalDayIdentity())?.ownerEmail, null)
  })

  it('reads a document written before the field existed as a Guest\u2019s', async () => {
    // Every document in the field predates this, and they all belong to Guests.
    // Defaulting the other way would lock real Guests out of their only copy.
    const legacy = { ...emptyLocalDatabase(GUEST) } as Record<string, unknown>
    delete legacy.ownerEmail
    setLocalStoreDriver(memoryDriver(JSON.stringify(legacy)))

    assert.equal((await readLocalDayIdentity())?.ownerEmail, null)
  })

  it('keeps the email after the account signs out, because the document is untouched', async () => {
    setLocalDayUser(ACCOUNT, 'someone@example.com')
    await updateLocalSettings(ACCOUNT, { calorieIntake: false })

    setLocalDayUser(null, null)

    assert.equal((await readLocalDayIdentity())?.ownerEmail, 'someone@example.com')
  })
})

describe('opening a day with no session', () => {
  it('opens a Guest\u2019s day, which is the only key to itself', () => {
    // ADR-0010: a login screen is a trap for a Guest \u2014 the only action there
    // mints a new identity that cannot read the document sitting under it.
    assert.equal(opensWithoutSession({ id: 'guest-9', ownerEmail: null }), true)
  })

  it('refuses an account\u2019s day, which has credentials to come back with', () => {
    assert.equal(opensWithoutSession({ id: 'account-9', ownerEmail: 'someone@example.com' }), false)
  })

  it('refuses when this device holds no day at all', () => {
    assert.equal(opensWithoutSession(null), false)
  })
})

describe('a day this device holds that the current session cannot open', () => {
  it('sends an account holder to sign in, because their day is reachable', () => {
    // The stranded-day screen used to say there was no way to reopen it and offer
    // permanent erasure as the only action. For an account that is simply false.
    assert.deepEqual(heldDayRecovery({ id: 'account-9', ownerEmail: 'someone@example.com' }), {
      kind: 'sign_in', email: 'someone@example.com',
    })
  })

  it('offers a fresh start only for a Guest\u2019s day, which nobody can reopen', () => {
    assert.deepEqual(heldDayRecovery({ id: 'guest-9', ownerEmail: null }), { kind: 'start_fresh' })
  })

  it('offers nothing when this device holds no day', () => {
    assert.deepEqual(heldDayRecovery(null), { kind: 'none' })
  })
})
