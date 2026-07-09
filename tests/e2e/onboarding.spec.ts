import { test, expect } from '@playwright/test'

test.use({ storageState: undefined })

test('new signup sees brain-dump onboarding, parses a day, and completion stays dismissed', async ({ page }) => {
  const unique = Date.now()
  const email = `onboarding-${unique}@test.healthyflow.local`
  const password = 'onboarding-pw-42!'

  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('token'))
  await page.reload()
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Full Name').fill('Onboarding Test')
  await page.getByLabel('Email Address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm Password').fill(password)
  await page.getByRole('button', { name: 'Create Account', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Tell me about your day' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Tell HealthyFlow about your day' }).click()
  await expect(page.getByRole('heading', { name: 'AI Task Analyzer' })).toBeVisible()

  await page.getByPlaceholder(/Describe what you want to accomplish/).fill(
    'Gym at 7am, finish the quarterly report, and grab groceries after work.'
  )
  await page.getByRole('button', { name: 'Analyze and generate tasks' }).click()
  await expect(page.getByText(/of \d+ selected/)).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: /Add Selected Tasks/ }).click()

  // Confirming the parse completes onboarding automatically.
  await expect(page.getByText('Onboarding complete. Achievement unlocked!')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tell me about your day' })).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tell me about your day' })).toHaveCount(0)
})

test('skip link completes onboarding without parsing', async ({ page }) => {
  const unique = Date.now()
  const email = `onboarding-skip-${unique}@test.healthyflow.local`
  const password = 'onboarding-pw-42!'

  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('token'))
  await page.reload()
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Full Name').fill('Onboarding Skip Test')
  await page.getByLabel('Email Address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm Password').fill(password)
  await page.getByRole('button', { name: 'Create Account', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Tell me about your day' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: "I'll do it later" }).click()
  await expect(page.getByText('Onboarding skipped')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tell me about your day' })).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tell me about your day' })).toHaveCount(0)
})
