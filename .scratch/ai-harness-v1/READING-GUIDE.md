# Reading guide — AI harness PR

A guided walk through the PR so you can own the code, not just merge it. Read top-down. The order is *learning order*, not commit order — commits are referenced where they explain a decision.

Total: ~600 lines of real code change (the rest is `package-lock.json` and deleted docs). Budget ~45 min for a careful read.

---

## 0. The vocabulary first

**Read:** [CONTEXT.md](../../CONTEXT.md) (40 lines)

Why first: every name in the diff — `Item`, `Task`, `Habit`, `parse-tasks`, `BYOK`, `Rollover` — is defined here. If you read code before reading this, you'll silently substitute your own meanings and miss the precision the PR is built on.

The two distinctions that matter most:
- **Item** (umbrella) vs **Task** (one of its `type` values). The PRD and code use "Item" for the parent type and reserve "Task" for `type: 'task'`. Mixing them is the single easiest way to break the mental model.
- **`parse-tasks`** is the *capability*, not "the AI parser." There used to be a fake AI surface (`openai-recommendations`) that pretended to do this; killing it is half the PR.

The PRD that drove all of this: [.scratch/ai-harness-v1/PRD.md](PRD.md).

---

## 1. The new reliability stack (the heart of the PR)

**Read in order:**

