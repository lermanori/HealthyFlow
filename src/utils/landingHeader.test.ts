import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const landing = readFileSync('public/landing.html', 'utf8')

describe('Landing header', () => {
  it('keeps the mobile navigation actions compact and on one line', () => {
    assert.match(landing, /\.nav-cta \.btn-sm\s*\{[\s\S]*?white-space:\s*nowrap;/)
    assert.match(landing, /class="btn btn-primary btn-sm nav-primary"[^>]*>Start Free<\/a>/)
  })

  it('does not inject scarcity copy into the compact navigation CTA', () => {
    assert.match(
      landing,
      /querySelectorAll\('a\.btn-primary\[href="\/app"\]:not\(\.nav-primary\)'\)/
    )
  })
})
