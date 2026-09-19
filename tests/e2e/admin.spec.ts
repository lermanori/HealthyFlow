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

function ledgerRow(id: string, extra: Record<string, unknown>) {
  return {
    id, createdAt: '2026-09-18T10:00:00.000Z', userId: 'guest-1', userEmail: null, userName: 'Guest',
    kind: 'ai', endpoint: null, model: null, actionClass: null, reason: null, creditsDelta: 0,
    balanceAfter: null, costUsd: null, costUnknown: false, actorEmail: null, legacyUnit: false, ...extra,
  }
}
export const ledgerRows = [
  ledgerRow('r1', { endpoint: 'parse-tasks', model: 'gpt-4o-mini', actionClass: 'text', creditsDelta: -1, costUsd: 0.00031 }),
  ledgerRow('r2', { kind: 'refund', endpoint: 'parse-meals', model: 'gpt-5.4-mini', actionClass: 'photo', reason: 'refund_failed_call_cost_unknown', costUnknown: true }),
  ledgerRow('r3', { kind: 'grant', userId: 'person-1', userEmail: 'person@example.com', userName: 'Person', reason: 'monthly_free_refill', creditsDelta: 15, balanceAfter: 15 }),
  ledgerRow('r4', { kind: 'admin', userId: 'person-1', userEmail: 'person@example.com', userName: 'Person', reason: 'admin_balance_set', creditsDelta: 10, balanceAfter: 25, actorEmail: 'admin@example.com' }),
  ledgerRow('r5', { userId: 'person-1', userEmail: 'person@example.com', userName: 'Person', endpoint: 'parse-tasks', model: 'gpt-4o-mini', creditsDelta: -6, legacyUnit: true }),
]

function spendSummary(costUsd: number) {
  return {
    costUsd,
    requests: 40,
    uncostedCalls: 2,
    actions: { text: { count: 30, credits: 30 }, photo: { count: 2, credits: 10 }, premium: { count: 1, credits: 10 } },
    refundedAttempts: 3,
    freeGranted: { guest: 20, monthly: 45 },
    adminChanges: { count: 1, net: -40 },
    legacyUnitRows: 0,
  }
}
const limit = (max: number) => ({ max, windowMinutes: 15 })
export const guards = {
  limits: {
    requestChars: 24000, imagesPerRequest: 4, pricedModels: ['gpt-4o-mini', 'gpt-5.4'],
    globalDailyCeilingUsd: 25, accountDailyActions: 200, nearCapActions: 160, guestActions: 10, monthlyActions: 15,
    guestNetworkWindowHours: 24, actionPrice: { text: 1, photo: 5, premium: 10 }, toolLoopModelCalls: 4,
    entry: {
      guestStart: limit(5), signup: limit(5), providerSignIn: limit(20),
      recoveryRequest: limit(5), recoveryRedeem: limit(20), accountDelete: limit(5),
    },
  },
  spentToday: { state: 'ok', usd: 21 },
  refusalsToday: { state: 'ok', byCode: { global_ceiling: 2, insufficient_credits: 7, email_unverified: 1 } },
  nearCap: { state: 'ok', accounts: [{ userId: 'busy-user-1', email: 'busy@example.com', actions: 180 }] },
  guestsWithoutGrantToday: { state: 'ok', count: 4 },
}

export const spend = { today: spendSummary(0.25), thisWeek: spendSummary(1.5), thisMonth: spendSummary(6.75) }

