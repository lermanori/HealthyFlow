import { test, expect } from '@playwright/test'

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
  await page.route('**/api/calendar/google/events?*', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.route('**/api/tasks?*', async (route) => {
    if (mode === 'loading') return new Promise(() => undefined)
    if (mode === 'empty') return route.fulfill({ contentType: 'application/json', body: '[]' })
    const date = new URL(route.request().url()).searchParams.get('date')
    const rows = date === '2026-07-13'
      ? [{ id: 'done-task', title: 'Plan the week', type: 'task', category: 'work', completed: true, startTime: '09:00', scheduledDate: date }]
      : date === '2026-07-15'
        ? [{ id: 'habit-wed', originalHabitId: 'habit-parent', title: 'Walk outside', type: 'habit', category: 'health', completed: false, scheduledDate: date }]
        : date === '2026-07-16'
          ? [{ id: 'workout-thu', title: 'Strength session', type: 'workout', category: 'fitness', completed: false, startTime: '18:00', scheduledDate: date }]
          : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) })
  })
}

for (const theme of ['midnight', 'white'] as const) {
  for (const viewport of viewports) {
    test(`Week ${theme} ${viewport.name} visual states`, async ({ page }) => {
      await freezeDate(page)
      await page.setViewportSize(viewport)
      await mockWeek(page, theme)
      await page.goto('/week')
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
  await page.goto('/week')
  await expect(page.getByText('Nothing planned this week')).toBeVisible()
  await expect(page.locator('#loading-screen')).toBeHidden()
  await expect(page).toHaveScreenshot('week-white-desktop-empty.png', { animations: 'disabled', fullPage: true })
})

test('Week loading state visual', async ({ page }) => {
  await freezeDate(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await mockWeek(page, 'midnight', 'loading')
  await page.goto('/week', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible()
  await expect(page.locator('#loading-screen')).toBeHidden()
  await expect(page).toHaveScreenshot('week-midnight-mobile-loading.png', { animations: 'disabled', fullPage: true })
})
