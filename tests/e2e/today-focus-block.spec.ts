/**
 * Phase 2 exit scenario, on Today.
 *
 * A Focus block created in Work appears at its scheduled hour, starts from
 * Today, survives reload, enters review, and creates a Work session — and no
 * ordinary Task is ever created as a substitute.
 *
 * Hermetic: every response is route-mocked, and the fake server enforces the
 * real transition state machine so the UI cannot pass by guessing. Persistence
 * itself is covered by backend/tests/work-day.test.ts and work-routes.test.ts.
 */

import { expect, test, type Page, type Route } from '@playwright/test'
import { daySummaryFixture, daySummaryFocusBlock } from './fixtures/day-summary'

const DATE = new Date().toISOString().slice(0, 10)
const BLOCK_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '33333333-3333-4333-8333-333333333333'
const REVIEW_ID = '55555555-5555-4555-8555-555555555555'
const SESSION_ID = '66666666-6666-4666-8666-666666666666'

const settings = {
  notifications: false,
  dailyReminders: false,
  weeklyReports: true,
  aiSuggestions: true,
  smartReminders: false,
  completionSounds: false,
  calorieIntake: false,
  achievementTracker: false,
  workoutTracker: false,
  weekStartsOn: 1,
  planningWindow: null,
  onboardingStatus: 'completed',
  theme: 'midnight',
}

function initialBlock() {
  return daySummaryFocusBlock({
    id: BLOCK_ID,
    projectId: PROJECT_ID,
    taskIds: [TASK_ID],
    startTime: '14:00',
    scheduledDate: DATE,
    plannedMinutes: 45,
    intendedOutcome: 'Reminder emails send on schedule',
    intendedEvidence: 'A passing reminder smoke test',
    project: {
      id: PROJECT_ID,
      name: 'InvoiceFlow',
      color: '#22d3ee',
      target: 'Ship invoice reminders',
      milestone: 'Reminders send on schedule',
    },
    tasks: [{ id: TASK_ID, title: 'Wire the reminder cron', status: 'open', relation: 'Unblocking', scheduledDate: DATE, duration: 45 }],
  })
}

async function setupWorkspace(page: Page) {
  let block: Record<string, any> = initialBlock()
  let sessionsCreated = 0
  const createdTasks: unknown[] = []

  await page.route('**/api/settings', route => route.fulfill({ json: settings }))
  await page.route('**/api/proactivity/rhythm', route => route.fulfill({
    json: {
      timezone: 'UTC',
      morning: { enabled: false, time: '08:00', days: [], lastSent: null },
      midday: { enabled: false, time: '13:00', days: [], lastSent: null },
      weekly: { enabled: false, time: '17:00', day: 0, lastSent: null },
    },
  }))
  await page.route('**/api/ai/daily-context?**', route => route.fulfill({ json: { signals: [] } }))

  await page.route('**/api/day-summary?**', route => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? DATE
    return route.fulfill({ json: daySummaryFixture({ date, items: [], focusBlocks: [block as never] }) })
  })

  // The real state machine: an invalid transition is a 409, never a silent pass.
  await page.route('**/api/work/focus-blocks/**', async (route: Route) => {
    const url = new URL(route.request().url())

    if (url.pathname.endsWith('/transition')) {
      const { action } = route.request().postDataJSON() as { action: string }
      const status = block.status
      const allowed =
        (action === 'start' && status === 'planned') ||
        (['finish', 'blocked', 'drift'].includes(action) && status === 'active') ||
        (action === 'continue' && status === 'reviewing') ||
        (action === 'cancel' && ['planned', 'active', 'reviewing'].includes(status))
      if (!allowed) {
        return route.fulfill({ status: 409, json: { error: `Cannot ${action} a ${status} Focus block` } })
      }

      if (action === 'start') block = { ...block, status: 'active', startedAt: new Date().toISOString() }
      else if (action === 'continue') block = { ...block, status: 'active', reviewTrigger: null, endedAt: null }
      else if (action === 'cancel') block = { ...block, status: 'canceled' }
      else {
        const trigger = action === 'finish' ? 'finished' : action === 'blocked' ? 'blocked' : 'drifted'
        block = { ...block, status: 'reviewing', reviewTrigger: trigger, endedAt: new Date().toISOString() }
      }
      return route.fulfill({ json: block })
    }

    if (url.pathname.endsWith('/review')) {
      sessionsCreated += 1
      const input = route.request().postDataJSON() as Record<string, any>
      block = { ...block, status: 'completed' }
      // Shaped like the real ReviewCompletion — the client Zod-parses it, so a
      // stub would fail the same way a broken server would.
      const review = {
        id: REVIEW_ID,
        focusBlockId: BLOCK_ID,
        trigger: 'finished',
        whatChanged: input.whatChanged,
        evidenceProduced: input.evidenceProduced ?? '',
        milestoneImpact: input.milestoneImpact,
        whatGotInWay: input.whatGotInWay ?? '',
        unnecessaryWork: input.unnecessaryWork ?? '',
        actualMinutes: input.actualMinutes,
        nextStep: input.nextStep,
        attention: input.attention,
        confirmedUpdates: input.updates ?? { tasks: [], project: {} },
        createdAt: new Date().toISOString(),
      }
      return route.fulfill({
        status: 201,
        json: {
          focusBlock: block,
          review,
          session: {
            id: SESSION_ID,
            projectId: PROJECT_ID,
            focusBlockId: BLOCK_ID,
            taskIds: [TASK_ID],
            standaloneTitle: null,
            standaloneContext: null,
            plannedMinutes: 45,
            actualMinutes: input.actualMinutes,
            outcome: input.whatChanged,
            evidence: input.evidenceProduced ?? null,
            attention: input.attention,
            blockerInfo: null,
            driftInfo: null,
            nextStep: input.nextStep,
            occurredAt: new Date().toISOString(),
            startedAt: block.startedAt ?? null,
            endedAt: new Date().toISOString(),
            review,
          },
        },
      })
    }

    return route.continue()
  })

  // Nothing in this flow may create an ordinary Task.
  await page.route('**/api/tasks', async (route: Route) => {
    if (route.request().method() === 'POST') createdTasks.push(route.request().postDataJSON())
    return route.fulfill({ json: {} })
  })

  return {
    getBlock: () => block,
    getSessionsCreated: () => sessionsCreated,
    getCreatedTasks: () => createdTasks,
  }
}

