# Day setup — design

> **Written 2026-08-27.** A dated document in `docs/history/` — it describes the
> design as agreed on that date and is not maintained. Where it disagrees with
> `TARGET.md`, `CONTEXT.md` or an ADR, those win.

> **The decision:** a short, deterministic interview that asks someone about their
> day and writes the answers into settings, Goals and Habits that already exist.
> It is **offered** at first run, never required, reachable from Today if declined,
> and **re-runnable from Settings** for the life of the account.

---

## 1. Why this exists

Onboarding exists today and does none of this. `Onboarding.seedNewUser` sets
`onboardingStatus: 'active'`, and the entire user-facing surface is one banner on
Today (`src/pages/TodayPage.tsx:1863`) that opens the AI Text Analyzer. It is an
**activation nudge**, not a preference-gathering step, and it has two holes:

| Hole | Evidence |
|---|---|
| **Guests never see it** — and per `TARGET.md` the iPhone Guest is now the front door | `src/lib/local/day.ts:61` hard-codes `onboardingStatus: 'completed'` for the Local day |
| **It sets nothing** — every preference a new person could declare stays at its default | `backend/src/settings-schema.ts` |

### The three jobs, and the razor

Day setup must serve all three axes of `TARGET.md` or it is clutter:

| Axis | What day setup does for it |
|---|---|
| **Truth** | Turns the 08:00–18:00 Planning window from a *declared assumption* into a **declared fact**. This is the largest available lever on `planning_window_missing` and on whether Capacity is `complete` |
| **Input** | Gives Talk a name, a communication style, and free-speech direction, so the first brain-dump parses into something that looks like the user's life |
| **Scope** | Lets someone say which parts of the day they are starting with, so Today is not a wall of modules they ignore |

**What it deliberately is not:** a demo, a wow moment, or a gate. It has to earn its
place on usefulness alone, which is why part one is four questions.

---

## 2. Vocabulary

Two entries `CONTEXT.md` needs, both of them collisions that will otherwise cause
a real mix-up:

> **Day setup** / **`onboardingStatus`** — *Day setup* is the re-runnable interview
> that sets the usable day, module choices, assistant profile, Habits and Goals.
> `onboardingStatus` is the one-shot disposition of the **first-run offer** to run
> it (`active | completed | skipped`). Running day setup again never touches it.

> **Claim**, not "sign up" — already in `CONTEXT.md` and load-bearing here. The
> end-of-setup account step converts the Guest's **own** row: one identity, nothing
> moves, nothing can be lost.

The feature is called **day setup** in code, copy and issue titles. It is not called
onboarding, a wizard, a questionnaire or a survey.

---

## 3. The interview

Everything below is **deterministic**. No AI call, no network, no credits. It runs
identically for a Guest with aeroplane mode on and for a subscriber.

> This was a design change during brainstorming and it is the most valuable property
> here: an AI-conducted interview would have been unavailable at exactly the moment
> it is offered, because a new account holds no credits and the front door must work
> offline (`TARGET.md`, "Never require a network").

### Part one · Your day — four questions, always

| # | Question | Writes |
|---|---|---|
| 1 | *What should I call you?* — skippable in one tap | `assistantProfile.preferredName` |
| 2 | *When does your day actually start and end?* | `planningWindow.startTime`, `planningWindow.endTime` |
| 3 | *Which of these do you want to start with?* — food / training / weight & progress | `calorieIntake`, `workoutTracker`, `achievementTracker` |
| 4 | *How should HealthyFlow talk to you?* | `responseStyle`, `planningStyle`, `followUpMode` |

**Q1** is the most cuttable question in the flow. Its job is tone — it makes the next
three read as an interview rather than a form. Cut it before cutting anything else.

**Q2 does not ask for the transition buffer.** Nobody answers "how long between
things?" honestly. It stays at the 15-minute default, which Settings already exposes.

**Q3 is framed as sequencing, not deletion.** `TARGET.md` says food, weight and
training are *core, not optional* — cutting them removes the reason to stay. So the
question is "which do you want to **start with**", the rest remain one toggle away in
Settings, and nobody amputates the reason to stay in their first minute.

**Q4 sets three settings from one question.** The three enums genuinely correlate, so
bundling them is compression rather than a lie, and Settings still exposes each one
individually:

