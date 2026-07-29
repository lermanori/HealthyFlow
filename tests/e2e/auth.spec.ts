import { test, expect } from './fixtures/ai-stubs'
import { TEST_EMAIL, TEST_PASSWORD } from './globalSetup'

test.describe('unauthenticated flows', () => {
  // ponytail: clear storageState so tests in this block start unauthenticated
  test.use({ storageState: { cookies: [], origins: [] } })

  test('login with seeded credentials lands on Today', async ({ page }) => {
    // unauthenticated root renders the Login page
    await page.goto('/app')

    await page.locator('#email').fill(TEST_EMAIL)
    await page.locator('#password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    // Today shows a date heading (h1) once authenticated
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
  })

  test('logout after login returns to LoginPage and persists on navigation', async ({ page }) => {
    // Start unauthenticated, log in
    await page.goto('/app')
    await page.locator('#email').fill(TEST_EMAIL)
    await page.locator('#password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    // Wait for Today (authenticated state)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    // Click logout button (in header on desktop)
    await page.locator('button:has-text("Logout")').click()

    // LoginPage should appear (email field is visible)
    await expect(page.locator('#email')).toBeVisible({ timeout: 10_000 })

    // Navigate to / and assert still on LoginPage (not redirected back to Today)
    await page.goto('/app')
    await expect(page.locator('#email')).toBeVisible()
  })

  test('waitlist stays secondary and validates inline', async ({ page }) => {
    await page.route('**/api/auth/signup-status', (route) => route.fulfill({
      json: {
        mode: 'waitlist',
        remaining: 0,
        offer: {
          foundingMemberLimit: 100,
          foundingMembersRemaining: 100,
          onboardingCredits: 250,
          foundingOnboardingCredits: 250,
          standardOnboardingCredits: 50,
          foundingPriceUsd: 9,
          regularPriceUsd: 19,
          monthlyCredits: 500,
          topUpPriceUsd: 5,
          topUpCredits: 250,
        },
      },
    }))

    await page.goto('/app')

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.locator('#email')).toHaveValue('')
    await expect(page.locator('#password')).toHaveValue('')
    await expect(page.getByText('demo@healthyflow.com')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Try the guided demo' })).toHaveAttribute('href', '/app/demo')
    await expect(page.locator('#waitlist-email')).toHaveCount(0)

    await page.getByRole('button', { name: 'Join the waitlist' }).click()
    await expect(page.locator('#waitlist-email')).toBeVisible()
    await page.getByRole('button', { name: 'Join the waitlist' }).last().click()
    await expect(page.getByRole('alert')).toHaveText('Enter your email address.')
  })
})

test.describe('authenticated flows', () => {
  // ponytail: use the shared storageState from auth.setup.ts (authenticated)
  test.use({ storageState: 'tests/e2e/.auth/user.json' })

  test('session persists across page reload', async ({ page }) => {
    // Navigate to Today (should already be authenticated via storageState)
    await page.goto('/app')

    // Assert Today is shown, not LoginPage
    // Date heading only appears in authenticated Today
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    // Reload the page
    await page.reload()

    // Today should still be visible after reload
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
  })
})
