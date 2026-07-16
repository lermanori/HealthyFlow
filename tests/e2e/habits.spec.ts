import { test, expect } from './fixtures/ai-stubs'

test('Habit golden path: completing today does NOT bleed into tomorrow', async ({ page }) => {
  // Reset test user state via backend (React Router catch-all blocks GET /test/reset)
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  // Add a daily habit via the UI
  await page.goto('/add')
  await expect(page.getByRole('heading', { name: 'Add Item', exact: true })).toBeVisible()

  // Select type = Habit (repeat is hardcoded to daily when type=habit)
  await page.getByRole('button', { name: 'Habit', exact: true }).click()

  const habitTitle = 'E2E Daily Habit Golden Path'
  // Placeholder becomes "Enter habit name..." when type=habit
  await page.locator('input[placeholder*="Enter"]').first().fill(habitTitle)

  // Pick a category
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()

  await page.locator('button[type="submit"]').click()

  // Redirected to Today — habit appears as exactly one row today
  await expect(page).toHaveURL('/', { timeout: 10_000 })
  const habitHeadings = page.locator('h3', { hasText: habitTitle })
  await expect(habitHeadings).toHaveCount(1, { timeout: 10_000 })

  // Habit cards open the focused check-in sheet; binary Habits complete there.
  const titleHeading = habitHeadings.first()
  await titleHeading.click()
  const sheet = page.getByRole('dialog', { name: habitTitle })
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Clear outcome' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()

  // Assert completed (line-through on title)
  await expect(titleHeading).toHaveClass(/line-through/, { timeout: 10_000 })

  // Navigate to tomorrow via the "Next day" arrow — real UI control
  await page.getByRole('button', { name: 'Next day' }).first().click()

  // Wait for the Today to load tomorrow's data
  await expect(page.locator('h3', { hasText: habitTitle })).toBeVisible({ timeout: 10_000 })

  // Tomorrow: habit appears as exactly one row
  const tomorrowHeadings = page.locator('h3', { hasText: habitTitle })
  await expect(tomorrowHeadings).toHaveCount(1, { timeout: 10_000 })

  // Tomorrow's instance must NOT be completed (no line-through)
  await expect(tomorrowHeadings.first()).not.toHaveClass(/line-through/, { timeout: 10_000 })
})
