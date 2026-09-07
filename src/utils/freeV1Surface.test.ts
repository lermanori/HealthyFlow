import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const apiSource = fs.readFileSync(new URL('../services/api.ts', import.meta.url), 'utf8')
const settingsSource = fs.readFileSync(new URL('../pages/SettingsPage.tsx', import.meta.url), 'utf8')
const claimSource = fs.readFileSync(new URL('../pages/ClaimAccountPage.tsx', import.meta.url), 'utf8')

test('a 402 has no global purchase toast', () => {
  assert.doesNotMatch(apiSource, /status === 402/)
  assert.doesNotMatch(apiSource, /Open Settings to subscribe or buy more/)
})

test('Claim promises the recurring free allowance instead of purchases', () => {
  assert.match(claimSource, /15 AI actions each calendar month/)
  assert.doesNotMatch(claimSource, /buy AI credits/i)
})

test('Settings exposes no v1 storefront or Cloud controls', () => {
  assert.doesNotMatch(settingsSource, />\s*Subscribe\s*</)
  assert.doesNotMatch(settingsSource, />\s*Buy [^<]*</)
  assert.doesNotMatch(settingsSource, /\$\{planPrice\} \/ month/)
  assert.doesNotMatch(settingsSource, /Your day on every device, with AI included/)
})
