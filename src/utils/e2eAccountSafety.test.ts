import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import path from 'node:path'

const e2eDirectory = 'tests/e2e'
const e2eSources = readdirSync(e2eDirectory)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => ({
    file,
    source: readFileSync(path.join(e2eDirectory, file), 'utf8'),
  }))

describe('e2e account safety', () => {
  it('contains no direct user-account writers', () => {
    const forbidden = [
      { label: 'users table insert/upsert', pattern: /\.from\(['"]users['"]\)[\s\S]{0,160}\.(?:insert|upsert)\(/ },
      { label: 'application user factory', pattern: /\bdb\.createUser\(/ },
      { label: 'Supabase Auth user factory', pattern: /\bauth\.admin\.createUser\(/ },
    ]

    const violations = e2eSources.flatMap(({ file, source }) =>
      forbidden
        .filter(({ pattern }) => pattern.test(source))
        .map(({ label }) => `${file}: ${label}`)
    )
    assert.deepEqual(
      violations,
      [],
      `E2E must reuse e2e@test.healthyflow.local instead of creating users: ${violations.join(', ')}`
    )
  })

  it('requires the durable account instead of seeding a replacement', () => {
    const setup = readFileSync(path.join(e2eDirectory, 'globalSetup.ts'), 'utf8')
    assert.match(setup, /Missing \$\{TEST_EMAIL\}\. Provision this durable test account outside/)
    assert.doesNotMatch(setup, /bcrypt|passwordHash|Failed to seed test user/)
  })

  it('always starts isolated local web servers with account creation blocked', () => {
    const config = readFileSync('playwright.config.ts', 'utf8')
    assert.match(config, /HF_TEST_MODE: '1'/)
    assert.match(config, /VITE_API_URL: `http:\/\/localhost:\$\{apiPort\}\/api`/)
    assert.equal(
      [...config.matchAll(/reuseExistingServer: false/g)].length,
      2,
      'both E2E web servers must reject reuse so the suite cannot hit a non-test backend'
    )
  })
})
