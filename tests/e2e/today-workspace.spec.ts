import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { DaySummary } from '../../backend/src/day-summary-schema'
import { daySummaryFixture } from './fixtures/day-summary'

const fixedNow = new Date('2026-07-15T10:00:00.000Z')
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'compact', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
] as const

const settings = {
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
  theme: 'midnight',
}

const signals = [
  {
    id: 'signal-habit',
    type: 'habit_risk',
    severity: 'medium',
    confidence: 'high',
    summary: 'Your afternoon walk is at risk after two missed days.',
    evidence: { habitId: 'habit-walk' },
    suggestedAction: {
      type: 'reschedule_item',
      label: 'Move the walk before the afternoon meeting',
      targetId: 'habit-walk',
    },
  },
  {
    id: 'signal-schedule',
    type: 'schedule_overload',
    severity: 'low',
    confidence: 'medium',
    summary: 'Two obligations overlap around 15:00.',
    evidence: { conflictIds: ['event-review', 'task-admin'] },
    suggestedAction: null,
  },
]

function denseDay(date: string): DaySummary {
  const summary = daySummaryFixture({
    date,
    items: [
      { id: 'habit-water', title: 'Drink water before coffee', type: 'habit', startTime: '07:30', duration: 10, scheduledDate: date, completed: true, habitInfo: { target: null, outcome: 'completed', progressTotal: 1 } },
      { id: 'task-focus', title: 'Finish the product brief', startTime: '09:30', duration: 60, scheduledDate: date },
      { id: 'task-client', title: 'Prepare client decisions', startTime: '10:45', duration: 30, scheduledDate: date },
      { id: 'task-admin', title: 'Review launch checklist', startTime: '15:00', duration: 45, scheduledDate: date },
      { id: 'workout-strength', title: 'Strength session', type: 'workout', startTime: '18:00', duration: 60, scheduledDate: date },
      { id: 'habit-walk', title: 'Walk outside', type: 'habit', position: 0, scheduledDate: date, habitInfo: { target: { value: 20, unit: 'minutes' }, outcome: 'pending', progressTotal: 0 } },
      { id: 'task-invoice', title: 'Send July invoice', position: 1, scheduledDate: date },
      { id: 'task-notes', title: 'Sort workshop notes', position: 2, scheduledDate: date },
      { id: 'task-book', title: 'Read design chapter', position: 3, scheduledDate: date },
    ],
    calendarEvents: [
      { id: 'event-lunch', title: 'Lunch with Maya', localStartTime: '12:15', localEndTime: '13:00', startAt: `${date}T12:15:00.000Z`, endAt: `${date}T13:00:00.000Z`, location: 'Market café' },
      { id: 'event-review', title: 'Launch review', localStartTime: '15:00', localEndTime: '15:45', startAt: `${date}T15:00:00.000Z`, endAt: `${date}T15:45:00.000Z` },
    ],
  })

  summary.attention = {
    focus: { state: 'selected', itemId: 'task-focus', reasonCode: 'active_timed_item' },
    nextPlannedItem: { id: 'task-client', title: 'Prepare client decisions', startTime: '10:45' },
    nextCalendarObligation: { id: 'event-lunch', title: 'Lunch with Maya', startTime: '12:15', endTime: '13:00' },
    nextObligation: {
      source: 'item',
      id: 'task-client',
      title: 'Prepare client decisions',
      startTime: '10:45',
      reasonCode: 'planned_item_precedes_calendar',
      conflictIds: [],
    },
  }
  summary.capacity = {
    status: 'complete',
    window: {
      startTime: '08:00',
      endTime: '20:00',
      transitionBufferMinutes: 10,
      totalMinutes: 720,
      consideredStartTime: '10:00',
      consideredEndTime: '20:00',
      consideredMinutes: 600,
      bufferPolicy: 'after_each_obligation',
    },
    basis: {
      scope: 'remaining',
      knownLoadMinutes: 330,
      timedItemCount: 4,
      calendarEventCount: 2,
      bufferedIntervalCount: 6,
    },
    availableMinutes: 270,
    reasonCodes: [],
  }
  summary.modules = { habits: 'enabled', nutrition: 'enabled', workouts: 'enabled' }
  summary.calorieEntries = [
    {
      id: 'meal-breakfast',
      date,
      time: '08:15',
      name: 'Yogurt and fruit',
      calories: 410,
      protein: 28,
      carbs: 45,
      fat: 12,
      quantity: '1 bowl',
      createdAt: null,
      updatedAt: null,
    },
  ]
  summary.supporting = {
    habits: { status: 'available', total: 2, pending: 1, partial: 0, completed: 1, failed: 0, targeted: 1 },
    nutrition: {
      status: 'available',
      entries: summary.calorieEntries,
      calories: { status: 'complete', value: 870 },
      protein: { status: 'complete', value: 66 },
      carbs: { status: 'complete', value: 91 },
      fat: { status: 'complete', value: 29 },
      weight: { status: 'not_recorded', entry: null },
    },
    workouts: {
      status: 'logged',
      sessions: [{
        id: 'session-strength',
        userId: 'test-user',
        date,
        title: 'Upper body',
        notes: null,
        exercises: [],
        createdAt: `${date}T07:00:00.000Z`,
        updatedAt: `${date}T07:00:00.000Z`,
      }],
    },
  }

  return summary
}

