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
    // Both entries in the "Plan" group are flagged individually. Layout drops a
    // group once it has no items, so the group disappears when both are off.
    assert.match(layout, /WEEK_VIEW_ENABLED \? \[\{ name: 'Week'/)
  })
})

describe('Work release flag', () => {
  it('is opt-in and protects navigation, the direct route and the Add page', () => {
    const featureFlags = readFileSync('src/featureFlags.ts', 'utf8')
    const app = readFileSync('src/App.tsx', 'utf8')
    const layout = readFileSync('src/components/Layout.tsx', 'utf8')
    const addItem = readFileSync('src/pages/AddItemPage.tsx', 'utf8')

    assert.match(featureFlags, /VITE_WORK_ENABLED === 'true'/)
    assert.match(app, /WORK_ENABLED \? <WorkPage \/> : <Navigate to="\/" replace \/>/)
    assert.match(layout, /WORK_ENABLED \? \[\{ name: 'Work'/)
    // A Project cannot be assigned while the surface that opens it is hidden.
    assert.match(addItem, /todayType === 'task' && WORK_ENABLED &&/)
  })

  it('strips Focus blocks from the day so Today cannot render them', () => {
    const api = readFileSync('src/services/api.ts', 'utf8')

    // Today reads Focus blocks from two independent places, so the flag is
    // applied once to the fetched day rather than at each render site.
    assert.match(api, /function applyWorkVisibility/)
    assert.match(api, /if \(WORK_ENABLED\) return summary/)
    assert.match(api, /work: \{ status: 'not_scheduled', focusBlocks: \[\] \}/)
    assert.match(api, /reference\.kind !== 'focus_block'/)
    assert.match(api, /applyWorkVisibility\(DaySummarySchema\.parse\(response\.data\)\)/)
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

describe('Cloud sync release flag', () => {
  it('is opt-in and prevents the free-v1 shell from probing an unavailable entitlement', () => {
    const featureFlags = readFileSync('src/featureFlags.ts', 'utf8')
    const cloudSync = readFileSync('src/hooks/useCloudSync.ts', 'utf8')

    assert.match(featureFlags, /VITE_CLOUD_SYNC_ENABLED === 'true'/)
    // The shape of the guard may change; what must hold is that the flag stops
    // the loop before it reaches the network.
    assert.match(cloudSync, /if \(!CLOUD_SYNC_ENABLED\)[\s\S]{0,240}?return/)
  })
})

describe('Cloud replication is enabled at build time but gated on the server', () => {
  it('turns the flag on for production builds as a recorded decision', () => {
    const production = readFileSync('.env.production', 'utf8')

    assert.match(production, /VITE_CLOUD_SYNC_ENABLED=true/)
    // The reason has to travel with the value. A bare `true` here reads as an
    // accident next time someone audits the free-v1 build.
    assert.match(production, /ADR-0019/)
    assert.match(production, /CloudAccess\.require/)
  })

  it('keeps the entitlement on the server, where a build flag cannot reach it', () => {
    const route = readFileSync('backend/src/routes/sync.ts', 'utf8')

    // The client flag only decides whether to *attempt* an exchange. If this
    // gate ever moves client-side, a free account's day starts leaving the
    // device the moment someone flips a build var.
    assert.match(route, /CloudAccess\.require\(req\.user\.userId\)/)
  })

  it('needs no flag to keep direct Google off the iPhone', () => {
    const production = readFileSync('.env.production', 'utf8')
    const flags = readFileSync('src/featureFlags.ts', 'utf8')

    // The guarantee is structural now, so neither the build config nor the flag
    // module should mention it — a flag that no longer exists cannot be set by
    // someone who has not read ADR-0020 §4.
    assert.doesNotMatch(production, /NATIVE_GOOGLE_CALENDAR_ENABLED/)
    assert.doesNotMatch(flags, /NATIVE_GOOGLE_CALENDAR_ENABLED/)
  })
})
