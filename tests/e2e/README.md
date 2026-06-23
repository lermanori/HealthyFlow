# E2E Tests

Playwright golden-path specs against the real Vite frontend + Express backend. **Regression gate before publishing**: if `npm run test:e2e` is green, the golden paths still work.

## Setup

```sh
npx playwright install chromium
```

## Running

```sh
npm run test:e2e         # headless (default; 12 tests in ~47s)
npm run test:e2e:headed  # visible browser
OPENAI_API_KEY= npm run test:e2e  # confirm suite works without OpenAI key
```

## What the suite covers

Six spec files, 12 golden-path tests:

| Spec | Test | Purpose |
|------|------|---------|
| `auth.spec.ts` | Login with seeded credentials | Unauthenticated → authenticated flow |
| `auth.spec.ts` | Logout persists | Session state cleared correctly |
| `auth.spec.ts` | Session persists across reload | storageState survives page reload |
| `habits.spec.ts` | Habit completion isolation | Per-day completion does not bleed to tomorrow |
| `items-add.spec.ts` | Add task via UI | Task creation works end-to-end |
| `items-add.spec.ts` | Category options closed set | Categories match CONTEXT.md definition |
| `items-lifecycle.spec.ts` | Complete task persists | Completion state survives reload |
| `items-lifecycle.spec.ts` | Edit task | Title edits appear on Dashboard |
| `items-lifecycle.spec.ts` | Delete task | Deletion removes from UI |
| `rollover.spec.ts` | Untimed rollover | Incomplete tasks carry forward to today |
| `week-view.spec.ts` | Week view task placement | Tasks appear under correct day columns |

## What the suite intentionally does NOT cover

- **AI correctness**: AI call outputs are stubbed (see below); this suite does not test OpenAI API calls or prompt quality. That belongs in the `ai-harness` layer.
- **Performance**: No load testing, no timing assertions.
- **Visual regression**: No screenshot diffs, no CSS assertion.
- **Parallelism**: All specs run serially (workers: 1) because they share one test user and reset it, so concurrent workers clobber each other. A follow-up to re-enable parallelism is per-worker test users.

## Test infrastructure

- Tests run against the **existing Supabase dev DB** — no separate test database.
- A dedicated test user (`e2e@test.healthyflow.local`) is seeded idempotently by `globalSetup.ts` at suite startup.
- The backend must be started with `HF_TEST_MODE=1`; `playwright.config.ts` does this automatically via `webServer`.
- Do not commit `.env`; Supabase credentials must be present locally.

## Resetting test data

### `/test/reset` endpoint

`POST /test/reset` is only mounted when `HF_TEST_MODE=1` (404 in production). It truncates the seeded test user's tasks so each spec starts clean. It is NOT called by specs directly; instead, **each spec resets via `globalSetup.ts` at suite startup**.

**Important gotcha**: `page.goto('/test/reset')` does NOT work (SPA catches all routes). Specs that need to reset mid-run must use:

```typescript
await page.request.post('http://localhost:3001/test/reset')
```

No specs currently reset mid-run (globalSetup suffices), but document this for future use.

## Auth fixture

Specs use Playwright's `storageState` feature to persist login state. Workflow:

1. `auth.setup.ts` (setup project) logs in once and saves state to `tests/e2e/.auth/user.json`.
2. Chromium specs load that state via `use: { storageState: 'tests/e2e/.auth/user.json' }` (configured in `playwright.config.ts`).
3. Tests in the `authenticated flows` block use the saved state; tests in `unauthenticated flows` explicitly clear it with `test.use({ storageState: { cookies: [], origins: [] } })`.

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

### Adding a new AI fixture

1. Add `tests/e2e/fixtures/ai/<endpoint>.json` with the response shape your frontend component expects.
2. Add a `page.route()` handler in `tests/e2e/fixtures/ai-stubs.ts` mapping the URL pattern to the new file:
   ```typescript
   await page.route('**/api/ai/my-new-endpoint', (route) =>
     route.fulfill({ path: path.join(FIXTURES, 'my-new-endpoint.json'), contentType: 'application/json' })
   )
   ```

## Viewing traces on failure

When a spec fails, Playwright captures a trace (visible browser state) and a screenshot (`on-first-retry` mode in `playwright.config.ts`). View them:

```sh
npx playwright show-trace test-results/[spec-name]-[attempt].trace
```

Local runs do not retry (retries: 0); CI retries once (retries: 1) so traces appear only on second failure attempt.

## Flake-quarantine policy

A spec that flakes (fails then passes on retry) twice within a calendar week is immediately `test.fixme()`'d with a comment linking to a new GitHub issue for investigation.

```typescript
test.fixme('my flaky test', async ({ page }) => {
  // #45: flaked on 2026-06-23 and 2026-06-24; quarantined pending investigation
  // ...
})
```

**Why this policy?**
- Flakes destroy confidence in the suite. Two flakes signal a real problem worth investigating synchronously.
- `test.fixme()` is explicit; skipping masks the problem.
- No `test.retry(N>1)` — that trades reliability for speed. Run-level retries stay at 1 (CI) / 0 (local).
- The tracking issue creates accountability for fixing the root cause.

**When to apply**: After the spec flakes a second time within the same calendar week (e.g., Monday and Wednesday), file an issue and apply `test.fixme()` in the same commit.

## CI-shape check

The suite is CI-ready: deterministic, headless, exits non-zero on failure, runs under 90s, and requires no `OPENAI_API_KEY`.

**Measured wall-clock: ~47s** (12 tests, 1 worker)
```
$ OPENAI_API_KEY= npm run test:e2e
12 passed (46.8s)
```

**Exit codes**:
- `0` on all-pass
- `1` on any failure

No GitHub Actions workflow is wired up yet; that's a follow-up.
