import { test, expect } from './fixtures/ai-stubs'
import { daySummaryFixture } from './fixtures/day-summary'

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

test('Demo Talk stays deterministic without calling the billable chat API', async ({ page }) => {
  let billableChatRequests = 0
  await page.addInitScript(() => {
    localStorage.setItem('demoPersona', 'noam')
    localStorage.setItem('mayaDemoGuide', 'closed')
  })
  await page.route('**/api/ai/chat', (route) => {
    billableChatRequests += 1
    return route.fulfill({
      status: 402,
      json: { error: 'Insufficient AI tokens', code: 'insufficient_credits' },
    })
  })

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('Give me one more small next step.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText("Here's a stable reset plan for Noam:")).toBeVisible()
  expect(billableChatRequests).toBe(0)
})

test('Migrates browser chat history without triggering a duplicate autosave', async ({ page }) => {
  const now = new Date().toISOString()
  const conversation = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Plan tomorrow',
    model: 'gpt-4o-mini',
    createdAt: now,
    updatedAt: now,
    messages: [{
      id: '22222222-2222-4222-8222-222222222222',
      role: 'user',
      content: 'Plan tomorrow',
      createdAt: now,
    }],
  }
  let saveRequests = 0

  await page.addInitScript((storedConversation) => {
    localStorage.setItem('healthyflow-assistant-conversations-v1', JSON.stringify([storedConversation]))
    localStorage.removeItem('healthyflow-assistant-conversations-v1-migrated')
  }, conversation)
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: '[]' })
      return
    }
    if (route.request().method() === 'PUT') {
      saveRequests += 1
      await route.fulfill({
        status: saveRequests === 1 ? 200 : 500,
        contentType: 'application/json',
        body: saveRequests === 1
          ? JSON.stringify(conversation)
          : JSON.stringify({ error: 'Failed to save chat history' }),
      })
      return
    }
    await route.fallback()
  })

  await page.goto('/app/talk')
  await expect(page.getByText('Plan tomorrow').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem('healthyflow-assistant-conversations-v1-migrated')
  )).toBe('true')
  await page.waitForTimeout(700)

  expect(saveRequests).toBe(1)
  await expect(page.getByText('Could not save chat history.')).toHaveCount(0)
})

test('Serializes autosaves while an earlier chat save is still in flight', async ({ page }) => {
  const now = new Date().toISOString()
  const conversation = {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Existing plan',
    model: 'gpt-4o-mini',
    createdAt: now,
    updatedAt: now,
    messages: [{
      id: '44444444-4444-4444-8444-444444444444',
      role: 'user',
      content: 'Existing plan',
      createdAt: now,
    }],
  }
  let activeSaves = 0
  let maximumConcurrentSaves = 0
  const savedMessageCounts: number[] = []

  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([conversation]),
      })
      return
    }
    if (route.request().method() === 'PUT') {
      const snapshot = route.request().postDataJSON() as { messages: unknown[] }
      activeSaves += 1
      maximumConcurrentSaves = Math.max(maximumConcurrentSaves, activeSaves)
      savedMessageCounts.push(snapshot.messages.length)
      await new Promise((resolve) => setTimeout(resolve, 600))
      activeSaves -= 1
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(snapshot),
      })
      return
    }
    await route.fallback()
  })
  await page.route('**/api/ai/chat', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 450))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Here is the updated plan.',
        toolEvents: [],
        pendingActions: [],
      }),
    })
  })

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('Update the plan')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Here is the updated plan.')).toBeVisible()
  await expect.poll(() => savedMessageCounts, { timeout: 4_000 }).toEqual([2, 3])

  expect(maximumConcurrentSaves).toBe(1)
  await expect(page.getByText('Could not save chat history.')).toHaveCount(0)
})

