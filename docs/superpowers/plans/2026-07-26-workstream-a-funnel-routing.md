# Workstream A: Funnel Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: COMPLETE** (2026-07-26). All nine tasks landed. Two things were added during execution that the plan did not anticipate: redirects for *every* legacy app route rather than just the three public ones (bookmarks and PWA shortcuts pointed at `/week`, `/add`, `/settings`), and the backend's push-notification payloads in `backend/src/proactivity.ts`, which hard-coded `/talk`. The Playwright suite was migrated and typechecks, but **was not executed** — this worktree has no `.env`, so the suite cannot reach Supabase. Running it is the one outstanding verification.

**Goal:** Serve the marketing page at `/` and the React app at `/app`, so paid ad traffic lands on the landing page instead of a login form.

**Architecture:** Netlify rewrites `/` to the static `landing.html` and `/app/*` to the SPA. React Router gets `basename="/app"`, which keeps every in-app route string unchanged. The PWA manifest, service worker app shell, and Playwright suite all currently hard-code `/` as the app and must move in lockstep. A Vite dev-server middleware reproduces the Netlify rewrite locally so dev and prod agree.

**Tech Stack:** Vite, React Router v6, Netlify redirects, service worker (hand-rolled, `public/sw.js`), Playwright.

**Source spec:** `docs/superpowers/specs/2026-07-26-launch-prep-design.md` section A.

---

## Two findings that change the shape of this work

**1. The service worker caches `/` as the app shell.** `public/sw.js:6` precaches `'/'` and `sw.js:103` serves `caches.match('/')` as the offline navigation fallback. Once `/` serves `landing.html`, every installed client would precache the *marketing page* as its app shell and show it when offline. `CACHE_VERSION` must also bump so existing installs discard the stale shell. This was listed as a one-line risk in the spec; it is four separate edits.

**2. The Playwright suite hard-codes root-relative paths in 79 `goto()` calls.** Playwright resolves `page.goto('/')` against the *origin*, not against a `baseURL` that has a path — so setting `baseURL: 'http://localhost:5173/app'` does **not** fix them. They need a mechanical rewrite.

---

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `netlify.toml` | Production routing | Rewrite `/` → landing, `/app/*` → SPA |
| `vite.config.ts` | Dev routing parity | Middleware mirroring the Netlify rewrite |
| `src/main.tsx` | Router mount | `basename="/app"` |
| `public/manifest.json` | PWA identity | `start_url`, `scope`, 3 shortcut URLs |
| `public/sw.js` | Offline shell + push targets | Shell path, fallback path, 2 push URLs, cache version |
| `public/landing.html` | Marketing CTAs | CTAs → `/app`, add Log in link |
| `src/pages/LoginPage.tsx` | Footer link | `/landing.html` → `/` |
| `playwright.config.ts`, `tests/e2e/*.spec.ts` | E2E navigation | Prefix app paths with `/app` |

---

## Task 1: Dev-server parity for the `/` rewrite

Without this, `/` serves the app in dev and the landing page in prod — the exact divergence that hides routing bugs until deploy.

**Files:**
- Modify: `vite.config.ts:4-13`

- [ ] **Step 1: Add the rewrite middleware**

Replace the `server` block in `vite.config.ts` with:

```ts
  plugins: [
    react(),
    {
      // Mirrors the netlify.toml rewrite so `/` serves the marketing page in dev
      // exactly as it does in production. Registered in configureServer so it runs
      // before Vite's SPA history fallback claims the request.
      name: 'healthyflow-landing-at-root',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const [path] = (req.url ?? '').split('?')
          if (path === '/' || path === '/index.html') {
            req.url = '/landing.html'
          }
          next()
        })
      },
    },
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
```

- [ ] **Step 2: Verify the rewrite works and the app still loads**

Run:

```bash
npm run dev
```

Then, in another shell:

```bash
curl -s http://localhost:5173/ | grep -o "<title>[^<]*</title>"
```

Expected: `<title>HealthyFlow — Your life, organized by AI</title>` (the landing page).

```bash
curl -s http://localhost:5173/app | grep -o "<title>[^<]*</title>"
```

