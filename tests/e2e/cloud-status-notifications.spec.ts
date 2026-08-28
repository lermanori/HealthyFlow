import { expect, test, type Page } from '@playwright/test'

const pausedMessage = 'Cloud sync paused. Changes are safe on this device.'
const unavailableMessage = 'Cloud status unavailable. Changes are safe on this device.'

async function reportCloudState(page: Page, state: 'paused' | 'unavailable') {
  await page.evaluate(async ({ modulePath, state }) => {
    const sync = await import(modulePath)
    if (state === 'paused') {
      sync.reportCloudSyncFailure(new Error('Cloud exchange unavailable'))
    } else {
      sync.reportCloudStatusFailure(new Error('Cloud status unavailable'))
    }
  }, { modulePath: '/src/hooks/useCloudSync.ts', state })
}

test('Connection and Cloud status stay in the mobile layout with one dismissible Cloud lifecycle', async ({ page }) => {
  await page.route('**/api/sync', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ syncedAt: new Date().toISOString(), changed: {} }),
    })
  })
  await page.route('**/api/tasks/overdue-notified', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/app')
  await expect(page.locator('header.pwa-mobile-header')).toBeVisible()
  const skipFirstRun = page.getByRole('button', { name: 'Just take me in' })
  if (await skipFirstRun.isVisible()) await skipFirstRun.click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1_500)

  const header = page.locator('header.pwa-mobile-header')
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  const offlineText = page.getByText("You're offline. Some features may be limited.", { exact: true })
  await expect(offlineText).toBeVisible()
  const [offlineTextBox, offlineHeaderBox] = await Promise.all([
    offlineText.boundingBox(),
    header.boundingBox(),
  ])
  expect(offlineTextBox).not.toBeNull()
  expect(offlineHeaderBox).not.toBeNull()
  expect(offlineTextBox!.y).toBeGreaterThanOrEqual(offlineHeaderBox!.y + offlineHeaderBox!.height)
  await expect(page.locator('[data-demo-id="network-status-notification"]')).toHaveCount(1)

  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(offlineText).toHaveCount(0)
  const reconnectedText = page.getByText("You're back online! Syncing data...", { exact: true })
  await expect(reconnectedText).toBeVisible()
  const reconnectedTextBox = await reconnectedText.boundingBox()
  expect(reconnectedTextBox).not.toBeNull()
  expect(reconnectedTextBox!.y).toBeGreaterThanOrEqual(offlineHeaderBox!.y + offlineHeaderBox!.height)

  const reminderTitle = 'E2E overdue reminder geometry'
  await page.evaluate(async ({ modulePath, reminderTitle }) => {
    const { taskService } = await import(modulePath)
    const now = new Date()
    const scheduledDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-')
    await taskService.addTask({
      title: reminderTitle,
      type: 'task',
      category: 'personal',
      startTime: '00:00',
      scheduledDate,
      duration: 5,
    })
  }, { modulePath: '/src/services/api.ts', reminderTitle })
  await page.reload()
  await expect(header).toBeVisible()
  await page.addStyleTag({
    content: ':root { --mobile-header-height: 8rem !important; } .mobile-header-inner { height: var(--mobile-header-height) !important; }',
  })
  const reminderCard = page.locator('.surface-overlay').filter({ hasText: 'Overdue' }).filter({ hasText: reminderTitle })
  await expect(reminderCard).toBeVisible()
  const [reminderCardBox, reminderHeaderBox] = await Promise.all([
    reminderCard.boundingBox(),
    header.boundingBox(),
  ])
  expect(reminderCardBox).not.toBeNull()
  expect(reminderHeaderBox).not.toBeNull()
  expect(reminderCardBox!.y).toBeGreaterThanOrEqual(reminderHeaderBox!.y + reminderHeaderBox!.height)
  await expect(page.getByRole('button', { name: `Dismiss Overdue reminder: ${reminderTitle}` })).toBeVisible()

  await page.evaluate(async (modulePath) => {
    const sync = await import(modulePath)
    sync.clearCloudSyncFailure()
  }, '/src/hooks/useCloudSync.ts')
  await reportCloudState(page, 'paused')

  const pausedText = page.getByText(pausedMessage, { exact: true })
  await expect(pausedText).toBeVisible()
  const [pausedTextBox, initialHeaderBox] = await Promise.all([
    pausedText.boundingBox(),
    header.boundingBox(),
  ])
  expect(pausedTextBox).not.toBeNull()
  expect(initialHeaderBox).not.toBeNull()
  expect(pausedTextBox!.y).toBeGreaterThanOrEqual(initialHeaderBox!.y + initialHeaderBox!.height)

  const notice = page.locator('[data-demo-id="cloud-status-notification"]')
  await expect(notice).toContainText(pausedMessage)
  await expect(page.getByRole('button', { name: 'Dismiss Cloud status' })).toBeVisible()

  const [noticeBox, headerBox] = await Promise.all([
    notice.boundingBox(),
    header.boundingBox(),
  ])
  expect(noticeBox).not.toBeNull()
  expect(headerBox).not.toBeNull()
  expect(noticeBox!.x).toBeGreaterThanOrEqual(8)
  expect(noticeBox!.x + noticeBox!.width).toBeLessThanOrEqual(312)
  expect(noticeBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height)

  const headerMenu = page.getByRole('button', { name: 'Open navigation menu' })
  await headerMenu.click()
  const navigationDrawer = page.getByRole('dialog', { name: 'HealthyFlow navigation' })
  await expect(navigationDrawer).toBeVisible()
  await navigationDrawer.getByRole('button', { name: 'Close navigation drawer' }).click()

  await reportCloudState(page, 'paused')
  await expect(page.locator('[data-demo-id="cloud-status-notification"]')).toHaveCount(1)

  await reportCloudState(page, 'unavailable')
  await expect(notice).toContainText(unavailableMessage)
  await expect(notice).not.toContainText(pausedMessage)
  await expect(page.locator('[data-demo-id="cloud-status-notification"]')).toHaveCount(1)

  await page.getByRole('button', { name: 'Dismiss Cloud status' }).click()
  await expect(notice).toHaveCount(0)
  await reportCloudState(page, 'unavailable')
  await expect(notice).toHaveCount(0)

  await page.evaluate(async (modulePath) => {
    const sync = await import(modulePath)
    sync.clearCloudSyncFailure()
  }, '/src/hooks/useCloudSync.ts')
  await reportCloudState(page, 'paused')
  await expect(notice).toContainText(pausedMessage)

  await page.evaluate(async (modulePath) => {
    const sync = await import(modulePath)
    sync.clearCloudSyncFailure()
  }, '/src/hooks/useCloudSync.ts')
  await expect(notice).toHaveCount(0)
})
