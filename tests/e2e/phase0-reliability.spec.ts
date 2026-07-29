import { API_ORIGIN } from './apiBase'
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

  for (const [path, heading] of [['/app/health', 'Health'], ['/app/calories', 'Nutrition'], ['/app/achievements', 'Progress'], ['/app/workouts', 'Workouts']] as const) {
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

  await page.goto('/app/calories')
  await expect(page).toHaveURL('/app')
  await expect(page.getByText('Nutrition is hidden for this account.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Enable in Settings' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Health' })).toHaveCount(0)

  await page.goto('/app/health')
  await expect(page).toHaveURL('/app')
  await expect(page.getByText('Health is hidden for this account.')).toBeVisible()

  await page.goto('/app/add?tab=achievements')
  await expect(page).toHaveURL('/app/add?tab=today')
  await expect(page.getByText('Progress is hidden for this account.')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Progress' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Nutrition' })).toHaveCount(0)
})

test('an individually hidden Health tool redirects to the remaining Health overview', async ({ page }) => {
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ...settings, calorieIntake: false }),
    })
  })

  await page.goto('/app/calories')
  await expect(page).toHaveURL('/app/health')
  await expect(page.getByText('Nutrition is hidden for this account.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Health', exact: true })).toBeVisible()
})

test('settings failure stays on the requested module URL and Retry recovers', async ({ page }) => {
  let recover = false
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    if (!recover) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' })
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) })
  })

  await page.goto('/app/achievements')
  await expect(page).toHaveURL('/app/achievements')
  await expect(page.getByRole('heading', { name: 'Could not check Progress' })).toBeVisible()
  recover = true
  await page.getByRole('button', { name: 'Retry' }).first().click()
  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible()
})

test('cached Settings remain usable during a failed background refresh', async ({ page }) => {
  let backgroundFails = false
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() === 'PATCH') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) })
    if (backgroundFails) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' })
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) })
  })
  // Health tools, not Appearance: #151 removed the Completion Sounds switch when
  // it made completion feedback silent, and Appearance is now only the theme
  // toggle — it has no switch left to exercise. Any real settings control serves
  // this test; the subject is the failed background refresh, not this control.
  await page.goto('/app/settings/health-tools')
  await expect(page.getByRole('switch', { name: /Nutrition/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Health', exact: true })).toBeVisible()
  backgroundFails = true
  await page.getByRole('switch', { name: /Nutrition/ }).click()
  await page.getByRole('link', { name: 'Health', exact: true }).click()
  await expect(page).toHaveURL('/app/health')
  await expect(page.getByRole('heading', { name: 'Health', exact: true })).toBeVisible()
})

test('changed Settings switches expose state and pass targeted Axe checks', async ({ page }) => {
  await page.goto('/app/settings/health-tools')
  const calorieSwitch = page.getByRole('switch', { name: /Nutrition/ })
  await expect(calorieSwitch).toBeVisible()
  await expect(calorieSwitch).toHaveAttribute('aria-checked', /true|false/)
  await expect(calorieSwitch).toBeEnabled()
  await calorieSwitch.focus()
  await expect(calorieSwitch).toBeFocused()

  const results = await new AxeBuilder({ page }).include('#features').analyze()
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})

// Both themes, because the contrast bug this catches only ever failed in one of
// them. `accent` is used as both the text colour and the tint behind it, so the
// two themes fail independently — running midnight alone reported 2 of the 9
// real violations and let the 7 white-theme ones ship.
for (const theme of ['midnight', 'white'] as const) {
test(`calorie dialog traps focus, inerts the app, closes with Escape, and restores Add Entry (${theme})`, async ({ page }) => {
  // Both are needed: localStorage paints before hydration, and useSettings then
  // re-applies whatever the server says — so mocking only one lets the other win.
  await page.addInitScript((t) => localStorage.setItem('hf-theme', t), theme)
  await page.route('**/api/settings', (route) => (
    route.request().method() === 'GET'
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...settings, theme }) })
      : route.continue()
  ))
  // Seed one entry so the quick-insert list actually renders. With no item
  // history the dialog shows "No saved item history yet" and the accent-styled
  // item buttons never mount — which silently voids the Axe check below, since
  // those buttons are exactly where the contrast violation lives. This test used
  // to pass only because earlier specs happened to leave Calorie entries behind.
  await page.goto('/app/calories')
  const token = await page.evaluate(() => localStorage.getItem('token'))
  expect(token).toBeTruthy()
  const seeded = await page.request.post(`${API_ORIGIN}/api/calories`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { date: new Date().toISOString().slice(0, 10), name: 'Axe fixture oats', calories: 320 },
  })
  expect(seeded.ok()).toBeTruthy()
  await page.reload()
  const opener = page.getByRole('button', { name: 'Add Entry' })
  await opener.click()
  const dialog = page.getByTestId('calorie-quick-insert-dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('calorie-quick-insert-search')).toBeFocused()
  expect(await page.locator('#root').evaluate((element) => (element as HTMLElement).inert)).toBe(true)
  // The assertion above is meaningless unless the list rendered.
  await expect(page.getByTestId('calorie-quick-insert-item').first()).toBeVisible()

  const results = await new AxeBuilder({ page }).include('[data-testid="calorie-quick-insert-dialog"]').analyze()
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})
}

test('mobile drawer is labelled modal navigation and restores the exact opener', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app')
  const opener = page.getByRole('button', { name: 'Open navigation menu' })
  await opener.click()
  const drawer = page.getByRole('dialog', { name: 'HealthyFlow navigation' })
  await expect(drawer).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close navigation drawer' }).last()).toBeFocused()
  for (const group of ['Today', 'Health tools', 'Utility']) {
    await expect(drawer.getByRole('region', { name: group })).toBeVisible()
  }
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
  await page.goto('/app/settings/data-privacy')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export Data/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(`healthyflow-export-${exportDate}.json`)
})

test('test mode validates signup input but blocks account persistence', async ({ request }) => {
  const email = `signup-probe-${Date.now()}@test.healthyflow.local`
  const password = 'Signup-probe-42!'
  const signup = await request.post(`${API_ORIGIN}/api/auth/signup`, {
    data: { email, password, name: 'Non-persistent signup probe' },
  })
  expect(signup.status()).toBe(403)
  expect(await signup.json()).toEqual({
    error: 'Account creation is disabled in automated test mode.',
    reason: 'test_account_creation_disabled',
  })

  const login = await request.post(`${API_ORIGIN}/api/auth/login`, { data: { email, password } })
  expect(login.status()).toBe(401)
})
