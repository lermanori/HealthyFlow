import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const settingsSource = fs.readFileSync(new URL('../pages/SettingsPage.tsx', import.meta.url), 'utf8')
const tokenManagerSource = fs.readFileSync(new URL('../pages/TokenManagerPage.tsx', import.meta.url), 'utf8')

test('Settings exposes both Founders Club entry points', () => {
  assert.match(settingsSource, /Founders Club/)
  assert.match(settingsSource, /Send feedback/)
  assert.match(settingsSource, /Request more actions/)
})

test('the Founders Club flow is available in native and has no mail-client dependency', () => {
  assert.doesNotMatch(settingsSource, /contactFlow && !isNativeApp/)
  assert.doesNotMatch(settingsSource, /mailto:lermanori@gmail\.com/)
})

test('the Founders Club surface contains no purchase or price language', () => {
  const start = settingsSource.indexOf('{/* Founders Club */}')
  const end = settingsSource.indexOf('{/* Notifications */}')
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const foundersClubSource = settingsSource.slice(start, end)

  assert.doesNotMatch(foundersClubSource, /\b(buy|subscribe|top up|purchase|pay)\b/i)
  assert.doesNotMatch(foundersClubSource, /\$\d/)
})

test('the admin inbox shows supplied reply contact before account identity', () => {
  assert.match(tokenManagerSource, /message\.replyTo \?\? message\.userEmail \?\? message\.userId/)
  assert.match(tokenManagerSource, /message\.kind === 'feedback' \? 'Feedback' : 'More actions'/)
})
