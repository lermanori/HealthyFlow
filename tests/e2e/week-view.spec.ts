import { test, expect } from './fixtures/ai-stubs'
import { format, addDays, startOfWeek } from 'date-fns'

test('Week view golden path: tasks appear under their correct day columns', async ({ page }) => {
  // Reset test user state via backend (React Router catch-all blocks GET /test/reset)
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')

  // Pick a different day: 2 days from today, but clamp to this week so it's visible
  // getWeekDates starts on Monday; pick a day that isn't today within the same week
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const candidateDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const otherDay = candidateDays.find((d) => format(d, 'yyyy-MM-dd') !== todayStr)!
  const otherDayStr = format(otherDay, 'yyyy-MM-dd')

  const todayTitle = `WeekE2E-Today-${Date.now()}`
  const otherTitle = `WeekE2E-Other-${Date.now()}`

  // --- Add task for TODAY ---
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()
  await page.locator('input[placeholder*="Enter"]').first().fill(todayTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="date"]').fill(todayStr)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  // --- Add task for OTHER day ---
  // Give it a start time: a TIMED task never rolls over (ADR-0002 carry-forward is
  // untimed-only), so it stays on its own day and won't leak into today's column even
  // when otherDay is in the past. Keeps this test correct on any weekday.
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()
  await page.locator('input[placeholder*="Enter"]').first().fill(otherTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="date"]').fill(otherDayStr)
  await page.locator('input[type="time"]').fill('10:00')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  // --- Navigate to Week View ---
  await page.goto('/week')
  // Wait for the week rail to render (redesign: 7 selectable day buttons)
  await expect(page.locator(`[data-rail-date="${todayStr}"]`)).toBeVisible({ timeout: 10_000 })

  // The redesign shows a single weekly agenda where each item row is tagged with
  // its scheduled date via data-date (instead of one column per day).
  // --- Assert today's task appears in a row dated today ---
  await expect(
    page.locator(`[data-date="${todayStr}"]`).filter({ hasText: todayTitle })
  ).toBeVisible({ timeout: 10_000 })

  // --- Assert other-day task appears in a row dated that day ---
  await expect(
    page.locator(`[data-date="${otherDayStr}"]`).filter({ hasText: otherTitle })
  ).toBeVisible({ timeout: 10_000 })

  // Negative: today's task must NOT appear under the other day's date
  await expect(
    page.locator(`[data-date="${otherDayStr}"]`).filter({ hasText: todayTitle })
  ).toHaveCount(0)
})
