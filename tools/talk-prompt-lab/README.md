# HealthyFlow Talk Prompt Lab

## Question

Which system-prompt framing makes regular Talk behave most like HealthyFlow's
target: effortless mixed input, one complete day, and an honest account of what
is known — without weakening confirmation safety?

This is deliberately isolated headless tooling under `tools/`. It is not
imported by the frontend, backend, Vite, Capacitor, or the iOS targets; it never
imports HealthyFlow's database layer and cannot execute a write. Read tools
return synthetic scenario fixtures; every write tool returns a preview-only
pending action.

## Run

```bash
npm run lab:talk
```

The lab reads `OPENAI_API_KEY` from the shell. If it is absent, it checks the
ignored `tools/talk-prompt-lab/.env.local` file and then the HealthyFlow
repository's primary-worktree `.env`, without printing or copying the key.
Calls go directly to OpenAI and therefore use the OpenAI account's API billing,
not HealthyFlow's credit ledger.

Run all scenarios that have an `expect` block with:

```bash
npm --prefix tools/talk-prompt-lab run eval
```

Promptfoo discovers these cases from `scenarios.json`. Each scenario can contain
one `user` message or a `turns` array. Turns share conversation history and may
override `toolResults` to represent a changed day. `systemContext` supplies
bounded synthetic device evidence such as a weekly review. The provider returns
each reply, tool trajectory, pending previews, target-reported state, usage,
and latency as structured output. `expect` holds deterministic checks; `rubric`
adds a model-graded judgment about quality. A new scenario with `expect` joins
the next run automatically; the YAML needs no new row. The Promptfoo viewer can
inspect transcripts with `npm --prefix tools/talk-prompt-lab run eval:view`.

## Comparison boundary

The Promptfoo provider is a runner. It loads a scenario and calls the configured
`targetModule`; it does not select a model, implement tools, or interpret the
harness's internal state. A target exports `runScenario({ scenario, systemPrompt,
options })` and returns a normalized trace: `reply`, `turns`, `toolEvents`,
`pendingActions`, `usage`, and `elapsedMs`. It may also return `finalState`.
Errors must surface explicitly. The existing `synthetic-openai` target owns the
OpenAI Chat Completions call and preview-only fake tools.

To compare targets, add providers with distinct names and target options in
`promptfooconfig.yaml`. A base model and its fine-tuned model can use the same
target module with different `options.model` values. A web-enabled target needs
an adapter that actually exposes web access, and its trace must say when it used
the web. A production Talk target needs to run the real Talk orchestration with
isolated seeded data and preview-only writes. Neither target is implemented yet;
the current results describe the synthetic harness only.

Each target receives the same scenario input. The target owns turn-by-turn state
and must reset it between scenarios. For a fair comparison, keep the base model,
prompt, scenario set, harness, and grading fixed when testing a fine tune. For a
web comparison, keep the model fixed and change only web availability. Report
both web-enabled runs that searched and runs that did not; access to a tool does
not prove it was used.

The currently automated cases cover grounded next-action advice plus five more
behaviors: mixed capture, failed reads, a mid-day pivot, correction across
turns, and a sparse weekly review. A failed assertion is a finding to inspect,
not a reason to weaken the expected behavior. Rubric grading adds API calls.

Controls:

- `p` — next prompt variant
- `s` — next synthetic scenario
- `m` — next model
- `r` — run the selected combination
- `a` — run all prompts against the selected scenario
- `v` — cycle through result summary, rendered prompt, and full run detail
- `q` — quit

Add another `.md` file under `prompts/` and restart to test another prompt. Use
`{{DATE_CONTEXT}}` where the deterministic scenario date context should appear.

## Boundary

- No Supabase connection.
- No HealthyFlow `/ai/chat` call.
- No real user data.
- No app persistence. Promptfoo keeps local evaluation results under the ignored
  `.promptfoo/` directory.
- No write execution, including after a model asks for confirmation.
- The model and this lab's synthetic harness run without the app. Production
  `/ai/chat` routing, context planning, Local-day composition, push delivery,
  voice capture, and confirmation UI are outside this harness. Testing that
  exact production orchestration requires an adapter around the real harness
  with injected in-memory data and preview-only writes.
- Current regular-Talk-shaped fake tools only; a prompt cannot conjure a
  missing Capacity capability, which is an intentional experiment result.

Record prompt comparisons and capability gaps in `NOTES.md`.
