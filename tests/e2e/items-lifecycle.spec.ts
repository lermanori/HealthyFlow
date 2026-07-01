import { readFile } from 'node:fs/promises'
import path from 'node:path'
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

  const taskCard = page.locator('[data-testid="timeline-draggable-task"]').filter({ hasText: taskTitle }).first()
  const checkbox = taskCard.getByRole('button', { name: 'Check task' })
  const title = taskCard.getByRole('heading', { name: taskTitle })

  const transformBeforeHover = await taskCard.evaluate((el) => getComputedStyle(el).transform)
  await taskCard.hover()
  await expect
    .poll(() => taskCard.evaluate((el) => getComputedStyle(el).transform))
    .toBe(transformBeforeHover)

  await checkbox.click()
  await expect(title).toHaveClass(/line-through/, { timeout: 10_000 })

  await taskCard.hover()
  await expect(taskCard.getByRole('button', { name: 'Uncheck task' })).toBeVisible()
  await taskCard.getByRole('button', { name: 'Uncheck task' }).click()
  await expect(title).not.toHaveClass(/line-through/, { timeout: 10_000 })

  await taskCard.hover()
  await taskCard.getByRole('button', { name: 'Check task' }).click()
  await expect(title).toHaveClass(/line-through/, { timeout: 10_000 })
})

test('Dedicated drag grip keeps scheduled and Anytime card controls clickable', async ({ page }) => {
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  const scheduledTitle = `Grip Scheduled ${Date.now()}`
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()
  await page.locator('input[placeholder*="Enter"]').first().fill(scheduledTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="time"]').fill('10:00')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  const anytimeTitle = `Grip Anytime ${Date.now()}`
  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()
  await page.locator('input[placeholder*="Enter"]').first().fill(anytimeTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  const scheduledCard = page.locator('[data-testid="timeline-draggable-task"]').filter({ hasText: scheduledTitle }).first()
  const anytimeCard = page.locator('[data-testid="timeline-draggable-task"]').filter({ hasText: anytimeTitle }).first()
  await expect(scheduledCard).toBeVisible()
  await expect(anytimeCard).toBeVisible()

  for (const card of [scheduledCard, anytimeCard]) {
    const grip = card.getByTestId('timeline-task-drag-grip')
    await expect(grip).toHaveAttribute('data-rfd-drag-handle-draggable-id', /.+/)
    await expect(card).not.toHaveAttribute('data-rfd-drag-handle-draggable-id', /.+/)

    await card.hover()
    await card.getByRole('button', { name: 'Check task' }).click()
    await expect(card.getByRole('button', { name: 'Uncheck task' })).toBeVisible({ timeout: 10_000 })

    await card.hover()
    await card.getByRole('button', { name: 'Uncheck task' }).click()
    await expect(card.getByRole('button', { name: 'Check task' })).toBeVisible({ timeout: 10_000 })

    await card.hover()
    const menuButton = card.locator('button').last()
    await menuButton.click()
    await expect(page.locator('button', { hasText: 'Edit' }).first()).toBeVisible({ timeout: 5_000 })
    await menuButton.click()

    const box = await grip.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width / 2 + 8, box!.y + box!.height / 2 + 8, { steps: 3 })
    await page.mouse.up()
  }
})

test('Compact timeline card does not clip content or overflow menu', async ({ page }) => {
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  const taskTitle = `Compact Clipping ${Date.now()}`
  await page.locator('input[placeholder*="Enter"]').first().fill(taskTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="time"]').fill('10:00')
  await page.locator('button[type="submit"]').click()

  await expect(page).toHaveURL('/', { timeout: 10_000 })

  const draggable = page.locator('[data-testid="timeline-draggable-task"]').filter({ hasText: taskTitle }).first()
  const card = draggable.getByRole('heading', { name: taskTitle }).locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")]').first()
  const checkbox = card.getByRole('button', { name: 'Check task' })
  const title = card.getByRole('heading', { name: taskTitle })
  const category = card.getByText('personal')

  await expect(card).toBeVisible()
  await expect(card).toHaveCSS('overflow', 'visible')

  const cardBox = await card.boundingBox()
  expect(cardBox).toBeTruthy()
  for (const locator of [checkbox, title, category]) {
    await expect(locator).toBeVisible()
    const box = await locator.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.x).toBeGreaterThanOrEqual(cardBox!.x)
    expect(box!.y).toBeGreaterThanOrEqual(cardBox!.y)
    expect(box!.x + box!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1)
    expect(box!.y + box!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1)
  }

  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  const transformBeforeHover = await card.evaluate((el) => getComputedStyle(el).transform)
  await card.hover()
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).transform)).toBe(transformBeforeHover)

  const menuButton = card.locator('button').last()
  await menuButton.click()
  const editButton = page.locator('button', { hasText: 'Edit' }).first()
  const deleteButton = page.locator('button', { hasText: 'Delete' }).first()
  await expect(editButton).toBeVisible({ timeout: 5_000 })
  await expect(deleteButton).toBeVisible()

  const menuBox = await page.locator('.task-menu').first().boundingBox()
  expect(menuBox).toBeTruthy()
  expect(menuBox!.width).toBeGreaterThan(0)
  expect(menuBox!.height).toBeGreaterThan(0)

  await editButton.click()
  await expect(page.locator('input[placeholder*="task title"]')).toBeVisible({ timeout: 5_000 })
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

