import { test, expect } from '@playwright/test'

test('Habit golden path: completing today does NOT bleed into tomorrow', async ({ page }) => {
  // Reset test user state via backend (React Router catch-all blocks GET /test/reset)
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  // Add a daily habit via the UI
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  // Select type = Habit (repeat is hardcoded to daily when type=habit)
  await page.locator('label', { hasText: 'Item Type' }).locator('..').locator('button', { hasText: 'Habit' }).click()

  const habitTitle = 'E2E Daily Habit Golden Path'
  // Placeholder becomes "Enter habit name..." when type=habit
  await page.locator('input[placeholder*="Enter"]').first().fill(habitTitle)

  // Pick a category
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()

  await page.locator('button[type="submit"]').click()

  // Redirected to Dashboard — habit appears as exactly one row today
  await expect(page).toHaveURL('/', { timeout: 10_000 })
  const habitHeadings = page.locator('h3', { hasText: habitTitle })
  await expect(habitHeadings).toHaveCount(1, { timeout: 10_000 })

  // Mark today's instance complete via the card toggle (first button in card outer)
  const titleHeading = habitHeadings.first()
  const cardOuter = titleHeading.locator('xpath=ancestor::div[contains(@class, "duration")]').first()
  await cardOuter.evaluate((el) => {
    const firstButton = el.querySelector('div > button')
    if (firstButton) (firstButton as HTMLElement).click()
  })

  // Assert completed (line-through on title)
  await expect(titleHeading).toHaveClass(/line-through/, { timeout: 10_000 })

  // Navigate to tomorrow via the "Next day" arrow — real UI control
  await page.locator('button[aria-label="Next day"]').click()

  // Wait for the dashboard to load tomorrow's data
  await expect(page.locator('h3', { hasText: habitTitle })).toBeVisible({ timeout: 10_000 })

  // Tomorrow: habit appears as exactly one row
  const tomorrowHeadings = page.locator('h3', { hasText: habitTitle })
  await expect(tomorrowHeadings).toHaveCount(1, { timeout: 10_000 })

  // Tomorrow's instance must NOT be completed (no line-through)
  await expect(tomorrowHeadings.first()).not.toHaveClass(/line-through/, { timeout: 10_000 })
})
