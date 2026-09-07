import { test, expect } from '@playwright/test'

test('Settings exposes Founders Club feedback and action requests', async ({ page }) => {
  const submitted: Array<Record<string, unknown>> = []
  await page.route('**/api/contact-messages', async route => {
    submitted.push(route.request().postDataJSON())
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      json: {
        id: 'message-1',
        userId: 'e2e-user',
        userEmail: 'e2e-user@healthyflow.test',
        userName: 'E2E User',
        kind: 'feedback',
        message: 'The new day flow is easier to scan.',
        replyTo: null,
        status: 'pending',
        handledAt: null,
        handledBy: null,
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: '2026-09-07T00:00:00.000Z',
      },
    })
  })
  await page.goto('/app/settings/account-billing')

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Founders Club' })).toBeVisible()
  await expect(page.getByText('Help shape HealthyFlow with direct feedback')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Subscribe' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Buy/ })).toHaveCount(0)
  await expect(page.getByText(/\$\d+\s*\/\s*month/)).toHaveCount(0)

  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByRole('heading', { name: 'Send feedback' })).toBeVisible()
  await page.getByLabel('Message').fill('The new day flow is easier to scan.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Message sent to the Founders Club')).toBeVisible()
  expect(submitted).toEqual([{
    kind: 'feedback',
    message: 'The new day flow is easier to scan.',
  }])

  await page.getByRole('button', { name: 'Request more actions' }).click()
  await expect(page.getByRole('heading', { name: 'Request more actions' })).toBeVisible()
  await expect(page.getByLabel('Message')).toHaveValue('I would like to request more free AI actions.')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
})
