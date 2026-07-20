import fs from 'fs'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/ai-stubs'

function getAuthTokenFromStorageState() {
  const storageState = JSON.parse(fs.readFileSync('tests/e2e/.auth/user.json', 'utf8'))
  for (const origin of storageState.origins ?? []) {
    const token = origin.localStorage?.find(
      (entry: { name: string; value: string }) => entry.name === 'token'
    )?.value
    if (token) return token
  }
  throw new Error('Missing auth token in Playwright storage state')
}

async function setWeekStartsOn(page: Page, weekStartsOn: 0 | 1) {
  const response = await page.request.patch('http://localhost:3001/api/settings', {
    headers: { Authorization: `Bearer ${getAuthTokenFromStorageState()}` },
    data: { weekStartsOn },
  })
  expect(response.ok()).toBeTruthy()
}

async function stubOptionalTodaySources(page: Page) {
  await page.route('**/api/calendar/google/events**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/ai/daily-context**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ signals: [] }) })
  )
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-24T12:00:00'))
  await setWeekStartsOn(page, 1)
  await stubOptionalTodaySources(page)
})

test('Today and Week share Monday and Sunday week boundaries', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-week-date="2026-06-22"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-week-date="2026-06-28"]')).toBeVisible()
  await expect(page.locator('[data-week-date="2026-06-21"]')).toHaveCount(0)

  await page.goto('/week')
  await expect(page.locator('[data-rail-date="2026-06-22"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-rail-date="2026-06-28"]')).toBeVisible()
  await expect(page.getByText('Jun 22 – 28, 2026')).toBeVisible()

  await setWeekStartsOn(page, 0)
  await page.goto('/')
  await expect(page.locator('[data-week-date="2026-06-21"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-week-date="2026-06-27"]')).toBeVisible()
  await expect(page.locator('[data-week-date="2026-06-28"]')).toHaveCount(0)

  await page.goto('/week')
  await expect(page.locator('[data-rail-date="2026-06-21"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-rail-date="2026-06-27"]')).toBeVisible()
  await expect(page.getByText('Jun 21 – 27, 2026')).toBeVisible()
})

test('Today uses accurate selected-date language and keeps day-navigation focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: "Today's Schedule" })).toBeVisible()

  const nextDay = page.getByRole('button', { name: 'Next day' })
  await nextDay.focus()
  await nextDay.click()
  await expect(nextDay).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Tomorrow', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: "Tomorrow's Schedule" })).toBeVisible()
  await expect(page.locator('[aria-live="polite"]')).toHaveText('Tomorrow. Thursday, June 25, 2026.')

  await nextDay.click()
  await expect(page.getByRole('heading', { name: 'Jun 26', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Schedule for June 26' })).toBeVisible()

  await page.getByRole('button', { name: 'Today', exact: true }).click()
  const previousDay = page.getByRole('button', { name: 'Previous day' })
  await previousDay.click()
  await expect(previousDay).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Yesterday', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: "Yesterday's Schedule" })).toBeVisible()
})

test('Today and Week provide roving keyboard navigation for their seven-day selectors', async ({ page }) => {
  await page.goto('/')
  const todayButton = page.locator('[data-week-date="2026-06-24"]')
  await expect(todayButton).toHaveAttribute('aria-current', 'date')
  await todayButton.focus()
  await todayButton.press('ArrowRight')

  const thursday = page.locator('[data-week-date="2026-06-25"]')
  await expect(thursday).toBeFocused()
  await expect(thursday).toHaveAttribute('aria-current', 'date')
  await thursday.press('End')
  await expect(page.locator('[data-week-date="2026-06-28"]')).toBeFocused()
  await page.locator('[data-week-date="2026-06-28"]').press('Home')
  await expect(page.locator('[data-week-date="2026-06-22"]')).toBeFocused()

  await page.goto('/week')
  const weekToday = page.locator('[data-rail-date="2026-06-24"]')
  await expect(weekToday).toHaveAttribute('aria-current', 'date')
  await weekToday.focus()
  await weekToday.press('ArrowLeft')
  await expect(page.locator('[data-rail-date="2026-06-23"]')).toBeFocused()
  await page.locator('[data-rail-date="2026-06-23"]').press('End')
  await expect(page.locator('[data-rail-date="2026-06-28"]')).toBeFocused()
})

test('visible previous and next date controls remain at least 44 by 44 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  for (const name of ['Previous day', 'Next day']) {
    const control = page.getByRole('button', { name })
    const box = await control.boundingBox()
    expect(box, `${name} should have a visible bounding box`).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
})
