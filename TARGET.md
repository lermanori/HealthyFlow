# Target

> **Say it, and it lands on one honest clock.**

*This describes the product being built. Where it differs from what ships
today, the refusals below say so.*

This document decides what HealthyFlow is for. Everything else — architecture,
scope, pricing, what gets built next — is derived from it. If a decision
elsewhere contradicts this file, this file is wrong and should be argued with
directly, not worked around.

## Who it is for

Someone whose day spans several parts of life at once — work, training, food —
and who has abandoned task apps before because keeping them tidy was more work
than the day itself.

Grounded in the founder's own daily use, not in research. That is a real
limitation and it is written down rather than hidden: the beachhead is people
like the founder, reachable through a warm network.

## The three axes

The product does three jobs. They are not competing identities — they are the
input, the subject and the output of one thing. Treating any of them as "the"
identity is what made the product feel like a pile of parts.

### 1. Input — say it

**The hook.** Getting a day into the app must cost close to nothing. You talk or
type in whatever order things occur to you, and it becomes real: scheduled,
dated, structured, reviewable before anything is written.

- **Demands:** Talk is fast, reliable and forgiving. Voice works. No filing, no
  choosing a category before you can capture, no form.
- **Fails when:** the user has to think about structure before they can get a
  thought out of their head.
- **This is the part the founder actually uses**, and the part most likely to be
  the reason someone starts.

### 2. Scope — one clock

**The reason to stay.** Everything that belongs to a day is on the same day:
tasks, habits, meetings, food, training, weight. Not five apps, not five tabs.

- **Demands:** nothing that belongs to a day lives somewhere else.
- **Fails when:** the user opens a second app for part of their day. That is the
  moment the product stops being the place their day lives.
- **Consequence:** food, weight and training are **core, not optional modules.**
  Cutting them to reduce scope removes the reason to stay.

### 3. Payoff — the honest clock

**The differentiator.** The day tells you the truth: what you planned, what
actually happened, and how much usable time is genuinely left — and it says why
when it cannot know.

- **Demands:** capacity visible by default; plan and record distinguished; a
  refusal to produce a plausible number in place of a real one.
- **Fails when:** the number is hidden, hedged without cause, or invented.
- **Nobody else ships this.** It is the reason this is not another planner.

## The razor

> **A part earns its place if it makes input easier, the picture more complete,
> or the truth clearer.** If it does none of the three, it is clutter — however
> good it is.

| Part | Input | Scope | Truth | Verdict |
|---|:--:|:--:|:--:|---|
| Talk, parse-tasks, voice | ✓ | ✓ | ✓ | Keep — the hook, *and* the way every module is reached |
| Today timeline | | ✓ | ✓ | Keep |
| Rollover | | ✓ | ✓ | Keep — nothing is silently dropped |
| Capacity, attention | | | ✓ | Keep — the differentiator |
| Goals | ✓ | | ✓ | Keep — remembered direction makes Talk easier and separates intention from plan or outcome; **direction only, never a second task lifecycle** |
| Habits | | ✓ | ✓ | Keep |
| Food, weight, training | | ✓ | | **Keep — core, not optional** |
| Google Calendar | | ✓ | ✓ | Keep — obligations you did not type |
| Projects, Focus blocks, Work sessions | ✗ | ✓ | ✓ | **Parked.** A Focus block *is* on the day — it fails on **second vocabulary**, not on shape |
| MCP endpoint, scoped API tokens | ✗ | ✗ | ✗ | Cut from the product story. Real engineering, no user story |
| Expenses, idea dump | ✗ | ✗ | ✗ | Never build. Not day-shaped |

**Parked is not cut.** *Cut* means it does not belong in this product. *Parked*
means the code stays, hidden behind a release flag, deliberately absent from the
story — kept for a future in which it earns its own vocabulary. Work is parked:
`VITE_WORK_ENABLED` is off, nothing is deleted, and it should not be deleted.

**Talk spans all three axes, and that is the point.** It is not only how things
get in — it writes into every module and answers questions about the day. So
"integrating AI with the modules that already exist" is not a feature request; it
is the work of making one axis carry the other two.

## How we know it is working

One question per axis. Each must be answerable from what the product records, or
it is an opinion.

### Input — does a day get in without friction?

- Share of parses that succeed, and how they fail when they do not.
- How much of a parse result is edited before it is confirmed. **A high edit rate
  is the clearest signal the hook is broken** — it means the user did the work
  anyway.
- Items captured per dump, and how often a review is abandoned instead of saved.

*Instrumented today:* every Talk send emits `ai_question_asked` with a structured
entry point, model and attachment presence, but never the user's text. Server
usage logs identify `ai-chat` and its capability calls with token counts. The
funnel is visible; parse-result edit distance and abandoned proposal review are
still not measured.

### Scope — does the whole day live here?

- How many parts of a day one person touches in a week: tasks, food, training,
  weight. Someone using one part is using a planner; someone using three is using
  this product.

*Instrumented today:* `item_created`, `calorie_entry_logged`, `weight_logged` and
`workout_logged` all fire. The first two retain their historical
`source: manual | ai_parse` contract; AI creation now starts in Talk. Breadth per
person is derivable but has never been defined as a measure.

### Truth — is the number seen, right, and acted on?

