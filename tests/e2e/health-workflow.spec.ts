import fs from 'fs'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { addDays, format } from 'date-fns'
import { API_ORIGIN } from './apiBase'
import { test, expect } from './fixtures/ai-stubs'

const today = () => format(new Date(), 'yyyy-MM-dd')
const dayBefore = () => format(addDays(new Date(), -7), 'yyyy-MM-dd')
const tomorrow = () => format(addDays(new Date(), 1), 'yyyy-MM-dd')

function getAuthTokenFromStorageState() {
  const storageState = JSON.parse(fs.readFileSync('tests/e2e/.auth/user.json', 'utf8'))
  for (const origin of storageState.origins ?? []) {
    const token = origin.localStorage?.find((entry: { name: string; value: string }) => entry.name === 'token')?.value
    if (token) return token
  }
  throw new Error('Missing auth token in Playwright storage state')
}

async function enableHealthModules(page: Page) {
  const response = await page.request.patch(`${API_ORIGIN}/api/settings`, {
    headers: { Authorization: `Bearer ${getAuthTokenFromStorageState()}` },
    data: { calorieIntake: true, achievementTracker: true, workoutTracker: true },
  })
  expect(response.ok()).toBeTruthy()
}

async function mockHealthDay(page: Page) {
  const selectedDate = today()
  await page.route('**/api/calories?date=*', (route) => route.fulfill({ json: [
    {
      id: 'calorie-1',
      userId: 'user-1',
      date: selectedDate,
      time: '08:00',
      name: 'Greek yogurt',
      calories: 320,
      protein: 21,
      carbs: 34,
      fat: 8,
      quantity: '1 bowl',
      createdAt: '2026-07-27T08:00:00.000Z',
      updatedAt: '2026-07-27T08:00:00.000Z',
    },
    {
      id: 'calorie-2',
      userId: 'user-1',
      date: selectedDate,
      time: '12:30',
      name: 'Chicken rice bowl',
      calories: 640,
      protein: 43,
      carbs: 72,
      fat: 18,
      quantity: '1 bowl',
      createdAt: '2026-07-27T12:30:00.000Z',
      updatedAt: '2026-07-27T12:30:00.000Z',
    },
  ] }))
  await page.route('**/api/calories/items?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/weight?date=*', (route) => route.fulfill({ json: {
    id: 'weight-1',
    userId: 'user-1',
    date: selectedDate,
    weightKg: 68.4,
    createdAt: '2026-07-27T07:00:00.000Z',
    updatedAt: '2026-07-27T07:00:00.000Z',
  } }))
  await page.route('**/api/weight/recent?*', (route) => route.fulfill({ json: {
    entries: [
      { id: 'weight-0', userId: 'user-1', date: dayBefore(), weightKg: 68.9, createdAt: '', updatedAt: '' },
      { id: 'weight-1', userId: 'user-1', date: selectedDate, weightKg: 68.4, createdAt: '', updatedAt: '' },
    ],
    latest: { id: 'weight-1', userId: 'user-1', date: selectedDate, weightKg: 68.4, createdAt: '', updatedAt: '' },
    previous: { id: 'weight-0', userId: 'user-1', date: dayBefore(), weightKg: 68.9, createdAt: '', updatedAt: '' },
    deltaKg: -0.5,
  } }))
  await page.route('**/api/workouts?date=*', (route) => route.fulfill({ json: [{
    id: 'session-1',
    userId: 'user-1',
    date: selectedDate,
    title: 'Strength B',
    notes: null,
    exercises: [],
    createdAt: '2026-07-27T18:30:00.000Z',
    updatedAt: '2026-07-27T18:30:00.000Z',
  }] }))
  await page.route('**/api/achievements?*', (route) => route.fulfill({ json: [{
    definition: {
      id: 'achievement-1',
      userId: 'user-1',
      name: '5K time',
      category: 'running',
      metricType: 'duration',
      unit: 'minutes',
      betterDirection: 'lower',
      targetValue: 25,
      archivedAt: null,
      createdAt: '',
      updatedAt: '',
    },
    entries: [],
    latest: null,
    previous: null,
    personalBest: null,
    trend: { delta: null, direction: 'none', isImprovement: null },
    targetProgress: null,
  }] }))
}

