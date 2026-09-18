import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')
const packageJson = readFileSync('package.json', 'utf8')
const nativePackage = readFileSync('ios/App/CapApp-SPM/Package.swift', 'utf8')
const releaseRunbook = readFileSync('docs/runbooks/app-store-v1.md', 'utf8')
const listing = readFileSync('output/app-store/v1/listing-draft.md', 'utf8')
const layout = readFileSync('src/components/Layout.tsx', 'utf8')
const addItemPage = readFileSync('src/pages/AddItemPage.tsx', 'utf8')

describe('free-v1 iOS release configuration', () => {
  it('uses one iOS 26 floor at project, app, widget and Swift-package levels', () => {
    const deploymentTargets = [...project.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)]
      .map(([, version]) => version)
    assert.equal(deploymentTargets.length, 6)
    assert.deepEqual([...new Set(deploymentTargets)], ['26.0'])
    assert.match(nativePackage, /swift-tools-version: 6\.2/)
    assert.match(nativePackage, /platforms: \[\.iOS\(\.v26\)\]/)
  })

  it('keeps app and widget release identity aligned', () => {
    assert.equal((project.match(/MARKETING_VERSION = 1\.0\.1;/g) ?? []).length, 4)
    assert.equal((project.match(/CURRENT_PROJECT_VERSION = 5;/g) ?? []).length, 4)
    assert.equal((project.match(/PRODUCT_BUNDLE_IDENTIFIER = app\.healthyflow\.mobile;/g) ?? []).length, 2)
    assert.equal((project.match(/PRODUCT_BUNDLE_IDENTIFIER = app\.healthyflow\.mobile\.widget;/g) ?? []).length, 2)
  })

  it('contains no v1 payment SDK or native purchase package', () => {
    const dependencySources = `${packageJson}\n${nativePackage}`
    assert.doesNotMatch(dependencySources, /revenuecat|purchases-capacitor|lemon.?squeezy|storekit/i)
  })

  it('records the exact free-v1 entitlement and local-data contract', () => {
    assert.match(releaseRunbook, /A Guest receives 10 AI actions once\./)
    assert.match(releaseRunbook, /A claimed account receives 15 AI actions each calendar month\./)
    assert.match(releaseRunbook, /Cloud cannot be obtained in v1\./)
    assert.match(releaseRunbook, /There is no purchase rail in the app\./)
    assert.match(releaseRunbook, /Founders Club/)
  })

  it("keeps App Store copy within Apple's published byte limits", () => {
    const subtitle = listing.match(/## Subtitle\n\n([^\n]+)/)?.[1]
    const keywords = listing.match(/## Keywords\n\n([^\n]+)/)?.[1]
    const description = listing.match(/## Description\n\n([\s\S]+?)\n\n## Keywords/)?.[1]

    assert.ok(subtitle)
    assert.ok(keywords)
    assert.ok(description)
    assert.ok(Buffer.byteLength(subtitle) <= 30)
    assert.ok(Buffer.byteLength(keywords) <= 100)
    assert.ok(Buffer.byteLength(description) <= 4_000)
  })

  it('keeps native navigation inside iOS presentation bounds and time entry direct', () => {
    assert.match(layout, /mobile-navigation-header/)
    assert.match(layout, /env\(safe-area-inset-top\)/)
    assert.match(addItemPage, /data-testid="add-item-time"/)
    assert.match(addItemPage, /type="time"/)
    assert.doesNotMatch(addItemPage, /TimePickerSheet/)
  })
})
