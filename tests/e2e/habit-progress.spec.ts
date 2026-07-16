import { test, expect } from './fixtures/ai-stubs'

test('mobile Habit cards open Variant B and persist partial/completed/failed outcomes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const date = new Date().toISOString().slice(0, 10)
  let workoutTotal = 20
  let workoutOutcome: 'partial' | 'completed' | 'failed' = 'partial'
  let smokeOutcome: 'pending' | 'completed' | 'failed' = 'pending'
  let entries = [{ id: 'entry-1', amount: 20, note: 'Run', createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T08:00:00.000Z` }]

  const habit = (id: string, title: string, info: any, startTime: string | null = null) => ({
    id, title, type: 'habit', category: 'fitness', startTime, duration: 30,
    completed: info.outcome === 'completed', scheduledDate: date, createdAt: `${date}T07:00:00.000Z`,
    repeat: 'daily', isHabitInstance: true, originalHabitId: id.split('-').slice(0, 5).join('-'), habitInfo: info,
  })
  const workoutInfo = () => ({ target: { value: 45, unit: 'minutes' }, outcome: workoutOutcome, progressTotal: workoutTotal })
  const smokeInfo = () => ({ target: null, outcome: smokeOutcome, progressTotal: 0 })

  await page.route('**/api/tasks**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/tasks' && request.method() === 'GET') {
      return route.fulfill({ json: [habit(`aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-${date}`, '45-minute workout', workoutInfo()), habit(`ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee-${date}`, 'Don’t smoke until 11', smokeInfo(), '11:00')] })
    }
    const isWorkout = url.pathname.includes('aaaaaaaa-bbbb')
    if (url.pathname.endsWith('/habit-progress') && request.method() === 'GET') {
      return route.fulfill({ json: { habit: habit(isWorkout ? `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-${date}` : `ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee-${date}`, isWorkout ? '45-minute workout' : 'Don’t smoke until 11', isWorkout ? workoutInfo() : smokeInfo(), isWorkout ? null : '11:00'), entries: isWorkout ? entries : [] } })
    }
    if (url.pathname.endsWith('/habit-progress') && request.method() === 'POST') {
      const input = request.postDataJSON()
      workoutTotal += input.amount
      entries = [...entries, { id: `entry-${entries.length + 1}`, amount: input.amount, note: input.note ?? null, createdAt: `${date}T09:00:00.000Z`, updatedAt: `${date}T09:00:00.000Z` }]
      workoutOutcome = workoutTotal >= 45 ? 'completed' : 'partial'
      return route.fulfill({ status: 201, json: { habit: habit(`aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-${date}`, '45-minute workout', workoutInfo()), entries } })
    }
    if (url.pathname.endsWith('/habit-outcome') && request.method() === 'PUT') {
      const input = request.postDataJSON()
      await new Promise(resolve => setTimeout(resolve, 1_500))
      if (isWorkout) workoutOutcome = input.outcome === 'pending' ? (workoutTotal > 0 ? 'partial' : 'pending') : input.outcome
      else smokeOutcome = input.outcome
      return route.fulfill({ json: { habit: habit(isWorkout ? `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-${date}` : `ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee-${date}`, isWorkout ? '45-minute workout' : 'Don’t smoke until 11', isWorkout ? workoutInfo() : smokeInfo(), isWorkout ? null : '11:00'), entries: isWorkout ? entries : [] } })
    }
    return route.fallback()
  })

  await page.goto('/')
  const mobileActions = page.getByRole('button', { name: 'Don’t smoke until 11 actions' })
  await expect(mobileActions).toBeVisible()
  const actionsBox = await mobileActions.boundingBox()
  expect(actionsBox).not.toBeNull()
  expect(actionsBox!.width).toBeGreaterThanOrEqual(44)
  expect(actionsBox!.height).toBeGreaterThanOrEqual(44)
  await page.getByText('45-minute workout').click()
  const sheet = page.getByRole('dialog', { name: '45-minute workout' })
  await expect(sheet.getByText('20 / 45 min')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Log 25 min and finish' })).toBeVisible()
  await sheet.getByRole('button', { name: '+ 20 min' }).click()
  await expect(sheet.getByRole('button', { name: 'Log 5 min and finish' })).toBeVisible()
  await sheet.getByRole('button', { name: '+ 5 min' }).click()
  await expect(sheet.getByText('45 / 45 min')).toBeVisible()
  await expect(sheet.getByText(/100% · Completed/)).toBeVisible()
  for (const name of ['Completed', 'Not done']) {
    const box = await sheet.getByRole('button', { name }).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.y + box!.height).toBeLessThanOrEqual(844)
  }
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('heading', { name: 'Don’t smoke until 11', exact: true }).click()
  const binarySheet = page.getByRole('dialog', { name: 'Don’t smoke until 11' })
  await binarySheet.getByRole('button', { name: 'Not done' }).click()
  await expect(binarySheet).not.toBeVisible({ timeout: 500 })
  await expect(page.getByText('Not done', { exact: true })).toBeVisible()
  const timedHabitRow = page.locator('[data-demo-id="habit-row"]').filter({ hasText: 'Don’t smoke until 11' })
  const [rowBox, statusBox] = await Promise.all([
    timedHabitRow.boundingBox(),
    timedHabitRow.getByText('Not done', { exact: true }).boundingBox(),
  ])
  expect(rowBox).not.toBeNull()
  expect(statusBox).not.toBeNull()
  expect(statusBox!.y + statusBox!.height).toBeLessThanOrEqual(rowBox!.y + rowBox!.height)
  await page.getByRole('heading', { name: 'Don’t smoke until 11', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Don’t smoke until 11' }).getByRole('button', { name: 'Clear outcome' })).toBeVisible()
})