1. [backend/src/routes/ai.ts:56-66](../../backend/src/routes/ai.ts#L56) — the `ParsedItem` zod schema
2. [backend/src/routes/ai.ts:69-102](../../backend/src/routes/ai.ts#L69) — the `parse-tasks` route handler
3. [backend/src/openai.ts](../../backend/src/openai.ts) (full file, ~95 lines)

The thing to internalise: **the zod schema is the single source of truth.** It's used three times:

- As the OpenAI contract, via `z.toJSONSchema(ParsedItems)` → passed to OpenAI as `response_format: { type: 'json_schema', strict: true }`. This makes the model *contractually incapable* of returning a malformed shape.
- As the defensive validator, via `ParsedItems.parse(...)` on the response. Belt-and-braces in case strict mode ever has an escape hatch.
- As the implicit contract for the frontend (`{ items: ParsedItem[] }`).

If you change one field — say, add `notes: z.string()` — all three move together. There is no other place to update. That's the deepening.

**Now compare to `openai.ts`.** `Openai.callStructured()` is a *deep module* (cf. Ousterhout): wide implementation, narrow interface. The route handler doesn't know about `fetch`, doesn't know about `Bearer`, doesn't know about `response_format`. It hands over a schema and a prompt; it gets back `Result<T>`.

The `Result` type (`{ ok: true; value: T } | { ok: false; code; message }`) is worth noting — no exceptions thrown across the seam. Look at how the route handles `!result.ok` on [ai.ts:98](../../backend/src/routes/ai.ts#L98): it doesn't care *why* OpenAI failed, just that it did, and returns a generic 500 with a human-readable message. The detailed error logs stay server-side.

**Commit context:** the route was first built inline (`aaa90cd`), then the OpenAI guts extracted into the module (`ab4bb5e`). Reading the final state is fine; if you want to see the *seam emerging*, `git diff aaa90cd ab4bb5e -- backend/src/routes/ai.ts` shows the route shrinking by ~50 lines as the duplication moves out.

---

## 2. The tests — proving the seam holds

**Read:**

1. [backend/tests/ai/parse-tasks.test.ts](../../backend/tests/ai/parse-tasks.test.ts) (~108 lines, 2 tests)
2. [backend/tests/ai/parse-tasks-failures.test.ts](../../backend/tests/ai/parse-tasks-failures.test.ts) (~84 lines, 4 tests)

Two patterns worth absorbing:

**`supertest(app)` not `supertest(URL)`.** The existing `tests/features/` suite hits `localhost:3001` over HTTP. These new tests import the Express `app` directly. That's a deliberate choice: `nock` intercepts `fetch` *in the same process*. If the backend ran out-of-process, nock would have nothing to grab. Look at how [parse-tasks.test.ts:4](../../backend/tests/ai/parse-tasks.test.ts#L4) imports `app` directly — that's the whole trick.

**Nock intercepts at the HTTP boundary, not the SDK.** No `jest.mock('../../src/openai')`. The test exercises the real `Openai.callStructured`, the real schema derivation, the real Zod validation — only the network call to `api.openai.com` is faked. This means refactoring `openai.ts` doesn't break the tests; only behavioural changes do.

The four failure cases (missing input, upstream 500, schema mismatch, missing content) map directly to the four error branches in `openai.ts`. Walk both files side by side once.

---

## 3. The frontend wire-fix

**Read:**

1. [src/services/api.ts:213-219](../../src/services/api.ts#L213) — `aiService.parseTasks`
2. [src/components/AITextAnalyzer.tsx:190-220](../../src/components/AITextAnalyzer.tsx#L190) — the call site and the failure UX

Two things to notice:

**The frontend type matches the backend zod schema exactly.** `ParsedItem` in `src/services/api.ts` (around line 200) has the same fields as the backend zod schema. There's no translation layer, no field renaming. The PRD called this out: `duration` not `estimatedDuration`, `repeat` always present. The "no translation layer" is the whole point — adding one is the slippery slope that makes parsers drift from the rest of the app.

**No rule-based fallback.** Look at the catch path. There is no "if AI fails, generate fake items from keyword matching." It's just `toast.error(...)` and keep the user's text in the input. The PRD's principle: "Honest failure beats silent degradation." This is why `openai-recommendations` had to die — it was exactly the dishonest fallback this PR refuses to have.

---

## 4. The deletions — what's *not* here anymore

This is the half of the PR that's invisible if you only diff against `main`. Read commits, not files.

- **`cb4ced8 refactor(ai): delete fake openai-recommendations endpoint`** — `git show cb4ced8`. An endpoint that prepended `[AI Enhanced]` to rule-based output. Pure theatre. Gone.
- **`e3b93a5 refactor(ai): strip BYOK from UI`** — `git show e3b93a5`. The frontend no longer reads `localStorage.getItem('openai_api_key')` or sends `apiKey` in request bodies. Settings page no longer asks for one. The server uses its own `OPENAI_API_KEY`. Why: XSS exposure + onboarding friction.
- **`ac90b5a refactor(ai): delete AIService and its three template handlers`** — `git show ac90b5a`. A 136-line file of dead abstractions: `AIService` with three "template" methods that wrapped string concatenation. The kind of seam you build when you anticipate variation that never comes. Deleting it is structural simplification, not feature work.

Read these commits not for the code, but for the *messages* — they explain the reasoning.

---

## 5. The Rollover deepening (parallel work)

**Read:**

1. [backend/src/rollover.ts](../../backend/src/rollover.ts) (~105 lines, the new module)
2. The commit message of `e04db58 refactor(rollover): deepen Rollover into one module` (`git show e04db58`)

This isn't part of the `ai-harness-v1` PRD — it landed on the same branch from the architecture-review. The pattern is the same as `openai.ts`: scattered logic across `routes/tasks.ts` and `supabase-client.ts` collapsed into one named module with a narrow interface.

If you only have time for one of the two deepenings, read `openai.ts`. Rollover is the same lesson applied to a different domain (carrying incomplete items day-to-day, per [CONTEXT.md "Rollover"](../../CONTEXT.md#L26)).

---

## 6. Domain language you can now defend

After reading the above, you should be able to push back on these phrasings in future PRs:

| Sloppy | What it should be | Why |
|---|---|---|
| "the AI parser" | `parse-tasks` | The capability has a proper name; "parser" is generic |
| "the OpenAI service" | `Openai` module | The module is named for what it wraps, not "service" |
| "the todo list" | items / Tasks | Item is the umbrella, Task is one type |
| "AI-enhanced recommendations" | rule-based recommendations | The "AI" label was a lie we removed |
| "user's API key" | (don't — we're server-keyed now) | BYOK is gone for parse-tasks |

---

## 7. What's *not* in this PR (and why)

These are deferred on purpose — knowing they're absent is part of owning the work:

- **`query-tasks` improvements.** The endpoint still dumps the whole task table into the prompt. Token blowup at scale. Defer.
- **`AITextAnalyzer.tsx` is still 790 lines.** Splitting it lands later via the `split-large-file` skill — it's [.scratch/architecture-review-v1/issues/04-split-ai-text-analyzer.md](../architecture-review-v1/issues/04-split-ai-text-analyzer.md).
- **No `grocery`/`meal`/`workout` parsing.** Each needs its own field schema and prompt design.
- **No per-user rate limiting.** Server-key bounds cost; revisit if abuse surfaces.

---

## 8. Suggested first edit (to prove you own it)

Pick one of these as a 30-minute exercise:

1. **Add `notes: z.string().optional()`** to `ParsedItem`. Watch how the change propagates: schema → OpenAI JSON Schema → response validation → frontend type → UI form. If you can do this without grep-and-replace, you've internalised the design.
2. **Write the 5th failure-path test** — "OpenAI returns 429 (rate limit) → endpoint returns 500." Mirror the existing failure tests; it's < 15 lines.
3. **Delete the Settings page's OpenAI section entirely** if any vestige is left ([src/pages/SettingsPage.tsx](../../src/pages/SettingsPage.tsx) was edited but worth a read-through).

---

## Commit map (for reference)

Read in *learning* order: 10578d4 → aaa90cd → 217d16f → ab4bb5e → cb4ced8 → e3b93a5 → ac90b5a → e04db58.

| Commit | Layer | One-line |
|---|---|---|
| `5546af4` | foundation | WIP baseline; ignore — superseded |
| `10578d4` | foundation | CONTEXT.md glossary |
| `aaa90cd` | parse-tasks | Happy path: gpt-4o-mini + zod + server key |
| `217d16f` | parse-tasks | Failure paths + drop rule-based fallback |
| `ab4bb5e` | deepening | Collapse OpenAI seam into one module |
| `cb4ced8` | cleanup | Delete fake openai-recommendations |
| `e3b93a5` | cleanup | Strip BYOK from UI |
| `ac90b5a` | cleanup | Delete dead `AIService` |
| `e04db58` | parallel | Deepen Rollover (not in PRD; from arch-review) |
