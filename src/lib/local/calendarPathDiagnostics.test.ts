import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calendarPathDiagnosis, calendarPathReasons } from './calendarPathDiagnostics'

const onDevice = {
  isNativeIOS: true,
  calendarAuthorization: 'full_access' as const,
}

describe('why an identity does or does not reach EventKit', () => {
  it('clears a Guest, whose day is Local by definition', () => {
    const diagnosis = calendarPathDiagnosis({
      ...onDevice,
      user: { id: 'guest-1', email: null },
      dayUserId: 'guest-1',
      rememberedOwnerId: 'guest-1',
    })

    assert.equal(diagnosis.identity, 'guest')
    assert.equal(diagnosis.branch, 'local')
    assert.equal(diagnosis.reachesEventKit, true)
    assert.deepEqual(diagnosis.blockers, [])
  })

  it('clears an account this device remembers holding the day for', () => {
    const diagnosis = calendarPathDiagnosis({
      ...onDevice,
      user: { id: 'account-1', email: 'someone@example.com' },
      dayUserId: 'account-1',
      rememberedOwnerId: 'account-1',
    })

    assert.equal(diagnosis.identity, 'account')
    assert.equal(diagnosis.reachesEventKit, true)
  })

  it('names the hosted branch as the reason an account misses EventKit', () => {
    // The failure #266 exists to confirm or refute: writes go to /tasks and the
    // backend Google adapter, so EventKit is never called at all.
    const diagnosis = calendarPathDiagnosis({
      ...onDevice,
      user: { id: 'account-1', email: 'someone@example.com' },
      dayUserId: null,
      rememberedOwnerId: null,
    })

    assert.equal(diagnosis.branch, 'hosted')
    assert.equal(diagnosis.reachesEventKit, false)
    assert.deepEqual(diagnosis.blockers, [
      'day_owner_not_remembered',
      'day_user_not_selected',
    ])
  })

  it('separates a mismatched owner from a missing one', () => {
    const diagnosis = calendarPathDiagnosis({
      ...onDevice,
      user: { id: 'account-2', email: 'someone@example.com' },
      dayUserId: null,
      rememberedOwnerId: 'account-1',
    })

    // Two different repairs: one device never downloaded the day, the other is
    // still holding somebody else's.
    assert.ok(diagnosis.blockers.includes('day_owner_mismatch'))
    assert.ok(!diagnosis.blockers.includes('day_owner_not_remembered'))
  })

  it('reports an unconnected Calendar even when the branch is correct', () => {
    const diagnosis = calendarPathDiagnosis({
      isNativeIOS: true,
      calendarAuthorization: 'denied',
      user: { id: 'guest-1', email: null },
      dayUserId: 'guest-1',
      rememberedOwnerId: 'guest-1',
    })

    assert.equal(diagnosis.branch, 'local')
    assert.equal(diagnosis.reachesEventKit, false)
    assert.deepEqual(diagnosis.blockers, ['calendar_not_connected'])
  })

  it('does not blame the branch when there is no session at all', () => {
    const diagnosis = calendarPathDiagnosis({
      ...onDevice,
      user: null,
      dayUserId: null,
      rememberedOwnerId: null,
    })

    assert.equal(diagnosis.identity, 'none')
    assert.deepEqual(diagnosis.blockers, ['no_session'])
  })

  it('says the web has no EventKit rather than inventing a day-branch fault', () => {
    const diagnosis = calendarPathDiagnosis({
      isNativeIOS: false,
      calendarAuthorization: 'not_determined',
      user: { id: 'account-1', email: 'someone@example.com' },
      dayUserId: null,
      rememberedOwnerId: null,
    })

    assert.ok(diagnosis.blockers.includes('not_native'))
  })

  it('renders every blocker as readable text and never leaks an identifier', () => {
    const diagnosis = calendarPathDiagnosis({
      ...onDevice,
      user: { id: 'account-1', email: 'someone@example.com' },
      dayUserId: null,
      rememberedOwnerId: 'account-9',
    })
    const reasons = calendarPathReasons(diagnosis)

    assert.equal(reasons.length, diagnosis.blockers.length)
    for (const reason of reasons) {
      assert.ok(reason.length > 0)
      assert.ok(!reason.includes('account-1'))
      assert.ok(!reason.includes('someone@example.com'))
    }
  })
})