export const managedUsers = [
  {
    id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'admin', signupMethod: 'password',
    createdAt: '2026-07-01T00:00:00.000Z', lastLoginAt: null, disabledAt: null, isTest: false,
    emailVerified: true, deviceId: 'd3a1ce00-0000-4000-8000-000000000001', freeAllowance: { state: 'claimed', kind: 'monthly', nextAvailableAt: '2026-10-01T00:00:00.000Z' },
    balance: 20, subscriptionActive: true, protection: 'current_admin',
  },
  {
    id: 'guest-1', email: null, name: 'Guest', role: 'user', signupMethod: 'guest',
    createdAt: '2026-09-10T00:00:00.000Z', lastLoginAt: null, disabledAt: null, isTest: false,
    emailVerified: false, deviceId: 'd3a1ce00-0000-4000-8000-000000000001', freeAllowance: { state: 'network_limited', kind: 'guest_initial' },
    balance: 10, subscriptionActive: false, protection: null,
  },
  {
    id: 'person-1', email: 'person@example.com', name: 'Person', role: 'user', signupMethod: 'password',
    createdAt: '2026-09-12T00:00:00.000Z', lastLoginAt: null, disabledAt: null, isTest: false,
    emailVerified: false, deviceId: null, freeAllowance: { state: 'email_unverified', kind: 'monthly' },
    balance: 15, subscriptionActive: false, protection: null,
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

type Overrides = Partial<Record<'ledger' | 'guards' | 'spend' | 'messages' | 'users' | 'audit' | 'balance' | 'cloud', (route: Route) => Promise<void>>>

export async function openAdmin(page: Page, overrides: Overrides = {}, path = '/app/admin') {
  await page.addInitScript((user) => {
    localStorage.setItem('token', 'admin-token')
    localStorage.setItem('healthyflow-session-user-v1', JSON.stringify(user))
  }, ADMIN)
  // Anything the shell asks for that this spec does not describe fails loudly
  // rather than reaching a backend.
  await page.route('**/api/**', route => route.fulfill({ status: 404, json: { error: 'Not mocked' } }))
  await page.route('**/api/auth/verify', route => route.fulfill({ json: ADMIN }))
  await page.route('**/api/admin/ledger**', overrides.ledger ?? (route => route.fulfill({ json: { rows: ledgerRows, nextOffset: null } })))
  await page.route('**/api/admin/spend**', overrides.spend ?? (route => route.fulfill({ json: spend })))
  await page.route('**/api/admin/guards', overrides.guards ?? (route => route.fulfill({ json: guards })))
  await page.route('**/api/admin/contact-messages**', overrides.messages ?? (route => {
    const status = new URL(route.request().url()).searchParams.get('status')
    const all = [message('m-1', 'pending'), message('m-2', 'pending'), message('m-3', 'handled')]
    return route.fulfill({ json: status === 'all' ? all : all.filter(m => m.status === status) })
  }))
  await page.route('**/api/admin/users', overrides.users ?? (route => route.request().method() === 'PATCH'
    ? route.fulfill({ json: { updatedUserIds: route.request().postDataJSON().userIds } })
    : route.fulfill({ json: managedUsers })))
  if (overrides.balance) await page.route('**/api/admin/users/*/balance', overrides.balance)
  if (overrides.cloud) await page.route('**/api/admin/users/*/cloud', overrides.cloud)
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

  test('a failed ledger read leaves the inbox and user management working', async ({ page }) => {
    await openAdmin(page, {
      ledger: route => route.fulfill({ status: 500, json: { error: 'Could not read the ledger' } }),
    })

    await expect(page.getByText('Could not load the ledger.')).toBeVisible()
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

test.describe('setting an action balance', () => {
  test('applies against the balance the admin started from, with a note', async ({ page }) => {
    let body: Record<string, unknown> | null = null
    await openAdmin(page, {
      balance: route => {
        body = route.request().postDataJSON()
        return route.fulfill({ json: { balance: 25, delta: 15 } })
      },
    })

    await expect(page.getByRole('heading', { name: 'Billing Accounts' })).toHaveCount(0)
    await expect(page.getByText(/AI actions available/)).toHaveCount(0)

    await page.getByRole('button', { name: 'Set actions for Guest' }).click()
    await page.getByLabel('New action balance for Guest').fill('25')
    await page.getByLabel('Note for Guest').fill('Founders Club request')
    await page.getByRole('button', { name: 'Set', exact: true }).click()

    await expect(page.getByText('Balance set to 25 actions')).toBeVisible()
    expect(body).toEqual({ expectedBalance: 10, balance: 25, note: 'Founders Club request' })
  })

  test('a balance that moved meanwhile is refused and shown, and nothing is overwritten', async ({ page }) => {
    await openAdmin(page, {
      balance: route => route.fulfill({
        status: 409,
        json: { error: 'The balance changed since it was shown.', reason: 'balance_changed', currentBalance: 12 },
      }),
    })

    await page.getByRole('button', { name: 'Set actions for Guest' }).click()
    await page.getByLabel('New action balance for Guest').fill('25')
    await page.getByRole('button', { name: 'Set', exact: true }).click()

    await expect(page.getByText('The balance changed to 12 since you started. Nothing was changed.')).toBeVisible()
    await expect(page.getByLabel('New action balance for Guest')).toHaveValue('25')
  })

  test('what was typed survives an unrelated refresh', async ({ page }) => {
    await openAdmin(page)

    await page.getByRole('button', { name: 'Set actions for Guest' }).click()
    await page.getByLabel('New action balance for Guest').fill('40')

    const refetched = page.waitForRequest(request => request.url().endsWith('/api/admin/users') && request.method() === 'GET')
    await page.getByRole('checkbox', { name: 'Select Guest' }).check()
    await page.getByRole('button', { name: 'Mark test' }).click()
    await refetched

    await expect(page.getByLabel('New action balance for Guest')).toHaveValue('40')
  })
})

test.describe('the Cloud switch', () => {
  test('a Guest cannot be given Cloud', async ({ page }) => {
    await openAdmin(page)

    await expect(page.getByRole('switch', { name: 'Cloud for Guest (needs a claimed account)' })).toBeDisabled()
  })

  test('asks before changing anything, and cancelling sends nothing', async ({ page }) => {
    const sent: unknown[] = []
    await openAdmin(page, {
      cloud: route => {
        sent.push(route.request().postDataJSON())
        return route.fulfill({ json: { userId: 'admin-1', active: false } })
      },
    })

    await page.getByRole('switch', { name: 'Cloud for admin@example.com' }).click()
    await expect(page.getByRole('heading', { name: 'Turn Cloud off for admin@example.com?' })).toBeVisible()
    await expect(page.getByText('AI actions are not affected.', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    expect(sent).toEqual([])

    await page.getByRole('switch', { name: 'Cloud for admin@example.com' }).click()
    await page.getByRole('button', { name: 'Turn Cloud off' }).click()
    await expect(page.getByText('Cloud turned off')).toBeVisible()
    expect(sent).toEqual([{ active: false }])
  })

  test('a Cloud change reads as such in the admin history', async ({ page }) => {
    await openAdmin(page, {
      audit: route => route.fulfill({ json: [{
        id: 'a-1', actorEmail: 'admin@example.com', targetEmail: 'admin@example.com', targetUserId: 'admin-1',
        action: 'cloud_granted', details: {}, createdAt: '2026-09-19T08:00:00.000Z',
      }] }),
    })

    await expect(page.getByText('turned Cloud on for admin@example.com')).toBeVisible()
  })
})

test.describe('disabling a Guest', () => {
  test('warns that the Guest loses its day on the device, and cancelling sends nothing', async ({ page }) => {
    const sent: unknown[] = []
    await openAdmin(page, {
      users: route => {
        if (route.request().method() === 'PATCH') {
          sent.push(route.request().postDataJSON())
          return route.fulfill({ json: { updatedUserIds: ['guest-1'] } })
        }
        return route.fulfill({ json: managedUsers })
      },
    })

    await page.getByRole('checkbox', { name: 'Select Guest' }).check()
    await page.getByRole('button', { name: 'Disable' }).click()
    await expect(page.getByRole('heading', { name: 'Disable 1 account, including a Guest?' })).toBeVisible()
    await expect(page.getByText(/cannot reach the day stored on its device/)).toBeVisible()
    await expect(page.getByText(/Enabling it again does not restore/)).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    expect(sent).toEqual([])

    await page.getByRole('button', { name: 'Disable' }).click()
    await page.getByRole('button', { name: 'Disable anyway' }).click()
    await expect(page.getByText('1 user updated')).toBeVisible()
    expect(sent).toEqual([{ userIds: ['guest-1'], action: 'disable' }])
  })

  test('an account with an email is disabled without that warning', async ({ page }) => {
    await openAdmin(page)

    await page.getByRole('checkbox', { name: 'Select person@example.com' }).check()
    await page.getByRole('button', { name: 'Disable' }).click()
    await expect(page.getByText('1 user updated')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('the panel says what disabling keeps and what a Guest loses', async ({ page }) => {
    await openAdmin(page)

    await expect(page.getByText('Disabling preserves data;')).toHaveCount(0)
    await expect(page.getByText(/a disabled Guest loses access to the day on its device/)).toBeVisible()
  })
})

test.describe('telling accounts apart', () => {
  test('each account shows its id, verification and free-allowance state', async ({ page }) => {
    await openAdmin(page)

    await expect(page.getByRole('button', { name: /Copy id of Guest guest-1/ })).toHaveText('id guest-1')
    await expect(page.getByText('Network already used the Guest grant')).toBeVisible()
    await expect(page.getByText('Monthly grant needs a verified email')).toBeVisible()
    await expect(page.getByText(/This month’s received/)).toBeVisible()
    await expect(page.getByText('Email not verified')).toBeVisible()
    await expect(page.getByText('Email verified', { exact: true })).toBeVisible()
  })

  test('People can be searched by id', async ({ page }) => {
    await openAdmin(page)

    const people = page.getByRole('region', { name: 'User Management' })
    await page.getByPlaceholder('Search name, email, id or device').fill('person-')
    await expect(people.getByText('person@example.com')).toBeVisible()
    await expect(people.getByText('No email — Guest')).toHaveCount(0)
  })

  test('an inbox message from a Guest leads to that Guest in People', async ({ page }) => {
    await openAdmin(page)

    await expect(page.getByText('guest@example.com').first()).toBeVisible()
    await page.getByRole('button', { name: 'Show in People' }).first().click()

    const people = page.getByRole('region', { name: 'User Management' })
    await expect(page.getByPlaceholder('Search name, email, id or device')).toHaveValue('guest-1')
    await expect(people.getByText('No email — Guest')).toBeVisible()
    await expect(people.getByText('person@example.com')).toHaveCount(0)
  })

  test('copying an id says whether it worked', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openAdmin(page)

    await page.getByRole('button', { name: /Copy id of Guest guest-1/ }).click()
    await expect(page.getByText('Id copied')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('guest-1')
  })
})

test.describe('Spend', () => {
  test('shows recorded cost and actions charged, and never counts admin changes as spending', async ({ page }) => {
    await openAdmin(page)

    const panel = page.getByRole('region', { name: 'Spend' })
    await expect(panel.getByText('$0.25')).toBeVisible()
    await expect(panel.getByText('2 of 40 AI calls have an unknown cost')).toBeVisible()
    await expect(panel.getByText('text 30 · photo 2 · premium 1')).toBeVisible()
    await expect(panel.getByText('Net -40 actions — not spending')).toBeVisible()
    await expect(panel.getByText('Periods are UTC.', { exact: false })).toBeVisible()

    await panel.getByRole('button', { name: 'This month' }).click()
    await expect(panel.getByText(/Recorded this month:/)).toBeVisible()
    await expect(panel.getByText('$6.75').first()).toBeVisible()
  })

  test('leaves test accounts out unless asked', async ({ page }) => {
    const asked: string[] = []
    await openAdmin(page, {
      spend: route => {
        asked.push(new URL(route.request().url()).searchParams.get('includeTest') ?? 'no')
        return route.fulfill({ json: spend })
      },
    })

    await expect(page.getByRole('region', { name: 'Spend' }).getByText('$0.25')).toBeVisible()
    await page.getByLabel('Include test accounts').check()
    await expect.poll(() => asked).toEqual(['no', 'true'])
  })

  test('a failed spend read says so, alone', async ({ page }) => {
    await openAdmin(page, { spend: route => route.fulfill({ status: 500, json: { error: 'Could not read spend' } }) })

    await expect(page.getByText('Could not load spend.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ledger' })).toBeVisible()
  })
})

test.describe('Ledger', () => {
  test('shows signed actions, recorded cost, the admin who acted, and old-unit rows', async ({ page }) => {
    await openAdmin(page)
    const ledger = page.getByRole('region', { name: 'Ledger' })

    await expect(ledger.getByRole('row', { name: /Monthly free actions/ })).toContainText('+15')
    await expect(ledger.getByRole('row', { name: /Balance set in Admin/ })).toContainText('+10')
    await expect(ledger.getByRole('row', { name: /Balance set in Admin/ })).toContainText('admin@example.com')
    await expect(ledger.getByRole('row', { name: /Refunded failed parse-meals/ })).toContainText('Unknown')
    await expect(ledger.getByRole('row', { name: /old credit unit/ })).toContainText('-6')
    await expect(ledger.getByText('$0.00031')).toBeVisible()
  })

  test('filters by kind and by person, and pages', async ({ page }) => {
    const asked: string[] = []
    await openAdmin(page, {
      ledger: route => {
        const url = new URL(route.request().url())
        asked.push(url.search)
        const offset = Number(url.searchParams.get('offset'))
        return route.fulfill({ json: offset === 0
          ? { rows: ledgerRows, nextOffset: 50 }
          : { rows: [ledgerRow('r6', { endpoint: 'ai-chat', model: 'gpt-4o-mini', creditsDelta: -1 })], nextOffset: null } })
      },
    })
    const ledger = page.getByRole('region', { name: 'Ledger' })

    await ledger.getByRole('button', { name: 'Load more' }).click()
    await expect(ledger.getByText('ai-chat · gpt-4o-mini')).toBeVisible()
    await expect(ledger.getByRole('button', { name: 'Load more' })).toHaveCount(0)

    await ledger.getByLabel('Filter ledger by kind').selectOption('refund')
    await ledger.getByRole('button', { name: 'Show only Guest guest-1 in the ledger' }).first().click()
    await expect.poll(() => asked.at(-1)).toContain('userId=guest-1')
    expect(asked.some(search => search.includes('kind=refund'))).toBe(true)
    await expect(ledger.getByRole('button', { name: 'Show everyone in the ledger' })).toBeVisible()
  })
})

test.describe('Guards', () => {
  test('lists every guard with its limit and today’s state', async ({ page }) => {
    await openAdmin(page)
    const panel = page.getByRole('region', { name: 'Guards' })

    await expect(panel.getByText('$21.00 of $25.00 spent today · 2 refused today')).toBeVisible()
    await expect(panel.getByRole('meter', { name: 'Share of the daily ceiling spent' })).toBeVisible()
    await expect(panel.getByText('busy@example.com · 180')).toBeVisible()
    await expect(panel.getByText(/4 Guests today without the network grant \(24h window\) · 1 refused today/)).toBeVisible()
    await expect(panel.getByText('text 1 · photo 5 · premium 10')).toBeVisible()
    await expect(panel.getByText('7 refused today')).toBeVisible()
    await expect(panel.getByText('20 per 15 min').first()).toBeVisible()
    await expect(panel.getByText('Not visible to the app')).toHaveCount(3)
  })

  test('a live value that could not be read says so, never 0', async ({ page }) => {
    await openAdmin(page, {
      guards: route => route.fulfill({ json: {
        ...guards,
        spentToday: { state: 'unavailable' },
        refusalsToday: { state: 'unavailable' },
        nearCap: { state: 'unavailable' },
        guestsWithoutGrantToday: { state: 'unavailable' },
      } }),
    })
    const panel = page.getByRole('region', { name: 'Guards' })

    await expect(panel.getByText('Today’s spend unavailable')).toBeVisible()
    await expect(panel.getByText('Accounts near the cap unavailable')).toBeVisible()
    await expect(panel.getByText('Refusals unavailable').first()).toBeVisible()
    await expect(panel.getByText(/0 refused today/)).toHaveCount(0)
  })

  test('a failed guards read says so, alone', async ({ page }) => {
    await openAdmin(page, { guards: route => route.fulfill({ status: 500, json: { error: 'Could not read the guards' } }) })

    await expect(page.getByText('Could not load the guards.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Spend' })).toBeVisible()
  })
})

test.describe('devices', () => {
  test('accounts on one device are tagged together, and the tag filters People to them', async ({ page }) => {
    await openAdmin(page)
    const people = page.getByRole('region', { name: 'User Management' })

    await expect(people.getByRole('button', { name: 'Show accounts on device d3a1ce00' }).first()).toContainText('2 accounts')
    await expect(people.getByText('device not seen yet')).toBeVisible()

    await people.getByRole('button', { name: 'Show accounts on device d3a1ce00' }).first().click()
    await expect(page.getByPlaceholder('Search name, email, id or device')).toHaveValue('d3a1ce00-0000-4000-8000-000000000001')
    await expect(people.getByText('No email — Guest')).toBeVisible()
    await expect(people.getByText('admin@example.com')).toBeVisible()
    await expect(people.getByText('person@example.com')).toHaveCount(0)
  })
})
