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
    assert.match(layout, /items:\s*WEEK_VIEW_ENABLED[\s\S]*?\{ name: 'Week'/)
  })
})

describe('Daily Signals release flag', () => {
  it('is opt-in on Today', () => {
    const featureFlags = readFileSync('src/featureFlags.ts', 'utf8')
    const today = readFileSync('src/pages/TodayPage.tsx', 'utf8')

    assert.match(featureFlags, /VITE_DAILY_SIGNALS_ENABLED === 'true'/)
    assert.match(today, /DAILY_SIGNALS_ENABLED && <AIRecommendationsBox date=\{selectedDateKey\} \/>/)
  })
})
