import { test, expect, type Page, type Route } from '@playwright/test'

// Hermetic: an administrator session and every admin endpoint are mocked, so
// nothing here reads or writes a real account.

const ADMIN = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  authMethod: 'password',
  emailVerified: true,
}

const zeroTotals = {
  requestCount: 0, billedTokens: 0, markupTokens: 0, baseTokens: 0,
  openAiCostUsd: 0, promptTokens: 0, completionTokens: 0, totalOpenAiTokens: 0,
}

export const overview = {
  users: [
    { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'admin', balance: 20, balance_updated_at: null },
    { id: 'guest-1', email: null, name: 'Guest', role: 'user', balance: 10, balance_updated_at: null },
  ],
  totals: { today: zeroTotals, thisWeek: zeroTotals, thisMonth: zeroTotals },
  activity: [],
}

export const managedUsers = [
  {
    id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'admin', signupMethod: 'password',
    createdAt: '2026-07-01T00:00:00.000Z', lastLoginAt: null, disabledAt: null, isTest: false,
    balance: 20, subscriptionActive: true, protection: 'current_admin',
  },
  {
    id: 'guest-1', email: null, name: 'Guest', role: 'user', signupMethod: 'guest',
    createdAt: '2026-09-10T00:00:00.000Z', lastLoginAt: null, disabledAt: null, isTest: false,
    balance: 10, subscriptionActive: false, protection: null,
  },
]

function message(id: string, status: 'pending' | 'handled') {
  return {
    id, userId: 'guest-1', userEmail: null, userName: 'Guest', kind: 'more_actions',
    message: `Request ${id}`, replyTo: 'guest@example.com', status,
    handledAt: status === 'handled' ? '2026-09-12T00:00:00.000Z' : null,
    handledBy: status === 'handled' ? 'admin-1' : null,
    createdAt: '2026-09-11T00:00:00.000Z', updatedAt: '2026-09-11T00:00:00.000Z',
  }
}

type Overrides = Partial<Record<'overview' | 'messages' | 'users' | 'audit', (route: Route) => Promise<void>>>

export async function openAdmin(page: Page, overrides: Overrides = {}, path = '/app/admin') {
  await page.addInitScript((user) => {
    localStorage.setItem('token', 'admin-token')
    localStorage.setItem('healthyflow-session-user-v1', JSON.stringify(user))
  }, ADMIN)
  // Anything the shell asks for that this spec does not describe fails loudly
  // rather than reaching a backend.
  await page.route('**/api/**', route => route.fulfill({ status: 404, json: { error: 'Not mocked' } }))
  await page.route('**/api/auth/verify', route => route.fulfill({ json: ADMIN }))
  await page.route('**/api/admin/overview', overrides.overview ?? (route => route.fulfill({ json: overview })))
  await page.route('**/api/admin/contact-messages**', overrides.messages ?? (route => {
    const status = new URL(route.request().url()).searchParams.get('status')
    const all = [message('m-1', 'pending'), message('m-2', 'pending'), message('m-3', 'handled')]
    return route.fulfill({ json: status === 'all' ? all : all.filter(m => m.status === status) })
  }))
  await page.route('**/api/admin/users', overrides.users ?? (route => route.fulfill({ json: managedUsers })))
  await page.route('**/api/admin/users/audit', overrides.audit ?? (route => route.fulfill({ json: [] })))
  await page.goto(path)
}

test.describe('admin screen reads', () => {
  test('a failed inbox read says so and can be retried, never "no messages"', async ({ page }) => {
    let fail = true
    await openAdmin(page, {
      messages: route => fail
        ? route.fulfill({ status: 500, json: { error: 'Database error' } })
        : route.fulfill({ json: [message('m-1', 'pending')] }),
    })

    await expect(page.getByText('Could not load messages.')).toBeVisible()
    await expect(page.getByText(/No .*in-app messages/)).toHaveCount(0)

    fail = false
    await page.getByRole('button', { name: 'Retry loading messages' }).click()
    await expect(page.getByText('Request m-1')).toBeVisible()
  })

  test('a failed usage read leaves the inbox and user management working', async ({ page }) => {
    await openAdmin(page, {
      overview: route => route.fulfill({ status: 500, json: { error: 'Database error' } }),
    })

    await expect(page.getByText('Could not load usage and balances.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Admin Inbox' })).toBeVisible()
    await expect(page.getByText('Request m-1')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
    await expect(page.getByText('No email — Guest')).toBeVisible()
  })

  test('the markup settings are gone from the screen', async ({ page }) => {
    await openAdmin(page)

    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
    await expect(page.getByText(/Billing Settings|Markup percent|Minimum markup|App tokens per/)).toHaveCount(0)
  })

  test('the pending badge counts pending messages under every filter', async ({ page }) => {
    await openAdmin(page)

    await expect(page.getByText('2 pending')).toBeVisible()
    await page.getByRole('button', { name: 'handled', exact: true }).click()
    await expect(page.getByText('Request m-3')).toBeVisible()
    await expect(page.getByText('2 pending')).toBeVisible()
  })
})

test.describe('admin screen naming', () => {
  test('is called Admin and speaks in actions, not tokens', async ({ page }) => {
    await openAdmin(page)

    await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Spend' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ledger' })).toBeVisible()
    await expect(page.getByText('Balances are in actions: text 1 · photo 5 · premium 10.')).toBeVisible()
    const copy = await page.locator('main').innerText()
    expect(copy.replace(/Model tokens/g, '')).not.toMatch(/token/i)
  })

  test('an old Token Manager link lands on Admin', async ({ page }) => {
    await openAdmin(page, {}, '/app/token-manager')

    await expect(page).toHaveURL(/\/app\/admin$/)
    await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible()
  })
})
