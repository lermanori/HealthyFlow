import { test, expect } from '@playwright/test'
import { TEST_EMAIL, TEST_PASSWORD } from './globalSetup'

test('login with seeded credentials lands on Dashboard', async ({ page }) => {
  // unauthenticated root renders the Login page
  await page.goto('/')

  await page.locator('#email').fill(TEST_EMAIL)
  await page.locator('#password').fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()

  // Dashboard shows a date heading (h1) once authenticated
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
})
