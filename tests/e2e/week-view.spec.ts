import { API_ORIGIN } from './apiBase'
import { test, expect } from './fixtures/ai-stubs'
import { format, addDays, startOfWeek } from 'date-fns'
import type { Page } from '@playwright/test'
import fs from 'fs'
import { daySummaryItem } from './fixtures/day-summary'
import { weekSummaryFixture } from './fixtures/week-summary'

function getAuthTokenFromStorageState() {
  const storageState = JSON.parse(fs.readFileSync('tests/e2e/.auth/user.json', 'utf8'))
  for (const origin of storageState.origins ?? []) {
    const token = origin.localStorage?.find((entry: { name: string; value: string }) => entry.name === 'token')?.value
    if (token) return token
  }
  throw new Error('Missing auth token in Playwright storage state')
}

async function setWeekStartsOn(page: Page, weekStartsOn: 0 | 1) {
  const response = await page.request.patch(`${API_ORIGIN}/api/settings`, {
    headers: { Authorization: `Bearer ${getAuthTokenFromStorageState()}` },
    data: { weekStartsOn },
  })
  expect(response.ok()).toBeTruthy()
}

test.beforeEach(async ({ page }) => {
  await setWeekStartsOn(page, 1)
})

test('Week view golden path: tasks appear under their correct day columns', async ({ page }) => {
  // Reset test user state via backend (React Router catch-all blocks GET /test/reset)
  const reset = await page.request.post(`${API_ORIGIN}/test/reset`)
  expect(reset.ok()).toBeTruthy()

  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')

  // Pick a different day: 2 days from today, but clamp to this week so it's visible
  // getWeekDates starts on Monday; pick a day that isn't today within the same week
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const candidateDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const otherDay = candidateDays.find((d) => format(d, 'yyyy-MM-dd') !== todayStr)!
  const otherDayStr = format(otherDay, 'yyyy-MM-dd')

  const todayTitle = `WeekE2E-Today-${Date.now()}`
  const otherTitle = `WeekE2E-Other-${Date.now()}`

  // --- Add task for TODAY ---
  await page.goto('/app/add')
  await expect(page.getByRole('heading', { name: 'Add Item', exact: true })).toBeVisible()
  await page.locator('input[placeholder*="Enter"]').first().fill(todayTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="date"]').fill(todayStr)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/app', { timeout: 10_000 })

  // --- Add task for OTHER day ---
  // Give it a start time: a TIMED task never rolls over (ADR-0002 carry-forward is
  // untimed-only), so it stays on its own day and won't leak into today's column even
  // when otherDay is in the past. Keeps this test correct on any weekday.
  await page.goto('/app/add')
  await expect(page.getByRole('heading', { name: 'Add Item', exact: true })).toBeVisible()
  await page.locator('input[placeholder*="Enter"]').first().fill(otherTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="date"]').fill(otherDayStr)
  await page.locator('input[type="time"]').fill('10:00')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/app', { timeout: 10_000 })

  // --- Navigate to Week View ---
  await page.goto('/app/week')
  // Wait for the week rail to render (redesign: 7 selectable day buttons)
  await expect(page.locator(`[data-rail-date="${todayStr}"]`)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'All week' }).click()

  // The redesign shows a single weekly agenda where each item row is tagged with
  // its scheduled date via data-date (instead of one column per day).
  // --- Assert today's task appears in a row dated today ---
  await expect(
    page.locator(`[data-date="${todayStr}"]`).filter({ hasText: todayTitle })
  ).toBeVisible({ timeout: 10_000 })

  // --- Assert other-day task appears in a row dated that day ---
  await expect(
    page.locator(`[data-date="${otherDayStr}"]`).filter({ hasText: otherTitle })
  ).toBeVisible({ timeout: 10_000 })

  // Negative: today's task must NOT appear under the other day's date
  await expect(
    page.locator(`[data-date="${otherDayStr}"]`).filter({ hasText: todayTitle })
  ).toHaveCount(0)
})

test('Week view follows configured first day of week', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-24T12:00:00'))

  await setWeekStartsOn(page, 1)
  await page.goto('/app/week')
  await expect(page.locator('[data-rail-date="2026-06-22"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-rail-date="2026-06-28"]')).toBeVisible()
  await expect(page.locator('[data-rail-date="2026-06-21"]')).toHaveCount(0)
  await expect(page.getByText('Jun 22 – 28, 2026')).toBeVisible()

  await setWeekStartsOn(page, 0)
  await page.goto('/app/week')
  await expect(page.locator('[data-rail-date="2026-06-21"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-rail-date="2026-06-27"]')).toBeVisible()
  await expect(page.locator('[data-rail-date="2026-06-28"]')).toHaveCount(0)
  await expect(page.getByText('Jun 21 – 27, 2026')).toBeVisible()

  await setWeekStartsOn(page, 1)
})

