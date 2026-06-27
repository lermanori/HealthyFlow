#!/usr/bin/env node

const { spawn } = require('child_process')
const { chromium } = require('playwright')

const PORT = Number(process.env.PORT || 5177)
const BASE_URL = `http://127.0.0.1:${PORT}`

function startVite() {
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  })

  child.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))
  return child
}

async function waitForServer(timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(BASE_URL)
      if (response.ok) return
    } catch {
      // Keep polling until Vite is listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${BASE_URL}`)
}

async function main() {
  const vite = startVite()
  let browser

  try {
    await waitForServer()
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } })

    await page.addInitScript(() => localStorage.setItem('token', 'test-token'))

    await page.route('**/api/auth/verify', (route) => route.fulfill({
      json: { user: { id: 'u1', email: 'test@example.com', name: 'Test User', role: 'user' } },
    }))
    await page.route('**/api/settings', (route) => route.fulfill({
      json: {
        notifications: true,
        dailyReminders: true,
        weeklyReports: false,
        aiSuggestions: true,
        smartReminders: false,
        completionSounds: true,
        calorieIntake: false,
        achievementTracker: false,
      },
    }))
    await page.route('**/api/tasks**', (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [] })
      return route.fulfill({ json: {} })
    })
    await page.route('**/api/ai/**', (route) => route.fulfill({ json: {} }))
    await page.route('**/api/calendar/google/sync-timed-tasks', (route) =>
      route.fulfill({ json: { synced: 0 } }))
    await page.route('**/api/calendar/google/events?**', (route) => route.fulfill({
      json: [{
        id: 'cal-1',
        provider: 'google',
        calendarId: 'primary',
        externalEventId: 'google-1',
        title: 'Imported calendar event',
        description: null,
        location: 'Room A',
        startAt: '2026-06-27T06:00:00.000Z',
        endAt: '2026-06-27T07:00:00.000Z',
        localStartTime: '09:00',
        localEndTime: '10:00',
        allDay: false,
        status: 'confirmed',
        htmlLink: null,
        completed: false,
        completedAt: null,
      }],
    }))
    await page.route('**/api/calendar/google/events/cal-1/schedule', (route) => {
      const body = route.request().postDataJSON()
      if (body.startTime !== '14:00') {
        return route.fulfill({ status: 400, json: { error: `Unexpected startTime ${body.startTime}` } })
      }
      return route.fulfill({
        json: {
          id: 'cal-1',
          provider: 'google',
          calendarId: 'primary',
          externalEventId: 'google-1',
          title: 'Imported calendar event',
          description: null,
          location: 'Room A',
          startAt: '2026-06-27T11:00:00.000Z',
          endAt: '2026-06-27T12:00:00.000Z',
          localStartTime: '14:00',
          localEndTime: '15:00',
          allDay: false,
          status: 'confirmed',
          htmlLink: null,
          completed: false,
          completedAt: null,
        },
      })
    })

    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await page.getByText('Imported calendar event').waitFor({ timeout: 10_000 })

    const draggable = page.locator('[data-rfd-draggable-id="calendar:cal-1"]')
    const handle = page.locator('[data-rfd-drag-handle-draggable-id="calendar:cal-1"]')
    const draggableId = await draggable.getAttribute('data-rfd-draggable-id')
    const handleCount = await handle.count()

    if (draggableId !== 'calendar:cal-1' || handleCount !== 1) {
      throw new Error(`Expected one draggable calendar event, got draggableId=${draggableId}, handleCount=${handleCount}`)
    }

    console.log(JSON.stringify({ ok: true, draggableId, handleCount }))
  } finally {
    if (browser) await browser.close()
    vite.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