- Does Capacity render at all, and is it `complete` or `partial`?
- **Which reason codes fire, and how often.** This is the most valuable number in
  the product: every reason code is a specific, fixable cause of the headline
  figure being hedged. If `item_missing_duration` dominates, that is a UX fix,
  not a mystery.
- Does anything change after the number is seen — an item moved, deferred, or
  dropped.

*Instrumented today:* **nothing.** There is no event for Capacity, attention or
the daily plan. The differentiator is the one part of the product that reports
nothing about itself.

### The decision this must also answer

The Money section accepts a risk and names what would reverse it: people who
exhaust their actions stopping rather than continuing manually. That is
measurable — `credits_exhausted`, followed by whether `item_created` with
`source: manual` keeps happening. **Make sure it stays measurable**, because it
is the trigger for a pricing change.

## Where it runs, and in what order

**Now: iPhone.** The immediate goal is an App Store listing with a working app.
Not feature completeness, not the web, not every axis at full strength — a real
listing people can install from. Everything else queues behind it.

**Then: the web reaches guest parity.** The same free, local, no-account
experience the iPhone app gives. Someone should be able to start on either
surface without being asked for anything.

**Later: cross-device is the paid product.** Everyone is single-device by nature —
the day lives on the device it was created on, because that is where the data is.
The same day appearing on the phone *and* the web is what a future Cloud
subscription buys. v1 has no Cloud entitlement or purchase path: Claim adds an
account identity and recurring free actions, not backup or a second device.

## Money

**The app is free, works offline, and needs no account.** That is not a trial —
nothing expires, and no part of the day itself is withheld.

**v1 is free and has no purchase rail** (ADR-0019). Nothing can be bought, nobody
can hold Cloud, and the app contains no price, Subscribe button, Buy button,
StoreKit product, RevenueCat SDK, or external checkout. The Local day remains a
real product without either an account or money.

**Gap recorded 2026-09-06:** the current Settings and administration surfaces
still carry paid-plan controls. Removing every v1 acquisition/grant path is #233;
until it lands, those controls describe a product the release refuses.

The free entitlement is deliberately concrete:

| Identity | AI actions | Recurs? | Cloud |
|---|---:|---|---|
| **Guest** | 10 | Once | No |
| **Claimed account** | 15 | Each calendar month | No |

Both grants are lazy: the attempted AI action is the activity check, so opening
the app stays offline and dormant rows cost nothing. Claim adds no welcome grant,
but it converts the Guest row in place: unused Guest actions survive, and the
account's monthly allowance remains independently eligible. See ADR-0017 and
ADR-0018.

When someone needs more, **Founders Club** is the direct line to ask. Any extra
actions are a discretionary free grant, not a sale, subscription, or promise.
Founders Club is an early-user relationship; it is not the future Founding price.

**A credit is one action, not a unit of cost** (ADR-0016). Text costs 1, a photo
5, and a premium model 10. Product copy says *actions*; Credit remains the ledger
noun. v1 provides Credits but does not sell them.

**The later paid shape is preserved, not launched.** Cloud will sell the day on
every device and a separate consumable will sell non-expiring action packs
(ADR-0012). Apple In-App Purchase through RevenueCat remains the accepted v1.1
rail (ADR-0015); issues #222–#224 are deferred until after the free release.
Nothing from that rail belongs in v1.

**Entry is open.** Claim takes no seat and meets no waitlist, whether someone
arrives cold or begins as a Guest. It exists to keep one identity and unlock the
monthly allowance, not to open a till.

**The risk this accepts:** a free user who exhausts an allowance still feels a
boundary. The day continues manually, and the inline refusal offers Claim where
eligible or Founders Club. Whether people continue manually is measured rather
than assumed.

## What we refuse

A refusal is the strongest statement in this document. Where one is not yet true
of the build, it is **dated and its gap named** rather than quietly softened —
softening a rule to survive a release is how the rule dies.

**In force today**

- **Never guess a number.** Say why instead.
- **No silent fallbacks.** A failure surfaces as a failure.
- **No second vocabulary.** If a feature needs its own set of nouns, it is a
  different product.
- **Never require a network** except for AI and calendar. Local storage is the
  base layer for everyone, so the day is readable and writable with no
  connection. Cloud replicates on top of it; it is not the source.

**In force on iPhone since 2026-08-21**

- **Never require an account to be useful.** Signing up buys more, never entry.
  Guest mode closes this — on iPhone. The web still asks for an account, and
  reaches parity later.

A Guest's Goals, Items, Habits, settings **and health** — food,
weight, training and progress — live on their device, so nothing is withheld from
someone without an account. That gap closed on 2026-08-21 and was the contradiction
ADR-0011 recorded.

Account entry closed the remaining gap on 2026-08-25. Password login, provider
login and new-account signup bring the account's archive down, merge it with any
newer Local changes already held for that identity, and validate the document
before the session opens. A failed download or write leaves the prior session
untouched and surfaces the failure.

Free users' data is never hosted — for cost, and because if it were, the Cloud
subscription would have nothing to sell.

## How to use this document

**Before building:** which axis does this serve? If none, do not build it.

**Before cutting:** which axis does this serve? If it is the only thing serving
that axis, cutting it breaks the product.

**When they conflict:** input beats scope beats truth for *acquisition*; truth
beats scope beats input for *retention*. A new user forgives a thin day; a
returning user does not forgive a wrong number.
