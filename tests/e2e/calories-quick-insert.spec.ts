import { test, expect } from './fixtures/ai-stubs'
import type { Page } from '@playwright/test'
import fs from 'fs'

function getAuthTokenFromStorageState() {
  const storageState = JSON.parse(fs.readFileSync('tests/e2e/.auth/user.json', 'utf8'))
  for (const origin of storageState.origins ?? []) {
    const token = origin.localStorage?.find((entry: { name: string; value: string }) => entry.name === 'token')?.value
    if (token) return token
  }
  throw new Error('Missing auth token in Playwright storage state')
}

async function enableCalorieIntake(page: Page) {
  const response = await page.request.patch('http://localhost:3001/api/settings', {
    headers: { Authorization: `Bearer ${getAuthTokenFromStorageState()}` },
    data: { calorieIntake: true },
  })
  expect(response.ok()).toBeTruthy()
}

test('Calories quick insert supports tab sorting, filtering, and keyboard selection', async ({ page }) => {
  await enableCalorieIntake(page)

  await page.route('**/api/calories?date=*', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' })
  })
  await page.route('**/api/weight?date=*', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: 'null' })
  })
  await page.route('**/api/weight/recent?limit=*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ entries: [], latest: null, previous: null, deltaKg: null }),
    })
  })
  await page.route('**/api/calories/items?*', async (route) => {
    const sort = new URL(route.request().url()).searchParams.get('sort')
    const items = sort === 'most-used'
      ? [
          {
            id: 'most-1',
            userId: 'user-1',
            name: 'Eggs',
            normalizedName: 'eggs',
            calories: 140,
            protein: 12,
            carbs: 1,
            fat: 10,
            usageCount: 14,
            lastUsedAt: '2026-06-28T09:00:00.000Z',
            createdAt: '2026-06-01T09:00:00.000Z',
            updatedAt: '2026-06-28T09:00:00.000Z',
          },
          {
            id: 'most-2',
            userId: 'user-1',
            name: 'Chicken Salad',
            normalizedName: 'chicken salad',
            calories: 320,
            protein: 35,
            carbs: 8,
            fat: 15,
            usageCount: 9,
            lastUsedAt: '2026-06-29T10:30:00.000Z',
            createdAt: '2026-06-01T09:00:00.000Z',
            updatedAt: '2026-06-29T10:30:00.000Z',
          },
        ]
      : [
          {
            id: 'recent-1',
            userId: 'user-1',
            name: 'Greek Yogurt',
            normalizedName: 'greek yogurt',
            calories: 120,
            protein: 15,
            carbs: 7,
            fat: 2,
            usageCount: 4,
            lastUsedAt: '2026-06-30T07:30:00.000Z',
            createdAt: '2026-06-01T09:00:00.000Z',
            updatedAt: '2026-06-30T07:30:00.000Z',
          },
          {
            id: 'recent-2',
            userId: 'user-1',
            name: 'Chicken Salad',
            normalizedName: 'chicken salad',
            calories: 320,
            protein: 35,
            carbs: 8,
            fat: 15,
            usageCount: 9,
            lastUsedAt: '2026-06-29T10:30:00.000Z',
            createdAt: '2026-06-01T09:00:00.000Z',
            updatedAt: '2026-06-29T10:30:00.000Z',
          },
        ]

    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(items) })
  })

  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Calories' })).toBeVisible()
  await page.getByRole('link', { name: 'Calories' }).click()
  await expect(page.getByRole('heading', { name: 'Calorie Log' })).toBeVisible()

  await page.getByRole('button', { name: /Add Entry/i }).click()
  await expect(page.getByTestId('calorie-quick-insert-dialog')).toBeVisible()

  const quickInsertItems = page.getByTestId('calorie-quick-insert-item')
  await expect(quickInsertItems).toHaveCount(2)
  await expect(quickInsertItems.nth(0)).toContainText('Greek Yogurt')
  await expect(quickInsertItems.nth(1)).toContainText('Chicken Salad')

  await page.getByRole('button', { name: 'Most Used' }).click()
  await expect(quickInsertItems.nth(0)).toContainText('Eggs')
  await expect(quickInsertItems.nth(1)).toContainText('Chicken Salad')

  const search = page.getByTestId('calorie-quick-insert-search')
  await search.fill('chick')
  await expect(quickInsertItems).toHaveCount(1)
  await expect(quickInsertItems.nth(0)).toContainText('Chicken Salad')

  await search.press('ArrowDown')
  await page.keyboard.press('Enter')

  await expect(page.locator('input[placeholder="Yogurt"]')).toHaveValue('Chicken Salad')
  await expect(page.locator('input[placeholder="Cal"]')).toHaveValue('320')
})