| Answer | `responseStyle` | `planningStyle` | `followUpMode` |
|---|---|---|---|
| *Just tell me* | `concise` | `direct` | `only_when_asked` |
| *Walk me through it* | `balanced` | `one_step_at_a_time` | `ask_about_outcomes` |
| *Explain as you go* | `detailed` | `guided` | `ask_about_outcomes` |

**Part one ends with a real finish line** — *"That's your day set up."* Part two is
offered, not queued. Someone can be done in four taps.

### Part two · Your direction — three optional steps

| # | Step | Writes |
|---|---|---|
| 5a | **Habits** — daily anchors: title, optional time | `tasks` rows, `type: 'habit'`, `repeat_type: 'daily'` |
| 5b | **Goals** — module picker + one sentence | `goals` rows |
| 5c | **Anything else about your day?** — free text | `assistantProfile.dayContext` |

**5a** offers tap-to-fill chips for common anchors, but a chip only prefills text.
Nothing is created without an explicit add. What day setup writes is a **Habit
template**, not tomorrow's row — a Habit instance is synthesised at query time and
becomes real only when placed or completed (ADR-0001, ADR-0002). The copy should not
imply a row exists on the day.

**5b needs almost no design.** `GOAL_MODULES` in `backend/src/goals-schema.ts:15`
already ships the seven options with labels and descriptions written for exactly this
purpose — *Whole day, Items, Habits, Food, Training, Progress* (Work is flag-hidden).
A Goal's `statement` is free speech by definition, so "deterministic" and "free text"
are not in tension: the structure is the module, the content is theirs.

**5c lands on a new field**, `assistantProfile.dayContext`, and here is the
reasoning, because a free-text field nothing reads is clutter by the razor:

- **Rejected: the `context` of a `whole_day` Goal.** `CONTEXT.md` describes Goal
  context as precisely this ("background, constraints, decisions and useful facts").
  But a Goal requires a `statement`, and if the user skipped 5b we would have to
  **invent** one. That is guessing.
- **Accepted: `AssistantProfileFieldsSchema` gains `dayContext`.** It reaches Talk on
  every turn through `AssistantContextSchema.profile`, which is a real home.
- **The tension, accepted knowingly:** that schema's own comment says *"It is not
  hidden model memory."* A free-text paragraph shipped on every turn edges toward
  being exactly that. **The mitigation is not optional: `dayContext` renders in
  Settings → Personal assistant as an editable textarea.** Visible and editable, or
  it does not ship.

---

## 4. Three doors, one flow

| Entry | On finish | On abandon |
|---|---|---|
| **First run** — *"Set up your day"* / *"Just take me in"* | `onboardingStatus: 'completed'` | stays `'active'` |
| **Today banner** — shown while `onboardingStatus !== 'completed'` | `'completed'` | unchanged |
| **Settings → Run day setup again** | **untouched** | untouched |

*"Just take me in"* sets `'skipped'`, **which still shows the banner** — choosing the
app first must never close the door.

> **The banner condition changes.** `src/pages/TodayPage.tsx:1863` currently renders
> on `onboardingStatus === 'active'`, which means today's "Later" button closes the
> door permanently. It becomes `!== 'completed'` so that `'skipped'` keeps the offer
> visible. Without this change, *"Just take me in"* is indistinguishable from
> "never show me this again", and the second of the three doors does not exist.

**The enum does not change.** `onboardingStatus` keeps its single job: the disposition
of the first-run offer. Day setup is a stateless flow reachable from three places.
Conflating the two is the mistake §2 exists to prevent.

---

## 5. The re-run rule

> **Run two opens holding what already exists, and produces a diff.**

- It applies only fields it asked about **and** the user confirmed.
- It never writes a field it did not ask about, and never resets one that was skipped.
- It **lists current Habits and Goals for editing or removal** — it never appends a
  second copy of what run one created.

Part one writes **settings**; part two writes **rows**. That asymmetry is the whole
reason this rule needs stating. A re-runnable interview that blindly creates rows
fills the day with duplicate Habits on the third pass.

---

## 6. Architecture

`onDevice(local, hosted)` in `src/lib/local/services.ts:138` already routes every
service to the device or the server depending on whether a Local day is held. So:

