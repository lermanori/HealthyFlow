import { test, expect } from './fixtures/ai-stubs'

// Each test fully independent: reset, add task, perform action, assert persistence

test('Complete Task: marking complete persists across reload', async ({ page }) => {
  // Reset test user state via backend (React Router catch-all blocks GET /test/reset)
  const reset1 = await page.request.post('http://localhost:3001/test/reset')
  expect(reset1.ok()).toBeTruthy()

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

test('Task location: create, edit, and clear location on the card', async ({ page }) => {
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  const taskTitle = 'Location Test Task'
  await page.locator('input[placeholder*="Enter"]').first().fill(taskTitle)
  await page.locator('input[placeholder="Add a place or address..."]').fill('Cafe Noga')
  await page.locator('button[type="submit"]').click()

  await expect(page).toHaveURL('/', { timeout: 10_000 })
  const titleHeading = page.locator('h3', { hasText: taskTitle }).first()
  await expect(titleHeading).toBeVisible()
  await expect(page.locator('text=Cafe Noga')).toBeVisible()

  const openTaskMenuByVisibleText = async (text: string) => {
    const taskCardOuter = page.locator(`text=${text}`).locator('xpath=ancestor::div[contains(@class, "duration")]').first()
    await taskCardOuter.hover()
    await taskCardOuter.evaluate((el) => {
      const buttons = el.querySelectorAll('div > button')
      if (buttons.length >= 2) (buttons[1] as HTMLElement).click()
    })
  }

  await openTaskMenuByVisibleText('Cafe Noga')
  await page.locator('button', { hasText: 'Edit' }).first().click()
  const locationInput = page.locator('input[placeholder="Add a place or address..."]').first()
  await expect(locationInput).toBeVisible({ timeout: 5_000 })
  await locationInput.fill('Library Room 2')
  await page.locator('button', { hasText: 'Save Changes' }).first().click()

  await expect(page.locator('text=Library Room 2')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('text=Cafe Noga')).not.toBeVisible()

  await openTaskMenuByVisibleText('Library Room 2')
  await page.locator('button', { hasText: 'Edit' }).first().click()
  await page.locator('input[placeholder="Add a place or address..."]').first().fill('')
  await page.locator('button', { hasText: 'Save Changes' }).first().click()

  await expect(page.locator('text=Library Room 2')).not.toBeVisible({ timeout: 10_000 })
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

test('Delete timed task from schedule menu removes it from Dashboard', async ({ page }) => {
  await page.goto('/test/reset', { waitUntil: 'networkidle' })

  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  const taskTitle = `Delete Timed Task ${Date.now()}`
  await page.locator('input[placeholder*="Enter"]').first().fill(taskTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="time"]').fill('10:00')
  await page.locator('button[type="submit"]').click()

  await expect(page).toHaveURL('/', { timeout: 10_000 })
  const titleHeading = page.locator('h3', { hasText: taskTitle }).first()
  await expect(titleHeading).toBeVisible()

  let dialogAccepted = false
  page.on('dialog', dialog => {
    dialogAccepted = true
    dialog.accept()
  })

  const taskCardOuter = titleHeading.locator('xpath=ancestor::div[contains(@class, "duration")]').first()
  await taskCardOuter.hover()
  await taskCardOuter.evaluate((el) => {
    const buttons = el.querySelectorAll('div > button')
    if (buttons.length >= 2) (buttons[1] as HTMLElement).click()
  })

  await expect(page.locator('button', { hasText: 'Delete' }).first()).toBeVisible({ timeout: 5_000 })
  await page.locator('button', { hasText: 'Delete' }).first().click()

  expect(dialogAccepted).toBe(true)
  await expect(titleHeading).not.toBeVisible({ timeout: 10_000 })
})

test('Scheduled timeline checkbox toggles reliably while the card is hovered', async ({ page }) => {
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  const taskTitle = `Hovered Timeline Toggle ${Date.now()}`
  await page.locator('input[placeholder*="Enter"]').first().fill(taskTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="time"]').fill('10:00')
  await page.locator('button[type="submit"]').click()

  await expect(page).toHaveURL('/', { timeout: 10_000 })

  const dragHandle = page.locator('[data-timeline-drag-handle="true"]').filter({ hasText: taskTitle }).first()
  const checkbox = dragHandle.getByRole('button', { name: 'Check task' })
  const title = dragHandle.getByRole('heading', { name: taskTitle })

  const transformBeforeHover = await dragHandle.evaluate((el) => getComputedStyle(el).transform)
  await dragHandle.hover()
  await expect
    .poll(() => dragHandle.evaluate((el) => getComputedStyle(el).transform))
    .toBe(transformBeforeHover)

  await checkbox.click()
  await expect(title).toHaveClass(/line-through/, { timeout: 10_000 })

  await dragHandle.hover()
  await expect(dragHandle.getByRole('button', { name: 'Uncheck task' })).toBeVisible()
  await dragHandle.getByRole('button', { name: 'Uncheck task' }).click()
  await expect(title).not.toHaveClass(/line-through/, { timeout: 10_000 })

  await dragHandle.hover()
  await dragHandle.getByRole('button', { name: 'Check task' }).click()
  await expect(title).toHaveClass(/line-through/, { timeout: 10_000 })
})

test('Schedule compacts empty four-hour windows around timed tasks', async ({ page }) => {
  await page.goto('/test/reset', { waitUntil: 'networkidle' })

  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  const taskTitle = `Compact Schedule Anchor ${Date.now()}`
  await page.locator('input[placeholder*="Enter"]').first().fill(taskTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="time"]').fill('10:00')
  await page.locator('button[type="submit"]').click()

  await expect(page).toHaveURL('/', { timeout: 10_000 })
  await expect(page.locator('h3', { hasText: taskTitle }).first()).toBeVisible()

  const sixAm = page.locator('[data-slot="06:00"]')
  await expect(page.locator('[data-slot="06:00"]')).toHaveAttribute('data-compacted', 'true')
  await expect(page.locator('[data-slot="09:00"]')).toHaveAttribute('data-compacted', 'true')
  await expect(page.locator('[data-slot="10:00"]')).toHaveAttribute('data-compacted', 'false')
  await expect(page.locator('[data-slot="11:00"]')).toHaveAttribute('data-compacted', 'true')

  await expect.poll(async () => {
    const compactHeight = await sixAm.evaluate((el) => Math.round(el.getBoundingClientRect().height))
    const taskSlotHeight = await page.locator('[data-slot="10:00"]').evaluate((el) => Math.round(el.getBoundingClientRect().height))
    return compactHeight < taskSlotHeight
  }).toBe(true)
})

test('Schedule expands compacted windows during drag', async ({ page }) => {
  await page.goto('/test/reset', { waitUntil: 'networkidle' })

  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  const taskTitle = `Drag Expanded Schedule ${Date.now()}`
  await page.locator('input[placeholder*="Enter"]').first().fill(taskTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="time"]').fill('10:00')
  await page.locator('button[type="submit"]').click()

  await expect(page).toHaveURL('/', { timeout: 10_000 })
  const titleHeading = page.locator('h3', { hasText: taskTitle }).first()
  await expect(titleHeading).toBeVisible()
  await expect(page.locator('[data-slot="06:00"]')).toHaveAttribute('data-compacted', 'true')

  const dragHandle = page.locator('[data-timeline-drag-handle="true"]').filter({ hasText: taskTitle }).first()
  await dragHandle.hover()
  await expect(page.locator('[data-slot="06:00"]')).toHaveAttribute('data-compacted', 'true')

  const box = await dragHandle.boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await expect(page.locator('[data-slot="06:00"]')).toHaveAttribute('data-compacted', 'false')

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 80, { steps: 8 })

  await expect(page.locator('[data-slot="06:00"]')).toHaveAttribute('data-compacted', 'false')
  await expect(page.locator('[data-slot="11:00"]')).toHaveAttribute('data-compacted', 'false')

  await page.mouse.up()
  await expect(page.locator('[data-slot="06:00"]')).toHaveAttribute('data-compacted', 'true')
})
