import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { DailySignal } from '../../backend/src/daily-context-schema'
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

function signalsForDate(date: string): DailySignal[] {
  return [
    {
      id: `${date}:schedule_overload:morning:task-client`,
      type: 'schedule_overload',
      kind: 'actionable',
      severity: 'medium',
      confidence: 'high',
      summary: 'Your morning has three scheduled Items totaling about 180 minutes.',
      rationale: '"Prepare client decisions" is the latest-starting Task in this crowded window. Moving it to Anytime would free 30 scheduled minutes without deleting it.',
      evidence: [
        { label: 'Window', value: 'morning' },
        { label: 'Scheduled load', value: '3 Items · 180 min' },
        { label: 'Concrete candidate', value: 'Prepare client decisions · 10:45' },
      ],
      proposal: {
        capability: 'update_item',
        label: 'Move "Prepare client decisions" to Anytime',
        arguments: {
          itemId: 'task-client',
          startTime: null,
          requestId: `daily-signal:${date}:task-client`,
        },
        affectedRecords: [{
          id: 'task-client',
          kind: 'task',
          title: 'Prepare client decisions',
          date,
        }],
        changes: [{
          field: 'startTime',
          label: 'Start time',
          before: '10:45',
          after: null,
        }],
      },
    },
    {
      id: `${date}:habit_risk:habit-walk`,
      type: 'habit_risk',
      kind: 'informational',
      severity: 'medium',
      confidence: 'high',
      summary: 'You missed "Walk outside" two recent days and it is due today.',
      rationale: 'The Habit is due today after two recent misses. “Do a smaller version” is useful guidance, but it is not an exact record change HealthyFlow can safely apply.',
      evidence: [
        { label: 'Habit', value: 'Walk outside' },
        { label: 'Recent misses', value: '2026-07-14, 2026-07-13' },
        { label: 'Due', value: date },
      ],
      proposal: null,
    },
  ]
}

function reviewedAction(date: string, id = '22222222-2222-4222-8222-222222222222') {
  return {
    id,
    capability: 'update_item',
    args: {
      itemId: 'task-client',
      startTime: null,
      requestId: `daily-signal:${date}:task-client`,
    },
    preview: {
      action: 'update_item',
      item: {
        id: 'task-client',
        title: 'Prepare client decisions',
        type: 'task',
        category: 'work',
        completed: false,
        scheduledDate: date,
        startTime: '10:45',
        duration: 30,
        repeat: 'none',
        position: null,
        isHabitInstance: false,
        originalHabitId: null,
        createdAt: `${date}T08:00:00.000Z`,
      },
      updates: {
        itemId: 'task-client',
        startTime: null,
        requestId: `daily-signal:${date}:task-client`,
      },
    },
    expiresAt: `${date}T10:10:00.000Z`,
  }
}

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

type DayContextState = 'mixed' | 'empty' | 'unavailable' | 'disabled'
type ConfirmRequest = {
  actionId: string
  args: Record<string, unknown>
}

