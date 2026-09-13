/**
 * The Local day accepts writes with no network (#279, ADR-0011).
 *
 * React Query defaults `networkMode: 'online'`, which *pauses* a mutation while
 * the device is offline — the function is never called, whether or not it
 * touches the network. Every write in this app goes to the Local day first, so
 * that default turned the product's headline claim into a falsehood: adding,
 * completing, editing, deleting and reordering an Item all sat paused until
 * connectivity returned.
 *
 * Nothing caught it because every other test drives the service layer directly
 * and never passes through React Query, and the offline release gate tested
 * *rendering* offline rather than *writing*.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('mutations are allowed to run while the device is offline', () => {
  const main = readFileSync('src/main.tsx', 'utf8')

  assert.match(main, /mutations:\s*\{[\s\S]*?networkMode:\s*'always'/)
})

test('refetches are allowed to run too, or a write lands unseen', () => {
  // The write succeeding is only half of it. `invalidateQueries` after a write
  // asks for a refresh, and a paused refresh leaves the screen showing the day
  // as it was — the change is on disk and invisible, which reads as lost.
  const main = readFileSync('src/main.tsx', 'utf8')

  assert.match(main, /queries:\s*\{[\s\S]*?networkMode:\s*'always'/)
})

test('the reason travels with the setting', () => {
  const main = readFileSync('src/main.tsx', 'utf8')

  // A bare `networkMode: 'always'` reads as a stray option and invites removal.
  // What it protects is the whole offline promise.
  assert.match(main, /ADR-0011/)
})

test('there is one QueryClient, so the default cannot be bypassed elsewhere', () => {
  // A second client configured without this would reintroduce the pause for
  // whatever it served, and nothing would fail.
  const sources = ['src/main.tsx', 'src/App.tsx']
  const clients = sources.filter((file) => readFileSync(file, 'utf8').includes('new QueryClient'))

  assert.deepEqual(clients, ['src/main.tsx'])
})

test('writes reach the Local day without the network in the first place', () => {
  const api = readFileSync('src/services/api.ts', 'utf8')

  // The pause was the only thing stopping an offline write: the local branch of
  // `createItem` goes to the document, and the analytics call after it is
  // deliberately not awaited.
  assert.match(api, /const createItem = onDevice\(\s*\(userId[^)]*\)\s*=>\s*\n?\s*localServices\.addTask/)
  assert.doesNotMatch(api, /await analytics\.capture/)
})

test('the release gate checks writing offline, not only rendering', () => {
  const runbook = readFileSync('docs/runbooks/app-store-v1.md', 'utf8')
  const gate = runbook.slice(runbook.indexOf('| Offline Local day'))

  assert.match(gate.split('\n')[0], /write|add|create/i)
})
