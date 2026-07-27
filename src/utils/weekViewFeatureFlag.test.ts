import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('Week View release flag', () => {
  it('is opt-in and protects both navigation and direct routes', () => {
    const featureFlags = readFileSync('src/featureFlags.ts', 'utf8')
    const app = readFileSync('src/App.tsx', 'utf8')
    const layout = readFileSync('src/components/Layout.tsx', 'utf8')

    assert.match(featureFlags, /VITE_WEEK_VIEW_ENABLED === 'true'/)
    assert.match(app, /WEEK_VIEW_ENABLED \? <WeekViewPage \/> : <Navigate to="\/" replace \/>/)
    assert.match(layout, /WEEK_VIEW_ENABLED \? \[\{ name: 'Week View'/)
  })
})
