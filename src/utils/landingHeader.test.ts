import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const landing = readFileSync('public/landing.html', 'utf8')

describe('Landing header', () => {
  it('keeps the mobile navigation actions compact and on one line', () => {
    // nowrap + a shrinkable brand is what keeps this on one line down to 320px;
    // measured, the full label clears the header at every width.
    assert.match(landing, /\.nav-cta \.btn-sm\s*\{[\s\S]*?white-space:\s*nowrap;/)
    assert.match(landing, /class="btn btn-primary btn-sm nav-primary"[^>]*>Join the waitlist<\/a>/)
  })

  it('does not inject scarcity copy into the compact navigation CTA', () => {
    // The swap targets data-signup-cta only, and the nav CTA does not carry it.
    assert.match(landing, /querySelectorAll\('a\[data-signup-cta\]'\)/)
    assert.doesNotMatch(landing, /nav-primary"\s+data-signup-cta/)
  })
})

describe('Landing signup CTA', () => {
  it('ships pointing at the waitlist so a failed status call cannot dead-end', () => {
    // Public signup slots default to 0 (backend/src/waitlist.ts), so the static
    // markup must never promise an account the login page cannot create.
    for (const cta of landing.match(/<a[^>]*data-signup-cta[^>]*>/g) ?? []) {
      assert.match(cta, /href="#waitlist-form"/)
    }
  })

  it('upgrades to Start Free only when slots are genuinely open', () => {
    assert.match(landing, /if \(status\.mode !== 'open' \|\| !\(status\.remaining > 0\)\) return;/)
  })
})
