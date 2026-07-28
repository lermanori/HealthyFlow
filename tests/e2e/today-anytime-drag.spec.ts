import { expect, test, type Page, type Route } from '@playwright/test'
import type { DaySummaryItem } from '../../backend/src/day-summary-schema'
import { daySummaryFixture } from './fixtures/day-summary'

const DATE = new Date().toISOString().slice(0, 10)
const HABIT_PARENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const VIRTUAL_HABIT_ID = `${HABIT_PARENT_ID}-${DATE}`
const MATERIALIZED_HABIT_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

type MutableItem = Pick<DaySummaryItem, 'id' | 'title'> & Partial<DaySummaryItem>

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
  planningWindow: null,
  onboardingStatus: 'completed',
  theme: 'midnight',
}

function initialItems(): MutableItem[] {
  return [
    { id: 'timed-plan', title: 'Timed plan', category: 'work', startTime: '10:00', duration: 60, scheduledDate: DATE },
    { id: 'flex-25', title: 'Flexible 25', category: 'personal', startTime: null, duration: 25, position: 0, scheduledDate: DATE },
    { id: 'flex-35', title: 'Flexible 35', category: 'personal', startTime: null, duration: 35, position: 1, scheduledDate: DATE },
    { id: 'flex-unknown', title: 'Flexible unknown', category: 'personal', startTime: null, duration: null, position: 2, scheduledDate: DATE },
    {
      id: VIRTUAL_HABIT_ID,
      title: 'Virtual stretch',
      type: 'habit',
      category: 'health',
      startTime: null,
      duration: 20,
      position: 3,
      scheduledDate: DATE,
      repeat: 'daily',
      isHabitInstance: true,
      originalHabitId: HABIT_PARENT_ID,
      habitInfo: { target: { value: 20, unit: 'minutes' }, outcome: 'pending', progressTotal: 0 },
    },
    { id: 'flex-complete', title: 'Flexible complete', category: 'personal', startTime: null, duration: 15, completed: true, position: 4, scheduledDate: DATE },
  ]
}

async function setupDragWorkspace(page: Page, options: { failFirstReorder?: boolean } = {}) {
  let items = initialItems()
  const virtualHabit = structuredClone(items.find(item => item.id === VIRTUAL_HABIT_ID)!)
  let failNextReorder = options.failFirstReorder ?? false
  let reorderCalls = 0
  let rollbackCalls = 0

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
    return route.fulfill({ json: daySummaryFixture({ date, items }) })
  })

  await page.route('**/api/tasks/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (method === 'PATCH' && url.pathname.endsWith('/tasks/reorder')) {
      reorderCalls += 1
      if (failNextReorder) {
        failNextReorder = false
        return route.fulfill({ status: 500, json: { error: 'Database error' } })
      }

      const { ids } = request.postDataJSON() as { ids: string[] }
      const order = new Map(ids.map((id, index) => [id, index]))
      items = items
        .map(item => order.has(item.id) ? { ...item, position: order.get(item.id)! } : item)
        .sort((left, right) => {
          if (left.startTime && !right.startTime) return -1
          if (!left.startTime && right.startTime) return 1
          if (!left.startTime && !right.startTime) {
            return (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)
          }
          return 0
        })
      return route.fulfill({ json: { success: true, updated: ids.length } })
    }

    if (method === 'POST' && url.pathname.endsWith('/rollback-drag-materialization')) {
      rollbackCalls += 1
      items = items.map(item => item.id === MATERIALIZED_HABIT_ID ? structuredClone(virtualHabit) : item)
      return route.fulfill({ json: { success: true } })
    }

    if (method === 'PUT') {
      const id = decodeURIComponent(url.pathname.split('/').pop()!)
      const updates = request.postDataJSON() as Partial<DaySummaryItem>
      const index = items.findIndex(item => item.id === id)
      if (index < 0) return route.fulfill({ status: 404, json: { error: 'Not found' } })

      const nextId = id === VIRTUAL_HABIT_ID ? MATERIALIZED_HABIT_ID : id
      const updated = {
        ...items[index],
        ...updates,
        id: nextId,
        startTime: updates.startTime === undefined ? items[index].startTime : updates.startTime,
        position: updates.position === undefined ? items[index].position : updates.position,
        ...(items[index].type === 'habit'
          ? { isHabitInstance: true, originalHabitId: HABIT_PARENT_ID }
          : {}),
      }
      items[index] = updated
      return route.fulfill({ json: updated })
    }

    return route.continue()
  })

  return {
    getItems: () => items,
    getReorderCalls: () => reorderCalls,
    getRollbackCalls: () => rollbackCalls,
  }
}

