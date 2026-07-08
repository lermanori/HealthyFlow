import { test, expect } from './fixtures/ai-stubs'

function formatLocalDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('healthyflow-assistant-conversations-v1')
  })
})

test('Mobile assistant composer wraps long text instead of hiding it off-screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/talk')

  const mainBox = await page.locator('main').boundingBox()
  const talkSurfaceBox = await page.locator('main > div > div').first().boundingBox()
  const bottomNavBox = await page.locator('div.fixed.bottom-0.left-0.right-0').boundingBox()
  expect(mainBox).toBeTruthy()
  expect(talkSurfaceBox).toBeTruthy()
  expect(bottomNavBox).toBeTruthy()
  expect(Math.round(talkSurfaceBox!.x - mainBox!.x)).toBe(0)
  expect(Math.round(mainBox!.width - talkSurfaceBox!.width)).toBe(0)
  expect(Math.abs((talkSurfaceBox!.y + talkSurfaceBox!.height) - bottomNavBox!.y)).toBeLessThanOrEqual(1)
  await expect(page.getByRole('contentinfo')).toHaveCount(0)

  const composer = page.getByPlaceholder(/Add anything/)
  await expect(composer).toBeVisible()
  await expect(page.getByLabel('Assistant model')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add manually' })).toBeHidden()
  const initialBox = await composer.boundingBox()
  const initialShell = await page.locator('form > div').filter({ has: composer }).boundingBox()
  expect(initialBox).toBeTruthy()
  expect(initialShell).toBeTruthy()
  expect(initialBox!.height).toBeLessThanOrEqual(48)
  expect(initialShell!.height).toBeLessThanOrEqual(100)
  await composer.fill('plan a focused morning block then add groceries and send the workout notes')

  const box = await composer.boundingBox()
  const composerShell = await page.locator('form > div').filter({ has: composer }).boundingBox()
  expect(box).toBeTruthy()
  expect(composerShell).toBeTruthy()
  expect(box!.width).toBeGreaterThan(120)
  expect(box!.height).toBeLessThanOrEqual(48)
  expect(composerShell!.height).toBeGreaterThan(box!.height)
  expect(Math.abs((composerShell!.y + composerShell!.height) - bottomNavBox!.y)).toBeLessThanOrEqual(12)
})

test('Confirmed assistant task appears on Today without a browser refresh', async ({ page }) => {
  const today = formatLocalDate(new Date())
  const title = `Assistant cache task ${Date.now()}`
  let created = false

  await page.route('**/api/tasks**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const requestUrl = new URL(route.request().url())
    const requestedDate = requestUrl.searchParams.get('date')
    const tasks = created && requestedDate === today
      ? [{
          id: 'assistant-created-task',
          title,
          category: 'personal',
          type: 'task',
          repeat: 'none',
          completed: false,
          scheduledDate: today,
          startTime: null,
          duration: 30,
          location: null,
          createdAt: new Date().toISOString(),
          position: null,
          googleEventId: null,
          syncedToGoogle: false,
          googleSyncStatus: 'skipped',
        }]
      : []
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(tasks) })
  })
  await page.route('**/api/calendar/google/events**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/calories**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/ai/chat', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Prepared a Task for confirmation.',
        toolEvents: [],
        pendingActions: [{
          id: 'pending-add-task',
          capability: 'add_task',
          args: { title, category: 'personal', scheduledDate: today },
          preview: { title, category: 'personal', scheduledDate: today },
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        }],
      }),
    })
  )
  await page.route('**/api/ai/chat/confirm', async (route) => {
    created = true
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        result: { item: { id: 'assistant-created-task', title } },
        action: {
          id: 'pending-add-task',
          capability: 'add_task',
          args: { title, category: 'personal', scheduledDate: today },
          preview: { title, category: 'personal', scheduledDate: today },
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      }),
    })
  })

  await page.goto('/')
  await expect(page.getByText(title)).toHaveCount(0)

  await page.goto('/talk')
  await page.getByPlaceholder(/Add anything/).fill(`add ${title} today`)
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Action confirmed')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 })
})
