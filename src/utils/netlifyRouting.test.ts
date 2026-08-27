import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('Netlify production routing', () => {
  it('forces the marketing-page rewrite to override the SPA index at root', () => {
    const config = readFileSync('netlify.toml', 'utf8')
    const rootRedirect = config.match(
      /\[\[redirects\]\]\s+from = "\/"\s+to = "\/landing\.html"\s+status = 200(?<options>[\s\S]*?)(?=\n\[\[redirects\]\]|$)/
    )

    assert.ok(rootRedirect, 'missing the / → /landing.html rewrite')
    assert.match(
      rootRedirect.groups?.options ?? '',
      /\bforce\s*=\s*true\b/,
      'the root rewrite must bypass Netlify file shadowing from dist/index.html'
    )
  })

  it('keeps the public support URL outside the authenticated app entrance', () => {
    const config = readFileSync('netlify.toml', 'utf8')

    assert.match(
      config,
      /\[\[redirects\]\]\s+from = "\/support"\s+to = "\/app\/support"\s+status = 301/,
      'missing the public /support → /app/support redirect',
    )
  })
})
