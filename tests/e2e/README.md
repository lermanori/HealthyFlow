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

## AI network stubs

All AI endpoints (`/api/ai/*`) are intercepted by Playwright before they reach the backend or OpenAI. This means the suite runs green with `OPENAI_API_KEY` unset.

### How it works

Every spec imports `{ test, expect }` from `./fixtures/ai-stubs` instead of `@playwright/test`. The stub fixture extends Playwright's `page` fixture to register `page.route()` handlers that reply with committed JSON fixtures before any request leaves the browser.

```
tests/e2e/fixtures/
├── ai-stubs.ts          ← shared fixture; import from here in all specs
└── ai/
    ├── tips.json        ← GET /api/ai/tips
    ├── motivation.json  ← GET /api/ai/motivation
    ├── parse-tasks.json ← POST /api/ai/parse-tasks
    └── query-tasks.json ← POST /api/ai/query-tasks
```

`auth.setup.ts` remains on `@playwright/test` directly (it's a setup project, not a spec).

### How to add a fixture for a new AI endpoint

1. Add `tests/e2e/fixtures/ai/<endpoint>.json` with a shape matching what the frontend component renders.
2. Add a `page.route(...)` handler in `tests/e2e/fixtures/ai-stubs.ts` pointing at the new file.

### Running with key unset

```sh
OPENAI_API_KEY= npm run test:e2e
```
