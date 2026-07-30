import { test, expect } from '@playwright/test'
import { TEST_EMAIL, TEST_PASSWORD } from './globalSetup'

const launchOffer = {
  foundingMemberLimit: 100,
  foundingMembersRemaining: 8,
  onboardingCredits: 250,
  foundingOnboardingCredits: 250,
  standardOnboardingCredits: 50,
  foundingPriceUsd: 9,
  regularPriceUsd: 19,
  monthlyCredits: 500,
  topUpPriceUsd: 5,
  topUpCredits: 250,
}

const personaCases = [
  [
    'maya',
    'Maya',
    'Workday overload',
    'Maya doesn’t need another list. She needs a day with shape.',
    'Turn my day into a plan',
  ],
  [
    'noam',
    'Noam',
    'Stuck and overwhelmed',
    'Noam doesn’t need a perfect plan. He needs one manageable move.',
    'Start with one manageable thing',
  ],
  [
    'lina',
    'Lina',
    'Health scattered across apps',
    'Lina doesn’t need four health apps. She needs one connected day.',
    'Bring my health into one day',
  ],
  [
    'amir',
    'Amir',
    'Everything changed again',
    'Amir doesn’t need a rigid plan. He needs one that can change.',
    'Build a plan that can change',
  ],
] as const

