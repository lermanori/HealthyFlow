import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nativeRouteFromUrl } from './nativeRouting'

describe('nativeRouteFromUrl', () => {
  it('maps the custom app scheme onto native routes', () => {
    assert.equal(
      nativeRouteFromUrl('healthyflow://app/talk?kickoff=morning'),
      '/talk?kickoff=morning',
    )
  })

  it('turns the native OAuth callback into the existing callback route', () => {
    assert.equal(
      nativeRouteFromUrl('healthyflow://oauth/callback?code=abc&state=123'),
      '/?code=abc&state=123&oauth=callback',
    )
  })

  it('maps trusted universal links and strips the web basename', () => {
    assert.equal(
      nativeRouteFromUrl('https://healthyflow.app/app/health?date=2026-07-30'),
      '/health?date=2026-07-30',
    )
  })

  it('rejects links from untrusted hosts and unsupported schemes', () => {
    assert.equal(nativeRouteFromUrl('https://example.com/app/talk'), null)
    assert.equal(nativeRouteFromUrl('javascript:alert(1)'), null)
    assert.equal(nativeRouteFromUrl('not a url'), null)
  })
})
