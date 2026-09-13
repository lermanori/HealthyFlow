/**
 * When the day asks the server for other devices' work (#278).
 *
 * Push has a natural trigger — this device knows when it changed something. Pull
 * has none, and pull is the half that carries everything done elsewhere. With
 * only launch, own-edit and reconnection as triggers, a phone left open showed
 * neither a new Item nor a deletion made on another device until the next cold
 * start.
 *
 * Foreground is the moment a person looks at the screen, which is when the day
 * has to be true.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const hook = () => readFileSync('src/hooks/useCloudSync.ts', 'utf8')

test('syncs when the app comes to the foreground', () => {
  const source = hook()

  assert.match(source, /addEventListener\('healthyflow:app-state', onAppState\)/)
  assert.match(source, /detail\?\.isActive\)\s*void sync\(\)/)
})

test('ignores the app going away', () => {
  const source = hook()
  const handler = source.slice(source.indexOf('const onAppState'), source.indexOf('window.addEventListener(\'healthyflow:app-state\''))

  // Backgrounding is not a reason to exchange — the person is not looking, and
  // iOS is about to suspend the process anyway.
  assert.match(handler, /if \(detail\?\.isActive\)/)
})

test('removes the listener with the effect', () => {
  const source = hook()

  // A listener outliving its effect would sync for an identity that has gone.
  assert.match(source, /removeEventListener\('healthyflow:app-state', onAppState\)/)
})

test('adds no polling — an idle device settles rather than asking forever', () => {
  const source = hook()

  // The one timer here is the debounce after a local change. An interval would
  // make an open app exchange forever, and the Device Calendar loop was a fresh
  // reminder of what repeated background work costs a phone.
  assert.doesNotMatch(source, /setInterval/)
  // Calls, not the `ReturnType<typeof setTimeout>` annotation.
  assert.equal((source.match(/=\s*setTimeout\(/g) ?? []).length, 1)
})

test('reuses the event the app already dispatches', () => {
  const native = readFileSync('src/lib/native.ts', 'utf8')
  const calendar = readFileSync('src/hooks/useDeviceCalendarSync.ts', 'utf8')

  // `native.ts` already turns Capacitor's appStateChange into this event, and
  // the Calendar reconciler already listens for it. Cloud not doing so was the
  // asymmetry, not a missing capability.
  assert.match(native, /App\.addListener\('appStateChange'/)
  assert.match(native, /'healthyflow:app-state'/)
  assert.match(calendar, /addEventListener\('healthyflow:app-state'/)
})