async function dragWithMouse(
  page: Page,
  source: ReturnType<Page['locator']>,
  destination: ReturnType<Page['locator']>,
  destinationOffsetY?: number
) {
  await source.scrollIntoViewIfNeeded()
  await source.hover()
  await page.waitForTimeout(50)
  const sourceBox = await source.boundingBox()
  expect(sourceBox).not.toBeNull()

  const start = {
    x: sourceBox!.x + sourceBox!.width / 2,
    y: sourceBox!.y + sourceBox!.height / 2,
  }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 4, start.y + 4, { steps: 2 })
  await page.mouse.move(start.x + 20, start.y + 20, { steps: 5 })
  await expect(page.locator('.today-plan-grid')).toHaveAttribute('data-drag-layout', 'expanded')

  // Pre-capture expansion changes the measured timeline. Resolve the destination
  // after lift so the pointer uses the same geometry as the drag engine.
  const destinationBox = await destination.boundingBox()
  expect(destinationBox).not.toBeNull()
  const viewport = page.viewportSize()
  const visibleTop = viewport ? Math.max(16, destinationBox!.y) : destinationBox!.y
  const visibleBottom = viewport
    ? Math.min(viewport.height - 16, destinationBox!.y + destinationBox!.height)
    : destinationBox!.y + destinationBox!.height
  const desiredY = destinationOffsetY === undefined
    ? (visibleTop + visibleBottom) / 2
    : destinationBox!.y + destinationOffsetY
  const end = {
    x: destinationBox!.x + destinationBox!.width / 2,
    y: Math.min(visibleBottom, Math.max(visibleTop, desiredY)),
  }
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await page.mouse.up()
}

async function dispatchTouch(
  page: Page,
  type: 'touchstart' | 'touchmove' | 'touchend',
  sourceSelector: string,
  point: { x: number; y: number }
) {
  await page.evaluate(({ eventType, selector, x, y }) => {
    const source = document.querySelector(selector)
    if (!(source instanceof HTMLElement)) throw new Error(`Touch source not found: ${selector}`)
    const touch = new Touch({
      identifier: 1,
      target: source,
      clientX: x,
      clientY: y,
      pageX: x + window.scrollX,
      pageY: y + window.scrollY,
      screenX: x,
      screenY: y,
      radiusX: 8,
      radiusY: 8,
      rotationAngle: 0,
      force: 0.5,
    })
    const activeTouches = eventType === 'touchend' ? [] : [touch]
    const event = new TouchEvent(eventType, {
      bubbles: true,
      cancelable: true,
      touches: activeTouches,
      targetTouches: activeTouches,
      changedTouches: [touch],
    })
    if (eventType === 'touchstart') source.dispatchEvent(event)
    else window.dispatchEvent(event)
  }, { eventType: type, selector: sourceSelector, ...point })
}

