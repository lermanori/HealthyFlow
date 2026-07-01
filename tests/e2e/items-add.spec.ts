import { test, expect } from './fixtures/ai-stubs'

// storageState is injected from playwright.config.ts (setup project)

test('Adding a Task via the UI makes it appear on today\'s Today', async ({ page }) => {
  await page.goto('/add')
  // Wait for form to be ready
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  // Fill title (placeholder: "Enter task name...")
  await page.locator('input[placeholder*="Enter"]').first().fill('Test Task Title')

  // Select Personal category (button inside Category section)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()

  // Submit
  await page.locator('button[type="submit"]').click()

  // Should redirect to Today
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  // Task appears by title
  await expect(page.locator('text=Test Task Title')).toBeVisible({ timeout: 10_000 })
})

test('Category options equal the closed set defined in CONTEXT.md', async ({ page }) => {
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  // All 6 category buttons sit inside the div that follows the "Category" label
  const categorySection = page.locator('label', { hasText: 'Category' }).locator('..')
  const categoryButtons = categorySection.locator('button')

  await expect(categoryButtons).toHaveCount(6)

  const labels = await categoryButtons.allTextContents()
  const normalized = labels.map(t => t.trim()).sort()

  expect(normalized).toEqual(['Fitness', 'Grocery', 'Health', 'Nutrition', 'Personal', 'Work'])
})
