import fs from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/ai-stubs'

function getAuthTokenFromStorageState() {
  const storageState = JSON.parse(fs.readFileSync('tests/e2e/.auth/user.json', 'utf8'))
  for (const origin of storageState.origins ?? []) {
    const token = origin.localStorage?.find(
      (entry: { name: string; value: string }) => entry.name === 'token'
    )?.value
    if (token) return token
  }
  throw new Error('Missing auth token in Playwright storage state')
}

async function setPlanningWindow(page: Page, planningWindow: null) {
  const response = await page.request.patch('http://localhost:3001/api/settings', {
    headers: { Authorization: `Bearer ${getAuthTokenFromStorageState()}` },
    data: { planningWindow },
  })
  expect(response.ok()).toBeTruthy()
}

test.beforeEach(async ({ page }) => {
  await setPlanningWindow(page, null)
})

test.afterEach(async ({ page }) => {
  await setPlanningWindow(page, null)
})

test('Today composes its selected-day regions through one DaySummary request', async ({ page }) => {
  const selectedDayRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      url.pathname === '/api/day-summary' ||
      (url.pathname === '/api/tasks' && url.searchParams.has('date')) ||
      url.pathname === '/api/calendar/google/events' ||
      (url.pathname === '/api/calories' && url.searchParams.has('date'))
    ) {
      selectedDayRequests.push(`${url.pathname}?${url.searchParams.toString()}`)
    }
  })

  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect.poll(
    () => selectedDayRequests.filter((request) => request.startsWith('/api/day-summary?')).length
  ).toBe(1)

  expect(selectedDayRequests.filter((request) => request.startsWith('/api/tasks?'))).toEqual([])
  expect(selectedDayRequests.filter((request) => request.startsWith('/api/calendar/google/events?'))).toEqual([])
  expect(selectedDayRequests.filter((request) => request.startsWith('/api/calories?'))).toEqual([])
})

test('usable-day settings stay opt-in and produce an honest non-unavailable capacity state', async ({ page }) => {
  await page.goto('/app/settings')
  const capacitySwitch = page.getByRole('switch', { name: 'Calculate daily capacity' })
  await expect(capacitySwitch).toHaveAttribute('aria-checked', 'false')

  const savePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/settings') &&
    response.request().method() === 'PATCH'
  )
  await capacitySwitch.click()
  expect((await savePromise).ok()).toBeTruthy()

  await expect(capacitySwitch).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByLabel('Day starts')).toHaveValue('08:00')
  await expect(page.getByLabel('Day ends')).toHaveValue('18:00')
  await expect(page.getByLabel('Transition buffer')).toHaveValue('15')

  const summaryResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/day-summary'
  )
  await page.goto('/app')
  const summaryResponse = await summaryResponsePromise
  expect(summaryResponse.ok()).toBeTruthy()
  const summary = await summaryResponse.json()
  expect(summary.settings.planningWindow).toEqual({
    startTime: '08:00',
    endTime: '18:00',
    transitionBufferMinutes: 15,
  })
  expect(summary.capacity.status).not.toBe('unavailable')
  if (summary.capacity.status === 'partial') {
    expect(summary.capacity).not.toHaveProperty('availableMinutes')
    expect(summary.capacity).toHaveProperty('availableUpperBoundMinutes')
  } else {
    expect(summary.capacity).toHaveProperty('availableMinutes')
  }
})
