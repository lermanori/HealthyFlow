import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures/ai-stubs'

const settings = {
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
  onboardingStatus: 'completed',
  theme: 'midnight',
}

test('module routes wait for Settings and render every enabled destination', async ({ page }) => {
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await new Promise((resolve) => setTimeout(resolve, 350))
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) })
  })

  for (const [path, heading] of [['/calories', 'Calorie Log'], ['/achievements', 'Achievements'], ['/workouts', 'Workout Tracker']] as const) {
    const navigation = page.goto(path)
    await expect(page).toHaveURL(path)
    await navigation
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
})

test('confirmed-disabled routes and Add tabs use one persistent notice', async ({ page }) => {
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...settings, calorieIntake: false, achievementTracker: false, workoutTracker: false }) })
  })

  await page.goto('/calories')
  await expect(page).toHaveURL('/')
  await expect(page.getByText('Calories is disabled for this account.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Enable in Settings' })).toBeVisible()

  await page.goto('/add?tab=achievements')
  await expect(page).toHaveURL('/add?tab=today')
  await expect(page.getByText('Achievements is disabled for this account.')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Achievements' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Calories' })).toHaveCount(0)
})

test('settings failure stays on the requested module URL and Retry recovers', async ({ page }) => {
  let recover = false
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    if (!recover) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' })
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) })
  })

  await page.goto('/achievements')
  await expect(page).toHaveURL('/achievements')
  await expect(page.getByRole('heading', { name: 'Could not check Achievements' })).toBeVisible()
  recover = true
  await page.getByRole('button', { name: 'Retry' }).first().click()
  await expect(page.getByRole('heading', { name: 'Achievements', exact: true })).toBeVisible()
})

test('cached Settings remain usable during a failed background refresh', async ({ page }) => {
  let backgroundFails = false
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() === 'PATCH') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) })
    if (backgroundFails) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' })
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) })
  })
  await page.goto('/settings#features')
  await expect(page.getByRole('switch', { name: /Completion Sounds/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Achievements' })).toBeVisible()
  backgroundFails = true
  await page.getByRole('switch', { name: /Completion Sounds/ }).click()
  await page.getByRole('link', { name: 'Achievements' }).click()
  await expect(page).toHaveURL('/achievements')
  await expect(page.getByRole('heading', { name: 'Achievements', exact: true })).toBeVisible()
})

test('changed Settings switches expose state and pass targeted Axe checks', async ({ page }) => {
  await page.goto('/settings#features')
  const calorieSwitch = page.getByRole('switch', { name: /Calorie Intake/ })
  await expect(calorieSwitch).toBeVisible()
  await expect(calorieSwitch).toHaveAttribute('aria-checked', /true|false/)
  await calorieSwitch.focus()
  await expect(calorieSwitch).toBeFocused()

  const results = await new AxeBuilder({ page }).include('#features').analyze()
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})

test('calorie dialog traps focus, inerts the app, closes with Escape, and restores Add Entry', async ({ page }) => {
  await page.goto('/calories')
  const opener = page.getByRole('button', { name: 'Add Entry' })
  await opener.click()
  const dialog = page.getByTestId('calorie-quick-insert-dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('calorie-quick-insert-search')).toBeFocused()
  expect(await page.locator('#root').evaluate((element) => (element as HTMLElement).inert)).toBe(true)

  const results = await new AxeBuilder({ page }).include('[data-testid="calorie-quick-insert-dialog"]').analyze()
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

test('mobile drawer is labelled modal navigation and restores the exact opener', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const opener = page.getByRole('button', { name: 'Open navigation menu' })
  await opener.click()
  const drawer = page.getByRole('dialog', { name: 'HealthyFlow navigation' })
  await expect(drawer).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close navigation drawer' }).last()).toBeFocused()
  expect(await page.locator('#root').evaluate((element) => (element as HTMLElement).inert)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(opener).toBeFocused()
})

test('export downloads the authenticated portable JSON filename and content', async ({ page }) => {
  const exportDate = new Date().toISOString().slice(0, 10)
  await page.route('**/api/account/export', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="healthyflow-export-${exportDate}.json"`,
    },
    body: JSON.stringify({ version: 1, exportedAt: `${exportDate}T12:00:00.000Z`, account: { id: 'user-1' } }),
  }))
  await page.goto('/settings')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export Data/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(`healthyflow-export-${exportDate}.json`)
})

test('deletes only a disposable account in destructive E2E mode', async ({ request }) => {
  test.skip(process.env.HF_RUN_DESTRUCTIVE_ACCOUNT_E2E !== '1', 'Opt-in destructive coverage uses a newly created disposable account only')
  const email = `phase0-disposable-${Date.now()}@test.healthyflow.local`
  const password = `Disposable-${Date.now()}!`
  const signup = await request.post('http://localhost:3001/api/auth/signup', { data: { email, password, name: 'Disposable Phase 0' } })
  expect(signup.ok()).toBeTruthy()
  const { token } = await signup.json()
  const deletion = await request.delete('http://localhost:3001/api/account', {
    headers: { Authorization: `Bearer ${token}` },
    data: { password, confirmation: 'DELETE' },
  })
  expect(deletion.ok()).toBeTruthy()
  expect(await deletion.json()).toEqual({ deleted: true, warnings: [] })
  const verify = await request.get('http://localhost:3001/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } })
  expect(verify.status()).toBe(401)
})