test('Week view includes calendar-integrated events in their day', async ({ page }) => {
  const reset = await page.request.post(`${API_ORIGIN}/test/reset`)
  expect(reset.ok()).toBeTruthy()

  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const eventDay = addDays(weekStart, 3)
  const eventDayStr = format(eventDay, 'yyyy-MM-dd')
  const eventTitle = `CalendarE2E-${Date.now()}`

  await page.route('**/api/week-summary?*', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    const day = body.days.find((candidate: { date: string }) => candidate.date === eventDayStr)
    day.calendar = {
      status: 'connected',
      reasonCode: null,
      events: [{
        id: 'external-week-event-1',
        provider: 'google',
        calendarId: 'primary',
        externalEventId: 'google-event-1',
        title: eventTitle,
        description: null,
        location: null,
        startAt: `${eventDayStr}T10:00:00.000Z`,
        endAt: `${eventDayStr}T11:00:00.000Z`,
        localStartTime: '10:00',
        localEndTime: '11:00',
        allDay: false,
        status: 'confirmed',
        htmlLink: null,
        completed: false,
        completedAt: null,
      }],
    }
    body.obligations = { total: 1, completed: 0 }
    body.contributions.push({ domain: 'calendar', total: 1, completed: 0, addressed: 0 })
    await route.fulfill({
      response,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })

  await page.goto('/app/week')
  await expect(page.locator(`[data-rail-date="${eventDayStr}"]`)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'All week' }).click()

  await expect(
    page.locator(`[data-date="${eventDayStr}"]`).filter({ hasText: eventTitle })
  ).toBeVisible({ timeout: 10_000 })
  await expect(
    page.locator(`[data-date="${eventDayStr}"]`).filter({ hasText: 'Calendar' })
  ).toBeVisible()
})

test('Week scope and selected date survive refresh and browser history', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-24T12:00:00'))

  await page.goto('/app/week')
  await expect(page.locator('[data-rail-date="2026-06-24"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-rail-date="2026-06-25"]').click()
  await expect(page).toHaveURL(/date=2026-06-25/)
  await page.reload()
  await expect(page.locator('[data-rail-date="2026-06-25"]')).toHaveAttribute('aria-current', 'date')

  await page.getByRole('button', { name: 'All week' }).click()
  await expect(page).toHaveURL(/scope=all/)
  await page.goBack()
  await expect(page.locator('[data-rail-date="2026-06-25"]')).toHaveAttribute('aria-current', 'date')
})

test('Week view shows an untimed one-off task only once', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-24T12:00:00'))

  const reset = await page.request.post(`${API_ORIGIN}/test/reset`)
  expect(reset.ok()).toBeTruthy()

  const todayStr = '2026-06-24'
  const title = `Untimed Week Once ${Date.now()}`

  await page.goto('/app/add')
  await expect(page.getByRole('heading', { name: 'Add Item', exact: true })).toBeVisible()
  await page.locator('input[placeholder*="Enter"]').first().fill(title)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="date"]').fill(todayStr)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/app', { timeout: 10_000 })

  await page.goto('/app/week')
  await expect(page.locator(`[data-rail-date="${todayStr}"]`)).toBeVisible({ timeout: 10_000 })

  await expect(page.locator('[data-date]').filter({ hasText: title })).toHaveCount(1)
  await expect(page.locator(`[data-date="${todayStr}"]`).filter({ hasText: title })).toBeVisible()
})

test('All Week aggregates Habit instances while selected-day check-in remains available', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-24T12:00:00'))
  const dates = Array.from({ length: 7 }, (_, index) => `2026-06-${22 + index}`)
  const itemsByDate = Object.fromEntries(dates.map((date, index) => [date, [
    daySummaryItem({
      id: `habit-parent-${date}`,
      title: 'Walk outside',
      type: 'habit',
      repeat: 'daily',
      isHabitInstance: true,
      originalHabitId: 'habit-parent',
      scheduledDate: date,
      completed: index === 0,
      habitInfo: {
        target: null,
        outcome: index === 0 ? 'completed' : index === 2 ? 'failed' : 'pending',
        progressTotal: 0,
      },
    }),
  ]]))
  itemsByDate['2026-06-25'].push(daySummaryItem({
    id: 'one-time',
    title: 'Prepare report',
    scheduledDate: '2026-06-25',
  }))

  await page.route('**/api/week-summary?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(weekSummaryFixture({ startDate: '2026-06-22', itemsByDate })),
  }))

  await page.goto('/app/week')
  const agenda = page.getByTestId('week-agenda')
  await expect(agenda.getByText('Walk outside')).toHaveCount(0)
  await expect(page.locator('[data-rail-date="2026-06-24"]')).toHaveAttribute('aria-label', /1 addressed of 1/)
  await page.getByRole('button', { name: 'Walk outside, Wednesday, Not done' }).click()
  await expect(page.getByRole('dialog')).toContainText('Walk outside')
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('button', { name: 'All week' }).click()
  await expect(agenda.getByText('Walk outside')).toHaveCount(0)
  await expect(agenda.getByText('Prepare report')).toBeVisible()

  const habitDisclosure = page.getByRole('button', { name: 'Walk outside', exact: true })
  await habitDisclosure.click()
  await expect(habitDisclosure).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: 'Walk outside, Wednesday, Not done' }).click()
  await expect(page.getByRole('dialog')).toContainText('Walk outside')
})

