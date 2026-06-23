import { test, expect } from '@playwright/test'
import { TEST_EMAIL, TEST_PASSWORD } from './globalSetup'

test('Adding a Task via the UI makes it appear on today\'s Dashboard', async ({ page }) => {
  // Log in
  await page.goto('/')
  await page.locator('#email').fill(TEST_EMAIL)
  await page.locator('#password').fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

  // Navigate to Add Item page
  await page.goto('/add')
  await expect(page.locator('text=Add New Item')).toBeVisible()

  // Fill in the form
  const titleInput = page.locator('input[placeholder*="Enter"]').first()
  await titleInput.fill('Test Task Title')

  // Select Personal category
  const personalButton = page.locator('button').filter({ hasText: 'Personal' })
  await personalButton.click()

  // Submit
  const submitButton = page.locator('button[type="submit"]')
  await submitButton.click()

  // Should redirect to dashboard
  await expect(page).toHaveURL('/')

  // Wait for task to appear
  await expect(page.locator('text=Test Task Title')).toBeVisible({ timeout: 10_000 })
})

test('The Category dropdown\'s options equal the closed set defined in CONTEXT.md', async ({ page }) => {
  // Log in
  await page.goto('/')
  await page.locator('#email').fill(TEST_EMAIL)
  await page.locator('#password').fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

  // Navigate to Add Item page
  await page.goto('/add')
  await expect(page.locator('text=Add New Item')).toBeVisible()

  // Find the category buttons (should be 6)
  const categoryButtons = page.locator('label').filter({ hasText: 'Category' }).locator('..').locator('button')

  // Expect exactly 6 category buttons
  const count = await categoryButtons.count()
  expect(count).toBe(6)

  // Extract the category labels
  const categoryLabels = await categoryButtons.allTextContents()
  const categories = categoryLabels.map(text => text.trim()).filter(text => text.length > 0)

  // Verify the closed set from CONTEXT.md: {health, work, personal, fitness, grocery, nutrition}
  const expectedCategories = ['Health', 'Work', 'Personal', 'Fitness', 'Grocery', 'Nutrition']

  // Sort both for comparison
  const sortedActual = categories.sort()
  const sortedExpected = expectedCategories.sort()

  expect(sortedActual).toEqual(sortedExpected)
})
