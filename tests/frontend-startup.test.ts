import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium, type Browser } from '@playwright/test'
import { createServer } from 'vite'

test('the app starts in a Vite development browser without server-only module errors', { timeout: 30_000 }, async () => {
  const server = await createServer({
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: 0,
    },
  })
  let browser: Browser | undefined

  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert.ok(address && typeof address === 'object', 'Vite did not expose a listening port')

    browser = await chromium.launch()
    const page = await browser.newPage()
    const pageErrors: string[] = []
    let reportFirstPageError: () => void
    const firstPageError = new Promise<void>((resolve) => {
      reportFirstPageError = resolve
    })
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
      reportFirstPageError()
    })

    await page.goto(`http://127.0.0.1:${address.port}/app`, { waitUntil: 'domcontentloaded' })
    await Promise.race([
      page.locator('#root > *').first().waitFor({ state: 'attached', timeout: 10_000 }),
      firstPageError,
    ])

    assert.deepEqual(pageErrors, [], `uncaught browser errors:\n${pageErrors.join('\n')}`)
    assert.ok(
      await page.locator('#root').evaluate((root) => root.childElementCount > 0),
      'React did not render into #root',
    )
    const dayCoreExports = await page.evaluate(async (modulePath) => (
      Object.keys(await import(modulePath))
    ), '/backend/src/day-summary-core.ts')
    assert.ok(
      dayCoreExports.includes('buildDaySummaryCore'),
      'the browser-safe day core did not load through Vite',
    )
  } finally {
    await browser?.close()
    await server.close()
  }
})