test('selected Today is a compact planning snapshot instead of a second Today timeline', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-24T12:00:00'))
  const today = '2026-06-24'
  const itemsByDate = {
    [today]: [
      daySummaryItem({ id: 'open-task', title: 'Unresolved proposal', scheduledDate: today }),
      daySummaryItem({ id: 'done-task', title: 'Completed execution', scheduledDate: today, completed: true }),
      daySummaryItem({
        id: 'habit-today',
        title: 'Daily stretch',
        type: 'habit',
        repeat: 'daily',
        isHabitInstance: true,
        originalHabitId: 'daily-stretch',
        scheduledDate: today,
        habitInfo: { target: null, outcome: 'pending', progressTotal: 0 },
      }),
    ],
  }
  const calendarEvent = {
    id: 'calendar-open',
    provider: 'google' as const,
    calendarId: 'primary',
    externalEventId: 'calendar-open',
    title: 'Planning call',
    description: null,
    location: null,
    startAt: `${today}T10:00:00.000Z`,
    endAt: `${today}T10:30:00.000Z`,
    localStartTime: '10:00',
    localEndTime: '10:30',
    allDay: false,
    status: 'confirmed',
    htmlLink: null,
    completed: false,
    completedAt: null,
  }
  const eventsByDate = {
    [today]: [
      calendarEvent,
      {
        ...calendarEvent,
        id: 'calendar-done',
        externalEventId: 'calendar-done',
        title: 'Finished call',
        completed: true,
      },
    ],
  }

  await page.route('**/api/week-summary?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(weekSummaryFixture({ startDate: '2026-06-22', itemsByDate, eventsByDate })),
  }))

  await page.goto('/app/week')
  const agenda = page.getByTestId('week-agenda')
  await expect(agenda.getByRole('heading', { name: 'Today planning snapshot' })).toBeVisible()
  await expect(agenda.getByText('Unresolved proposal')).toBeVisible()
  await expect(agenda.getByText('Planning call')).toBeVisible()
  await expect(agenda.getByText('Completed execution')).toHaveCount(0)
  await expect(agenda.getByText('Finished call')).toHaveCount(0)
  await expect(agenda.getByText('Daily stretch')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Open Today' })).toHaveAttribute('href', '/app')
  await expect(page.getByRole('heading', { name: 'Habit cadence' })).toBeVisible()
})

test('All Week communicates complete, partial, and unavailable capacity without a false total', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-24T12:00:00'))
  const common = {
    window: {
      startTime: '08:00',
      endTime: '18:00',
      transitionBufferMinutes: 0,
      totalMinutes: 600,
      consideredStartTime: '08:00',
      consideredEndTime: '18:00',
      consideredMinutes: 600,
      bufferPolicy: 'after_each_obligation' as const,
    },
    basis: {
      scope: 'planned' as const,
      knownLoadMinutes: 120,
      timedItemCount: 1,
      calendarEventCount: 0,
      bufferedIntervalCount: 1,
    },
  }
  const capacityByDate = {
    '2026-06-22': { status: 'complete' as const, ...common, availableMinutes: 480, reasonCodes: [] },
    '2026-06-23': {
      status: 'partial' as const,
      ...common,
      availableUpperBoundMinutes: 480,
      reasonCodes: ['item_missing_duration' as const],
    },
  }
  await page.route('**/api/week-summary?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(weekSummaryFixture({ startDate: '2026-06-22', capacityByDate })),
  }))

  await page.goto('/app/week')
  await page.getByRole('button', { name: 'All week' }).click()
  await expect(page.getByText('Monday, Jun 22 · 8h unallocated')).toBeVisible()
  await expect(page.getByText(/Capacity partly known/)).toBeVisible()
  await expect(page.getByText('Capacity unavailable').first()).toBeVisible()
  await expect(page.getByText(/weekly capacity/i)).toHaveCount(0)
})
