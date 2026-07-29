# HealthyFlow

Your whole day in one place. Tasks, habits, food, training and weight live on one
timeline that carries itself forward.

React + Vite frontend (Netlify), Express + TypeScript backend (Railway), Supabase
for data. The app is served under `/app`; `/` is the marketing page.

## Start here

| I want to know… | Read |
|---|---|
| What the app actually does today | [`FEATURES.md`](./FEATURES.md) |
| What a word means (Item, Habit instance, Rollover…) | [`CONTEXT.md`](./CONTEXT.md) |
| Why something is built the way it is | [`docs/adr/`](./docs/adr/) |
| Positioning, pricing, go-to-market | [`MARKETING.md`](./MARKETING.md) |
| What is in flight | [Issues](https://github.com/lermanori/HealthyFlow/issues) · [Project 1](https://github.com/users/lermanori/projects/1/views/1) |
| How to deploy | [`README-DEPLOYMENT.md`](./README-DEPLOYMENT.md) |

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

`LEDGER.md` is appended on every commit by `.githooks/post-commit`. A new clone
needs this once:

```sh
git config core.hooksPath .githooks
```
