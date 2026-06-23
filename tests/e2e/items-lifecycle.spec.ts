import { test, expect } from '@playwright/test'

// Each test fully independent: reset, add task, perform action, assert persistence

test('Complete Task: marking complete persists across reload', async ({ page }) => {
  // Reset test user's tasks
  await page.goto('/test/reset', { waitUntil: 'networkidle' })

  // Add a task via the UI
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  const taskTitle = 'Complete Test Task'
  await page.locator('input[placeholder*="Enter"]').first().fill(taskTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('button[type="submit"]').click()

  // Redirected to dashboard, task visible
  await expect(page).toHaveURL('/', { timeout: 10_000 })
  await expect(page.locator(`text=${taskTitle}`)).toBeVisible()

  // Find the task card by its heading, then find and click the checkbox button
  const titleHeading = page.locator('h3', { hasText: taskTitle }).first()
  const taskCardOuter = titleHeading.locator('xpath=ancestor::div[contains(@class, "duration")]').first()

  // Click the checkbox: first button in the outer flex container
  await taskCardOuter.evaluate((el) => {
    const firstButton = el.querySelector('div > button')
    if (firstButton) (firstButton as HTMLElement).click()
  })

  // Assert completed state: title should have line-through class
  await expect(titleHeading).toHaveClass(/line-through/, { timeout: 10_000 })

  // RELOAD and assert it STILL shows completed (catches optimistic-update-only regressions)
  await page.reload()
  const reloadedTitle = page.locator('h3', { hasText: taskTitle }).first()
  await expect(reloadedTitle).toBeVisible()
  await expect(reloadedTitle).toHaveClass(/line-through/)
})

test('Edit Task: changing title updates Dashboard and persists', async ({ page }) => {
  // Reset test user's tasks
  await page.goto('/test/reset', { waitUntil: 'networkidle' })

  // Add a task via the UI
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  const originalTitle = 'Edit Test Task'
  await page.locator('input[placeholder*="Enter"]').first().fill(originalTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('button[type="submit"]').click()

  // Redirected to dashboard, task visible
  await expect(page).toHaveURL('/', { timeout: 10_000 })
  const titleHeading = page.locator('h3', { hasText: originalTitle }).first()
  await expect(titleHeading).toBeVisible()

  // Find the task card and hover to reveal the menu button
  const taskCardOuter = titleHeading.locator('xpath=ancestor::div[contains(@class, "duration")]').first()
  await taskCardOuter.hover()

  // Click the menu button (MoreVertical): second button in the outer flex container
  await taskCardOuter.evaluate((el) => {
    const buttons = el.querySelectorAll('div > button')
    if (buttons.length >= 2) (buttons[1] as HTMLElement).click()
  })

  // Wait for the Edit button to appear in the dropdown menu
  await expect(page.locator('button', { hasText: 'Edit' }).first()).toBeVisible({ timeout: 5_000 })

  // Click Edit in the dropdown menu
  await page.locator('button', { hasText: 'Edit' }).first().click()

  // TaskEditModal should open; wait for the modal to appear with title input
  await expect(page.locator('input[placeholder*="task title"]')).toBeVisible({ timeout: 5_000 })

  // Find and fill the title input
  const titleInput = page.locator('input[placeholder*="task title"]').first()
  await titleInput.fill('Updated Edit Task Title')

  // Save the task using the "Save Changes" button (not [type="submit"])
  await expect(page.locator('button', { hasText: 'Save Changes' })).toBeVisible()
  await page.locator('button', { hasText: 'Save Changes' }).first().click()

  // Modal closes, wait for API to update, dashboard shows new title
  await expect(page.locator('h3', { hasText: 'Updated Edit Task Title' })).toBeVisible({ timeout: 10_000 })
  await expect(titleHeading).not.toBeVisible()
})

test('Delete Task: removing task makes it disappear from Dashboard', async ({ page }) => {
  // Reset test user's tasks
  await page.goto('/test/reset', { waitUntil: 'networkidle' })

  // Add a task via the UI
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  const taskTitle = 'Delete Test Task'
  await page.locator('input[placeholder*="Enter"]').first().fill(taskTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('button[type="submit"]').click()

  // Redirected to dashboard, task visible
  await expect(page).toHaveURL('/', { timeout: 10_000 })
  const titleHeading = page.locator('h3', { hasText: taskTitle }).first()
  await expect(titleHeading).toBeVisible()

  // Set up dialog handler BEFORE clicking delete
  let dialogAccepted = false
  page.on('dialog', dialog => {
    dialogAccepted = true
    dialog.accept()
  })

  // Find the task card and hover to reveal the menu button
  const taskCardOuter = titleHeading.locator('xpath=ancestor::div[contains(@class, "duration")]').first()
  await taskCardOuter.hover()

  // Click the menu button (MoreVertical): second button in the outer flex container
  await taskCardOuter.evaluate((el) => {
    const buttons = el.querySelectorAll('div > button')
    if (buttons.length >= 2) (buttons[1] as HTMLElement).click()
  })

  // Wait for Delete button to appear and click it
  await expect(page.locator('button', { hasText: 'Delete' }).first()).toBeVisible({ timeout: 5_000 })
  await page.locator('button', { hasText: 'Delete' }).first().click()

  // Wait for dialog to be handled and task to disappear
  await expect(titleHeading).not.toBeVisible({ timeout: 10_000 })
})
