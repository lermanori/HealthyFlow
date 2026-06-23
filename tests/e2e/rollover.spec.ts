import { test, expect } from './fixtures/ai-stubs'
import { format, subDays } from 'date-fns'

// ADR-0002 golden path: an incomplete untimed task dated yesterday must appear
// on today's Dashboard via the one-rule carry-forward (no new row, no synthetic id).
//
// Seam: AddItemPage has a <input type="date"> that defaults to today but is
// editable. We fill it with yesterday's date to create a real past-dated row,
// then navigate to today's Dashboard and assert it surfaces.

test('Rollover golden path: untimed task dated yesterday appears on today Dashboard', async ({ page }) => {
  // Reset test user state via the backend test endpoint (HF_TEST_MODE=1).
  // POST directly to the backend — the Vite proxy only covers /api.
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  const taskTitle = `Rollover E2E ${yesterday}`

  // --- Create an untimed task dated yesterday ---
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  await page.locator('input[placeholder*="Enter"]').first().fill(taskTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()

  // Set the date field to yesterday (leave Time blank → untimed task)
  await page.locator('input[type="date"]').fill(yesterday)

  // Ensure the Time field is empty (it should be, but clear it defensively)
  await page.locator('input[type="time"]').fill('')

  await page.locator('button[type="submit"]').click()

  // Redirected to Dashboard (today's view — the app always opens on today)
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  // ADR-0002 one rule: incomplete untimed task with scheduled_date < today
  // surfaces on today's Dashboard. Same real row, same id, title unchanged.
  await expect(page.locator('h3', { hasText: taskTitle })).toBeVisible({ timeout: 10_000 })

  // Optionally confirm it is NOT struck through (still incomplete)
  await expect(page.locator('h3', { hasText: taskTitle }).first()).not.toHaveClass(/line-through/)
})
