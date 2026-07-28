import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The Playwright projects partition the e2e suite by subject. A partition is only
// safe if it stays total and disjoint:
//   - miss a spec, and it silently stops running in the default suite
//   - list one twice, and the default suite runs it twice and inflates the totals
// Neither failure is visible in a green run, so it is asserted here instead.

const config = readFileSync('playwright.config.ts', 'utf8')

function subjectSpecs(): Map<string, string[]> {
  const block = config.match(/const SUBJECTS: Record<string, readonly string\[\]> = \{([\s\S]*?)\n\}/)
  assert.ok(block, 'SUBJECTS map not found in playwright.config.ts')
  const subjects = new Map<string, string[]>()
  for (const line of block[1].split('\n')) {
    const entry = line.match(/^\s*([a-z]+):\s*\[(.*)\],\s*$/)
    if (!entry) continue
    subjects.set(entry[1], [...entry[2].matchAll(/'([^']+)'/g)].map((m) => m[1]))
  }
  assert.ok(subjects.size > 0, 'parsed no subjects')
  return subjects
}

const onDisk = readdirSync('tests/e2e')
  .filter((file) => file.endsWith('.spec.ts'))
  .map((file) => file.replace(/\.spec\.ts$/, ''))

describe('e2e subject partition', () => {
  it('covers every spec file', () => {
    const claimed = new Set([...subjectSpecs().values()].flat())
    const missing = onDisk.filter((spec) => !claimed.has(spec))
    assert.deepEqual(
      missing,
      [],
      `spec files in no subject would never run: ${missing.join(', ')}. Add them to SUBJECTS in playwright.config.ts.`
    )
  })

  it('lists no spec under two subjects', () => {
    const seen = new Map<string, string>()
    const dupes: string[] = []
    for (const [subject, specs] of subjectSpecs()) {
      for (const spec of specs) {
        const first = seen.get(spec)
        if (first) dupes.push(`${spec} (${first} + ${subject})`)
        else seen.set(spec, subject)
      }
    }
    assert.deepEqual(dupes, [], `specs listed twice would run twice: ${dupes.join(', ')}`)
  })

  it('references no spec that does not exist', () => {
    const known = new Set(onDisk)
    const ghosts = [...subjectSpecs().values()].flat().filter((spec) => !known.has(spec))
    assert.deepEqual(ghosts, [], `SUBJECTS names a missing spec: ${ghosts.join(', ')}`)
  })
})
