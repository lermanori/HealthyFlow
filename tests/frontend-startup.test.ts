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

    const syncNotice = 'Cloud sync paused. Changes are safe on this device.'
    await page.evaluate(async (modulePath) => {
      const sync = await import(modulePath)
      sync.reportCloudSyncFailure(new Error('Backend unavailable'))
    }, '/src/hooks/useCloudSync.ts')
    await page.getByText(syncNotice).waitFor({ state: 'visible' })
    await page.waitForTimeout(3_100)
    assert.ok(await page.getByText(syncNotice).isVisible(), 'the sync notice disappeared while sync was still failing')

    await page.evaluate(async (modulePath) => {
      const sync = await import(modulePath)
      sync.clearCloudSyncFailure()
    }, '/src/hooks/useCloudSync.ts')
    await page.getByText(syncNotice).waitFor({ state: 'hidden' })

    const accountId = 'browser-login-account'
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    }
    let archiveAvailable = false
    await page.route('http://localhost:3001/api/**', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders })
        return
      }

      const path = new URL(request.url()).pathname
      if (path === '/api/auth/login') {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: accountId,
              email: 'local-first@example.com',
              name: 'Local First',
              role: 'user',
              authMethod: 'password',
            },
            token: 'browser-login-token',
          }),
        })
        return
      }
      if (path === '/api/account/export') {
        if (!archiveAvailable) {
          await route.fulfill({
            status: 503,
            headers: corsHeaders,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Could not create account export' }),
          })
          return
        }
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({
            account: { email: 'local-first@example.com' },
            items: [{
              id: 'downloaded-task',
              user_id: accountId,
              title: 'Downloaded onto this device',
              type: 'task',
              category: 'personal',
              start_time: null,
              location: null,
              duration: 20,
              repeat_type: 'none',
              completed: false,
              completed_at: null,
              scheduled_date: '2026-08-25',
              position: 0,
              original_habit_id: null,
              habit_target_value: null,
              habit_target_unit: null,
              habit_outcome: null,
              overdue_notified: false,
              rolled_over_from_task_id: null,
              original_created_at: null,
              deleted_at: null,
              created_at: '2026-08-25T08:00:00.000Z',
            }],
          }),
        })
        return
      }
      if (path === '/api/credits/summary') {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({ balance: 100, subscription: { active: true } }),
        })
        return
      }
      if (path === '/api/sync') {
        await route.fulfill({
          status: 503,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Cloud exchange unavailable' }),
        })
        return
      }

      await route.fulfill({
        status: 500,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ error: `Unexpected browser test request: ${path}` }),
      })
    })
    await page.evaluate(async (modulePath) => {
      const store = await import(modulePath)
      store.setLocalStoreDriver(store.memoryDriver())
    }, '/src/lib/local/store.ts')

    await page.locator('#email').fill('local-first@example.com')
    await page.locator('#password').fill('password123')
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByText('Could not bring your day onto this device. Nothing was changed.').waitFor({ state: 'visible' })

    const failedLogin = await page.evaluate(async ({ servicesPath, sessionPath }) => {
      const services = await import(servicesPath)
      const session = await import(sessionPath)
      return {
        activeUserId: services.localDayUser(),
        token: session.readSessionToken(),
        rememberedUser: session.readRememberedSessionUser(),
      }
    }, {
      servicesPath: '/src/lib/local/services.ts',
      sessionPath: '/src/lib/session.ts',
    })
    assert.deepEqual(failedLogin, {
      activeUserId: null,
      token: null,
      rememberedUser: null,
    }, 'a failed account download changed the active session')

    archiveAvailable = true
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.locator('#email').waitFor({ state: 'detached' })

    const localLogin = await page.evaluate(async ({ servicesPath, storePath, expectedUserId }) => {
      const services = await import(servicesPath)
      const store = await import(storePath)
      const database = await store.loadLocalDatabase(expectedUserId)
      return {
        activeUserId: services.localDayUser(),
        taskTitles: database.tasks.map((task: { title: string }) => task.title),
      }
    }, {
      servicesPath: '/src/lib/local/services.ts',
      storePath: '/src/lib/local/store.ts',
      expectedUserId: accountId,
    })
    assert.equal(localLogin.activeUserId, accountId, 'login did not switch the account onto its Local day')
    assert.deepEqual(localLogin.taskTitles, ['Downloaded onto this device'])
    await page.getByText(syncNotice).waitFor({ state: 'visible' })
  } finally {
    await browser?.close()
    await server.close()
  }
})
