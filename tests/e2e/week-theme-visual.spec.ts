import { test, expect } from '@playwright/test'
import { daySummaryItem } from './fixtures/day-summary'
import { weekSummaryFixture } from './fixtures/week-summary'

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
  onboardingStatus: 'completed',
}

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'compact', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
] as const

async function freezeDate(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const fixed = new Date('2026-07-15T10:00:00.000Z').valueOf()
    const NativeDate = Date
    class FixedDate extends NativeDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        super(args.length === 0 ? fixed : args[0])
      }
      static now() { return fixed }
    }
    window.Date = FixedDate as DateConstructor
  })
}

async function mockWeek(page: import('@playwright/test').Page, theme: 'midnight' | 'white', mode: 'content' | 'empty' | 'loading' = 'content') {
  await page.route('**/api/settings', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...baseSettings, theme }) }))
  await page.route('**/api/week-summary?*', async (route) => {
    if (mode === 'loading') return new Promise(() => undefined)
    const itemsByDate = mode === 'empty' ? {} : {
      '2026-07-13': [daySummaryItem({ id: 'done-task', title: 'Plan the week', completed: true, startTime: '09:00', scheduledDate: '2026-07-13' })],
      '2026-07-15': [daySummaryItem({
        id: 'habit-wed',
        originalHabitId: 'habit-parent',
        title: 'Walk outside',
        type: 'habit',
        repeat: 'daily',
        isHabitInstance: true,
        scheduledDate: '2026-07-15',
        habitInfo: { target: null, outcome: 'failed', progressTotal: 0 },
      })],
      '2026-07-16': [daySummaryItem({ id: 'workout-thu', title: 'Strength session', type: 'workout', startTime: '18:00', scheduledDate: '2026-07-16' })],
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(weekSummaryFixture({ startDate: '2026-07-13', itemsByDate })),
    })
  })
}

for (const theme of ['midnight', 'white'] as const) {
  for (const viewport of viewports) {
    test(`Week ${theme} ${viewport.name} visual states`, async ({ page }) => {
      await freezeDate(page)
      await page.setViewportSize(viewport)
      await mockWeek(page, theme)
      await page.goto('/app/week')
      await expect(page.getByRole('heading', { name: 'My Week' })).toBeVisible()
      await expect(page.locator('#loading-screen')).toBeHidden()
      await expect(page).toHaveScreenshot(`week-${theme}-${viewport.name}-selected-completed.png`, { animations: 'disabled', fullPage: true })
    })
  }
}

test('Week empty state visual', async ({ page }) => {
  await freezeDate(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockWeek(page, 'white', 'empty')
  await page.goto('/app/week')
  await expect(page.getByText('Nothing planned for this scope.')).toBeVisible()
  await expect(page.locator('#loading-screen')).toBeHidden()
  await expect(page).toHaveScreenshot('week-white-desktop-empty.png', { animations: 'disabled', fullPage: true })
})

test('Week loading state visual', async ({ page }) => {
  await freezeDate(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await mockWeek(page, 'midnight', 'loading')
  await page.goto('/app/week', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible()
  await expect(page.locator('#loading-screen')).toBeHidden()
  await expect(page).toHaveScreenshot('week-midnight-mobile-loading.png', { animations: 'disabled', fullPage: true })
})
