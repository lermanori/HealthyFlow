import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const landing = readFileSync('public/landing.html', 'utf8')

describe('Landing header', () => {
  it('keeps the mobile navigation actions compact and on one line', () => {
    // nowrap + a shrinkable brand is what keeps this on one line down to 320px;
    // the live CTA keeps its label short rather than adding a scarcity count.
    assert.match(landing, /\.nav-cta \.btn-sm\s*\{[\s\S]*?white-space:\s*nowrap;/)
    assert.match(
      landing,
      /class="btn btn-primary btn-sm nav-primary"[^>]*data-access-cta[^>]*>Join the waitlist<\/a>/
    )
  })
})

describe('Landing signup CTA', () => {
  it('uses one live access state for every acquisition CTA', () => {
    assert.match(landing, /querySelectorAll\('\[data-access-cta\]'\)/)
    assert.match(landing, /el\.textContent = 'Start Free'/)
    assert.match(landing, /el\.textContent = 'Join the waitlist'/)
  })

  it('ships every acquisition CTA pointing at the waitlist', () => {
    for (const cta of landing.match(/<a[^>]*data-access-cta[^>]*>/g) ?? []) {
      assert.match(cta, /href="#waitlist-form"/)
    }
  })

  it('can actually hide the sold-out offer copy', () => {
    // The script hides founding-only copy with `el.hidden = true`. The UA rule
    // `[hidden] { display: none }` loses to any author rule that sets display,
    // and `.plan li { display: flex }` did exactly that — the card shipped
    // reading "$19 / month" and "$9 locked in" at the same time. Without this
    // rule the hiding is silently a no-op inside the plan list.
    assert.match(landing, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/)
  })

  it('publishes the agreed founding and top-up offers', () => {
    assert.match(landing, /\$<span data-offer-founding-price>9<\/span>\/month/)
    assert.match(landing, /data-offer-onboarding-credits>250<\/span> AI credits/)
    assert.match(landing, /data-offer-monthly-credits>500<\/span> AI credits each month/)
    assert.match(landing, /data-offer-topup-credits>250<\/span> non-expiring credits for \$/)
    assert.match(landing, /foundingMembersRemaining/)
    assert.match(landing, /Every new account receives/)
  })
})
