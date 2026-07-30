import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { EnabledIosVersionPolicy } from '../../backend/src/mobile-version-contracts'
import { evaluateIosVersionPolicy } from './mobileVersion'

const policy: EnabledIosVersionPolicy = {
  enabled: true,
  platform: 'ios',
  minimumVersion: '1.4.0',
  latestVersion: '1.6.0',
  storeUrl: 'https://apps.apple.com/app/healthyflow/id123456789',
  message: 'Update HealthyFlow to continue.',
}

describe('native iOS version gate', () => {
  it('blocks a marketing version below the configured minimum', () => {
    assert.deepEqual(evaluateIosVersionPolicy('1.3.9', policy, 'live'), {
      status: 'blocked',
      currentVersion: '1.3.9',
      policy,
      source: 'live',
    })
  })

  it('accepts equal and newer versions component-by-component', () => {
    assert.equal(evaluateIosVersionPolicy('1.4', policy, 'live').status, 'supported')
    assert.equal(evaluateIosVersionPolicy('1.10', policy, 'cache').status, 'supported')
  })

  it('accepts every version when the gate is disabled', () => {
    assert.deepEqual(evaluateIosVersionPolicy('0.1', {
      enabled: false,
      platform: 'ios',
    }, 'live'), {
      status: 'supported',
      currentVersion: '0.1',
    })
  })
})
