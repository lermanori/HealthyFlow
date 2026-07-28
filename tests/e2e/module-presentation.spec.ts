import { test, expect } from './fixtures/ai-stubs'

const baseSettings = {
  notifications: true,
  dailyReminders: true,
  weeklyReports: true,
  aiSuggestions: true,
  smartReminders: true,
  completionSounds: true,
  calorieIntake: true,
  achievementTracker: true,
  workoutTracker: true,
  weekStartsOn: 1,
  planningWindow: null,
  onboardingStatus: 'completed',
  theme: 'midnight',
}

test('all Health availability combinations share navigation and local-tab visibility', async ({ page }) => {
  let currentSettings = baseSettings
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({ json: currentSettings })
  })

  const combinations = Array.from({ length: 8 }, (_, mask) => ({
    calorieIntake: Boolean(mask & 1),
    workoutTracker: Boolean(mask & 2),
    achievementTracker: Boolean(mask & 4),
  }))

  for (const combination of combinations) {
    currentSettings = { ...baseSettings, ...combination }
    await page.goto('/app')
    const anyEnabled = Object.values(combination).some(Boolean)
    const globalNavigation = page.getByRole('navigation', { name: 'Application' })
    await expect(globalNavigation.getByRole('link', { name: 'Health', exact: true })).toHaveCount(anyEnabled ? 1 : 0)
    await expect(globalNavigation.getByRole('region', { name: 'Today' })).toBeVisible()
    await expect(globalNavigation.getByRole('region', { name: 'Utility' })).toBeVisible()
    await expect(globalNavigation.getByRole('region', { name: 'Health tools' })).toHaveCount(anyEnabled ? 1 : 0)

    if (!anyEnabled) continue
    await page.goto('/app/health')
    const healthNavigation = page.getByRole('navigation', { name: 'Health' })
    await expect(healthNavigation.getByRole('link', { name: 'Overview' })).toBeVisible()
    await expect(healthNavigation.getByRole('link', { name: 'Nutrition' })).toHaveCount(combination.calorieIntake ? 1 : 0)
    await expect(healthNavigation.getByRole('link', { name: 'Workouts' })).toHaveCount(combination.workoutTracker ? 1 : 0)
    await expect(healthNavigation.getByRole('link', { name: 'Progress' })).toHaveCount(combination.achievementTracker ? 1 : 0)
  }
})

test('Settings categories are addressable and preserve a draft through mobile drill-down', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/app/settings/health-tools')
  await expect(page.getByRole('link', { name: /Health tools/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Health tools', exact: true })).toBeVisible()
  await expect(page.getByRole('switch', { name: /Nutrition/ })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app/settings')
  await expect(page.getByRole('navigation', { name: 'Settings categories' })).toBeVisible()
  await page.getByRole('link', { name: /Connections & Advanced/ }).click()
  await expect(page).toHaveURL('/app/settings/connections-advanced')

  await expect(page.getByRole('heading', { name: 'Developer API tokens' })).toBeVisible()
  const tokenInput = page.locator('input.input-field').first()
  await tokenInput.fill('Preserved mobile draft')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page).toHaveURL('/app/settings')
  await page.getByRole('link', { name: /Connections & Advanced/ }).click()
  await expect(tokenInput).toHaveValue('Preserved mobile draft')
  expect(await page.locator('[data-demo-id="main-content"]').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
})