Expected: the app's title from `index.html` (not the landing title). If `/app` returns the landing page, the middleware is matching too broadly.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "build: serve landing page at / in dev to match production routing"
```

---

## Task 2: Netlify production rewrites

**Files:**
- Modify: `netlify.toml:6-9`

- [ ] **Step 1: Replace the catch-all redirect**

Replace this block:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

with:

```toml
# Marketing page owns the root. Ad traffic must not land on a login form.
[[redirects]]
  from = "/"
  to = "/landing.html"
  status = 200

# The React app lives under /app; BrowserRouter uses basename="/app".
[[redirects]]
  from = "/app/*"
  to = "/index.html"
  status = 200

# Legacy public routes. These must be real 301 redirects, NOT 200 rewrites:
# with basename="/app" the router ignores any URL outside /app, so serving
# index.html at /demo would render a blank page.
[[redirects]]
  from = "/demo"
  to = "/app/demo"
  status = 301

[[redirects]]
  from = "/privacy"
  to = "/app/privacy"
  status = 301

[[redirects]]
  from = "/terms"
  to = "/app/terms"
  status = 301
```

Note: Netlify serves real files (`/landing.html`, `/assets/*`, `/icons/*`, `/sw.js`, `/manifest.json`) before consulting redirects, so no rule is needed for them.

- [ ] **Step 2: Add the same legacy redirects to the dev middleware**

So dev matches prod, extend the middleware from Task 1 in `vite.config.ts` to redirect the three legacy paths:

```ts
      configureServer(server) {
        const legacyRoutes = ['/demo', '/privacy', '/terms']
        server.middlewares.use((req, res, next) => {
          const [path] = (req.url ?? '').split('?')
          if (path === '/' || path === '/index.html') {
            req.url = '/landing.html'
            return next()
          }
          if (legacyRoutes.includes(path)) {
            res.statusCode = 301
            res.setHeader('Location', `/app${req.url}`)
            return res.end()
          }
          next()
        })
      },
```

- [ ] **Step 3: Verify the redirect**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:5173/demo
```

Expected: `301 http://localhost:5173/app/demo`

- [ ] **Step 4: Commit**

```bash
git add netlify.toml vite.config.ts
git commit -m "build: route / to landing page and /app/* to the SPA"
```

---

## Task 3: Router basename

Because React Router strips the basename before matching, every existing `<Route path="/week">` and `navigate('/')` keeps working untouched. Only raw `href`/`window.location` strings need attention, and those are handled in Tasks 5–7.

**Files:**
- Modify: `src/main.tsx:26`

- [ ] **Step 1: Set the basename**

Change:

```tsx
      <BrowserRouter>
```

to:

```tsx
      <BrowserRouter basename="/app">
```

- [ ] **Step 2: Verify routing in the browser**

With `npm run dev` running, load `http://localhost:5173/app/week`. Expected: the Week view renders, and the URL stays `/app/week`. Loading `http://localhost:5173/week` should now fall through to the SPA and render the login/wildcard route at a URL React Router does not own — that is expected and is what the Netlify config stops in production.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: mount the app under /app via router basename"
```

---

## Task 4: PWA manifest

Left unchanged, an installed PWA opens the marketing page instead of the app.

**Files:**
- Modify: `public/manifest.json:5`, `:10`, `:80`, `:92`, `:104`

- [ ] **Step 1: Move the app scope**

Change line 5 from `"start_url": "/",` to:

```json
  "start_url": "/app",
```

Change line 10 from `"scope": "/",` to:

```json
  "scope": "/app",
```

- [ ] **Step 2: Fix the three shortcut URLs**

Change `"url": "/add"` to `"url": "/app/add"`, `"url": "/week"` to `"url": "/app/week"`, and `"url": "/?ai=true"` to `"url": "/app?ai=true"`.

- [ ] **Step 3: Verify the manifest is valid JSON**

```bash
node -e "const m=require('./public/manifest.json');console.log(m.start_url,m.scope,m.shortcuts.map(s=>s.url).join(' '))"
```

Expected: `/app /app /app/add /app/week /app?ai=true`

- [ ] **Step 4: Commit**

```bash
git add public/manifest.json
git commit -m "fix: point PWA start_url, scope, and shortcuts at /app"
```

---

## Task 5: Service worker app shell and push targets

**Files:**
- Modify: `public/sw.js:1`, `:6`, `:63`, `:84`, `:103`

- [ ] **Step 1: Bump the cache version**

Change line 1 from `const CACHE_VERSION = 'healthyflow-v5'` to:

```js
const CACHE_VERSION = 'healthyflow-v6'
```

This matters: the `activate` handler deletes only caches that do not start with `CACHE_VERSION`, so without the bump, existing installs keep serving the old `/` shell — which is now the landing page.

- [ ] **Step 2: Move the precached app shell**

Change line 6 from `'/',` to:

```js
  '/app',
```

- [ ] **Step 3: Move the offline navigation fallback**

Change line 103 from `const cachedShell = await caches.match('/')` to:

```js
    const cachedShell = await caches.match('/app')
```

- [ ] **Step 4: Fix the two push-notification default URLs**

Change line 63 from `let payload = { title: 'HealthyFlow', body: 'New notification', url: '/' }` to:

```js
  let payload = { title: 'HealthyFlow', body: 'New notification', url: '/app' }
```

Change line 84 from `const targetUrl = event.notification.data?.url || '/'` to:

```js
  const targetUrl = event.notification.data?.url || '/app'
```

Both are passed to `clients.openWindow()`, which resolves against the origin — not the router basename — so a bare `/` would open the marketing page from a notification tap.

- [ ] **Step 5: Verify no stale root references remain**

```bash
grep -n "'/'" public/sw.js
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add public/sw.js
git commit -m "fix: move service worker app shell and push targets to /app"
```

---

## Task 6: Landing page CTAs and Log in link

Every landing CTA currently points at `/`, which after Task 2 points back at the landing page itself — an infinite loop. Waitlist-aware CTA text is Workstream B; this task only makes the links go somewhere real.

**Files:**
- Modify: `public/landing.html:640-642`, `:659-660`, `:863`, `:875`, `:909-910`

- [ ] **Step 1: Update the nav CTAs**

Replace the `nav-cta` block at lines 639-642 with:

```html
      <div class="nav-cta">
        <a class="btn btn-ghost btn-sm" href="/app">Log in</a>
        <a class="btn btn-primary btn-sm" href="/app">Start Free</a>
      </div>
```

- [ ] **Step 2: Update every remaining `href="/"` and the Watch Demo links**

The `/demo` links would work via the Task 2 redirect, but pointing them straight at the final URL avoids a needless round trip on every click:

```bash
sed -i '' -e 's|href="/"|href="/app"|g' -e 's|href="/demo"|href="/app/demo"|g' public/landing.html
```

- [ ] **Step 3: Verify no self-referential links remain**

```bash
grep -c 'href="/app"' public/landing.html
```

Expected: `6` (nav Log in, nav Start Free, hero CTA, Free plan CTA, Launch plan CTA, final CTA).

```bash
grep -c 'href="/app/demo"' public/landing.html
```

Expected: `2` (hero Watch Demo, final Watch Demo). Step 1 replaces the nav's "Watch Demo" button with "Log in" — stranded existing users need the login path more than a third demo link, and Watch Demo still appears twice further down the page.

```bash
grep -n 'href="/"\|href="/demo"' public/landing.html
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add public/landing.html
git commit -m "fix: point landing CTAs at /app and add a Log in link"
```

---

## Task 7: Login page footer link

**Files:**
- Modify: `src/pages/LoginPage.tsx:290`

- [ ] **Step 1: Point the footer link at the new landing root**

Change `href="/landing.html"` to:

```tsx
            <a href="/" className="transition-colors hover:text-cyan-400">
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "fix: link login footer to the landing page at root"
```

---

## Task 8: Migrate the Playwright suite to `/app`

79 `goto()` calls use root-relative paths. Playwright resolves a leading-slash path against the origin, ignoring any path in `baseURL`, so these must be rewritten rather than fixed by config.

**Files:**
- Modify: `tests/e2e/*.spec.ts`, `tests/e2e/auth.setup.ts`, `tests/e2e/fixtures/*`

- [ ] **Step 1: Record the current state of the suite**

Before changing anything, capture which tests pass today so regressions are attributable:

```bash
npx playwright test --reporter=line 2>&1 | tail -20
```

Save the pass/fail counts. If the suite is already red, note which specs fail — do not try to fix pre-existing failures in this task.

- [ ] **Step 2: Rewrite the app-route navigations**

`/test/reset` is a **backend** route (`backend/src/index.ts:97`) and must NOT be prefixed. Exclude it:

```bash
grep -rl "goto('/" tests/e2e | xargs sed -i '' \
  -e "s|goto('/')|goto('/app')|g" \
  -e "s|goto('/add')|goto('/app/add')|g" \
  -e "s|goto('/week')|goto('/app/week')|g" \
  -e "s|goto('/talk')|goto('/app/talk')|g" \
  -e "s|goto('/settings')|goto('/app/settings')|g" \
  -e "s|goto('/calories')|goto('/app/calories')|g" \
  -e "s|goto('/workouts')|goto('/app/workouts')|g" \
  -e "s|goto('/achievements')|goto('/app/achievements')|g" \
  -e "s|goto('/demo')|goto('/app/demo')|g"
```

- [ ] **Step 3: Find any navigation the sed missed**

```bash
grep -rn "goto('/" tests/e2e | grep -v "goto('/app" | grep -v "test/reset"
```

Expected: no output. Any line that appears is a path the sed list did not cover — prefix it with `/app` by hand, unless it is a backend route.

- [ ] **Step 4: Check for URL assertions that hard-code root paths**

```bash
grep -rn "toHaveURL\|waitForURL" tests/e2e
```

Every match asserting a path such as `'/week'` must become `'/app/week'`. Update each one found.

- [ ] **Step 5: Run the suite and compare against Step 1**

```bash
npx playwright test --reporter=line 2>&1 | tail -20
```

Expected: the same pass/fail counts recorded in Step 1. Any *new* failure is caused by this workstream and must be fixed before committing.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e playwright.config.ts
git commit -m "test: migrate e2e navigation to the /app basename"
```

---

## Task 9: End-to-end verification in the browser

**Files:** none — verification only.

- [ ] **Step 1: Start the dev server through the preview tooling**

Use `preview_start` (never `npm run dev` in a raw shell for this step) so the page can be inspected.

- [ ] **Step 2: Confirm the root serves marketing**

Navigate to `http://localhost:5173/`. Expected: the landing page hero reading "Your life, organized by AI" (Workstream D rewrites this copy later). Confirm via `read_page`, not a screenshot alone.

- [ ] **Step 3: Confirm the CTA path works**

Click the hero "Start Free" button. Expected: navigation to `/app`, rendering the login page.

- [ ] **Step 4: Confirm deep links resolve**

Navigate directly to `http://localhost:5173/app/week`. Expected: the Week view, with the URL unchanged.

- [ ] **Step 5: Check the console for errors**

Run `read_console_messages` with `onlyErrors: true`. Expected: no errors relating to routing, the manifest, or service worker registration.

- [ ] **Step 6: Confirm the manifest resolves from the app**

```bash
curl -s http://localhost:5173/manifest.json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const m=JSON.parse(d);console.log(m.start_url===('/app')?'OK':'WRONG: '+m.start_url)})"
```

Expected: `OK`

- [ ] **Step 7: Update the ledger and commit**

Prepend a dated entry to `LEDGER.md` per the CLAUDE.md commit workflow describing the routing move, then:

```bash
git add LEDGER.md
git commit -m "docs: record workstream A funnel routing in the ledger"
```

---

## Deployment note (not a code task)

The first deploy after this change will serve the landing page at a URL that existing PWA installs and browser bookmarks point at. The service worker cache bump in Task 5 handles stale shells, but users with `/` bookmarked will land on marketing and need the **Log in** link added in Task 6. That link is therefore load-bearing, not decoration.

## Out of scope

Waitlist-aware CTA text, `signup-status` fetching, pricing copy, and the day-thesis rewrite are Workstreams B and D. This plan only moves the furniture.
