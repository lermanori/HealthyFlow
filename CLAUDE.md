# HealthyFlow

What the product is for, who it is for, and the razor for what belongs in it:
**[`TARGET.md`](./TARGET.md)**. Read it before proposing a feature or a cut.

React + Vite frontend (Netlify), Express + TypeScript backend (Railway), Supabase
(Postgres) for data. The same frontend also ships as a **native iOS app** through
a Capacitor shell, distributed via TestFlight — **a change to the web app is a
change to the iOS app.** Check both before assuming a frontend change is web-only.
The app target declares different `IPHONEOS_DEPLOYMENT_TARGET` values in its two
build configurations (15.0 and 17.0) while the widget is 17.0 in both; confirm the
intended floor before relying on an OS-gated API.

## Rules that override normal practice

- **No silent fallbacks.** A failed call surfaces the error. Never substitute a
  hard-coded response, an empty result, or a guessed value.
- **A failed read is never an empty result.** `unavailable` means the read broke;
  `not_logged` / `not_recorded` / `not_scheduled` mean nothing was there. One
  module failing must never fail the whole day.
- **Capacity never guesses.** Exact figure, upper bound with typed reasons, or
  nothing.
- **Server-keyed AI only.** The OpenAI key lives on the server. There is no BYOK
  flow and never has been. Do not add client-side key handling.
- **`callStructured(schema, prompt) → Result<T>`.** Callers get a typed result or
  an explicit error, never an untyped `any`.
- **Zod is the single source of truth.** Types are `z.infer<>` of a schema, never
  written alongside one.
- **Virtual-first.** A Habit instance is synthesised at query time and becomes a
  real row only when placed or completed — never on a plain read. See ADR-0001,
  ADR-0002.
- **Add to existing deep modules** rather than creating a thin file per feature.
  `backend/src/day-summary-schema.ts` is the day contract and the most central type in the
  codebase; read it before changing anything that appears on Today.
- **Routes stay thin.** Validate with Zod, call a service, return. Business logic
  lives in service modules.

## Where things live

> **Live docs must be true. Historical docs must be dated. Nothing in between.**

| Location | Holds | Maintained? |
|---|---|---|
| `TARGET.md` | What the product is for, and the razor | Yes |
| `CONTEXT.md` | Domain vocabulary, and the words we refuse | Yes |
| `README.md` | The door — where to find everything | Yes |
| `LEDGER.md` | Session narrative, newest first | Append-only |
| `docs/adr/` | Numbered decisions and their reasoning | Immutable — never edit |
| `docs/architecture/` | How a subsystem works | Yes |
| `docs/runbooks/` | How to run, deploy and operate it | Yes |
| `docs/agents/` | Skill configuration | Yes |
| `docs/history/` | Plans, specs, reviews, snapshots — dated | **No, by design** |

Nothing in `docs/history/` describes the app now. If something there is the only
place a fact is written down, it needs a home above.

**What the app does today is answered by code, not prose:** routes in
`src/App.tsx`, navigation in `src/components/Layout.tsx`, release flags in
`src/featureFlags.ts`, the shape of a day in `backend/src/day-summary-schema.ts`.

## Task tracking

GitHub Issues plus [Project 1](https://github.com/users/lermanori/projects/1/views/1)
are the source of truth for what is in progress. Check the board before acting.
Record triage state via the project's `Status` field, not a file. See
`docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`,
`docs/agents/domain.md`.

## Agent commit workflow

When the user says "commit":

1. Run `git status` to see what changed.
2. Write a concise message as `<type>: <summary>` (`feat:`, `fix:`, `docs:`,
   `refactor:`). Use the user's words if they supplied a message.
3. Prepend an entry to `LEDGER.md`:

```
### YYYY-MM-DD HH:MM — `<branch>`

<2–4 sentences on what was accomplished and where the project stands. A status
update, not a copy of the commit message.>

---
```

4. Stage the changed files plus `LEDGER.md`.
5. Commit.

The ledger is written by the agent, not by a hook — `.githooks/post-commit` is
deliberately a no-op.

## Verification

`npm run typecheck` (frontend), `npm --prefix backend run typecheck` (covers
`src` **and** `tests`), `npm run test:unit`, `npm --prefix backend test`,
`npm run build`. Do not claim work is done without running what is relevant.
