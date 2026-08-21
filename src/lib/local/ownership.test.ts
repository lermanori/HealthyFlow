import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { forgetLocalDayOwner, holdsLocalDay, rememberLocalDayOwner } from './services'

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