test.describe('demo acquisition funnel', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const [persona, name, problem, valueHeadline, outcome] of personaCases) {
    test(`${problem} shows ${name}'s proof before its outcome`, async ({ page }) => {
      await page.goto('/app/demo?source=e2e')

      await expect(page.getByRole('button', { name: new RegExp(`^${problem}`) })).toBeVisible()
      await page.getByRole('button', { name: new RegExp(`^${problem}`) }).click()

      await expect(page).toHaveURL(new RegExp(`/app/demo\\?persona=${persona}&stage=proof`))
      await expect(page.getByRole('heading', { name: valueHeadline })).toBeVisible()
      await expect(page.getByText(`The proof in ${name}'s day`)).toBeVisible()
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      await page.getByRole('button', { name: `Continue to ${name}'s outcome` }).click()

      await expect(page).toHaveURL(new RegExp(`/app/demo\\?persona=${persona}&stage=finish&reason=finished`))
      await expect(page.getByRole('heading', { name: `${outcome}.` })).toBeVisible()
      await expect(page.getByText('Your workspace starts clean.')).toBeVisible()
    })
  }

  test('open signup goes directly to a clean, attributed account form', async ({ page }) => {
    let signupBody: Record<string, unknown> | null = null
    await page.route('**/api/**', route => route.fulfill({
      status: 500,
      json: { error: 'Endpoint is outside this funnel test.' },
    }))
    await page.route('**/api/auth/signup-status', route => route.fulfill({
      json: { mode: 'open', remaining: 8, offer: launchOffer },
    }))
    await page.route('**/api/auth/signup', async route => {
      signupBody = route.request().postDataJSON()
      await route.fulfill({
        json: {
          user: {
            id: 'clean-user',
            email: 'clean@example.com',
            name: 'Clean User',
            role: 'user',
            authMethod: 'password',
          },
          token: 'clean-user-token',
          signupCredits: {
            credits: 250,
            cohort: 'founding',
            balance: 250,
            alreadyGranted: false,
          },
        },
      })
    })

    await page.goto('/app/demo?persona=noam&stage=finish&reason=finished&source=landing&utm_campaign=beta')
    await page.getByRole('button', { name: 'Start with one manageable thing' }).click()

    await expect(page).toHaveURL(/\/app\/login\?mode=signup&from=demo&persona=noam/)
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await expect(page.getByText(/What feels hardest to start right now/)).toBeVisible()
    await expect(page.getByText(/demo workspace does not/)).toBeVisible()

    await page.locator('#name').fill('Clean User')
    await page.locator('#email').fill('clean@example.com')
    await page.locator('#password').fill('clean-password')
    await page.locator('#confirmPassword').fill('clean-password')
    await page.getByRole('button', { name: 'Create account', exact: true }).last().click()

    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBe('clean-user-token')
    expect(signupBody).toEqual({
      email: 'clean@example.com',
      password: 'clean-password',
      name: 'Clean User',
    })
    expect(await page.evaluate(() => localStorage.getItem('demoPersona'))).toBeNull()
    expect(await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('healthyflow-demo-acquisition-v1') ?? '{}').persona,
    )).toBe('noam')
  })

  test('invite-only access joins the waitlist inline with attribution', async ({ page }) => {
    let submitted: Record<string, unknown> | null = null
    await page.route('**/api/auth/signup-status', route => route.fulfill({
      json: { mode: 'waitlist', remaining: 0, offer: launchOffer },
    }))
    await page.route('**/api/waitlist', async route => {
      submitted = route.request().postDataJSON()
      await route.fulfill({ json: { joined: true } })
    })

    await page.goto('/app/demo?persona=lina&stage=finish&reason=closed&source=landing&utm_campaign=beta')
    await page.locator('#demo-waitlist-email').fill('demo-funnel@example.com')
    await page.getByRole('button', { name: 'Join the waitlist' }).click()

    await expect(page.getByText("You're on the list.")).toBeVisible()
    await expect(page).toHaveURL(/stage=finish/)
    expect(submitted).toMatchObject({
      email: 'demo-funnel@example.com',
      source: 'demo-lina',
      utmCampaign: 'beta',
    })
  })

  test('a signed-in user returns with the original session', async ({ page }) => {
    const unauthorizedRequests: string[] = []
    page.on('response', response => {
      if (response.status() === 401) unauthorizedRequests.push(response.url())
    })
    await page.goto('/app')
    await page.locator('#email').fill(TEST_EMAIL)
    await page.locator('#password').fill(TEST_PASSWORD)
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Today' })).toBeVisible({ timeout: 10_000 })
    const originalToken = await page.evaluate(() => localStorage.getItem('token'))

    await page.goto('/app/demo?source=login')
    await page.getByRole('button', { name: /^Workday overload/ }).click()
    await expect(page.getByRole('heading', {
      name: 'Maya doesn’t need another list. She needs a day with shape.',
    })).toBeVisible()
    expect(await page.evaluate(
      () => Boolean(sessionStorage.getItem('healthyflow-demo-return-token-v1')),
    )).toBe(false)

    await page.getByRole('button', { name: "Explore Maya's workspace instead" }).click()
    await expect(page).toHaveURL('/app?demo=maya')
    expect(await page.evaluate(
      () => Boolean(sessionStorage.getItem('healthyflow-demo-return-token-v1')),
    )).toBe(true)

    await page.getByRole('button', { name: 'Exit demo' }).click()
    await page.getByRole('button', { name: 'Return to my workspace' }).click()

    await expect(page).toHaveURL('/app')
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBe(originalToken)
    expect(await page.evaluate(
      () => sessionStorage.getItem('healthyflow-demo-return-token-v1'),
    )).toBeNull()
    expect(unauthorizedRequests).toEqual([])
  })

  test('mobile proof reaches its CTA without an overlay or clipped controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/api/auth/signup-status', route => route.fulfill({
      json: { mode: 'waitlist', remaining: 0, offer: launchOffer },
    }))
    await page.goto('/app/demo?persona=noam&stage=proof&source=landing')
    await page.reload()

    await expect(page.getByRole('heading', {
      name: 'Noam doesn’t need a perfect plan. He needs one manageable move.',
    })).toBeVisible()
    await expect(page.getByText('Put laundry in the machine · 11:00')).toBeVisible()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await page.getByRole('button', { name: "Continue to Noam's outcome" }).click()

    await expect(page).toHaveURL(/persona=noam&stage=finish&reason=finished/)
    await expect(page.getByRole('heading', { name: 'Start with one manageable thing.' })).toBeVisible()
    await expect(page.locator('#demo-waitlist-email')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try another day' })).toBeVisible()
  })

  test('Keep exploring and Try another day have explicit destinations', async ({ page }) => {
    await page.route('**/api/auth/signup-status', route => route.fulfill({
      json: { mode: 'open', remaining: 8, offer: launchOffer },
    }))
    await page.goto('/app/demo?persona=noam&stage=finish&reason=finished&source=e2e')

    await page.getByRole('button', { name: 'Keep exploring the real demo' }).click()
    await expect(page).toHaveURL('/app?demo=noam')
    await expect(page.getByRole('button', { name: 'Exit demo' })).toBeVisible()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)

    await page.getByRole('button', { name: 'Exit demo' }).click()
    await page.getByRole('button', { name: 'Try another day' }).click()
    await expect(page).toHaveURL(/\/app\/demo\?source=e2e/)
    await expect(page.getByRole('heading', { name: 'Which kind of day sounds familiar?' })).toBeVisible()
  })
})
