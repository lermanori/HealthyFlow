# HealthyFlow

**Say it, and it lands on one honest clock.** What the product is for, who it is
for, and the razor for what belongs in it: [`TARGET.md`](./TARGET.md).

React + Vite frontend (Netlify), Express + TypeScript backend (Railway), Supabase
for data. The app is served under `/app`; `/` is the marketing page. The same
frontend also ships as a native iOS app through a Capacitor shell, currently
distributed via TestFlight — see [`docs/ios.md`](./docs/ios.md).

## Start here

| I want to know… | Read |
|---|---|
| What the product is *for* | [`TARGET.md`](./TARGET.md) |
| What the app actually does today | The code — routes in `src/App.tsx`, nav in `src/components/Layout.tsx`, flags in `src/featureFlags.ts` |
| What a word means (Item, Habit instance, Rollover…) | [`CONTEXT.md`](./CONTEXT.md) |
| Why something is built the way it is | [`docs/adr/`](./docs/adr/) |
| How money works | [`TARGET.md`](./TARGET.md) — Money |
| How the iOS app works | [`docs/runbooks/ios.md`](./docs/runbooks/ios.md) |
| How to take money on iOS | [`docs/runbooks/paid-apps-setup.md`](./docs/runbooks/paid-apps-setup.md) |
| Anything dated or finished | [`docs/history/`](./docs/history/) — unmaintained by design |
| What is in flight | [Issues](https://github.com/lermanori/HealthyFlow/issues) · [Project 1](https://github.com/users/lermanori/projects/1/views/1) |
| How to deploy | [`docs/runbooks/deploy.md`](./docs/runbooks/deploy.md) |

## Running locally

```sh
npm install
```

Copy `.env.example` to `.env` and fill it in, then run the API and the frontend
in separate terminals:

```sh
npm run server
```

```sh
npm run dev
```

## Regression gate

Before publishing, run:

```sh
npm run test:e2e
```

If the golden-path suite is green, the core flows still work. See
[tests/e2e/README.md](./tests/e2e/README.md).

Unit tests:

```sh
npm run test:unit
```

## Landing page

`public/landing.html` is static and hand-maintained. Its screenshots are real
captures of the app — regenerate them whenever navigation or a surface changes.
Only the API needs to be running (`npm run server`); the script starts its own
Vite on :5199 so that it, not your shell, controls the build:

```sh
node scripts/capture-landing-shots.mjs
```

It pins the feature flags to production's values (every `VITE_*` in
`src/featureFlags.ts` blanked) and the theme to Midnight, then refuses to write if
a flagged-off surface rendered anyway. That guard exists because Week and then
Daily Signals both reached the landing page as screenshots of features no
production user could see. To shoot a flag deliberately on:

```sh
HF_SHOT_FLAGS=VITE_WEEK_VIEW_ENABLED node scripts/capture-landing-shots.mjs
```

## Ledger

`LEDGER.md` is a hand-written session narrative, newest first. **It is not
automated.** The agent prepends an entry as part of the commit workflow in
[`CLAUDE.md`](./CLAUDE.md); `.githooks/post-commit` is deliberately a no-op, kept
only so a `core.hooksPath` config stays valid. If you commit by hand and want a
ledger entry, write it by hand.