test('Mobile assistant composer wraps long text instead of hiding it off-screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app/talk')

  const mainBox = await page.locator('main').boundingBox()
  const talkSurfaceBox = await page.locator('main > div > div').first().boundingBox()
  const mobileHeaderBox = await page.locator('header.pwa-mobile-header').boundingBox()
  const bottomNavBox = await page.locator('div.fixed.bottom-0.left-0.right-0').boundingBox()
  const composerForm = page.locator('form').filter({ has: page.getByPlaceholder(/Add anything/) })
  const formBox = await composerForm.boundingBox()
  expect(mainBox).toBeTruthy()
  expect(talkSurfaceBox).toBeTruthy()
  expect(mobileHeaderBox).toBeTruthy()
  expect(bottomNavBox).toBeTruthy()
  expect(formBox).toBeTruthy()
  expect(mainBox!.y).toBeGreaterThanOrEqual(mobileHeaderBox!.y + mobileHeaderBox!.height - 1)
  // Deliberately no assertions on the header's background-image / backdrop-filter
  // here. They were checking that the header paints opaquely so the composer
  // cannot show through it — but they did it by pinning exact CSS, which broke
  // the moment #151 moved the header onto semantic tokens even though the header
  // still paints opaquely. Appearance is covered by the snapshots in
  // responsive-visual-system.spec.ts at this exact viewport; what belongs here is
  // the geometry this test is named for.
  const headerOpacity = await page.locator('header.pwa-mobile-header').evaluate((element) => {
    const styles = window.getComputedStyle(element)
    return { opacity: styles.opacity, paddingTop: styles.paddingTop }
  })
  expect(Number(headerOpacity.opacity)).toBe(1)
  expect(headerOpacity.paddingTop).toBe('0px')
  expect(Math.round(talkSurfaceBox!.x - mainBox!.x)).toBe(0)
  expect(Math.round(mainBox!.width - talkSurfaceBox!.width)).toBe(0)
  expect(formBox!.y).toBeLessThan(bottomNavBox!.y)
  expect(Math.abs((formBox!.y + formBox!.height) - bottomNavBox!.y)).toBeLessThanOrEqual(1)
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
  await expect(page.getByText('Chat history')).toHaveCount(0)

  const composer = page.getByPlaceholder(/Add anything/)
  await expect(composer).toBeVisible()
  await expect(page.getByLabel('Assistant model')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add manually' })).toBeHidden()
  const initialBox = await composer.boundingBox()
  const initialShell = await page.locator('form > div').filter({ has: composer }).boundingBox()
  expect(initialBox).toBeTruthy()
  expect(initialShell).toBeTruthy()
  expect(initialBox!.height).toBeLessThanOrEqual(48)
  expect(initialShell!.height).toBeLessThanOrEqual(112)
  await composer.fill('plan a focused morning block then add groceries and send the workout notes')

  const box = await composer.boundingBox()
  const composerShell = await page.locator('form > div').filter({ has: composer }).boundingBox()
  expect(box).toBeTruthy()
  expect(composerShell).toBeTruthy()
  expect(box!.width).toBeGreaterThan(120)
  expect(box!.height).toBeGreaterThanOrEqual(initialBox!.height)
  expect(box!.height).toBeLessThanOrEqual(112)
  expect(composerShell!.height).toBeGreaterThan(box!.height)
  expect(composerShell!.y + composerShell!.height).toBeLessThanOrEqual(formBox!.y + formBox!.height)
})

test('Confirmed assistant task appears on Today without a browser refresh', async ({ page }) => {
  const today = formatLocalDate(new Date())
  const title = `Assistant cache task ${Date.now()}`
  let created = false

  await page.route('**/api/day-summary?**', async (route) => {
    const requestUrl = new URL(route.request().url())
    const requestedDate = requestUrl.searchParams.get('date')
    const items = created && requestedDate === today
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
    await route.fulfill({
      json: daySummaryFixture({ date: requestedDate ?? today, items }),
    })
  })
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

  await page.goto('/app')
  await expect(page.getByText(title)).toHaveCount(0)

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill(`add ${title} today`)
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Action confirmed')).toBeVisible()

  await page.goto('/app')
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
})
