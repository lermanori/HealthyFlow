# Marketing focus — where the effort should go

> **Written 2026-08-26.** A dated document in `docs/history/` — it describes the
> product as it stood on that date and is not maintained. Supersedes nothing;
> the 2026-08 marketing plan's §2 research still holds and is not repeated here.

> **The short answer:** the message is not the problem. **The funnel is closed by
> construction** — a stranger cannot install without TestFlight, cannot sign up
> on the web once ten slots are gone, and cannot pay on any surface. Every hour
> spent on copy, posts or ads before those three are open converts at zero.
> Open the door, open the till, put the differentiator on the site — then market
> one sentence to a warm audience.

---

## 1. The finding — nothing you send traffic to currently works

Four walls, each verified in code today. This is the whole diagnosis; sections 2–7
are what to do about it.

| Wall | What a stranger hits | Evidence |
|---|---|---|
| **No install path** | The landing page never mentions the iPhone app, the App Store or TestFlight — not once in 1,146 lines. The only real product surface is invisible on the only page you can link to. | `public/landing.html` (no match for iOS/App Store/TestFlight); `README.md` — "currently distributed via TestFlight" |
| **The web door is a waitlist** | Every acquisition CTA — nav, hero, both pricing plans, the grid, the final band — points at `#waitlist-form`. The badge says *"Invite-only beta · First 100 members."* Cold signup still calls `Waitlist.authorizeSignup`, so the door closes silently once the public slots (default **10**) are claimed. | `landing.html:684,692,699,865,889,904,941`; `backend/src/auth.ts:235`; `backend/src/routes/auth.ts:131`; migration default `public_slots_open = 10` |
| **Guest mode is iPhone-only** | The one thing that removed the wall — *Start without an account* — is gated behind `isNativeIOS`. Web visitors, which is everyone arriving from a post, a DM or a directory, still meet a login screen. | `src/pages/LoginPage.tsx:461` |
| **Nobody can pay** | No StoreKit, no Stripe, no Lemon Squeezy anywhere in the codebase. On the web, "buy" opens a WhatsApp/email contact flow you fulfil by hand. On iOS every purchase CTA is hidden and the text reads *"AI credit purchases are not yet available in the iOS app."* | `src/pages/SettingsPage.tsx:375,608–612`; issue [#201](https://github.com/lermanori/HealthyFlow/issues/201) open since 2026-07-30 |

**The compounding one:** ADR-0012 decided on 2026-08-21 that *entry is open and
scarcity belongs to the paid tier.* Half of it shipped — Claim takes no slot. The
half that did not ship is the cold-signup path, which is exactly the door
marketing points at. The site is still selling an invite-only beta the product
decision abolished five days ago.

**The backwards incentive:** a Guest who has used the app for a month and claims
an account gets **zero credits** (deliberate — `startGuestSession` in
`backend/src/auth.ts` explains why, and TARGET.md confirms the $1 grant is unplaced).
A cold stranger who slips through the waitlist gets **250**. The person who has
already proven they want it gets no taste of the thing you are selling.

---

## 2. Focus order

Each of these blocks the one below it. Do not reorder them for the one that feels
more like marketing.

### F0 — Ship the App Store listing
`TARGET.md` already says this: *"Now: iPhone. The immediate goal is an App Store
listing with a working app… Everything else queues behind it."* It is also the
highest-leverage marketing act available, for reasons that are not about the
listing itself:

- It converts every channel from *"join a waitlist"* to *"install it now."* A DM
  that ends in a TestFlight link costs you a walkthrough; one that ends in an App
  Store link costs you nothing.
- TestFlight caps at 10,000 testers, expires builds after 90 days, requires Beta
  App Review for the first external build, and asks a stranger to install a second
  app first. Every one of those is a conversion tax you are paying on every
  conversation.
- App Store search is a permanent, free, compounding channel. It is the only one
  in this document that keeps working while you sleep.

### F1 — Open the till, without building billing
Issue #201 has been the P0 blocker for four weeks. Time-box it to one day and
decide **on paper**, not in code. The recommendation:

- **Keep manual fulfilment through customer #10.** It works on the web today, and
  the hand-off is a *feature* at this stage: every purchase is a conversation with
  someone who just paid you. Building StoreKit or a checkout before ten people
  have paid is building infrastructure for a hypothesis.
- **Fix the iOS dead end now.** Today an iPhone user who exhausts their credits
  reads "not yet available" and has nowhere to go. That is a churn event fired at
  the exact person who has demonstrated they value the hook. At minimum the state
  should be honest about what happens next and give them a way to reach you.
- **Check Apple's current rules before you write that copy.** In-app purchase
  requirements and what an app may say about buying elsewhere have moved
  repeatedly; whatever this document assumed would be out of date. Verify against
  the live guidelines, then write the string.

### F2 — Give the web an honest front door
Two options, in preference order:

1. **Ship guest parity on the web** — TARGET.md's stated next step after the
   listing, and it makes the landing CTA *"Start free — no account, no install"*
   truthful on every device.
2. **Interim, today:** point the web CTAs at the install path and keep the
   waitlist only as the fallback for people without an iPhone. That is a
   fifteen-minute change to `landing.html` and it stops the page contradicting
   ADR-0012.

Either way, **remove "Invite-only beta."** It is a scarcity signal aimed at the
front door, which is precisely where ADR-0012 says scarcity does not belong.

### F3 — Put the differentiator on the site
`landing.html` sells *scope* — one day, five apps in one. It never once mentions
**Capacity**, the honest clock, or the refusal to guess. That is the thing
TARGET.md says nobody else ships, it renders by default now
(`planningWindow` defaults to 08:00–18:00 in `backend/src/settings-schema.ts`), and
it is completely absent from your marketing.

### F4 — Place the $1 credit grant
TARGET.md calls this "a growth lever [that] wants evidence rather than a default,"
and it is unplaced. Place it at **first open on iPhone**, where the Guest is. You
are selling effortless input; a Guest currently cannot experience effortless input
at all. Measure `ai_parse_requested { succeeded: true }` → next-day return against
Guests who never got it, and let that decide whether it stays.

### F5 — Only now: outreach
Twenty warm DMs, two posts a week, community journey posts. Section 5.

---

## 3. What to say

`TARGET.md` has already done the positioning work and it is sharper than anything
on the website. Use it verbatim.

**The line:** *Say it, and it lands on one honest clock.*

### The message architecture is the three axes

TARGET.md also gives the priority order, which is the part most people get wrong:

> *Input beats scope beats truth for **acquisition**; truth beats scope beats
> input for **retention**.*

| Axis | Job | Where it belongs |
|---|---|---|
| **Input — say it** | The reason someone starts | The headline, the demo video's first three seconds, the App Store screenshot #1 |
| **Scope — one clock** | The reason they stay | The body of the page — this is what the site does well today |
| **Truth — the honest clock** | The reason they choose you over Motion or Sunsama | The proof beat, the second half of the demo, the thing you post about |

Today's site is all scope. It is a good page for someone already convinced, and a
weak page for a stranger.

### The three-beat demo

One asset carries every channel — the hero video, the App Store preview, the GIF
in a Reddit post, the thing you show in a walkthrough call:

1. **Talk.** Someone speaks a messy day out loud, in no order.
2. **It lands.** The timeline fills — tasks timed, habits recurring, the meal
   broken into macros, the workout on the day.
3. **The clock answers.** Capacity appears with a real number — *or an upper
   bound with a stated reason.* Show the hedged case on purpose. That is the
   moment the product is different from every competitor.

### The position to own

> **It never guesses. When it can't know, it says why.**

In a market where every planner now ships a confident AI number, a codified refusal
to invent one is a genuine, defensible stance — and it is defensible precisely
because it is not a marketing claim. It is a rule in `CLAUDE.md`, a reason-code
enum in the day contract, and a `partial` status the UI is required to render.
That is unusually good content: you can show the code behind the promise.

### Audience

Beachhead stays what TARGET.md says it is: **people running work, training and
food at once, reachable through a warm network.** The ADHD/executive-function
angle is a *message variant* for community posts, not an identity — it is a
crowded top end, and the honesty angle differentiates you from it rather than
inside it.

---

## 4. What to sell

Two products, per ADR-0012, and the site currently sells neither of them correctly.

| | What it is | What it buys | Scarcity |
|---|---|---|---|
| **AI credits** | Consumable, 50 per $1 (`TOP_UP_PRICE_USD = 5` → `TOP_UP_CREDITS = 250`) | Effortless input | None |
| **Cloud** | Subscription, $9 founding anchored at $19 | Your day on every device | The founders' discount, capped at 100 |

### Lead with Cloud, not credits

Cloud is recurring, it is where ADR-0012 put the scarcity, and *"your day on every
device"* is a sentence anyone understands. Credits are a top-up detail, not a
headline. The site does the reverse: the featured $9 "Founding Member" plan lists
its benefit as *"500 AI credits each month."* That is the old product story.

### Copy on the site that is now false

- *"First 100 accounts receive 250 AI credits for onboarding"* — founding is a
  **Cloud discount**, not a credit cohort (ADR-0012), and a claiming Guest gets
  nothing.
- *"Invite-only beta · First 100 members"* — entry is open.
- *"Registration is invite-only right now"* — half true, and true for the wrong
  reason.
- The Founding plan's whole benefit list — it sells credits where it should sell
  cross-device.

### Say the boundary out loud

TARGET.md's own sentence is the best pricing copy in the project:

> **Free is a good planner. Paid is an effortless one.**

Put it on the pricing section unedited. TARGET.md names the risk it accepts —
running out of credits reads as a downgrade — and stating the boundary plainly up
front is the cheapest available mitigation. It also matches the brand you are
building in §3: the product that tells you the truth.

---

## 5. Where to look for people

Ordered by cost of proof, not by reach.

| # | Channel | Motion | Why here |
|---|---|---|---|
| 1 | **Warm network / WhatsApp** | 20 personal DMs to people who juggle gym + work + food. Founding offer + a 15-minute walkthrough. | It is already your payment rail (`SettingsPage.tsx:375`). Warm-first founders reach ten customers in weeks; cold-start founders take months. |
| 2 | **Build-in-public (X / LinkedIn)** | 2–3 posts a week, drawn from the work you are doing anyway. | The honesty angle *is* the content: "my planner refuses to guess how much time you have, and here is the enum of reasons it gives instead." Engineering-credible, screenshot-able, and unlike anyone else's launch posts. |
| 3 | **Communities** | Journey posts only — r/productivity, r/getdisciplined, r/ADHD, lifting/fitness crossovers. Never a pitch; they get removed. | Where the beachhead already talks about abandoning task apps. |
| 4 | **App Store search** | Listing keywords, screenshots, preview video. | Free, permanent, compounding — and unavailable until F0. |
| 5 | **Directories & niche newsletters** | AlternativeTo, toolfinder, ADHD-tool lists. | Low effort, slow drip. Do it while waiting on review. |

**Not yet, and this matters:** no paid ads, no Product Hunt, no growth tooling, no
SEO content programme. All four spend attention against a funnel that does not
convert, and Product Hunt in particular is a one-shot asset you cannot re-fire —
spending it while the CTA is a waitlist is the expensive version of this mistake.

---

## 6. What to measure

Four numbers, one per question, and each must be answerable from what the product
records — not from a feeling.

| Question | Number | Status |
|---|---|---|
| Does a day get in? | Installs → first day captured; parse success rate; edit rate before confirm | **Partly ready.** `ai_parse_requested` now carries `succeeded` and `item_count`; edit-before-confirm is not recorded |
| Does the whole day live here? | People touching ≥3 modules in a week | **Derivable, never defined.** The events exist; the measure does not |
| Is the number seen and acted on? | Capacity renders / `complete` vs `partial` / **which reason codes fire** | **Nothing. Zero events.** |
| Will strangers pay? | Paying customers → 10 | No purchase event exists, because no purchase exists |

**The single most valuable missing instrument** is the Capacity reason code
distribution. TARGET.md is explicit about why: every reason code is a specific,
fixable cause of the headline number being hedged. If `item_missing_duration`
dominates, that is a UX fix with a known payoff — and right now the differentiator
is the one part of the product that reports nothing about itself.

**The pricing tripwire, from TARGET.md:** watch `credits_exhausted` followed by
whether `item_created { source: 'manual' }` keeps happening for that person. If it
stops, free is a demo rather than a product, and the answer is a small recurring
free allowance. Keep it measurable — it is the trigger for a pricing change.

**Correction to TARGET.md:** its Input section says *"`ai_parse_requested` fires.
Nothing records whether it succeeded."* That is stale — `succeeded` and
`item_count` are captured at all four call sites
(`src/hooks/useParsedItems.ts:27,33`, `src/components/MealAnalyzer/index.tsx:77,83`).
The Capacity gap in the same section is still entirely real.

---

## 7. The next 30 days

| Week | Ship | Say |
|---|---|---|
| **1** | App Store submission prepared and sent. Decide #201 on paper. Fix the iOS credits dead end. | Nothing publicly. Write the three-beat demo script. |
| **2** | Landing page: remove invite-only, lead with the install path, add the honest-clock section, fix the false pricing copy. | First 10 warm DMs. Start posting while you build. |
| **3** | Web guest parity (or the interim CTA if the listing slipped). Place the $1 grant. | Second 10 DMs. First community journey post. |
| **4** | Capacity telemetry — render, status, reason codes. | Talk to every single person who started. White-glove is a feature at this size. |

Then review: which pitch got replies, which module people actually opened, and
what the reason codes say. TARGET.md's pivot trigger stands — if after ~30 real
conversations the day-story does not land but one module does, follow the money
and re-package around that module.

---

## 8. Documents and state that are now false

Worth an hour, because each one misleads the next person or agent who reads it:

- **`public/landing.html`** — sells an invite-only beta, credit-based founding
  tier, and a product with no iPhone app. Three product decisions out of date.
- **`TARGET.md`, Input section** — the parse-telemetry claim, per §6 above.
- **ADR-0012's consequences are half-applied** — the cold-signup path still calls
  `Waitlist.authorizeSignup`, and the login screen still renders "N spots left,"
  which the ADR says must move to wherever Cloud is sold.
- **The project board** — no issue updated since 2026-07-30, while the ledger
  records heavy work through 2026-08-25 (guest mode, Claim, Local day, Cloud delta
  sync). `CLAUDE.md` tells every agent to check the board before acting; it
  currently gives a false picture of what is in flight.