async function dragWithTouch(page: Page, sourceSelector: string, destination: ReturnType<Page['locator']>) {
  const source = page.locator(sourceSelector)
  await source.scrollIntoViewIfNeeded()
  const sourceBox = await source.boundingBox()
  expect(sourceBox).not.toBeNull()
  const start = {
    x: sourceBox!.x + sourceBox!.width / 2,
    y: sourceBox!.y + sourceBox!.height / 2,
  }

  await dispatchTouch(page, 'touchstart', sourceSelector, start)
  await page.waitForTimeout(150)
  await expect(page.locator('.today-plan-grid')).toHaveAttribute('data-drag-layout', 'expanded')

  const destinationBox = await destination.boundingBox()
  expect(destinationBox).not.toBeNull()
  const viewport = page.viewportSize()
  const visibleTop = viewport ? Math.max(16, destinationBox!.y) : destinationBox!.y
  const visibleBottom = viewport
    ? Math.min(viewport.height - 16, destinationBox!.y + destinationBox!.height)
    : destinationBox!.y + destinationBox!.height
  const end = {
    x: destinationBox!.x + destinationBox!.width / 2,
    y: (visibleTop + visibleBottom) / 2,
  }

  for (let step = 1; step <= 8; step += 1) {
    await dispatchTouch(page, 'touchmove', sourceSelector, {
      x: start.x + ((end.x - start.x) * step) / 8,
      y: start.y + ((end.y - start.y) * step) / 8,
    })
    await page.waitForTimeout(20)
  }
  await page.waitForTimeout(50)
  await dispatchTouch(page, 'touchend', sourceSelector, end)
}

test('compact Anytime summary is honest, inline, date-scoped, and touch-sized', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setupDragWorkspace(page)
  await page.goto('/app')

  await expect(page.getByTestId('anytime-summary')).toHaveText('4 incomplete · 80 min known · 1 without duration')
  await expect(page.locator('.today-anytime-item:visible')).toHaveCount(2)

  const handles = page.locator('.today-anytime-item:visible [data-timeline-drag-handle="true"]')
  await expect(handles).toHaveCount(2)
  for (const handle of await handles.all()) {
    const box = await handle.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }

  const disclosure = page.locator('.today-anytime-disclosure')
  await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.today-anytime-item:visible')).toHaveCount(5)

  await page.getByRole('button', { name: 'Next day', exact: true }).click()
  await expect(page.locator('.today-anytime-item:visible')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Show all 5', exact: true })).toHaveAttribute('aria-expanded', 'false')
})

test('wide workspace keeps the full Anytime list visible without squeezing the schedule', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupDragWorkspace(page)
  await page.goto('/app')

  await expect(page.locator('.today-anytime-item:visible')).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Show all 5', exact: true })).toBeHidden()

  const schedule = await page.locator('[data-demo-id="schedule-section"]').boundingBox()
  const anytime = await page.locator('[data-demo-id="anytime-backlog"]').boundingBox()
  expect(schedule).not.toBeNull()
  expect(anytime).not.toBeNull()
  expect(schedule!.width).toBeGreaterThan(650)
  expect(schedule!.x + schedule!.width).toBeLessThan(anytime!.x)
})

test('keyboard drag expands all hours, reorders Anytime, restores focus, and persists', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const state = await setupDragWorkspace(page)
  await page.goto('/app')

  const handle = page.getByRole('button', { name: 'Move Flexible 25', exact: true })
  await handle.press('Space')
  await expect(page.locator('.today-plan-grid')).toHaveAttribute('data-drag-layout', 'expanded')
  await expect(page.locator('[data-slot="06:00"]')).toHaveCSS('height', '72px')

  await handle.press('ArrowDown')
  await expect(page.getByRole('status', { name: 'Schedule changes' })).toContainText('Anytime, position 2')
  await handle.press('Space')

  await expect(page.locator('.today-plan-grid')).not.toHaveAttribute('data-drag-layout', 'expanded')
  await expect(page.locator('[data-slot="06:00"]')).toHaveCSS('height', '28px')
  await expect(handle).toBeFocused()
  await expect.poll(state.getReorderCalls).toBeGreaterThan(0)

  await page.reload()
  const rows = page.locator('#anytime-items .today-anytime-item')
  await expect(rows).toHaveCount(5)
  await expect(rows.nth(0)).toContainText('Flexible 35')
  await expect(rows.nth(1)).toContainText('Flexible 25')

  await handle.press('Space')
  await handle.press('Escape')
  await expect(page.getByRole('status', { name: 'Schedule changes' })).toContainText('move cancelled')
  await expect(handle).toBeFocused()
})