function dayContextState(date: string, state: DayContextState): DaySummary {
  const mixedItems = [
    { id: 'habit-pending', title: 'Morning reset', type: 'habit' as const, scheduledDate: date, habitInfo: { target: null, outcome: 'pending' as const, progressTotal: 0 } },
    { id: 'habit-partial', title: 'Walk outside', type: 'habit' as const, scheduledDate: date, habitInfo: { target: { value: 20, unit: 'minutes' as const }, outcome: 'partial' as const, progressTotal: 10 } },
    { id: 'habit-completed', title: 'Drink water', type: 'habit' as const, scheduledDate: date, completed: true, habitInfo: { target: { value: 8, unit: 'count' as const }, outcome: 'completed' as const, progressTotal: 8 } },
    { id: 'habit-failed', title: 'No late caffeine', type: 'habit' as const, scheduledDate: date, habitInfo: { target: { value: 1, unit: 'count' as const }, outcome: 'failed' as const, progressTotal: 0 } },
  ]
  const summary = daySummaryFixture({
    date,
    items: state === 'mixed' ? mixedItems : [],
  })
  summary.modules = {
    habits: 'enabled',
    nutrition: state === 'disabled' ? 'disabled' : state === 'unavailable' ? 'unavailable' : 'enabled',
    workouts: state === 'disabled' ? 'disabled' : state === 'unavailable' ? 'unavailable' : 'enabled',
  }
  summary.supporting.habits = state === 'mixed'
    ? { status: 'available', total: 4, pending: 1, partial: 1, completed: 1, failed: 1, targeted: 3 }
    : { status: 'available', total: 0, pending: 0, partial: 0, completed: 0, failed: 0, targeted: 0 }

  if (state === 'mixed') {
    summary.calorieEntries = [
      {
        id: 'calorie-zero',
        date,
        time: '08:00',
        name: 'Tracked drink',
        calories: 0,
        protein: 0,
        carbs: null,
        fat: 0,
        quantity: null,
        createdAt: null,
        updatedAt: null,
      },
      {
        id: 'calorie-partial',
        date,
        time: null,
        name: 'Partially tracked snack',
        calories: 0,
        protein: 0,
        carbs: 12,
        fat: null,
        quantity: null,
        createdAt: null,
        updatedAt: null,
      },
    ]
    summary.supporting.nutrition = {
      status: 'available',
      entries: summary.calorieEntries,
      calories: { status: 'complete', value: 0 },
      protein: { status: 'complete', value: 0 },
      carbs: { status: 'partial', value: 12 },
      fat: { status: 'partial', value: 0 },
      weight: { status: 'not_recorded', entry: null },
    }
    summary.supporting.workouts = {
      status: 'logged',
      sessions: [{
        id: 'workout-session',
        userId: 'test-user',
        date,
        title: 'Logged strength',
        notes: null,
        exercises: [{
          id: 'exercise-1',
          sessionId: 'workout-session',
          name: 'Squat',
          sets: 3,
          reps: 5,
          weightKg: 62.5,
          durationMinutes: null,
          distanceKm: null,
          notes: null,
          position: 0,
        }, {
          id: 'exercise-2',
          sessionId: 'workout-session',
          name: 'Run',
          sets: null,
          reps: null,
          weightKg: null,
          durationMinutes: 20,
          distanceKm: 3.2,
          notes: null,
          position: 1,
        }],
        createdAt: `${date}T18:00:00.000Z`,
        updatedAt: `${date}T18:00:00.000Z`,
      }],
    }
  } else if (state === 'empty') {
    summary.supporting.nutrition = {
      status: 'not_logged',
      entries: [],
      calories: { status: 'unavailable', value: null },
      protein: { status: 'unavailable', value: null },
      carbs: { status: 'unavailable', value: null },
      fat: { status: 'unavailable', value: null },
      weight: { status: 'not_recorded', entry: null },
    }
    summary.supporting.workouts = { status: 'not_logged', sessions: [] }
  } else if (state === 'unavailable') {
    summary.supporting.nutrition = {
      status: 'unavailable',
      entries: [],
      calories: { status: 'unavailable', value: null },
      protein: { status: 'unavailable', value: null },
      carbs: { status: 'unavailable', value: null },
      fat: { status: 'unavailable', value: null },
      weight: { status: 'unavailable', entry: null },
    }
    summary.supporting.workouts = { status: 'unavailable', sessions: [] }
  }

  return summary
}

