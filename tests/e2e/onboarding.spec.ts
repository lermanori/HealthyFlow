import { test, expect } from '@playwright/test'

test.use({ storageState: undefined })

test('new signup sees onboarding, seeded tasks, domain links, and completion stays dismissed', async ({ page }) => {
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

  await expect(page.getByRole('heading', { name: 'Start with HealthyFlow' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Ask AI what to focus on today')).toBeVisible()
  await expect(page.getByText('Log your first meal')).toBeVisible()
  await expect(page.getByText('Record one small win')).toBeVisible()

  await page.getByRole('link', { name: /Log calories/ }).click()
  await expect(page).toHaveURL(/\/add\?tab=calories/)
  await expect(page.getByRole('tab', { name: 'Calories' })).toHaveAttribute('aria-selected', 'true')

  await page.goto('/')
  await page.getByRole('button', { name: 'Ask AI Use the sample tasks.' }).click()
  await expect(page.getByRole('heading', { name: 'Ask AI About Your Tasks' })).toBeVisible()
  await page.goto('/')

  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByText('Onboarding complete. Achievement unlocked!')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Start with HealthyFlow' })).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Start with HealthyFlow' })).toHaveCount(0)
})
