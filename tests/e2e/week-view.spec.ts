import { test, expect } from './fixtures/ai-stubs'
import { format, addDays, startOfWeek } from 'date-fns'

test('Week view golden path: tasks appear under their correct day columns', async ({ page }) => {
  // Reset test user state via backend (React Router catch-all blocks GET /test/reset)
  const reset = await page.request.post('http://localhost:3001/test/reset')
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
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()
  await page.locator('input[placeholder*="Enter"]').first().fill(todayTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="date"]').fill(todayStr)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  // --- Add task for OTHER day ---
  // Give it a start time: a TIMED task never rolls over (ADR-0002 carry-forward is
  // untimed-only), so it stays on its own day and won't leak into today's column even
  // when otherDay is in the past. Keeps this test correct on any weekday.
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()
  await page.locator('input[placeholder*="Enter"]').first().fill(otherTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="date"]').fill(otherDayStr)
  await page.locator('input[type="time"]').fill('10:00')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  // --- Navigate to Week View ---
  await page.goto('/week')
  // Wait for the week rail to render (redesign: 7 selectable day buttons)
  await expect(page.locator(`[data-rail-date="${todayStr}"]`)).toBeVisible({ timeout: 10_000 })

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

test('Week view includes calendar-integrated events in their day', async ({ page }) => {
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const eventDay = addDays(weekStart, 3)
  const eventDayStr = format(eventDay, 'yyyy-MM-dd')
  const eventTitle = `CalendarE2E-${Date.now()}`

  await page.route('**/api/calendar/google/events**', async (route) => {
    const url = new URL(route.request().url())
    const date = url.searchParams.get('date')
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(date === eventDayStr ? [{
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
      }] : []),
    })
  })

  await page.goto('/week')
  await expect(page.locator(`[data-rail-date="${eventDayStr}"]`)).toBeVisible({ timeout: 10_000 })

  await expect(
    page.locator(`[data-date="${eventDayStr}"]`).filter({ hasText: eventTitle })
  ).toBeVisible({ timeout: 10_000 })
  await expect(
    page.locator(`[data-date="${eventDayStr}"]`).filter({ hasText: 'Calendar' })
  ).toBeVisible()
})

test('Week view Up Next ignores past events', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-24T12:00:00'))

  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  const pastTuesdayTitle = `Past Tuesday ${Date.now()}`
  const pastTodayTitle = `Past Today ${Date.now()}`
  const futureTodayTitle = `Future Today ${Date.now()}`
  const futureThursdayTitle = `Future Thursday ${Date.now()}`

  await page.route('**/api/calendar/google/events**', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date')
    const eventsByDate: Record<string, unknown[]> = {
      '2026-06-23': [{
        id: 'past-tuesday',
        provider: 'google',
        calendarId: 'primary',
        externalEventId: 'past-tuesday',
        title: pastTuesdayTitle,
        description: null,
        location: null,
        startAt: '2026-06-23T10:00:00.000Z',
        endAt: '2026-06-23T11:00:00.000Z',
        localStartTime: '10:00',
        localEndTime: '11:00',
        allDay: false,
        status: 'confirmed',
        htmlLink: null,
        completed: false,
        completedAt: null,
      }],
      '2026-06-24': [
        {
          id: 'past-today',
          provider: 'google',
          calendarId: 'primary',
          externalEventId: 'past-today',
          title: pastTodayTitle,
          description: null,
          location: null,
          startAt: '2026-06-24T09:00:00.000Z',
          endAt: '2026-06-24T10:00:00.000Z',
          localStartTime: '09:00',
          localEndTime: '10:00',
          allDay: false,
          status: 'confirmed',
          htmlLink: null,
          completed: false,
          completedAt: null,
        },
        {
          id: 'future-today',
          provider: 'google',
          calendarId: 'primary',
          externalEventId: 'future-today',
          title: futureTodayTitle,
          description: null,
          location: null,
          startAt: '2026-06-24T15:00:00.000Z',
          endAt: '2026-06-24T16:00:00.000Z',
          localStartTime: '15:00',
          localEndTime: '16:00',
          allDay: false,
          status: 'confirmed',
          htmlLink: null,
          completed: false,
          completedAt: null,
        },
      ],
      '2026-06-25': [{
        id: 'future-thursday',
        provider: 'google',
        calendarId: 'primary',
        externalEventId: 'future-thursday',
        title: futureThursdayTitle,
        description: null,
        location: null,
        startAt: '2026-06-25T10:00:00.000Z',
        endAt: '2026-06-25T11:00:00.000Z',
        localStartTime: '10:00',
        localEndTime: '11:00',
        allDay: false,
        status: 'confirmed',
        htmlLink: null,
        completed: false,
        completedAt: null,
      }],
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(eventsByDate[date ?? ''] ?? []),
    })
  })

  await page.goto('/week')
  await expect(page.locator('[data-rail-date="2026-06-24"]')).toBeVisible({ timeout: 10_000 })

  await expect(page.getByTestId('week-up-next-title')).toHaveText(futureTodayTitle)
  await expect(page.getByTestId('week-up-next-title')).not.toHaveText(pastTuesdayTitle)
  await expect(page.getByTestId('week-up-next-title')).not.toHaveText(pastTodayTitle)
})
