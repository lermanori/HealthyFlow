# PROTOTYPE — HealthyFlow Talk Prompt Lab

## Question

Which system-prompt framing makes regular Talk behave most like HealthyFlow's
target: effortless mixed input, one complete day, and an honest account of what
is known — without weakening confirmation safety?

This is deliberately isolated prototype tooling under `tools/`. It is not
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

Run the deterministic Promptfoo suite with:

```bash
npm --prefix tools/talk-prompt-lab run eval
```

The first case requires Talk to read Today, active Goals, and Habit history;
recommend an existing Goal-aligned Task; preserve a partial Capacity result as
uncertain; and create no write preview. The provider returns the reply, tool
trajectory, pending previews, unchanged fixture state, usage, and latency as a
single structured result so later cases can grade the same observable contract.

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
- No persistence.
- No write execution, including after a model asks for confirmation.
- Current regular-Talk-shaped fake tools only; a prompt cannot conjure a
  missing Capacity capability, which is an intentional experiment result.

When the experiment answers the question, record the conclusion in `NOTES.md`
and delete this worktree.
