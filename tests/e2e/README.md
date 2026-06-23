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
