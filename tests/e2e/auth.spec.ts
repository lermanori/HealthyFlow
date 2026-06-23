import { test, expect } from './fixtures/ai-stubs'
import { TEST_EMAIL, TEST_PASSWORD } from './globalSetup'

test.describe('unauthenticated flows', () => {
  // ponytail: clear storageState so tests in this block start unauthenticated
  test.use({ storageState: { cookies: [], origins: [] } })

  test('login with seeded credentials lands on Dashboard', async ({ page }) => {
    // unauthenticated root renders the Login page
    await page.goto('/')

    await page.locator('#email').fill(TEST_EMAIL)
    await page.locator('#password').fill(TEST_PASSWORD)
    await page.locator('button[type="submit"]').click()

    // Dashboard shows a date heading (h1) once authenticated
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
  })

  test('logout after login returns to LoginPage and persists on navigation', async ({ page }) => {
    // Start unauthenticated, log in
    await page.goto('/')
    await page.locator('#email').fill(TEST_EMAIL)
    await page.locator('#password').fill(TEST_PASSWORD)
    await page.locator('button[type="submit"]').click()

    // Wait for Dashboard (authenticated state)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    // Click logout button (in header on desktop)
    await page.locator('button:has-text("Logout")').click()

    // LoginPage should appear (email field is visible)
    await expect(page.locator('#email')).toBeVisible({ timeout: 10_000 })

    // Navigate to / and assert still on LoginPage (not redirected back to Dashboard)
    await page.goto('/')
    await expect(page.locator('#email')).toBeVisible()
  })
})

test.describe('authenticated flows', () => {
  // ponytail: use the shared storageState from auth.setup.ts (authenticated)
  test.use({ storageState: 'tests/e2e/.auth/user.json' })

  test('session persists across page reload', async ({ page }) => {
    // Navigate to Dashboard (should already be authenticated via storageState)
    await page.goto('/')

    // Assert Dashboard is shown, not LoginPage
    // Date heading only appears in authenticated Dashboard
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    // Reload the page
    await page.reload()

    // Dashboard should still be visible after reload
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
  })
})
