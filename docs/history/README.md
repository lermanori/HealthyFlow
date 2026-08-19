# History

Everything in this directory is **time-bound and unmaintained**. It records what
was planned, decided or observed on a date, and it was accurate then. None of it
is a description of the app now.

That is the whole point of the directory. The rule for this repo is:

> **Live docs must be true. Historical docs must be dated. Nothing in between.**

Before this existed, a finished plan and a live contract looked identical in a
file listing, so every reader had to open a file to find out whether to trust it.
Roughly 40% of the project's prose was executed plans reading like current
intent.

## What lives where

| Directory | What it holds |
|---|---|
| `plans/` | Implementation plans. Executed, superseded, or abandoned |
| `specs/` | Designs, as approved at the time |
| `reviews/` | Dated review artifacts — UX findings, code-review write-ups. Several findings have since been fixed |
| `snapshots/` | Point-in-time descriptions of the product, frozen |
| `product/` | Positioning, pricing and go-to-market as they stood |
| `workstreams/` | Dormant workstreams kept for their reasoning |
| `2026-06-30-task-ledger/` | An abandoned per-task ledger format, superseded by root `LEDGER.md` |
| `dev-harnesses/` | Throwaway manual test pages |

## If you need the truth instead

| Question | Where it is actually answered |
|---|---|
| What does the app do? | The code — routes in `src/App.tsx`, navigation in `src/components/Layout.tsx`, flags in `src/featureFlags.ts` |
| What does a word mean? | `CONTEXT.md` |
| Why is it built this way? | `docs/adr/` — dated, immutable, still authoritative |
| How does a subsystem work? | `docs/architecture/` |
| How do I run or deploy it? | `docs/runbooks/` |
| What happened, and when? | `LEDGER.md` |

Nothing here should be cited as current. If a document in this directory is the
only place something is written down, that thing needs a home in one of the live
locations above.

## Citations from immutable documents

ADRs are never edited, so some of them cite paths that have since moved. Those
citations are not broken records — they named the file correctly at the time.
Follow them here:

| Cited as | Now at |
|---|---|
| `ROLLOVER_IMPROVEMENTS.md` (ADR-0002, `CONTEXT.md`) | `2026-rollover-improvements-superseded.md` |
| `FEATURES.md` | `snapshots/2026-08-17-features.md` |
| `MARKETING.md` | `product/2026-08-marketing-plan.md` |
| `docs/superpowers/specs/…` | `specs/…` |
| `docs/superpowers/plans/…` | `plans/…` |
| `docs/ux-review/…` | `reviews/2026-07-18-ux/…` |
