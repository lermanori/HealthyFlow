import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')
const packageJson = readFileSync('package.json', 'utf8')
const nativePackage = readFileSync('ios/App/CapApp-SPM/Package.swift', 'utf8')
const releaseRunbook = readFileSync('docs/runbooks/app-store-v1.md', 'utf8')

describe('free-v1 iOS release configuration', () => {
  it('uses one iOS 17 floor at project, app, widget and Swift-package levels', () => {
    const deploymentTargets = [...project.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)]
      .map(([, version]) => version)
    assert.equal(deploymentTargets.length, 6)
    assert.deepEqual([...new Set(deploymentTargets)], ['17.0'])
    assert.match(nativePackage, /platforms: \[\.iOS\(\.v17\)\]/)
  })

  it('keeps app and widget release identity aligned', () => {
    assert.equal((project.match(/MARKETING_VERSION = 1\.0\.1;/g) ?? []).length, 4)
    assert.equal((project.match(/CURRENT_PROJECT_VERSION = 2;/g) ?? []).length, 4)
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
    const subtitle = releaseRunbook.match(/\*\*Subtitle \(\d+ characters\)\*\*\n\n```text\n([^\n]+)\n```/)?.[1]
    const keywords = releaseRunbook.match(/\*\*Keywords \(\d+ bytes\)\*\*\n\n```text\n([^\n]+)\n```/)?.[1]
    const description = releaseRunbook.match(/\*\*Description\*\*\n\n```text\n([\s\S]+?)\n```/)?.[1]

    assert.ok(subtitle)
    assert.ok(keywords)
    assert.ok(description)
    assert.ok(Buffer.byteLength(subtitle) <= 30)
    assert.ok(Buffer.byteLength(keywords) <= 100)
    assert.ok(Buffer.byteLength(description) <= 4_000)
  })
})
