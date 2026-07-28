import { expect, test, type Page } from '@playwright/test'

const fixedNow = new Date('2026-07-15T10:00:00.000Z')

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'compact', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
] as const

const surfaces = [
  { name: 'talk', path: '/app/talk', heading: 'Talk to your day' },
  { name: 'add', path: '/app/add', heading: 'Add Item' },
  { name: 'health', path: '/app/health?date=2026-07-15', heading: 'Health' },
  { name: 'nutrition', path: '/app/calories?date=2026-07-15', heading: 'Nutrition' },
  { name: 'workouts', path: '/app/workouts?date=2026-07-15&mode=session', heading: 'Workouts' },
  { name: 'progress', path: '/app/achievements', heading: 'Progress' },
  { name: 'settings', path: '/app/settings', heading: 'Settings' },
] as const

const baseSettings = {
  notifications: false,
  dailyReminders: false,
  weeklyReports: true,
  aiSuggestions: true,
  smartReminders: false,
  completionSounds: false,
  calorieIntake: true,
  achievementTracker: true,
  workoutTracker: true,
  weekStartsOn: 1,
  planningWindow: {
    startTime: '08:00',
    endTime: '20:00',
    transitionBufferMinutes: 10,
  },
  onboardingStatus: 'completed',
}

async function mockStableSurfaceData(page: Page, theme: 'midnight' | 'white') {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem('token', 'responsive-visual-token')
    localStorage.setItem('hf-theme', selectedTheme)
    localStorage.removeItem('healthyflow-assistant-conversations-v1')
    localStorage.removeItem('healthyflow-assistant-conversations-v1-migrated')
  }, theme)
  await page.clock.setFixedTime(fixedNow)
  await page.route('**/api/auth/verify', (route) => route.fulfill({
    json: {
      id: 'responsive-visual-user',
      email: 'visual@healthyflow.local',
      name: 'Visual Review',
      role: 'user',
    },
  }))
  await page.route('**/api/settings', (route) => route.fulfill({
    json: { ...baseSettings, theme },
  }))
  await page.route('**/api/projects', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/ai/conversations', (route) => route.fulfill({ json: [] }))
  await page.route(/\/api\/calories\?.*/, (route) => route.fulfill({ json: [] }))
  await page.route(/\/api\/calories\/items\?.*/, (route) => route.fulfill({ json: [] }))
  await page.route(/\/api\/weight\?date=.*/, (route) => route.fulfill({ json: null }))
  await page.route(/\/api\/weight\/recent\?.*/, (route) => route.fulfill({
    json: {
      entries: [],
      latest: null,
      previous: null,
      deltaKg: null,
    },
  }))
  await page.route(/\/api\/workouts\?date=.*/, (route) => route.fulfill({ json: [] }))
  await page.route('**/api/workouts/plans', (route) => route.fulfill({ json: [] }))
  await page.route(/\/api\/workouts\/exercises\?.*/, (route) => route.fulfill({ json: [] }))
  await page.route(/\/api\/achievements(?:\?.*)?$/, (route) => route.fulfill({ json: [] }))
  await page.route('**/api/credits/summary', (route) => route.fulfill({
    json: {
      balance: 120,
      subscriptionBalance: 100,
      topupBalance: 20,
      usedThisMonth: 30,
      monthlyGrantUsed: 30,
      pricing: {
        promoActive: false,
        phase: 'regular',
        priceUsd: 19,
        monthlyCredits: 500,
        sellCreditsPerUsd: 50,
        topUpPriceUsd: 5,
        topUpCredits: 250,
        foundingMemberLimit: 100,
      },
      subscription: {
        active: true,
        pricePhase: 'regular',
        monthlyCredits: 500,
        renewalDate: '2026-08-01',
        lastMonthlyGrantAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    },
  }))
  await page.route('**/api/calendar/google/status', (route) => route.fulfill({
    json: {
      provider: 'google',
      connected: false,
      accountEmail: null,
      connectedAt: null,
      scopes: [],
    },
  }))
  await page.route('**/api/settings/connections/tokens', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/proactivity/rhythm', (route) => route.fulfill({
    json: {
      timezone: 'UTC',
      morning: { enabled: true, time: '08:00', days: [1, 2, 3, 4, 5], lastSent: null },
      midday: { enabled: true, time: '13:00', days: [1, 2, 3, 4, 5], lastSent: null },
      weekly: { enabled: false, time: '17:00', day: 0, lastSent: null },
    },
  }))
}

for (const theme of ['midnight', 'white'] as const) {
  for (const viewport of viewports) {
    test(`${theme} primary surfaces at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await mockStableSurfaceData(page, theme)

      for (const surface of surfaces) {
        await page.goto(surface.path)
        await expect(page.locator('#loading-screen')).toBeHidden()
        await expect(page.getByRole('heading', { name: surface.heading, exact: true })).toBeVisible()
        await expect.poll(() => page.evaluate(() => (
          document.documentElement.scrollWidth <= document.documentElement.clientWidth
        ))).toBe(true)
        await expect(page).toHaveScreenshot(
          `surface-${theme}-${viewport.name}-${surface.name}.png`,
          { animations: 'disabled', fullPage: true },
        )
      }
    })
  }
}

for (const theme of ['midnight', 'white'] as const) {
  for (const viewport of viewports) {
    test(`${theme} login at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.addInitScript((selectedTheme) => {
        localStorage.removeItem('token')
        localStorage.setItem('hf-theme', selectedTheme)
      }, theme)
      await page.route('**/api/auth/signup-status', (route) => route.fulfill({
        json: {
          mode: 'waitlist',
          remaining: 0,
          offer: {
            foundingMemberLimit: 100,
            foundingMembersRemaining: 100,
            onboardingCredits: 250,
            foundingOnboardingCredits: 250,
            standardOnboardingCredits: 50,
            foundingPriceUsd: 9,
            regularPriceUsd: 19,
            monthlyCredits: 500,
            topUpPriceUsd: 5,
            topUpCredits: 250,
          },
        },
      }))
      await page.goto('/app')

      await expect(page.locator('#loading-screen')).toBeHidden()
      await expect(page.getByRole('heading', { name: 'Welcome to HealthyFlow' })).toBeVisible()
      await expect(page).toHaveScreenshot(
        `surface-${theme}-${viewport.name}-login.png`,
        { animations: 'disabled', fullPage: true },
      )
    })
  }
}
