import { test, expect } from './fixtures/ai-stubs'
import { API_ORIGIN } from './apiBase'

async function resetSharedUser(
  request: import('@playwright/test').APIRequestContext,
  onboardingStatus: 'active' | 'completed'
) {
  const response = await request.post(`${API_ORIGIN}/test/reset`, {
    data: { onboardingStatus },
  })
  expect(response.ok()).toBeTruthy()
}

test.beforeEach(async ({ request }) => {
  await resetSharedUser(request, 'active')
})

test.afterEach(async ({ request }) => {
  await resetSharedUser(request, 'completed')
})

test('shared test user sees brain-dump onboarding, parses a day, and completion stays dismissed', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Turn notes into Items' })).toBeVisible()

  await page.getByPlaceholder(/Describe what you want to accomplish/).fill(
    'Gym at 7am, finish the quarterly report, and grab groceries after work.'
  )
  await page.getByRole('button', { name: 'Analyze and generate tasks' }).click()
  await expect(page.getByText(/of \d+ selected/)).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: /Add Selected Tasks/ }).click()

  // Confirming the parse completes onboarding automatically.
  await expect(page.getByText('Onboarding complete. Achievement unlocked!')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toHaveCount(0)
})

test('skip link completes onboarding without parsing', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await expect(page.getByText('Onboarding skipped')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toHaveCount(0)
})
