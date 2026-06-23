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

## Auth fixture & known blockers

**Current (v1 — auth.spec.ts only)**: Specs log in fresh via the UI each test using the seeded test user credentials (TEST_EMAIL, TEST_PASSWORD exported from `globalSetup.ts`). Login itself works, but:

**Blocker**: localStorage (which holds the auth token) does not persist across `page.goto()` navigation in the test context. This prevents protected routes (e.g., `/add`) from being accessed in the same test after login. The auth context checks `localStorage.getItem('token')` on every page load; if the token is missing, it renders LoginPage instead of the route's actual component.

**Workaround for #30**: See `tests/e2e/items-add.spec.ts` — it attempts to manually set localStorage before navigating, but this also fails due to the same persistence issue.

**Fix for #31**: Implement Playwright's `storageState` fixture properly by:
1. Creating a setup project that logs in once and saves `context.storageState()`
2. Configuring the main projects to restore that state via `use: { storageState: path }` 
3. This will persist cookies AND localStorage across all tests in that project

See Playwright docs: https://playwright.dev/docs/auth#reuse-signed-in-state