async function mockToday(page: Page, options?: {
  theme?: 'midnight' | 'white'
  summary?: (date: string) => DaySummary
  summaryError?: () => boolean
  signalError?: boolean
  signals?: (date: string) => DailySignal[]
  onSummaryRequest?: () => void
}) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'today-workspace-token')
  })
  await page.clock.setFixedTime(fixedNow)
  await page.route('**/api/auth/verify', (route) => route.fulfill({
    json: {
      id: 'today-workspace-user',
      email: 'today@healthyflow.local',
      name: 'Today Review',
      role: 'user',
    },
  }))
  await page.route('**/api/settings', (route) => route.fulfill({
    json: { ...settings, theme: options?.theme ?? settings.theme },
  }))
  await page.route('**/api/proactivity/rhythm', (route) => route.fulfill({
    json: {
      timezone: 'UTC',
      morning: { enabled: true, time: '08:00', days: [1, 2, 3, 4, 5], lastSent: null },
      midday: { enabled: true, time: '13:00', days: [1, 2, 3, 4, 5], lastSent: null },
      weekly: { enabled: false, time: '17:00', day: 0, lastSent: null },
    },
  }))
  await page.route('**/api/day-summary?**', (route) => {
    options?.onSummaryRequest?.()
    if (options?.summaryError?.()) {
      return route.fulfill({ status: 503, json: { error: 'Unavailable' } })
    }
    const date = new URL(route.request().url()).searchParams.get('date') ?? '2026-07-15'
    return route.fulfill({ json: (options?.summary ?? denseDay)(date) })
  })
  await page.route('**/api/ai/daily-context?**', (route) => {
    if (options?.signalError) {
      return route.fulfill({ status: 503, json: { error: 'Unavailable' } })
    }
    const date = new URL(route.request().url()).searchParams.get('date') ?? '2026-07-15'
    return route.fulfill({
      json: {
        date,
        generatedAt: `${date}T14:00:00.000Z`,
        day: {
          tasks: [],
          calorieEntries: [],
          weight: null,
          achievements: [],
          workoutSessions: [],
          calendarEvents: [],
        },
        lookback: {
          habitHistory: { windowDays: 3, days: [] },
          calorieHistory: { windowDays: 7, days: [] },
          workoutHistory: { windowDays: 14, days: [] },
        },
        signals: (options?.signals ?? signalsForDate)(date),
      },
    })
  })
}

async function dispatchSwipe(
  page: Page,
  sourceSelector: string,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  await page.evaluate(({ selector, startPoint, endPoint }) => {
    const source = document.querySelector(selector)
    if (!(source instanceof HTMLElement)) throw new Error(`Swipe source not found: ${selector}`)

    const dispatch = (
      type: 'touchstart' | 'touchmove' | 'touchend',
      point: { x: number; y: number }
    ) => {
      const touch = new Touch({
        identifier: 137,
        target: source,
        clientX: point.x,
        clientY: point.y,
        pageX: point.x + window.scrollX,
        pageY: point.y + window.scrollY,
        screenX: point.x,
        screenY: point.y,
      })
      const activeTouches = type === 'touchend' ? [] : [touch]
      source.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: activeTouches,
        targetTouches: activeTouches,
        changedTouches: [touch],
      }))
    }

    dispatch('touchstart', startPoint)
    dispatch('touchmove', endPoint)
    dispatch('touchend', endPoint)
  }, { selector: sourceSelector, startPoint: start, endPoint: end })
}

