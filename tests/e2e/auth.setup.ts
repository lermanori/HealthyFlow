import { test as setup, expect } from '@playwright/test'
import { TEST_EMAIL, TEST_PASSWORD } from './globalSetup'

const authFile = 'tests/e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('token'))
  await page.goto('/')

  // Ensure we're on the login form (not already authenticated)
  await expect(page.locator('#email')).toBeVisible()

  await page.locator('#email').fill(TEST_EMAIL)
  await page.locator('#password').fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()

  // Wait for the authenticated shell.
  await expect(page.getByRole('link', { name: 'Today' })).toBeVisible({ timeout: 10_000 })

  await page.context().storageState({ path: authFile })
})