test('mouse drag moves Items across Schedule and Anytime and materializes a virtual Habit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupDragWorkspace(page)
  await page.goto('/app')

  const timedGrip = page.locator('[data-timeline-drag-id="timed-plan"] [data-timeline-drag-handle="true"]')
  await dragWithMouse(page, timedGrip, page.locator('#anytime-items'))
  await expect(page.locator('#anytime-items [data-timeline-drag-id="timed-plan"]')).toBeVisible()

  await page.reload()
  await expect(page.locator('#anytime-items [data-timeline-drag-id="timed-plan"]')).toBeVisible()

  const virtualGrip = page.locator(`[data-timeline-drag-id="${VIRTUAL_HABIT_ID}"] [data-timeline-drag-handle="true"]`)
  await dragWithMouse(page, virtualGrip, page.locator('[data-slot="10:00"]'))
  await expect(page.locator(`[data-demo-id="schedule-section"] [data-timeline-drag-id="${MATERIALIZED_HABIT_ID}"]`)).toBeVisible()
  await expect(page.locator(`[data-timeline-drag-id="${VIRTUAL_HABIT_ID}"]`)).toHaveCount(0)

  await page.reload()
  await expect(page.locator(`[data-demo-id="schedule-section"] [data-timeline-drag-id="${MATERIALIZED_HABIT_ID}"]`)).toBeVisible()
})

test('touch drag moves an Anytime Item into the schedule', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupDragWorkspace(page)
  await page.goto('/app')

  const sourceSelector = '[data-timeline-drag-id="flex-35"] [data-timeline-drag-handle="true"]'
  await dragWithTouch(page, sourceSelector, page.locator('[data-slot="09:00"]'))

  await expect(page.locator('[data-demo-id="schedule-section"] [data-timeline-drag-id="flex-35"]')).toBeVisible()
  await expect(page.locator('.today-plan-grid')).not.toHaveAttribute('data-drag-layout', 'expanded')
})

test('failed virtual Habit reorder restores its synthetic id, order, layout, and announcement', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const state = await setupDragWorkspace(page, { failFirstReorder: true })
  await page.goto('/app')

  const virtualGrip = page.locator(`[data-timeline-drag-id="${VIRTUAL_HABIT_ID}"] [data-timeline-drag-handle="true"]`)
  const firstRow = page.locator('#anytime-items .today-anytime-item').nth(0)
  await dragWithMouse(page, virtualGrip, firstRow, 8)

  await expect(
    page.locator('[id="_rht_toaster"]').getByText('Virtual stretch could not be moved. Its original position was restored.')
  ).toBeVisible()
  await expect(page.locator(`[data-timeline-drag-id="${VIRTUAL_HABIT_ID}"]`)).toBeVisible()
  await expect(page.locator(`[data-timeline-drag-id="${MATERIALIZED_HABIT_ID}"]`)).toHaveCount(0)
  await expect(page.locator('.today-plan-grid')).not.toHaveAttribute('data-drag-layout', 'expanded')
  await expect(page.locator('[data-slot="06:00"]')).toHaveCSS('height', '28px')
  await expect.poll(state.getRollbackCalls).toBe(1)

  const restoredItems = state.getItems().filter(item => !item.startTime)
  expect(restoredItems.map(item => item.id)).toEqual([
    'flex-25',
    'flex-35',
    'flex-unknown',
    VIRTUAL_HABIT_ID,
    'flex-complete',
  ])
})