test('a Focus block runs its whole life from Today without becoming a Task', async ({ page }) => {
  const workspace = await setupWorkspace(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/app')
  await expect(page.locator('#loading-screen')).toBeHidden()

  // Appears at its scheduled hour, reading as Focus rather than as a Task.
  const slot = page.locator('[data-demo-id="schedule-slot-14:00"]')
  const row = slot.getByTestId('timeline-focus-block')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Ship invoice reminders')
  await expect(row).toContainText('InvoiceFlow')
  await expect(row).toHaveAttribute('data-focus-block-status', 'planned')

  // The hour must not collapse to the compact empty height around a Focus
  // block — if it does, the row overflows into the next hour and the now-marker
  // covers this button.
  await expect(slot).toHaveAttribute('data-compacted', 'false')

  // Start opens the overlay with the target and a running clock.
  await row.getByRole('button', { name: 'Start focus block' }).click()
  const overlay = page.getByTestId('focus-block-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('Ship invoice reminders')
  await expect(overlay).toContainText('of 45 planned minutes')
  await expect(overlay).toContainText('Wire the reminder cron')

  // Survives a reload: still active, still timing from the persisted start.
  await page.reload()
  await expect(page.locator('#loading-screen')).toBeHidden()
  await expect(page.getByTestId('focus-block-overlay')).toBeVisible()

  // Minimize keeps the block running and leaves a Resume affordance.
  await page.getByRole('button', { name: 'Back to Today' }).click()
  await expect(page.getByTestId('focus-block-overlay')).toBeHidden()
  await expect(row).toHaveAttribute('data-focus-block-status', 'active')
  await expect(row.getByRole('button', { name: /Resume/ })).toBeVisible()

  // Esc from the reopened overlay also minimizes rather than ending the block.
  await row.getByRole('button', { name: /Resume/ }).click()
  await expect(page.getByTestId('focus-block-overlay')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('focus-block-overlay')).toBeHidden()
  expect(workspace.getBlock().status).toBe('active')

  // Finishing enters review as a sheet over the day.
  await row.getByRole('button', { name: /Resume/ }).click()
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  const sheet = page.getByTestId('work-review-sheet')
  await expect(sheet).toBeVisible()
  await expect(page.getByTestId('focus-block-overlay')).toBeHidden()

  // Completing the review creates exactly one Work session.
  await sheet.getByLabel(/What changed/).fill('Cron wired, retries still failing')
  await sheet.getByLabel(/Smallest valuable next step/).fill('Define the retry policy')
  await sheet.getByRole('button', { name: /Complete review and create Work session/ }).click()

  await expect(sheet).toBeHidden()
  await expect(row).toHaveAttribute('data-focus-block-status', 'completed')
  expect(workspace.getSessionsCreated()).toBe(1)

  // The whole flow created no ordinary Task as a substitute.
  expect(workspace.getCreatedTasks()).toEqual([])
})

test('a block scheduled for another day shows but cannot be started', async ({ page }) => {
  await setupWorkspace(page)
  await page.goto('/app')
  await expect(page.locator('#loading-screen')).toBeHidden()

  await page.getByRole('button', { name: 'Next day', exact: true }).click()

  const row = page.getByTestId('timeline-focus-block')
  await expect(row).toHaveCount(1)
  await expect(row.getByRole('button', { name: 'Start focus block' })).toHaveCount(0)
})
