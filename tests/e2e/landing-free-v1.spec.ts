import { expect, test } from '@playwright/test'

test.describe('free-v1 landing page', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ] as const) {
    test(`publishes the honest offer at ${viewport.name} size`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.setViewportSize(viewport)
      await page.goto('/')

      await expect(page.getByRole('heading', { name: 'Your whole day, on one page.' })).toBeVisible()
      await expect(page.getByText('10 AI actions once', { exact: false })).toBeVisible()
      await expect(page.getByText('15 AI actions each calendar month', { exact: false })).toBeVisible()
      await expect(page.getByText('Cloud cannot be obtained in v1.', { exact: false })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open Founders Club' })).toHaveAttribute(
        'href',
        '/app/settings/account-billing#founders-club',
      )
      await expect(page.getByText(/waitlist|invite-only|per month/i)).toHaveCount(0)
      await expect.poll(() => page.evaluate(() => (
        document.documentElement.scrollWidth <= document.documentElement.clientWidth
      ))).toBe(true)
      expect(pageErrors).toEqual([])
    })
  }

  test('navigation, reduced motion, analytics and attribution remain functional', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      Object.defineProperty(window, 'posthog', {
        configurable: true,
        value: {
          capture: (event: string, properties: unknown) => {
            sessionStorage.setItem('landing-capture', JSON.stringify({ event, properties }))
          },
        },
      })
    })
    await page.goto('/?utm_source=launch&utm_medium=owned&utm_campaign=free-v1')

    const freeV1 = page.locator('#free-v1')
    await expect(freeV1).toHaveCSS('opacity', '1')
    await page.getByRole('link', { name: 'Free v1' }).click()
    await expect(page).toHaveURL(/#free-v1$/)

    const demoHref = await page.getByRole('link', { name: 'Watch the demo' }).first().getAttribute('href')
    expect(demoHref).toContain('utm_source=launch')
    expect(demoHref).toContain('utm_medium=owned')
    expect(demoHref).toContain('utm_campaign=free-v1')

    await page.getByRole('link', { name: 'Start free' }).first().click()
    const capture = await page.evaluate(() => sessionStorage.getItem('landing-capture'))
    expect(JSON.parse(capture ?? '{}')).toEqual({
      event: 'signup_cta_clicked',
      properties: { destination: 'app', placement: 'navigation', access_mode: 'open' },
    })
  })
})