> **Day setup writes nothing itself. It calls the three services Settings, Goals and
> Add Item already call.** Guest and account are the same code path — no branching,
> no new persistence, no new endpoint.

```
answers ──► interview.ts (pure) ──► { settingsPatch, goals[], habits[] }
                                          │
                                          ▼
                              commitDaySetup()
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              ▼                           ▼                           ▼
   settingsService.updateSettings   goalService.createGoal    taskService.createTask
              │                           │                           │
              └────────────── onDevice() ─┴───────────────────────────┘
                          Local day (Guest)  │  REST (account)
```

| Piece | Responsibility | Depends on |
|---|---|---|
| `src/interview.ts` | Question definitions + the **pure** map from answers to writes | Zod schemas only. No I/O, no React |
| `src/components/DaySetup/` | Step UI, back / next / skip, prefill from current state | `interview.ts` |
| `commitDaySetup()` | Applies the three write sets, reports what landed | the three services |
| First-run screen | *"Set up your day"* / *"Just take me in"* | `onboardingStatus` |

`interview.ts` sits alongside `modulePresentation.ts` and `timelineRecords.ts`, the
existing home for pure frontend modules. **The question set is data** — adding a
question is editing an array, not writing a component.

### A bug this uncovers, which must be fixed first

**`onboardingService` is the only service in `src/services/api.ts` not wrapped in
`onDevice`.** `complete` and `skip` (`src/services/api.ts:1537`) are raw `api.post`
calls to `/onboarding/*`.

A Guest holds a real session token (ADR-0010), so those posts **succeed** — against
the *server's* settings row. But a Guest's day is read from the Local document, so
nothing the user can see changes. The banner would never disappear, and nothing would
report an error. A silent no-op, which `CLAUDE.md` forbids.

**The fix:** day setup writes `onboardingStatus` through
`settingsService.updateSettings({ onboardingStatus })`, which is already
`onDevice`-wrapped and therefore correct for both identities. The `/onboarding/*`
routes are then reachable only by the legacy banner path, and should be retired with it.

> **Decide alongside it:** `Onboarding.complete` also awards a *"Completed onboarding"*
> Achievement (`backend/src/onboarding.ts`). Dropping the route drops the award for
> Guests, making it asymmetric. Either implement it on the device, or drop it
> entirely — it serves none of the three axes, and a re-runnable day setup should not
> be minting Progress records on every pass. **Recommendation: drop it.**

### Two schema changes, both small

1. **`dayContext` on `AssistantProfileFieldsSchema`** (`backend/src/settings-schema.ts:34`)
   — trimmed, capped at 2000, nullable, defaults `null`. Add to
   `AssistantProfilePatchSchema` in the same commit.
   > ⚠️ **Adding the field does not make Talk read it.** The Talk prompt must name
   > `dayContext` explicitly, or this ships a textarea into a void.
2. **`LOCAL_SETTINGS_BASELINE`** (`src/lib/local/day.ts:61`) stops hard-coding
   `onboardingStatus: 'completed'` and becomes `'active'`. Without this, Guests — the
   primary user — still never see any of it.
   > No migration guard is needed. There are no existing users.

---

## 7. Error handling

Three services, no transaction. **The commit is not atomic and must not pretend to
be** (`CLAUDE.md`: no silent fallbacks).

- **Order by value:** settings → Goals → Habits. If Habits fail, the window, modules
  and assistant profile are still correctly set.
- **Report exactly what landed.** Never render "Setup complete" over a failed write.
- **A failed commit leaves `onboardingStatus: 'active'`,** so the Today banner stays
  and the door is still open.
- **Recovery is re-running day setup**, which opens prefilled — nothing is retyped.
  The re-run requirement doubles as the error-recovery path.

---

## 8. Analytics

`src/lib/analytics/index.ts:48` already passes `$set_once` through `identify`, which
is what makes "once per user" true rather than best-effort.

| Moment | Event / property |
|---|---|
| **First completion, ever** | `onboarding_completed` (exists) — fires **once per user**, guarded by `$set_once: { day_setup_first_completed_at }` |
| Any completion | `day_setup_completed { run: 'first' \| 'repeat', steps_answered, wrote_goals, wrote_habits, changed_window }` |
| First-run offer declined | `onboarding_skipped` (exists) |
| Abandoned mid-flow | `day_setup_abandoned { step_id }` |

