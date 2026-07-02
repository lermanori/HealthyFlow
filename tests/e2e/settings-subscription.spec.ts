import { test, expect } from '@playwright/test'

test('Settings exposes subscription and top-up contact flows', async ({ page }) => {
  await page.goto('/settings')

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'AI Credits' })).toBeVisible()
  await expect(page.getByText('Most quick text analyses use about 5-15 credits.')).toBeVisible()
  await expect(page.getByText('500 credits / month, refreshed monthly with no rollover.')).toBeVisible()

  await page.getByRole('button', { name: 'Subscribe' }).first().click()
  await expect(page.getByRole('heading', { name: 'Subscribe' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Email' })).toHaveAttribute('href', /mailto:lermanori@gmail\.com/)
  await expect(page.getByRole('link', { name: 'Instagram DM' })).toHaveAttribute('href', 'https://instagram.com/lermanori')
  await page.getByRole('button', { name: 'In-app message' }).click()
  await expect(page.getByText('Message sent to admin')).toBeVisible()

  await page.getByRole('button', { name: 'Subscribe' }).first().click()
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /972523221702/)
  await expect(page.getByRole('link', { name: 'SMS' })).toHaveAttribute('href', /972523221702/)
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('button', { name: 'Buy More' }).first().click()
  await expect(page.getByRole('heading', { name: 'Buy more credits' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Email' })).toHaveAttribute('href', /top-up/i)
})
