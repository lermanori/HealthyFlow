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

test('shared test user enters Talk from onboarding and completion stays dismissed', async ({ page }) => {
  await page.route('**/api/ai/chat', (route) => route.fulfill({
    json: {
      message: 'I can help turn that into reviewable Items.',
      toolEvents: [],
      pendingActions: [],
    },
  }))
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Open Talk', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/talk$/)
  await expect(page.getByRole('heading', { name: 'Talk to your day' })).toBeVisible()

  const composer = page.getByPlaceholder(/Add anything/)
  await expect(composer).toBeFocused()
  await composer.fill(
    'Gym at 7am, finish the quarterly report, and grab groceries after work.'
  )
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('I can help turn that into reviewable Items.')).toBeVisible()

  // The first successful Talk turn completes onboarding; opening Talk alone does not.
  await expect(page.getByText('Onboarding complete.')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toHaveCount(0)

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