test('Drag start keeps the card attached to the pointer without shifting layout', async ({ page }) => {
  await page.goto('/test/reset', { waitUntil: 'networkidle' })

  await page.goto('/add')
  await expect(page.locator('h1', { hasText: 'Add New Item' })).toBeVisible()

  const taskTitle = `Drag Attached Schedule ${Date.now()}`
  await page.locator('input[placeholder*="Enter"]').first().fill(taskTitle)
  await page.locator('label', { hasText: 'Category' }).locator('..').locator('button', { hasText: 'Personal' }).click()
  await page.locator('input[type="time"]').fill('10:00')
  await page.locator('button[type="submit"]').click()

  await expect(page).toHaveURL('/', { timeout: 10_000 })
  const titleHeading = page.locator('h3', { hasText: taskTitle }).first()
  await expect(titleHeading).toBeVisible()
  await expect(page.locator('[data-slot="06:00"]')).toHaveAttribute('data-compacted', 'true')

  const taskCard = page.locator('[data-testid="timeline-draggable-task"]').filter({ hasText: taskTitle }).first()
  const dragHandle = taskCard.getByTestId('timeline-task-drag-grip')
  await taskCard.hover()

  const box = await dragHandle.boundingBox()
  expect(box).toBeTruthy()
  const cardTopBefore = (await taskCard.boundingBox())!.y

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()

  // Lifting must NOT expand the compacted windows — expanding here reflows the timeline
  // and throws the dragged clone away from the pointer.
  await expect(page.locator('[data-slot="06:00"]')).toHaveAttribute('data-compacted', 'true')

  const dy = 60
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + dy, { steps: 6 })

  // Still compacted mid-drag: no vertical layout shift above or below the dragged card.
  await expect(page.locator('[data-slot="06:00"]')).toHaveAttribute('data-compacted', 'true')
  await expect(page.locator('[data-slot="11:00"]')).toHaveAttribute('data-compacted', 'true')

  // The dragged card tracks the pointer: its top moves ~dy, not hundreds of px.
  const cardTopDuring = (await taskCard.boundingBox())!.y
  expect(Math.abs((cardTopDuring - cardTopBefore) - dy)).toBeLessThan(24)

  await page.mouse.up()
  await expect(page.locator('[data-slot="06:00"]')).toHaveAttribute('data-compacted', 'true')
})

test('Drag start avoids fragile capture hooks and drag-time expansion', async () => {
  const source = await readFile(path.join(process.cwd(), 'src/components/DayTimeline.tsx'), 'utf8')

  expect(source).not.toContain('flushSync')
  expect(source).not.toContain('onMouseDownCapture')
  expect(source).not.toContain('onPointerDownCapture')
  expect(source).not.toContain('onBeforeCapture')
  expect(source).not.toContain('isExpandedForDrag')
})

test('Mobile calendar event checkbox stays compact and clear of the title', async ({ page }) => {
  const eventTitle = `Mobile Calendar ${Date.now()}`

  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/calendar/google/events**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'external-mobile-event-1',
        provider: 'google',
        calendarId: 'primary',
        externalEventId: 'google-mobile-event-1',
        title: eventTitle,
        description: null,
        location: null,
        startAt: `${new Date().toISOString().slice(0, 10)}T10:00:00.000Z`,
        endAt: `${new Date().toISOString().slice(0, 10)}T11:00:00.000Z`,
        localStartTime: '10:00',
        localEndTime: '11:00',
        allDay: false,
        status: 'confirmed',
        htmlLink: null,
        completed: false,
        completedAt: null,
      }]),
    })
  })

  await page.goto('/')
  const eventRow = page.locator('[data-slot="10:00"]').filter({ hasText: eventTitle }).first()
  const checkbox = eventRow.getByRole('button', { name: 'Check calendar event', exact: true })
  const title = eventRow.getByRole('heading', { name: eventTitle })
  await expect(checkbox).toBeVisible({ timeout: 10_000 })
  await expect(title).toBeVisible()

  const checkboxBox = await checkbox.boundingBox()
  const titleBox = await title.boundingBox()
  expect(checkboxBox).toBeTruthy()
  expect(titleBox).toBeTruthy()
  expect(Math.round(checkboxBox!.width)).toBeLessThanOrEqual(20)
  expect(Math.round(checkboxBox!.height)).toBeLessThanOrEqual(20)
  expect(titleBox!.x).toBeGreaterThan(checkboxBox!.x + checkboxBox!.width)
  expect(titleBox!.x - (checkboxBox!.x + checkboxBox!.width)).toBeGreaterThanOrEqual(4)

  const source = await readFile(path.join(process.cwd(), 'src/components/DayTimeline.tsx'), 'utf8')
  expect(source).toContain('!min-h-0 !w-4 !min-w-0')
})