`$set_once` survives the identity merge when a Guest Claims, so someone who completes
day setup as a Guest and creates an account later does not double-count.

**This repays a `TARGET.md` debt.** Capacity is the one part of the product that
reports nothing about itself. `changed_window` is the first event that says whether
anyone ever declares their real day — and day setup is the main thing that will move
`planning_window_missing`.

---

## 9. Testing

| Command | Covers |
|---|---|
| `npm run test:unit` | `interview.ts` mapping — answers in, writes out. Pure, no mocks |
| `npm run test:unit` | **The re-run diff:** a second pass over unchanged answers produces **no** writes |
| `npm run test:unit` | **Run day setup twice with the same answers; assert the Habit count does not change** |
| `npm run test:unit` | `commitDaySetup` with fake services — order, partial-failure reporting, `onboardingStatus` untouched on failure |
| `npm run test:unit` | **Completing day setup with a Local day held clears the banner** — the regression that the `onboardingService` bug in §6 would otherwise reintroduce |
| `npm --prefix backend test` | `dayContext` round-trips `SettingsSchema` / `SettingsPatchSchema` and reaches `AssistantContextSchema` |
| `npm run typecheck`, `npm --prefix backend run typecheck`, `npm run build` | Per `CLAUDE.md` |

---

## 10. The next part — Claim and the plans

**Not specced here. Described so the finish line is built with somewhere to go.**

Day setup ends with a final screen that **never gates anything**. In this part it
offers **Claim only**, plus a plain statement that the app is free, works offline and
nothing expires. The plan panel is the next piece of work.

### Why it is separate

The plan panel serves **none** of the three axes of the razor. It is a commercial step
attached to a product step, and it is blocked on things day setup is not:

