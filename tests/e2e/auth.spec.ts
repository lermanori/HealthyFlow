import { test, expect } from './fixtures/ai-stubs'
import { TEST_EMAIL, TEST_NAME, TEST_PASSWORD } from './globalSetup'
import { API_ORIGIN } from './apiBase'

test.describe('unauthenticated flows', () => {
  // ponytail: clear storageState so tests in this block start unauthenticated
  test.use({ storageState: { cookies: [], origins: [] } })

  test('login with durable test credentials lands on Today', async ({ page }) => {
    // unauthenticated root renders the Login page
    await page.goto('/app')

    await page.locator('#email').fill(TEST_EMAIL)
    await page.locator('#password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    // Today shows a date heading (h1) once authenticated
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
  })

  test('signup submits the full contract without creating another user', async ({ page }) => {
    await page.route('**/api/auth/signup-status', (route) => route.fulfill({
      json: {
        mode: 'open',
        remaining: 100,
        offer: {
          foundingMemberLimit: 100,
          foundingMembersRemaining: 100,
          onboardingCredits: 250,
          foundingOnboardingCredits: 250,
          standardOnboardingCredits: 50,
          foundingPriceUsd: 9,
          regularPriceUsd: 19,
          monthlyCredits: 500,
          topUpPriceUsd: 5,
          topUpCredits: 250,
        },
      },
    }))

    const sharedLogin = await page.request.post(`${API_ORIGIN}/api/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    })
    expect(sharedLogin.ok()).toBeTruthy()
    const sharedSession = await sharedLogin.json()
    const candidateEmail = `signup-probe-${Date.now()}@test.healthyflow.local`
    let submitted: Record<string, unknown> | null = null

    await page.route('**/api/auth/signup', async (route) => {
      submitted = route.request().postDataJSON()
      await route.fulfill({
        json: {
          user: sharedSession.user,
          token: sharedSession.token,
          signupCredits: {
            credits: 250,
            cohort: 'founding',
            balance: 250,
            alreadyGranted: false,
          },
        },
      })
    })

    await page.goto('/app')
    await page.locator('[aria-label="Authentication mode"]')
      .getByRole('button', { name: 'Create account', exact: true })
      .click()
    await page.locator('#name').fill(TEST_NAME)
    await page.locator('#email').fill(candidateEmail)
    await page.locator('#password').fill(TEST_PASSWORD)
    await page.locator('#confirmPassword').fill(TEST_PASSWORD)
    await page.locator('form')
      .getByRole('button', { name: 'Create account', exact: true })
      .click()

    await expect(page.getByText('Account created with 250 AI credits. Welcome to HealthyFlow.')).toBeVisible()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBe(sharedSession.token)
    expect(submitted).toEqual({
      email: candidateEmail,
      password: TEST_PASSWORD,
      name: TEST_NAME,
    })

    // The browser exercised the happy-path response with the shared identity,
    // while the candidate email never reached the backend.
    const candidateLogin = await page.request.post(`${API_ORIGIN}/api/auth/login`, {
      data: { email: candidateEmail, password: TEST_PASSWORD },
    })
    expect(candidateLogin.status()).toBe(401)
  })

  test('logout after login returns to LoginPage and persists on navigation', async ({ page }) => {
    // Start unauthenticated, log in
    await page.goto('/app')
    await page.locator('#email').fill(TEST_EMAIL)
    await page.locator('#password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    // Wait for Today (authenticated state)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    // Click logout button (in header on desktop)
    await page.locator('button:has-text("Logout")').click()

    // LoginPage should appear (email field is visible)
    await expect(page.locator('#email')).toBeVisible({ timeout: 10_000 })

    // Navigate to / and assert still on LoginPage (not redirected back to Today)
    await page.goto('/app')
    await expect(page.locator('#email')).toBeVisible()
  })

  test('waitlist stays secondary and validates inline', async ({ page }) => {
    await page.route('**/api/auth/signup-status', (route) => route.fulfill({
      json: {
        mode: 'waitlist',
        remaining: 0,
        offer: {
          foundingMemberLimit: 100,
          foundingMembersRemaining: 100,
          onboardingCredits: 250,
          foundingOnboardingCredits: 250,
          standardOnboardingCredits: 50,
          foundingPriceUsd: 9,
          regularPriceUsd: 19,
          monthlyCredits: 500,
          topUpPriceUsd: 5,
          topUpCredits: 250,
        },
      },
    }))

    await page.goto('/app')

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.locator('#email')).toHaveValue('')
    await expect(page.locator('#password')).toHaveValue('')
    await expect(page.getByText('demo@healthyflow.com')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Try the guided demo' })).toHaveAttribute('href', '/app/demo')
    await expect(page.locator('#waitlist-email')).toHaveCount(0)

    await page.getByRole('button', { name: 'Join the waitlist' }).click()
    await expect(page.locator('#waitlist-email')).toBeVisible()
    await page.getByRole('button', { name: 'Join the waitlist' }).last().click()
    await expect(page.getByRole('alert')).toHaveText('Enter your email address.')
  })

  test('Continue with Google starts PKCE with the invitation retained locally', async ({ page }) => {
    await page.route('**/api/auth/signup-status', (route) => route.fulfill({
      json: {
        mode: 'waitlist',
        remaining: 0,
        offer: {
          foundingMemberLimit: 100,
          foundingMembersRemaining: 100,
          onboardingCredits: 250,
          foundingOnboardingCredits: 250,
          standardOnboardingCredits: 50,
          foundingPriceUsd: 9,
          regularPriceUsd: 19,
          monthlyCredits: 500,
          topUpPriceUsd: 5,
          topUpCredits: 250,
        },
      },
    }))

    let authorizeUrl: URL | null = null
    await page.route('**/supabase-auth/auth/v1/authorize?**', (route) => {
      authorizeUrl = new URL(route.request().url())
      return route.fulfill({ contentType: 'text/html', body: '<p>Google provider</p>' })
    })

    await page.goto('/app?invite=invite-state')
    const appOrigin = new URL(page.url()).origin
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect(page.getByText('Google provider')).toBeVisible()

    expect(authorizeUrl).not.toBeNull()
    expect(authorizeUrl!.searchParams.get('provider')).toBe('google')
    expect(authorizeUrl!.searchParams.get('redirect_to')).toBe(`${appOrigin}/app?oauth=callback`)
    expect(authorizeUrl!.searchParams.get('code_challenge')).toBeTruthy()
    const pending = await page.evaluate(() => JSON.parse(
      localStorage.getItem('healthyflow-google-oauth-pending') ?? '{}'
    ))
    expect(pending.invite).toBe('invite-state')
  })

  test('Google callback exchanges the Supabase session and lands in the app', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('healthyflow-google-oauth-code-verifier', JSON.stringify('test-verifier'))
      localStorage.setItem('healthyflow-google-oauth-pending', JSON.stringify({
        invite: 'invite-state',
        startedAt: Date.now(),
      }))
    })
    await page.route('**/supabase-auth/auth/v1/token?grant_type=pkce', (route) => route.fulfill({
      json: {
        access_token: 'verified-supabase-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: 'google-subject',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'google@example.com',
          email_confirmed_at: '2026-07-29T00:00:00.000Z',
          app_metadata: { provider: 'google', providers: ['google'] },
          user_metadata: { full_name: 'Google User' },
          identities: [{ provider: 'google' }],
          created_at: '2026-07-29T00:00:00.000Z',
        },
      },
    }))
    let exchangeBody: Record<string, unknown> | null = null
    await page.route('**/api/auth/google', async (route) => {
      exchangeBody = route.request().postDataJSON()
      return route.fulfill({
        json: {
          user: {
            id: 'app-user',
            email: 'google@example.com',
            name: 'Google User',
            role: 'user',
            authMethod: 'google',
          },
          token: 'healthyflow-jwt',
          isNewUser: true,
          signupCredits: {
            credits: 250,
            cohort: 'founding',
            balance: 250,
            alreadyGranted: false,
          },
        },
      })
    })

    await page.goto('/app?oauth=callback&code=auth-code')

    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBe('healthyflow-jwt')
    expect(exchangeBody).toEqual({
      accessToken: 'verified-supabase-token',
      invite: 'invite-state',
    })
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByRole('link', { name: 'Today' })).toBeVisible()
    await expect.poll(() => page.evaluate(
      () => localStorage.getItem('healthyflow-google-oauth-pending')
    )).toBeNull()
  })

  test('Google cancellation returns inline and keeps the invitation usable', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('healthyflow-google-oauth-pending', JSON.stringify({
        invite: 'invite-state',
        startedAt: Date.now(),
      }))
    })

    await page.goto('/app?oauth=callback&error=access_denied&error_code=access_denied')

    await expect(page.getByRole('alert')).toHaveText('Google sign-in was cancelled. No changes were made.')
    await expect(page).toHaveURL(/\/app\?invite=invite-state$/)
    await expect(page.getByRole('heading', { name: "You're invited" })).toBeVisible()
  })

  test('expired invitations and closed signup surface exact inline messages', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('healthyflow-google-oauth-code-verifier', JSON.stringify('test-verifier'))
      localStorage.setItem('healthyflow-google-oauth-pending', JSON.stringify({
        invite: 'expired-invite',
        startedAt: Date.now(),
      }))
    })
    await page.route('**/supabase-auth/auth/v1/token?grant_type=pkce', (route) => route.fulfill({
      json: {
        access_token: 'verified-supabase-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: 'google-subject',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'new@example.com',
          email_confirmed_at: '2026-07-29T00:00:00.000Z',
          app_metadata: { provider: 'google', providers: ['google'] },
          user_metadata: {},
          identities: [{ provider: 'google' }],
          created_at: '2026-07-29T00:00:00.000Z',
        },
      },
    }))
    await page.route('**/api/auth/google', (route) => route.fulfill({
      status: 403,
      json: { error: 'This invitation has expired.', reason: 'invite_expired' },
    }))

    await page.goto('/app?oauth=callback&code=expired-code')

    await expect(page.getByRole('alert')).toHaveText('This invitation has expired. Ask for a new invitation.')
    await expect(page.evaluate(() => localStorage.getItem('token'))).resolves.toBeNull()
  })

  test('Google exchange network errors can retry without repeating provider consent', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('healthyflow-google-oauth-code-verifier', JSON.stringify('test-verifier'))
      localStorage.setItem('healthyflow-google-oauth-pending', JSON.stringify({
        startedAt: Date.now(),
      }))
    })
    await page.route('**/supabase-auth/auth/v1/token?grant_type=pkce', (route) => route.fulfill({
      json: {
        access_token: 'verified-supabase-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: 'google-subject',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'new@example.com',
          email_confirmed_at: '2026-07-29T00:00:00.000Z',
          app_metadata: { provider: 'google', providers: ['google'] },
          user_metadata: {},
          identities: [{ provider: 'google' }],
          created_at: '2026-07-29T00:00:00.000Z',
        },
      },
    }))
    await page.route('**/api/auth/google', (route) => route.abort('failed'))

    await page.goto('/app?oauth=callback&code=network-code')

    await expect(page.getByRole('alert')).toContainText('Network error')
    await expect(page.getByRole('button', { name: 'Retry Google sign-in' })).toBeVisible()
  })
})

test.describe('authenticated flows', () => {
  // ponytail: use the shared storageState from auth.setup.ts (authenticated)
  test.use({ storageState: 'tests/e2e/.auth/user.json' })

  test('session persists across page reload', async ({ page }) => {
    // Navigate to Today (should already be authenticated via storageState)
    await page.goto('/app')

    // Assert Today is shown, not LoginPage
    // Date heading only appears in authenticated Today
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    // Reload the page
    await page.reload()

    // Today should still be visible after reload
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
  })
})
