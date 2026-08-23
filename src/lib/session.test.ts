import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  applyVerifiedSession,
  endedTheSession,
  forgetSessionUser,
  readRememberedSessionUser,
  isGuestSession,
  readSessionToken,
  setSessionTokenStore,
  type SessionTokenStore,
} from './session'

function installStorage() {
  const values = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

function memoryTokenStore(initial: string | null = null): SessionTokenStore & { value: string | null } {
  const store = {
    value: initial,
    read: () => store.value,
    write: (token: string) => { store.value = token },
    clear: () => { store.value = null },
  }
  return store
}

const GUEST_VERIFY_RESPONSE = {
  id: 'guest-1',
  email: null,
  name: 'Guest',
  role: 'user',
  authMethod: 'guest',
  token: 'renewed-guest-token',
}

const ACCOUNT_VERIFY_RESPONSE = {
  id: 'user-1',
  email: 'someone@example.com',
  name: 'Someone',
  role: 'user',
  authMethod: 'password',
}

let store: ReturnType<typeof memoryTokenStore>

beforeEach(() => {
  installStorage()
  store = memoryTokenStore('the-token-we-verified-with')
  setSessionTokenStore(store)
})

describe('applying a verified session', () => {
  // The regression this file exists for. `GET /auth/verify` re-issues a Guest's
  // session on every open so the year slides forward (ADR-0010); a client that
  // reads only the identity ships a fixed fuse from account creation and strands
  // the Guest on day 366. No backend test can catch it — supertest's world ends
  // at res.body.
  it('persists the token the server re-issued for a Guest', () => {
    const { user, renewedToken } = applyVerifiedSession(GUEST_VERIFY_RESPONSE)

    assert.equal(renewedToken, 'renewed-guest-token')
    assert.equal(readSessionToken(), 'renewed-guest-token')
    assert.equal(user.email, null)
    assert.equal(user.authMethod, 'guest')
    assert.ok(!('token' in user), 'the token is a session concern, not part of the identity')
  })

  it('leaves the stored token alone when the server did not re-issue one', () => {
    const { user, renewedToken } = applyVerifiedSession(ACCOUNT_VERIFY_RESPONSE)

    assert.equal(renewedToken, null)
    assert.equal(readSessionToken(), 'the-token-we-verified-with')
    assert.equal(user.email, 'someone@example.com')
  })

  it('refuses a response it cannot read rather than inventing an identity', () => {
    assert.throws(() => applyVerifiedSession({ id: 'guest-1', email: null }))
    assert.throws(() => applyVerifiedSession({ ...GUEST_VERIFY_RESPONSE, token: '' }))
    assert.equal(readSessionToken(), 'the-token-we-verified-with')
  })
})

describe('recognising a Guest', () => {
  it('is exactly the absence of an email', () => {
    assert.equal(isGuestSession({ email: null }), true)
    assert.equal(isGuestSession({ email: 'someone@example.com' }), false)
    assert.equal(isGuestSession(null), false)
    assert.equal(isGuestSession(undefined), false)
  })
})

describe('opening without a network', () => {
  // The bug this exists for cost a real day. A Guest opened the app while the
  // server was unreachable, `verifyToken` rejected, the session was cleared, and
  // starting again minted a new identity — so the document on the device belonged
  // to a session that could never be produced again. The day was stranded by a
  // failed *network call*, in an app whose whole promise is that it does not need
  // one.
  it('tells a refusal apart from an absent network', () => {
    assert.equal(endedTheSession({ response: { status: 401 } }), true)
    assert.equal(endedTheSession({ response: { status: 403 } }), true)
    // axios leaves `response` undefined when nothing answered at all.
    assert.equal(endedTheSession({ message: 'Network Error' }), false)
    assert.equal(endedTheSession(new Error('boom')), false)
    assert.equal(endedTheSession(null), false)
  })

  it('remembers the identity the server last confirmed', () => {
    applyVerifiedSession(GUEST_VERIFY_RESPONSE)

    const remembered = readRememberedSessionUser()

    assert.equal(remembered?.id, 'guest-1')
    assert.equal(remembered?.email, null)
    assert.equal(remembered?.authMethod, 'guest')
  })

  it('forgets it when the session really ends', () => {
    applyVerifiedSession(GUEST_VERIFY_RESPONSE)
    forgetSessionUser()

    assert.equal(readRememberedSessionUser(), null)
  })

  it('treats an unreadable cached identity as absent rather than guessing at one', () => {
    localStorage.setItem('healthyflow-session-user-v1', '{"id":')
    assert.equal(readRememberedSessionUser(), null)

    localStorage.setItem('healthyflow-session-user-v1', '{"id":"x"}')
    assert.equal(readRememberedSessionUser(), null)
  })
})
