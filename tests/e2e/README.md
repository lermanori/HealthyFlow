# E2E Tests

Playwright specs against the real Vite frontend + Express backend.

## Setup

```sh
npx playwright install chromium
```

## Running

```sh
npm run test:e2e         # headless
npm run test:e2e:headed  # visible browser
```

## Model

- Tests run against the **existing Supabase dev DB** — no separate test database.
- A dedicated test user (`e2e@test.healthyflow.local`) is seeded idempotently by `globalSetup.ts`.
- `globalSetup.ts` deletes that user's tasks before each run so specs start clean.
- The backend must be started with `HF_TEST_MODE=1`; `playwright.config.ts` does this automatically via `webServer`.
- `POST /test/reset` is only mounted when `HF_TEST_MODE=1` — it is a 404 in production.
- Do not commit `.env`; Supabase credentials must be present locally.

## Auth fixture (ponytail v1)

Specs log in fresh via the UI each test using the seeded test user credentials (TEST_EMAIL, TEST_PASSWORD exported from `globalSetup.ts`). The tests run serially (`fullyParallel: false` in `playwright.config.ts`), so each logs in once before running.

v2 will use Playwright's built-in `storageState` fixture (see #31) to cache and reuse login sessions, reducing per-test auth overhead.