for (const viewport of viewports) {
  test(`expanded Daily Signals at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockToday(page)
    await page.goto('/app')

    await page.getByRole('button', { name: 'Review', exact: true }).click()
    const signalsRegion = page.locator('[data-demo-id="daily-signals-summary"]')
    await expect(signalsRegion.getByText('Why this surfaced').first()).toBeVisible()
    await expect(signalsRegion.getByText('Move "Prepare client decisions" to Anytime')).toBeVisible()
    await expect(signalsRegion.getByText('Start time')).toBeVisible()
    await expect(signalsRegion.getByText(/10:45.*Anytime/)).toBeVisible()
    await expect(signalsRegion).toHaveScreenshot(`today-daily-signals-expanded-${viewport.name}.png`, {
      animations: 'disabled',
    })
  })
}

test('Daily Signals expose exact proposals, allow edits, and apply through the shared confirmation path', async ({ page }) => {
  let summaryRequests = 0
  let reviewBody: unknown
  let confirmBody: ConfirmRequest | null = null
  await mockToday(page, { onSummaryRequest: () => { summaryRequests += 1 } })
  await page.route('**/api/ai/daily-context/review', async (route) => {
    reviewBody = route.request().postDataJSON()
    const body = reviewBody as { date: string }
    await route.fulfill({
      json: {
        signal: signalsForDate(body.date)[0],
        pendingAction: reviewedAction(body.date),
      },
    })
  })
  await page.route('**/api/ai/chat/confirm', async (route) => {
    const body = route.request().postDataJSON() as ConfirmRequest
    confirmBody = body
    const action = reviewedAction('2026-07-15')
    await route.fulfill({
      json: {
        action: { ...action, args: body.args },
        result: {
          item: {
            ...action.preview.item,
            startTime: body.args.startTime,
          },
        },
      },
    })
  })
  await page.goto('/app')

  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const signalsRegion = page.locator('[data-demo-id="daily-signals-summary"]')
  const actionable = signalsRegion.getByRole('listitem').filter({ hasText: 'Actionable proposal' })
  const informational = signalsRegion.getByRole('listitem').filter({ hasText: 'Information' })

  await expect(actionable.getByText('Prepare client decisions · Task · 2026-07-15')).toBeVisible()
  await expect(actionable.getByText(/10:45.*Anytime/)).toBeVisible()
  await expect(informational.getByRole('button', { name: /Review change|Apply/ })).toHaveCount(0)

  await actionable.getByRole('button', { name: 'Review change' }).click()
  expect(reviewBody).toEqual({
    date: '2026-07-15',
    signalId: '2026-07-15:schedule_overload:morning:task-client',
  })
  await expect(actionable.getByText('Review before applying')).toBeVisible()
  await actionable.getByLabel('Start time').fill('16:30')
  await actionable.getByRole('button', { name: 'Apply' }).click()

  await expect(page.getByText('Daily plan updated', { exact: true })).toBeVisible()
  expect(confirmBody).toMatchObject({
    actionId: '22222222-2222-4222-8222-222222222222',
    args: {
      itemId: 'task-client',
      startTime: '16:30',
      requestId: 'daily-signal:2026-07-15:task-client',
    },
  })
  await expect.poll(() => summaryRequests).toBeGreaterThan(1)
  await expect(signalsRegion).toContainText('1 signal')
  await expect(actionable).toHaveCount(0)
})

test('Daily Signal recovery preserves edits across prepare and expired-action retries', async ({ page }) => {
  let reviewAttempts = 0
  let confirmAttempts = 0
  const confirmedBodies: ConfirmRequest[] = []
  await mockToday(page)
  await page.route('**/api/ai/daily-context/review', async (route) => {
    reviewAttempts += 1
    if (reviewAttempts === 1) {
      return route.fulfill({
        status: 503,
        json: { error: 'Could not revalidate this proposal', code: 'daily_signal_prepare_failed' },
      })
    }
    const body = route.request().postDataJSON() as { date: string }
    return route.fulfill({
      json: {
        signal: signalsForDate(body.date)[0],
        pendingAction: reviewedAction(
          body.date,
          reviewAttempts === 2
            ? '22222222-2222-4222-8222-222222222222'
            : '33333333-3333-4333-8333-333333333333'
        ),
      },
    })
  })
  await page.route('**/api/ai/chat/confirm', async (route) => {
    confirmAttempts += 1
    const body = route.request().postDataJSON() as ConfirmRequest
    confirmedBodies.push(body)
    if (confirmAttempts === 1) {
      return route.fulfill({
        status: 409,
        json: { error: 'Pending action is no longer available', code: 'pending_action_unavailable' },
      })
    }
    const action = reviewedAction('2026-07-15', '33333333-3333-4333-8333-333333333333')
    return route.fulfill({
      json: {
        action: { ...action, args: body.args },
        result: { item: { ...action.preview.item, startTime: body.args.startTime } },
      },
    })
  })
  await page.goto('/app')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const actionable = page.getByRole('listitem').filter({ hasText: 'Actionable proposal' })

  await actionable.getByRole('button', { name: 'Review change' }).click()
  await expect(actionable.getByRole('alert')).toContainText('Could not revalidate this proposal')
  await actionable.getByRole('button', { name: 'Retry review' }).click()
  await actionable.getByLabel('Start time').fill('16:30')
  await actionable.getByRole('button', { name: 'Apply' }).click()
  await expect(actionable.getByText('Pending action is no longer available')).toBeVisible()
  await actionable.getByRole('button', { name: 'Prepare again' }).click()
  await expect(actionable.getByLabel('Start time')).toHaveValue('16:30')
  await actionable.getByRole('button', { name: 'Apply' }).click()

  await expect(page.getByText('Daily plan updated', { exact: true })).toBeVisible()
  expect(reviewAttempts).toBe(3)
  expect(confirmedBodies).toHaveLength(2)
  expect(confirmedBodies[1]).toMatchObject({
    actionId: '33333333-3333-4333-8333-333333333333',
    args: { startTime: '16:30' },
  })
})

test('a stale Daily Signal refreshes to the latest signal set', async ({ page }) => {
  let stale = false
  let signalRequests = 0
  await mockToday(page, {
    signals: (date) => {
      signalRequests += 1
      return stale ? [] : signalsForDate(date)
    },
  })
  await page.route('**/api/ai/daily-context/review', async (route) => {
    stale = true
    await route.fulfill({
      status: 409,
      json: {
        error: 'This Daily Signal is no longer current.',
        code: 'daily_signal_stale',
      },
    })
  })
  await page.goto('/app')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('listitem').filter({ hasText: 'Actionable proposal' })
    .getByRole('button', { name: 'Review change' }).click()

  await expect.poll(() => signalRequests).toBeGreaterThan(1)
  await expect(page.getByText('No Daily Signals need attention.')).toBeVisible()
  await expect(page.locator('[data-demo-id="daily-signals-summary"] [aria-live="polite"]'))
    .toContainText('Daily Signals refreshed')
})

test('Daily Signal dismissal recovers from cancellation failure', async ({ page }) => {
  let cancelAttempts = 0
  await mockToday(page)
  await page.route('**/api/ai/daily-context/review', async (route) => {
    const body = route.request().postDataJSON() as { date: string }
    await route.fulfill({
      json: {
        signal: signalsForDate(body.date)[0],
        pendingAction: reviewedAction(body.date),
      },
    })
  })
  await page.route('**/api/ai/chat/cancel', async (route) => {
    cancelAttempts += 1
    if (cancelAttempts === 1) {
      return route.fulfill({ status: 503, json: { error: 'Cancellation unavailable' } })
    }
    return route.fulfill({ json: reviewedAction('2026-07-15') })
  })
  await page.goto('/app')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const actionable = page.getByRole('listitem').filter({ hasText: 'Actionable proposal' })

  await actionable.getByRole('button', { name: 'Review change' }).click()
  await actionable.getByRole('button', { name: 'Dismiss' }).click()
  await expect(actionable.getByText('Cancellation unavailable')).toBeVisible()
  await actionable.getByRole('button', { name: 'Try dismissing again' }).click()

  await expect(actionable).toHaveCount(0)
  expect(cancelAttempts).toBe(2)

  const informational = page.getByRole('listitem').filter({ hasText: 'Information' })
  await informational.getByRole('button', { name: 'Dismiss' }).click()
  const signalsRegion = page.locator('[data-demo-id="daily-signals-summary"]')
  await expect(signalsRegion).toContainText('Daily Signals cleared for this view.')
  await expect(signalsRegion).toBeFocused()
})

test('informational Daily Signals start a fresh bounded Talk conversation', async ({ page }) => {
  await mockToday(page)
  const now = new Date().toISOString()
  await page.route('**/api/ai/conversations', async (route) => {
    await route.fulfill({
      json: [{
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Unrelated existing plan',
        model: 'gpt-4o-mini',
        createdAt: now,
        updatedAt: now,
        messages: [{
          id: '22222222-2222-4222-8222-222222222222',
          role: 'user',
          content: 'Keep discussing my unrelated existing plan.',
          createdAt: now,
        }],
      }],
    })
  })
  let chatMessages: Array<{ role: string; content: string }> = []
  await page.route('**/api/ai/chat', async (route) => {
    chatMessages = route.request().postDataJSON().messages
    await route.fulfill({
      json: {
        message: 'Let us choose one useful next step for this signal.',
        toolEvents: [],
        pendingActions: [],
      },
    })
  })
  await page.goto('/app')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const informational = page.getByRole('listitem').filter({ hasText: 'Information' })
  await informational.getByRole('link', { name: 'Open Talk' }).click()

  await expect(page).toHaveURL(/\/talk$/)
  await expect(page.getByText('From Today · 2026-07-15 · habit risk')).toBeVisible()
  const talkInput = page.locator('[data-demo-id="talk-input"]')
  await expect(talkInput).toHaveValue(/You missed "Walk outside"/)
  await expect(talkInput).toHaveValue(/one useful next step/i)
  await expect(page.locator('.assistant-messages-scroll')).not.toContainText('unrelated existing plan')
  expect(page.url()).not.toContain('signal')
  expect(page.url()).not.toContain('rationale')

  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Let us choose one useful next step for this signal.')).toBeVisible()
  expect(chatMessages).toHaveLength(1)
  expect(chatMessages[0].content).toContain('You missed "Walk outside"')
  expect(chatMessages[0].content).not.toContain('unrelated existing plan')
})

test('the previous Daily Signal contract degrades to safe informational guidance', async ({ page }) => {
  await mockToday(page)
  await page.route('**/api/ai/daily-context?**', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? '2026-07-15'
    await route.fulfill({
      json: {
        date,
        generatedAt: `${date}T14:00:00.000Z`,
        day: {
          tasks: [],
          calorieEntries: [],
          weight: null,
          achievements: [],
          workoutSessions: [],
          calendarEvents: [],
        },
        lookback: {
          habitHistory: { windowDays: 3, days: [] },
          calorieHistory: { windowDays: 7, days: [] },
          workoutHistory: { windowDays: 14, days: [] },
        },
        signals: [{
          id: `${date}:schedule_overload:morning`,
          type: 'schedule_overload',
          severity: 'medium',
          confidence: 'high',
          summary: 'Your morning has three scheduled items totaling about 180 minutes.',
          evidence: {
            window: 'morning',
            itemIds: ['task-1', 'task-2', 'task-3'],
          },
          suggestedAction: {
            type: 'move_to_anytime',
            label: 'Move one item to Anytime',
          },
        }],
      },
    })
  })
  await page.goto('/app')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const signal = page.getByRole('listitem').filter({ hasText: 'Information' })

  await expect(signal).toContainText('previous Daily Signals contract')
  await expect(signal).toContainText('Informational until server refresh')
  await expect(signal.getByRole('button', { name: /Review change|Apply/ })).toHaveCount(0)
})

test('Daily Signals render an explicit no-signal state', async ({ page }) => {
  await mockToday(page, { signals: () => [] })
  await page.goto('/app')

  await expect(page.getByText('No Daily Signals need attention.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0)
})

test('completion feedback is undoable, silent, and preserves text selection', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as Window & { __healthyFlowVibrationCalls: VibratePattern[] }
    state.__healthyFlowVibrationCalls = []
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: VibratePattern) => {
        state.__healthyFlowVibrationCalls.push(pattern)
        return true
      },
    })
  })
  await mockToday(page)

  let undoRequested = false
  await page.route('**/api/tasks/complete/task-focus', (route) => route.fulfill({
    json: {
      id: 'task-focus',
      userId: 'today-workspace-user',
      title: 'Finish the product brief',
      type: 'task',
      category: 'work',
      completed: true,
      scheduledDate: '2026-07-15',
      startTime: '09:30',
      duration: 60,
      repeat: 'none',
      position: null,
      createdAt: '2026-07-15T08:00:00.000Z',
    },
  }))
  await page.route('**/api/tasks/task-focus', async (route) => {
    undoRequested = true
    await route.fulfill({
      json: {
        id: 'task-focus',
        userId: 'today-workspace-user',
        title: 'Finish the product brief',
        type: 'task',
        category: 'work',
        completed: false,
        scheduledDate: '2026-07-15',
        startTime: '09:30',
        duration: 60,
        repeat: 'none',
        position: null,
        createdAt: '2026-07-15T08:00:00.000Z',
      },
    })
  })
  await page.goto('/app')

  const task = page.locator('[data-testid="timeline-draggable-task"]').filter({
    hasText: 'Finish the product brief',
  }).first()
  const title = task.getByRole('heading', { name: 'Finish the product brief' })
  expect(await title.evaluate((element) => getComputedStyle(element).userSelect)).not.toBe('none')

  await task.getByRole('button', { name: 'Check task' }).click()
  const undo = page.getByRole('button', { name: 'Undo completion of Finish the product brief' })
  await expect(undo).toBeVisible()
  expect(await page.evaluate(() => (
    window as Window & { __healthyFlowVibrationCalls: VibratePattern[] }
  ).__healthyFlowVibrationCalls)).toEqual([])

  await undo.click()
  await expect.poll(() => undoRequested).toBe(true)
})

for (const viewport of viewports) {
  test(`dense Today decision workspace at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockToday(page)
    await page.goto('/app')

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

for (const viewport of viewports) {
  test(`dense Today white-theme workspace at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockToday(page, { theme: 'white' })
    await page.goto('/app')

    await expect(page.locator('#loading-screen')).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    await expect(page.locator('[data-demo-id="decision-band"]')).toBeVisible()
    await expect(page.locator('[data-demo-id="daily-signals-summary"]')).toBeVisible()
    await expect(page.locator('[data-demo-id="anytime-backlog"]')).toBeVisible()
    await expect(page.locator('[data-demo-id="schedule-section"]')).toBeVisible()
    await expect(page).toHaveScreenshot(`today-workspace-white-${viewport.name}.png`, {
      animations: 'disabled',
      fullPage: true,
    })
  })
}

for (const viewport of viewports) {
  test(`Day Context preserves honest module states at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    let contextState: DayContextState = 'mixed'
    let summaryUnavailable = false
    await page.setViewportSize(viewport)
    await mockToday(page, {
      summary: (date) => dayContextState(date, contextState),
      summaryError: () => summaryUnavailable,
    })
    await page.goto('/app')

    const context = page.locator('[data-demo-id="day-context"]')
    const habitsButton = context.getByRole('button', { name: /Habits/ })
    await expect(habitsButton).toHaveAttribute('aria-expanded', 'false')
    await habitsButton.click()
    const habitsPanelId = await habitsButton.getAttribute('aria-controls')
    expect(habitsPanelId).toBeTruthy()
    const habitsPanel = page.locator(`#${habitsPanelId}`)
    await expect(habitsPanel).toBeVisible()
    await expect(habitsPanel.getByText('10 of 20 min')).toBeVisible()
    await expect(habitsPanel.getByText('Partial', { exact: true })).toBeVisible()
    await expect(habitsPanel.getByText('Completed', { exact: true })).toBeVisible()
    await expect(habitsPanel.getByText('Not done', { exact: true })).toBeVisible()
    await expect(habitsPanel.getByRole('progressbar', { name: 'Walk outside Habit progress' })).toHaveAttribute('aria-valuenow', '10')
    await habitsPanel.focus()
    await habitsPanel.press('Escape')
    await expect(habitsButton).toHaveAttribute('aria-expanded', 'false')
    await expect(habitsButton).toBeFocused()

    const nutritionButton = context.getByRole('button', { name: /Nutrition and Weight/ })
    await expect(nutritionButton).toContainText('0 kcal')
    await nutritionButton.click()
    const nutritionPanel = page.locator(`#${await nutritionButton.getAttribute('aria-controls')}`)
    await expect(nutritionPanel.getByText('0g', { exact: true }).first()).toBeVisible()
    await expect(nutritionPanel.getByText('12g known', { exact: true })).toBeVisible()
    await expect(nutritionPanel.getByText('0g known', { exact: true })).toBeVisible()
    await expect(nutritionPanel.getByText('Not recorded on this date')).toBeVisible()

    const workoutButton = context.getByRole('button', { name: /Workout/ })
    await expect(workoutButton).toContainText('1 logged session')
    await workoutButton.click()
    const workoutPanel = page.locator(`#${await workoutButton.getAttribute('aria-controls')}`)
    await expect(workoutPanel.getByText('Scheduled Workout Items')).toHaveCount(0)
    await expect(workoutPanel.getByText('Logged Workout sessions')).toBeVisible()
    await expect(workoutPanel.getByText('Logged strength')).toBeVisible()
    await expect(workoutPanel.getByText('Squat')).toBeVisible()
    await expect(workoutPanel.getByText('3 sets · 5 reps · 62.5 kg')).toBeVisible()
    await expect(workoutPanel.getByText('Run')).toBeVisible()
    await expect(workoutPanel.getByText('20 min · 3.2 km')).toBeVisible()
    await habitsButton.click()
    await expect(context).toHaveScreenshot(`today-day-context-${viewport.name}.png`, {
      animations: 'disabled',
    })

    contextState = 'empty'
    await page.reload()
    await expect(context.getByRole('button', { name: /Habits/ })).toContainText('No Habits due this day')
    await expect(context.getByRole('button', { name: /Nutrition and Weight/ })).toContainText('Calories not logged · Weight not recorded')
    await expect(context.getByRole('button', { name: /Workout/ })).toContainText('No logged sessions')

    contextState = 'unavailable'
    await page.reload()
    await expect(context.getByRole('button', { name: /Nutrition and Weight/ })).toContainText('Calorie entries unavailable · Weight unavailable')
    await expect(context.getByRole('button', { name: /Workout/ })).toContainText('Logged sessions unavailable')

    contextState = 'disabled'
    await page.reload()
    await expect(context.getByRole('button', { name: /Habits/ })).toBeVisible()
    await expect(context.getByRole('button', { name: /Nutrition and Weight/ })).toHaveCount(0)
    await expect(context.getByRole('button', { name: /Workout/ })).toHaveCount(0)

    summaryUnavailable = true
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Could not load this daily plan' })).toBeVisible()
    await expect(page.getByText('No Habits due this day')).toHaveCount(0)
  })
}

test('layout follows workspace width and preserves the mobile reading order', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await mockToday(page)
  await page.goto('/app')

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
  await page.goto('/app')

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
  await page.goto('/app')
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

test('mobile Today swipe changes one day while vertical and interactive gestures stay put', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockToday(page)
  await page.goto('/app')

  const swipeSurface = '[data-testid="today-swipe-surface"]'
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()

  await dispatchSwipe(page, swipeSurface, { x: 320, y: 240 }, { x: 180, y: 248 })
  await expect(page.getByRole('heading', { name: 'Tomorrow', exact: true })).toBeVisible()

  await dispatchSwipe(page, swipeSurface, { x: 90, y: 240 }, { x: 230, y: 232 })
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()

  await dispatchSwipe(page, swipeSurface, { x: 220, y: 220 }, { x: 230, y: 360 })
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()

  await dispatchSwipe(page, '[data-demo-id="talk-button"]', { x: 320, y: 40 }, { x: 160, y: 45 })
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
})

test('frequent controls meet touch size and disclosures preserve keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockToday(page)
  await page.goto('/app')

  for (const name of ['Talk', 'Add', 'Previous day', 'Next day', 'Review', 'Show all 4']) {
    const control = page.getByRole(name === 'Talk' || name === 'Add' ? 'link' : 'button', { name }).first()
    await expect(control).toBeVisible()
    const box = await control.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }

  for (const name of ['Habits', 'Nutrition and Weight', 'Workout']) {
    const control = page.locator('[data-demo-id="day-context"]').getByRole('button', { name: new RegExp(name) })
    await expect(control).toBeVisible()
    const box = await control.boundingBox()
    expect(box).not.toBeNull()
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

  const detailsId = await closeReview.getAttribute('aria-controls')
  const signal = page.locator(`[id="${detailsId}"] [tabindex="-1"]`).first()
  await signal.focus()
  await signal.press('Escape')
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeFocused()
})

test('decision, signal, and Anytime regions pass targeted accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockToday(page)
  await page.goto('/app')

  for (const selector of [
    '[data-demo-id="decision-band"]',
    '[data-demo-id="daily-signals-summary"]',
    '[data-demo-id="anytime-backlog"]',
  ]) {
    await expect(page.locator(selector)).toBeVisible()
  }
  await page.getByRole('button', { name: 'Review', exact: true }).click()

  const results = await new AxeBuilder({ page })
    .include('[data-demo-id="decision-band"]')
    .include('[data-demo-id="daily-signals-summary"]')
    .include('[data-demo-id="anytime-backlog"]')
    .include('[data-demo-id="day-context"]')
    .analyze()

  expect(results.violations).toEqual([])
})