test('Health owns the cross-domain overview while Nutrition keeps the detailed log', async ({ page }) => {
  await enableHealthModules(page)
  await mockHealthDay(page)
  await page.goto(`/app/health?date=${today()}`)

  const overview = page.locator('[data-demo-id="health-daily-overview"]')
  await expect(overview).toBeVisible()
  await expect(overview.getByText('960 kcal')).toBeVisible()
  await expect(overview.getByText('64g protein')).toBeVisible()
  await expect(overview.getByText('68.4 kg')).toBeVisible()
  await expect(overview.getByText('1 logged')).toBeVisible()
  await expect(overview.getByText('1 tracked')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Health' }).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')

  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page).toHaveURL(new RegExp(`date=${tomorrow()}`))
  await expect(page.getByText('Tomorrow', { exact: true })).toBeVisible()

  await page.getByRole('navigation', { name: 'Health' }).getByRole('link', { name: 'Nutrition' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/calories\\?date=${tomorrow()}`))
  await expect(page.getByRole('heading', { name: 'Calorie Log' })).toBeVisible()
  const nutritionOverview = page.locator('[data-demo-id="nutrition-daily-overview"]')
  await expect(nutritionOverview.getByText('Workout', { exact: true })).toHaveCount(0)
  await expect(nutritionOverview.getByText('Progress', { exact: true })).toHaveCount(0)
})

test('health workflow stays touch-safe and accessible on mobile', async ({ page }) => {
  await enableHealthModules(page)
  await mockHealthDay(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/app/health?date=${today()}`)

  for (const name of ['Previous day', 'Next day', 'Today']) {
    const control = page.getByRole('button', { name }).first()
    const box = await control.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  for (const name of ['Overview', 'Nutrition', 'Workouts', 'Progress']) {
    const link = page.getByRole('navigation', { name: 'Health' }).getByRole('link', { name })
    const box = await link.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }

  expect(await page.locator('main').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  const results = await new AxeBuilder({ page })
    .include('[data-demo-id="health-daily-overview"]')
    .analyze()
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})

test('an individual Calorie entry can be deleted and restored without losing the selected date', async ({ page }) => {
  const reset = await page.request.post(`${API_ORIGIN}/test/reset`)
  expect(reset.ok()).toBeTruthy()
  await enableHealthModules(page)
  const entryName = `Undo snack ${Date.now()}`

  const response = await page.request.post(`${API_ORIGIN}/api/calories`, {
    headers: { Authorization: `Bearer ${getAuthTokenFromStorageState()}` },
    data: {
      date: today(),
      time: '10:30',
      name: entryName,
      calories: 180,
      protein: 6,
      carbs: 24,
      fat: 7,
      quantity: '1 serving',
    },
  })
  expect(response.ok()).toBeTruthy()

  await page.goto(`/app/calories?date=${today()}`)
  const detailedLog = page.getByRole('region', { name: 'Detailed log' })
  await expect(detailedLog.getByText(entryName, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: `Delete ${entryName} calorie entry` }).click()
  await expect(detailedLog.getByText(entryName, { exact: true })).not.toBeVisible()
  await page.getByRole('button', { name: `Undo deletion of ${entryName}` }).click()

  await expect(detailedLog.getByText(entryName, { exact: true })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`date=${today()}`))
})

test('Achievement selection and target progress are programmatic', async ({ page }) => {
  await enableHealthModules(page)
  await page.route('**/api/achievements?*', (route) => route.fulfill({ json: [
    {
      definition: {
        id: 'achievement-push-ups',
        userId: 'user-1',
        name: 'Push-ups',
        category: 'strength',
        metricType: 'reps',
        unit: 'reps',
        betterDirection: 'higher',
        targetValue: 20,
        archivedAt: null,
        createdAt: '',
        updatedAt: '',
      },
      entries: [{
        id: 'entry-push-ups',
        achievementId: 'achievement-push-ups',
        userId: 'user-1',
        date: today(),
        value: 12,
        supportingValue: null,
        supportingUnit: null,
        notes: null,
        createdAt: '',
        updatedAt: '',
      }],
      latest: {
        id: 'entry-push-ups',
        achievementId: 'achievement-push-ups',
        userId: 'user-1',
        date: today(),
        value: 12,
        supportingValue: null,
        supportingUnit: null,
        notes: null,
        createdAt: '',
        updatedAt: '',
      },
      previous: null,
      personalBest: null,
      trend: { delta: null, direction: 'none', isImprovement: null },
      targetProgress: 60,
    },
    {
      definition: {
        id: 'achievement-run',
        userId: 'user-1',
        name: '5K time',
        category: 'running',
        metricType: 'duration',
        unit: 'minutes',
        betterDirection: 'lower',
        targetValue: 25,
        archivedAt: null,
        createdAt: '',
        updatedAt: '',
      },
      entries: [],
      latest: null,
      previous: null,
      personalBest: null,
      trend: { delta: null, direction: 'none', isImprovement: null },
      targetProgress: null,
    },
  ] }))

  await page.goto('/app/achievements')
  const pushUps = page.getByRole('button', { name: 'Push-ups 12 reps, selected' })
  await expect(pushUps).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('progressbar', { name: 'Push-ups target progress' })).toHaveAttribute('aria-valuenow', '60')

  const run = page.getByRole('button', { name: '5K time Not recorded' })
  await run.click()
  await expect(run).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Push-ups 12 reps' })).toHaveAttribute('aria-pressed', 'false')
})

test('health surfaces remain contained at desktop, compact, and mobile widths', async ({ page }) => {
  await enableHealthModules(page)
  await mockHealthDay(page)
  await page.route('**/api/workouts/plans**', (route) => route.fulfill({ json: [] }))

  const surfaces = [
    { path: `/app/health?date=${today()}`, heading: 'Health' },
    { path: `/app/calories?date=${today()}`, heading: 'Calorie Log' },
    { path: `/app/workouts?date=${today()}&mode=session`, heading: 'Workout Tracker' },
    { path: '/app/achievements', heading: 'Achievements' },
  ]

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    for (const surface of surfaces) {
      await page.goto(surface.path)
      await expect(page.getByRole('heading', { name: surface.heading, exact: true })).toBeVisible()
      expect(await page.locator('main').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
  }
})
