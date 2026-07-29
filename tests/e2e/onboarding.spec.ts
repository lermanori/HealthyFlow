import { test, expect } from './fixtures/ai-stubs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

test.use({ storageState: undefined })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function createSignupInvite(email: string) {
  const { data: entry, error: waitlistError } = await supabase
    .from('waitlist')
    .insert({ email, status: 'pending', source: 'e2e-onboarding' })
    .select('id')
    .single()
  if (waitlistError) throw waitlistError

  const token = `e2e-${randomUUID()}`
  const { error: inviteError } = await supabase
    .from('invites')
    .insert({ token, waitlist_id: entry.id })
  if (inviteError) throw inviteError
  return token
}

test('new signup sees brain-dump onboarding, parses a day, and completion stays dismissed', async ({ page }) => {
  const unique = Date.now()
  const email = `onboarding-${unique}@test.healthyflow.local`
  const password = 'onboarding-pw-42!'
  const invite = await createSignupInvite(email)

  await page.goto(`/app?invite=${encodeURIComponent(invite)}`)
  await page.evaluate(() => localStorage.removeItem('token'))
  await page.reload()
  await expect(page.getByRole('heading', { name: "You're invited" })).toBeVisible()
  await page.getByLabel('Full Name').fill('Onboarding Test')
  await page.getByLabel('Email Address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm Password').fill(password)
  await page.getByRole('button', { name: 'Create Account', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Turn notes into Items' })).toBeVisible()

  await page.getByPlaceholder(/Describe what you want to accomplish/).fill(
    'Gym at 7am, finish the quarterly report, and grab groceries after work.'
  )
  await page.getByRole('button', { name: 'Analyze and generate tasks' }).click()
  await expect(page.getByText(/of \d+ selected/)).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: /Add Selected Tasks/ }).click()

  // Confirming the parse completes onboarding automatically.
  await expect(page.getByText('Onboarding complete. Achievement unlocked!')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toHaveCount(0)
})

test('skip link completes onboarding without parsing', async ({ page }) => {
  const unique = Date.now()
  const email = `onboarding-skip-${unique}@test.healthyflow.local`
  const password = 'onboarding-pw-42!'
  const invite = await createSignupInvite(email)

  await page.goto(`/app?invite=${encodeURIComponent(invite)}`)
  await page.evaluate(() => localStorage.removeItem('token'))
  await page.reload()
  await expect(page.getByRole('heading', { name: "You're invited" })).toBeVisible()
  await page.getByLabel('Full Name').fill('Onboarding Skip Test')
  await page.getByLabel('Email Address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm Password').fill(password)
  await page.getByRole('button', { name: 'Create Account', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await expect(page.getByText('Onboarding skipped')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tell HealthyFlow about your day' })).toHaveCount(0)
})