async function mockToday(page: Page, options?: {
  summary?: (date: string) => DaySummary
  signalError?: boolean
}) {
  await page.clock.setFixedTime(fixedNow)
  await page.route('**/api/settings', (route) => route.fulfill({ json: settings }))
  await page.route('**/api/proactivity/rhythm', (route) => route.fulfill({
    json: {
      timezone: 'UTC',
      morning: { enabled: true, time: '08:00', days: [1, 2, 3, 4, 5], lastSent: null },
      midday: { enabled: true, time: '13:00', days: [1, 2, 3, 4, 5], lastSent: null },
      weekly: { enabled: false, time: '17:00', day: 0, lastSent: null },
    },
  }))
  await page.route('**/api/day-summary?**', (route) => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? '2026-07-15'
    return route.fulfill({ json: (options?.summary ?? denseDay)(date) })
  })
  await page.route('**/api/ai/daily-context?**', (route) => options?.signalError
    ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
    : route.fulfill({ json: { signals } })
  )
}

for (const viewport of viewports) {
  test(`dense Today decision workspace at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockToday(page)
    await page.goto('/')

    await expect(page.locator('#loading-screen')).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    await expect(page.locator('[data-demo-id="decision-band"]')).toBeVisible()
    await expect(page.getByText('4h 30m usable time left')).toBeVisible()
    await expect(page.locator('[data-demo-id="daily-signals-summary"]')).toBeVisible()
    await expect(page.locator('[data-demo-id="anytime-backlog"]')).toBeVisible()
    await expect(page.locator('[data-demo-id="schedule-section"]')).toBeVisible()
    await expect(page).toHaveScreenshot(`today-workspace-${viewport.name}.png`, {
      animations: 'disabled',
      fullPage: true,
    })
  })
}

test('layout follows workspace width and preserves the mobile reading order', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await mockToday(page)
  await page.goto('/')

  const compactAnytime = await page.locator('[data-demo-id="anytime-backlog"]').boundingBox()
  const compactSchedule = await page.locator('[data-demo-id="schedule-section"]').boundingBox()
  expect(compactAnytime).not.toBeNull()
  expect(compactSchedule).not.toBeNull()
  expect(Math.abs(compactAnytime!.x - compactSchedule!.x)).toBeLessThan(4)
  expect(compactAnytime!.y).toBeLessThan(compactSchedule!.y)

  await page.setViewportSize({ width: 1440, height: 900 })
  const wideAnytime = await page.locator('[data-demo-id="anytime-backlog"]').boundingBox()
  const wideSchedule = await page.locator('[data-demo-id="schedule-section"]').boundingBox()
  expect(wideAnytime).not.toBeNull()
  expect(wideSchedule).not.toBeNull()
  expect(wideSchedule!.x).toBeLessThan(wideAnytime!.x)
  expect(Math.abs(wideSchedule!.y - wideAnytime!.y)).toBeLessThan(8)

  await page.setViewportSize({ width: 390, height: 844 })
  for (const selector of [
    '[data-demo-id="decision-band"]',
    '[data-demo-id="daily-signals-summary"]',
    '[data-demo-id="anytime-backlog"]',
    '[data-demo-id="schedule-section"]',
  ]) {
    await expect(page.locator(selector)).toBeVisible()
  }
  const mobileSignal = await page.locator('[data-demo-id="daily-signals-summary"]').boundingBox()
  const mobileAnytime = await page.locator('[data-demo-id="anytime-backlog"]').boundingBox()
  const mobileSchedule = await page.locator('[data-demo-id="schedule-section"]').boundingBox()
  const mobileDock = await page.locator('.mobile-bottom-dock').boundingBox()
  expect(mobileSignal!.y).toBeLessThan(mobileAnytime!.y)
  expect(mobileAnytime!.y).toBeLessThan(mobileSchedule!.y)
  expect(mobileSignal!.y + mobileSignal!.height).toBeLessThanOrEqual(mobileDock!.y + 1)
})

test('capacity and Daily Signals failures stay explicit without blocking the plan', async ({ page }) => {
  await mockToday(page, {
    signalError: true,
    summary: (date) => {
      const summary = denseDay(date)
      summary.capacity = {
        status: 'partial',
        window: summary.capacity.status === 'complete' ? summary.capacity.window : null!,
        basis: summary.capacity.status === 'complete' ? summary.capacity.basis : null!,
        availableUpperBoundMinutes: 315,
        reasonCodes: ['calendar_unavailable', 'item_missing_duration'],
      }
      summary.calendar = { status: 'unavailable', reasonCode: 'sync_failed', events: [] }
      summary.attention.nextCalendarObligation = null
      return summary
    },
  })
  await page.goto('/')

  await expect(page.getByText('At most 5h 15m unallocated')).toBeVisible()
  await expect(page.getByText(/Calendar obligations could not be checked/)).toBeVisible()
  await expect(page.getByText('Daily Signals unavailable.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Talk' })).toBeVisible()
  await expect(page.locator('[data-demo-id="schedule-section"]')).toBeVisible()
})

test('empty, completed, past, and future focus states use explicit language', async ({ page }) => {
  await mockToday(page, {
    summary: (date) => {
      const summary = daySummaryFixture({
        date,
        items: date === '2026-07-15'
          ? []
          : [{
              id: `item-${date}`,
              title: date < '2026-07-15' ? 'Unfinished follow-up' : 'Plan next milestone',
              scheduledDate: date,
              startTime: '09:00',
              duration: 30,
              completed: date === '2026-07-17',
            }],
      })
      if (date < '2026-07-15') {
        summary.dateMode = 'past'
        summary.attention.focus = { state: 'past_incomplete', itemId: `item-${date}`, reasonCode: 'past_incomplete_item' }
      } else if (date === '2026-07-16') {
        summary.dateMode = 'future'
        summary.attention.focus = { state: 'future_planned', itemId: `item-${date}`, reasonCode: 'first_future_item' }
      } else if (date === '2026-07-17') {
        summary.dateMode = 'future'
        summary.attention.focus = { state: 'completed_day', itemId: null, reasonCode: null }
      }
      return summary
    },
  })
  await page.goto('/')
  await expect(page.getByText('Open day')).toBeVisible()

  await page.getByRole('button', { name: 'Previous day' }).first().click()
  await expect(page.locator('[data-demo-id="decision-band"]').getByText('Unfinished follow-up')).toBeVisible()
  await expect(page.getByText('This Item was left incomplete on this past day.')).toBeVisible()

  await page.getByRole('button', { name: 'Next day' }).first().click()
  await page.getByRole('button', { name: 'Next day' }).first().click()
  await expect(page.locator('[data-demo-id="decision-band"]').getByText('Plan next milestone')).toBeVisible()
  await expect(page.getByText('This is the first planned Item for this future day.')).toBeVisible()

  await page.getByRole('button', { name: 'Next day' }).first().click()
  await expect(page.getByText('Day complete')).toBeVisible()
})

test('frequent controls meet touch size and disclosures preserve keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockToday(page)
  await page.goto('/')

  for (const name of ['Talk', 'Add', 'Previous day', 'Next day', 'Review', 'Show all 4']) {
    const control = page.getByRole(name === 'Talk' || name === 'Add' ? 'link' : 'button', { name }).first()
    const box = await control.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }

  const review = page.getByRole('button', { name: 'Review', exact: true })
  await review.focus()
  await review.press('Enter')
  const closeReview = page.getByRole('button', { name: 'Close', exact: true })
  await expect(closeReview).toBeFocused()
  await expect(closeReview).toHaveAttribute('aria-expanded', 'true')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const transitionDuration = await closeReview.evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(transitionDuration).toMatch(/0\.00001s|1e-05s|0s/)
})

test('decision, signal, and Anytime regions pass targeted accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockToday(page)
  await page.goto('/')

  for (const selector of [
    '[data-demo-id="decision-band"]',
    '[data-demo-id="daily-signals-summary"]',
    '[data-demo-id="anytime-backlog"]',
  ]) {
    await expect(page.locator(selector)).toBeVisible()
  }

  const results = await new AxeBuilder({ page })
    .include('[data-demo-id="decision-band"]')
    .include('[data-demo-id="daily-signals-summary"]')
    .include('[data-demo-id="anytime-backlog"]')
    .analyze()

  expect(results.violations).toEqual([])
})
