import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const landing = readFileSync('public/landing.html', 'utf8')

describe('Landing header', () => {
  it('keeps the mobile navigation actions compact and on one line', () => {
    assert.match(landing, /\.nav-cta \.btn-sm\s*\{[\s\S]*?white-space:\s*nowrap;/)
    assert.match(
      landing,
      /class="btn btn-primary btn-sm nav-primary"[^>]*data-access-cta[^>]*>Start free<\/a>/
    )
  })

  it('links every navigation anchor to a section on the page', () => {
    const anchors = [...landing.matchAll(/<nav class="nav-links">([\s\S]*?)<\/nav>/g)]
      .flatMap(([, nav]) => [...nav.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id))
    assert.ok(anchors.length > 0)
    for (const id of anchors) assert.match(landing, new RegExp(`id="${id}"`))
  })
})

describe('Free-v1 landing contract', () => {
  it('opens access directly without a waitlist or live offer lookup', () => {
    for (const cta of landing.match(/<a[^>]*data-access-cta[^>]*>/g) ?? []) {
      assert.match(cta, /href="\/app"/)
    }
    assert.doesNotMatch(landing, /\/auth\/signup-status|\/waitlist|waitlist-form/i)
    assert.doesNotMatch(landing, /invite-only|founding member|founding price/i)
  })

  it('states the exact Guest and claimed-account allowances', () => {
    assert.match(landing, /A Guest receives <strong>10 AI actions once<\/strong>/)
    assert.match(landing, /A claimed account receives <strong>15 AI actions each calendar month<\/strong>/)
  })

  it('is explicit about local data and unavailable Cloud', () => {
    assert.match(landing, /Cloud cannot be obtained in v1\./)
    assert.match(landing, /Your Local day is not backed up or moved to a new device\./)
    assert.doesNotMatch(landing, /\$\d|\/ month|subscription|top-up|buy now|subscribe/i)
  })

  it('offers Founders Club as a free request and feedback path', () => {
    assert.match(landing, /Founders Club/)
    assert.match(landing, /request additional free actions/)
    assert.match(landing, /href="\/app\/settings\/account-billing#founders-club"/)
  })

  it('preserves acquisition analytics and campaign attribution', () => {
    assert.match(landing, /capture\('signup_cta_clicked'/)
    assert.match(landing, /destination:\s*'app'/)
    assert.equal((landing.match(/data-demo-cta/g) ?? []).length, 3)
    assert.match(landing, /\['utm_source', 'utm_medium', 'utm_campaign'\]/)
    assert.match(landing, /href\.searchParams\.set\(name, value\)/)
  })
})