| Blocker | State |
|---|---|
| **`worktree-pricing-actions` merging** — ADR-0013, *a credit is an action* | **Accepted**, implemented, 828 backend tests green, **unmerged** |
| `supabase/migrations/20260826120000_credit_is_an_action.sql` | **Written, unapplied** |
| **ADR-0014** — removing the welcome grant and gating the monthly allowance on registration | **Not written.** Both decisions contradict ADR-0013, which is immutable. See below |
| A purchase rail at all — StoreKit or merchant of record | Unbuilt, unchosen. Issue [#201](https://github.com/lermanori/HealthyFlow/issues/201), P0 since 2026-07-30 |
| Apple's current in-app-purchase rules | **Must be verified against live guidelines before any copy is written** |

### What it will say, once ADR-0013 lands

| | |
|---|---|
| **Stay a Guest** | Free, offline, nothing expires — **and no AI at all.** The whole day, typed in yourself |
| **Claim** | Free. **`MONTHLY_FREE_CREDITS = 15` every month**, plus a recoverable identity and the ability to spend money. **No welcome grant** |
| **Cloud** | $9 founding (100 seats) / $19 regular. Your day on every device, **plus text AI with no balance** — fair use 100/day, 100 photo and 50 premium actions a month |
| **Top-up** | $5 → 300 actions, non-expiring, no subscription needed |

A credit is now **one action** — text 1, photo 5, premium model 10 — not a unit of
cost. Copy must say *actions*.

**This is a clean line for the finish line to draw:** *"Create an account — free — and
get 15 AI actions every month."* It is concrete, recurring, and it answers the
backwards incentive the marketing report named, where the person who had already
proved they wanted the product received nothing for claiming.

### Two questions, answered 2026-08-27 — and what they cost

> **1. There is no welcome grant.** No credits are awarded for creating an account.
> **2. The monthly free allowance requires registration.** An account is the only
> durable handle on who is being given credits; a Guest can be re-created by
> reinstalling, so a guest-eligible allowance is farmable by construction.

Both are decisions **against what is currently on `worktree-pricing-actions`**, and
each has a concrete consequence:

| Consequence | Detail |
|---|---|
| **`WELCOME_CREDITS` is removed, not repriced** | ADR-0013's Consequences section states *"Signup grants a flat `WELCOME_CREDITS`, with no cohort branch"*, and `supabase/migrations/20260826120000_credit_is_an_action.sql:77` says the same in a table comment. `docs/adr/` is immutable (`CLAUDE.md`), so **this needs its own decision record — ADR-0014 — amending ADR-0013.** It cannot be a silent constant change |
| **The monthly refill needs an identity gate it does not have** | `claim_monthly_free_credits(p_user_id, p_credits)` gates on `user_id` and the calendar month **only** — there is no email, account or subscription condition in the SQL. A Guest holds a `user_credits` row, so today the entire gate is whatever the caller in `backend/src/credits.ts:591` decides. Requiring an email must be made **explicit**, and belongs in the RPC rather than only in TypeScript, so a second caller cannot bypass it |

### What this costs, stated plainly

**A Guest now experiences no effortless input at all.** The hook — the thing
`TARGET.md` calls the reason someone starts — cannot be felt before Claim.

This is consistent with `TARGET.md`'s refusal, which is about *usefulness*, not AI:
the whole day works without an account, and signing up buys more, never entry. The
wall is an email, not money, and it is the lowest wall that answers "who am I giving
credits to."

But it **supersedes F4 of `docs/history/product/2026-08-26-marketing-focus.md`**,
which recommended placing the grant *"at first open on iPhone, where the Guest is"*
precisely so a Guest could feel the hook. That recommendation is now declined, and the
measurement it proposed — first-parse success against next-day return — should instead
compare **Claim rates before and after** the finish line ships.

### How the free allowance is protected — decided 2026-08-27

**The account gate is the whole anti-abuse story. Build nothing else.**

Farming a monthly allowance is self-defeating once it is gated on an account,
because **the day lives in the account**. Fifteen actions a month is a taste, not a
supply, so using farmed credits means splitting your day across several logins —
which destroys the one honest clock that is the reason to be here. The payoff is
$0.0046 per account per month against that cost.

| Do | Why |
|---|---|
| Gate the refill on an account, **in the RPC** rather than only in the TypeScript caller | A second caller cannot bypass a condition that lives in the function |
| Add *"and has used the app this period"* to the refill | One `WHERE` clause. Kills dormant-row farming, the only variant that costs nothing to run |
| Leave `GLOBAL_DAILY_COST_CEILING_USD = 25` (`backend/src/credits.ts:71`) as the backstop | It already bounds every failure mode not thought of, and refuses rather than absorbing |
| **Build nothing else** — no DeviceCheck, no Keychain UUID, no fingerprinting | Per-device is the wrong unit: it punishes the multi-device user Cloud is sold to, and the web has no equivalent, so it could never be the rule |

**Email verification is still worth adding — for account recovery, not abuse.** There
is no verification path in `backend/src/auth.ts` today, and an App Store audience will
lock itself out. Email normalization (gmail dots and `+aliases`) is worth twenty
minutes for the same reason: the user who accidentally creates a second account and
cannot find their day.

**Revisit only on evidence.** The refill writes `reason: 'monthly_free_refill'` into
`ai_usage_log`, so refills against distinct active accounts is already measurable.

### Two documents this will falsify

- **`TARGET.md`'s Money section.** ADR-0013 measures its central premise false:
  effortless input is *not* what costs us money. *"Free is a good planner. Paid is an
  effortless one"* needs softening now that free includes 15 actions a month.
- **`public/landing.html`** — per `docs/history/product/2026-08-26-marketing-focus.md`,
  it still sells an invite-only beta and a credit-based founding tier, both of which
  product decisions have abolished.

### One convergence worth recording

That marketing report's **F4** independently concluded that the unplaced $1 credit
grant should land *"at first open on iPhone, where the Guest is."* That is exactly
where day setup's finish line sits. Two lines of reasoning, same surface.

---

## 11. What this design does not decide

- Whether the plan panel appears on native at all, or only on web (Apple 3.1.1).
- Whether the `dayContext` textarea should also be offered on the Goals page.
- Whether day setup should ever be **re-offered** proactively — e.g. "your day really
  starts at 06:30; update your window?" That evidence-driven prompt was considered as
  an alternative to a front-door interview and remains a good idea **after** this
  ships, not instead of it.
- Weekly Habits. `repeat_type: 'weekly'` is accepted and never synthesised
  (ADR-0002), so 5a offers daily anchors only.
