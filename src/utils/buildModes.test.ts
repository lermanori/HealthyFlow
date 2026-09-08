import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>
}

describe('frontend build modes', () => {
  it('offers explicit local and production commands', () => {
    assert.equal(packageJson.scripts['build:local'], 'tsc && vite build --mode local-build')
    assert.equal(packageJson.scripts['build:production'], 'tsc && vite build --mode production')
  })

  it('keeps bare and iOS builds on the production command', () => {
    assert.equal(packageJson.scripts.build, 'npm run build:production')
    assert.match(packageJson.scripts['build:ios'], /npm run build:production/)
  })

  it('pins each mode to its intended public API URL', () => {
    assert.match(
      readFileSync('.env.local-build', 'utf8'),
      /^VITE_API_URL=http:\/\/localhost:3001\/api$/m,
    )
    assert.match(
      readFileSync('.env.production', 'utf8'),
      /^VITE_API_URL=https:\/\/healthyflow-production\.up\.railway\.app\/api$/m,
    )
  })
})
