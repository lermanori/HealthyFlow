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

async function setOnDeviceOnboardingStatus(
  page: import('@playwright/test').Page,
  onboardingStatus: 'active' | 'completed',
) {
  await page.goto('/app')
  await page.evaluate(async (status) => {
    const { settingsService } = await import('/src/services/api.ts')
    await settingsService.updateSettings({ onboardingStatus: status })
  }, onboardingStatus)
  await page.reload()
}

test.beforeEach(async ({ request, page }) => {
  await resetSharedUser(request, 'active')
  await setOnDeviceOnboardingStatus(page, 'active')
})

test.afterEach(async ({ request }) => {
  await resetSharedUser(request, 'completed')
})

test('the banner opens day setup, and finishing it clears the banner', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Set up your day' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Set up my day', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/day-setup$/)
  await expect(page.getByRole('heading', { name: 'What should I call you?' })).toBeVisible()

  // Part one is four questions and ends at a real finish line.
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { name: /When does your day actually start/ })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { name: /How should HealthyFlow talk to you/ })).toBeVisible()

  await page.getByRole('button', { name: /That's enough/ }).click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: 'Set up your day' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Set up your day' })).toHaveCount(0)
})

test('"Later" defers day setup but leaves the door open', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Set up your day' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Later', exact: true }).click()

  // Deliberate: 'Later' records 'skipped', and the banner renders on anything
  // other than 'completed'. Choosing the app first must never close the door —
  // day setup stays one tap away until it is actually finished.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Set up your day' })).toBeVisible()
})
