/**
 * AI network stubs — intercept all /api/ai/* calls and reply from committed
 * JSON fixtures so the suite runs green with OPENAI_API_KEY unset.
 *
 * Usage: import { test, expect } from './fixtures/ai-stubs'
 * (drop-in replacement for @playwright/test)
 *
 * How to add a new fixture:
 * 1. Add a JSON file to tests/e2e/fixtures/ai/<endpoint>.json whose shape
 *    matches what the frontend component expects.
 * 2. Add a route handler below mapping the URL pattern to the new file.
 */
import { fileURLToPath } from 'url'
import path from 'path'
import { test as base, expect } from '@playwright/test'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ai')

export const test = base.extend<object>({
  page: async ({ page }, use) => {
    // ponytail: single glob covers all AI routes; per-route JSON files handle shape differences
    await page.route('**/api/ai/tips', (route) =>
      route.fulfill({ path: path.join(FIXTURES, 'tips.json'), contentType: 'application/json' })
    )
    await page.route('**/api/ai/motivation', (route) =>
      route.fulfill({ path: path.join(FIXTURES, 'motivation.json'), contentType: 'application/json' })
    )
    await page.route('**/api/ai/parse-tasks', (route) =>
      route.fulfill({ path: path.join(FIXTURES, 'parse-tasks.json'), contentType: 'application/json' })
    )
    await page.route('**/api/ai/query-tasks', (route) =>
      route.fulfill({ path: path.join(FIXTURES, 'query-tasks.json'), contentType: 'application/json' })
    )
    await use(page)
  },
})

export { expect }
