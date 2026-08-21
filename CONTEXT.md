# Vocabulary

The words this project uses, and the ones it refuses. What the app is *for* is in
[`TARGET.md`](./TARGET.md). The rules you must follow are in
[`CLAUDE.md`](./CLAUDE.md). This file is only the words.

**A term is here because getting it wrong causes a real problem** — a collision,
a wrong assumption, or a claim about something that does not exist. If a term is
merely defined in code, the code is its documentation and it does not belong here.

When your output names a domain concept — an issue title, a variable, a test
name, a commit message — use the word as defined here. **Rename in code, change
this file in the same commit.**

## Words that collide

These pairs look interchangeable and are not. Every one has caused a real mix-up.

| Looks the same | Actually |
|---|---|
| **Item** / **Task** | *Item* is the umbrella for everything tracked. *Task* is one `type` of Item. Never say Task for the umbrella. |
| **Focus** / **Focus block** | *Focus* is the day contract's choice of what deserves attention now — no schedule, no lifecycle, belongs to no module. A *Focus block* is a scheduled Work plan. They share a word and nothing else. Say "Focus block" whenever Work is meant. |
| **Calorie entry** / **`meal` Item** | Nutrition is Calorie entries, in their own table. The `meal` Item type is unrelated and has no surface. Never "meal entry". |
| **Workout session** / **`workout` Item** | A *Workout session* is a dated training record. The `workout` Item type is a scheduled thing on the day. Different tables, different meanings. |
| **Work session** / **Focus block** | The *Focus block* is the plan; the *Work session* is the durable record of what happened. Only a completed review produces a session — elapsed time never does. |
| **Achievement** / **Progress** | The same thing. The API, table and route say *Achievement*; the label users see says *Progress*. Do not "fix" either to match the other. |
| **Talk workflow** / **Talk stage** / **capability** | Three different things. `plan_work` is a workflow, `draft_task` is a stage inside it, `add_work_task` is a reusable capability any workflow may invoke. See ADR-0009. |
| **Claim** / **Sign in** | Both take a Guest to an account, and they are opposites. *Claim* converts the Guest's **own** row — one identity, nothing moves, nothing can be lost. *Sign in* abandons that row for an account that **already exists** — two identities, the day travels, and the guest row's credits are forfeit. Never say "sign up" for either. |
| **User setting** / **release flag** | A *setting* is the user's choice and hides a section for that account. A *flag* is the project's choice and hides a surface from everyone. Work has no setting and is behind a flag. |

## Words that do not mean what they look like

**Habit instance** — synthesised at query time, not a stored row. It becomes real
only when placed or completed. Daily only; weekly is accepted and never
synthesised.

**Materialize** — writing the real `tasks` row for something that was virtual.
Triggered by placing or completing, never by a plain read (ADR-0001, ADR-0002).

**Anytime backlog** vs **Someday backlog** — *Anytime* belongs to a specific day
(`scheduled_date` set, no `start_time`). *Someday* has neither date nor time and
shows on every day until placed or completed. Easy to conflate; different rows.

**Rollover** — Tasks carry forward; **Habits do not.** A missed Habit day
re-synthesises fresh. The asymmetry is deliberate (ADR-0002).

**`unavailable`** — the read *failed*. It is never an empty result. Empty is
`not_logged` / `not_recorded` / `not_scheduled`. Confusing the two turns a broken
module into a quiet lie.

**Capacity `partial`** — an upper bound, not a number. It means something the day
should know is missing, and a reason code says what. **A Calendar the user never
connected is not a reason** — it is outside the system's world, like an obligation
never written down, so Capacity stays `complete`. A connected Calendar that failed
to read *is* a reason.

**Planning window** — the user's declared usable day. It has a default, so
Capacity works on day one. A default is a **declared assumption, not a guess**:
the day always renders the window it computed against.

**Daily Plan reference** — an entry in the day's single ordered plan, tagged
`plan`, `actual` or `boundary`. It points at the record its module owns; it never
copies or mutates it. Not a "timeline row" — the plan is the data, the timeline is
one rendering.

**Local day** — the record of someone's day held on their device rather than on
the server: Items, Habits, Habit progress and settings, in one document
(ADR-0011). It is the **source**, not a cache — there is no server copy behind it
to fall back to, which is why a read that fails can never be reported as an empty
day. _Avoid_: "offline copy", "local cache", "draft".

**Claim** — the moment a Guest becomes an account holder **on their own row**. It
happens in place: the same `users` row gains an email and a password, the `userId`
never changes, and the **Local day** is still keyed correctly the instant the write
commits. **Nothing moves and nothing can be lost** — that is the property the
design exists to preserve, and any change that breaks it is a different design.
Entry is open: Claim takes no signup slot and meets no waitlist (ADR-0012).
_Avoid_: "migrate", "import", "transfer", "upload" — every one implies moving data
that does not move.

**Sign in** (from a Guest) — abandoning a guest identity for an account that
already exists. Not Claim, and not the reverse of it. Two rows are involved, the
account's day travels **down** to the device, the Guest chooses whether to keep
their device day or discard it, and **the guest row's credit balance is forfeit**,
said plainly before they do it.

**Guest** — someone using the app with no account. Their day is real and their
own; nothing expires and nothing is withheld. Their **Local day** lives on one
device, and their `users` row on the server holds identity and a credit balance
and nothing else. _Avoid_: confusing a Guest with a **demo persona** — a persona
is seeded, shared and disposable, a Guest's day is theirs. Not a "trial" either:
guest mode does not run out.

## Words we refuse

| Never say | Say instead / why |
|---|---|
| todo, reminder, action item | **Task** |
| routine, ritual | **Habit** |
| BYOK, bring your own key | Retired. No such flow has ever shipped; AI is **server-keyed** |
| free time, available time | **Capacity** — and say whether it is exact or an upper bound |
| timeline row | **Daily Plan reference** |
| sync, migrate (for signup) | **Claim** |
| offline copy, local cache | **Local day** — it is the source, not a copy of anything |
| AI parser, task extractor | **parse-tasks** — "extractor" loses the habit case |
| agent, session, chat mode | **Talk workflow** |

## Things that look built and are not

- **`grocery` and `meal` Item types** — accepted by `ItemTypeSchema`, each with its
  own daily-plan reference kind, and **neither has any surface**. No page, no Add
  target, no renderer. Do not describe either as available.
- **Weekly Habits** — `repeat_type: 'weekly'` is accepted and stored but never
  synthesised into instances (ADR-0002).
- **Work** — Projects, Focus blocks and Work sessions are complete and **parked
  behind `VITE_WORK_ENABLED`**, deliberately absent from the product story. The
  code stays. See `TARGET.md`.
- **Health for a Guest** — Nutrition, Weight, Training and Progress are not held
  in the **Local day**. A Guest's settings switch those modules off, so the day
  reports them `disabled` rather than empty. This contradicts `TARGET.md`, which
  calls food, weight and training core rather than optional; the contradiction is
  recorded in ADR-0011 and is not resolved.
- **Sign in** (from a Guest) — a Guest cannot yet move to an account that already
  exists. It needs Health on the device first, because the download has nowhere to
  put it. Not designed. **Claim is built.**

## Closed sets

**Categories** — `health`, `work`, `personal`, `fitness`, `grocery`, `nutrition`.
AI output must pick from this set; anything else is rejected at the parser
boundary. The authority is `CategorySchema`; an e2e test asserts the UI offers
exactly these.
