import { test, expect } from './fixtures/ai-stubs'
import type { Page } from '@playwright/test'
import fs from 'fs'

// storageState is injected from playwright.config.ts (setup project)

function getAuthTokenFromStorageState() {
  const storageState = JSON.parse(fs.readFileSync('tests/e2e/.auth/user.json', 'utf8'))
  for (const origin of storageState.origins ?? []) {
    const token = origin.localStorage?.find((entry: { name: string; value: string }) => entry.name === 'token')?.value
    if (token) return token
  }
  throw new Error('Missing auth token in Playwright storage state')
}

async function enableDomainPages(page: Page) {
  const response = await page.request.patch('http://localhost:3001/api/settings', {
    headers: { Authorization: `Bearer ${getAuthTokenFromStorageState()}` },
    data: { calorieIntake: true, achievementTracker: true },
  })
  expect(response.ok()).toBeTruthy()
}

test('Adding a Task via the UI makes it appear on today\'s Today', async ({ page }) => {
  await page.goto('/add')
  // Wait for form to be ready
  await expect(page.locator('h1', { hasText: 'Add Item' })).toBeVisible()

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
  await expect(page.locator('h1', { hasText: 'Add Item' })).toBeVisible()

  // All 6 category buttons sit inside the div that follows the "Category" label
  const categorySection = page.locator('label', { hasText: 'Category' }).locator('..')
  const categoryButtons = categorySection.locator('button')

  await expect(categoryButtons).toHaveCount(6)

  const labels = await categoryButtons.allTextContents()
  const normalized = labels.map(t => t.trim()).sort()

  expect(normalized).toEqual(['Fitness', 'Grocery', 'Health', 'Nutrition', 'Personal', 'Work'])
})

test('Add Item domain tabs create calorie and achievement entries through existing surfaces', async ({ page }) => {
  await enableDomainPages(page)
  const token = getAuthTokenFromStorageState()
  const unique = Date.now()
  const achievementName = `Add Item PR ${unique}`

  const achievement = await page.request.post('http://localhost:3001/api/achievements', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: achievementName,
      category: 'fitness',
      metricType: 'reps',
      unit: 'reps',
      betterDirection: 'higher',
      targetValue: 20,
    },
  })
  expect(achievement.ok()).toBeTruthy()

  await page.goto('/add')
  await expect(page.getByRole('tab', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Calories' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Achievements' })).toBeVisible()

  const foodName = `Tab Yogurt ${unique}`
  await page.getByRole('tab', { name: 'Calories' }).click()
  await page.getByLabel('Name').fill(foodName)
  await page.getByLabel('Calories').fill('180')
  await page.getByLabel('Protein').fill('20')
  await page.getByRole('button', { name: 'Add Entry' }).click()
  await expect(page).toHaveURL('/calories', { timeout: 10_000 })
  await expect(page.getByText(foodName)).toBeVisible()

  await page.goto('/add')
  await page.getByRole('tab', { name: 'Achievements' }).click()
  await page.getByLabel('Achievement').selectOption({ label: achievementName })
  await page.getByRole('spinbutton', { name: 'Value (reps)' }).fill('12')
  await page.getByRole('button', { name: 'Add Achievement Entry' }).click()
  await expect(page).toHaveURL('/achievements', { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: achievementName })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`${achievementName} 12`) })).toBeVisible()
})
