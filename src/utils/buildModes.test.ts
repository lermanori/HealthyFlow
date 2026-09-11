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

describe('running the iPhone app against a local backend', () => {
  it('has a script that syncs the local build into iOS', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

    // `build:local` alone only writes dist/. The iOS app serves
    // ios/App/App/public, which only `cap sync` updates — so without this the
    // simulator keeps serving whatever production build was last synced, and a
    // local backend sees no traffic at all.
    assert.equal(pkg.scripts['build:ios:local'], 'npm run build:local && cap sync ios')
  })

  it('keeps the shipping iOS build pinned to production', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

    assert.match(pkg.scripts['build:ios'], /build:production/)
    assert.doesNotMatch(pkg.scripts['build:ios'], /build:local/)
  })
})
