# HealthyFlow — Marketing Plan v2: First 10 Paying Customers

> **Product:** HealthyFlow — AI-assisted personal productivity & habit tracker
> **Stage:** Built. Credit constants are live in `backend/src/credits.ts` — $9 promo / $19
> regular, $5 → 250 credits, 250 signup credits for the first 100 accounts and 50 after.
> **No payment integration on any platform**: no Stripe, no StoreKit, no purchase code anywhere.
> **Distribution:** iOS app in TestFlight (not App Store listed) · web app at
> `healthyflow.app/app` · landing page at `/`
> **Goal:** 10 paying customers. Money first. Everything (audience, pricing, positioning) is pivotable — customers decide.
> **Last updated:** 2026-07-05 (supersedes the 2026-06-19 pre-launch GTM draft)

> **✅ Verified against the code — 2026-08-16.** The launch price is **$9/mo for the first 100
> members, anchored against $19**, and both figures now exist as `PROMO_PRICE_USD` and
> `REGULAR_PRICE_USD`. The `$1/mo promo → $2/mo regular` figures throughout this document are
> historical.
>
> **The margin trap is closed, but not the way §4 P0.1 proposes.** `APP_TOKENS_PER_USD = 1000`
> and `MARKUP_RATE = 0.25` still exist and still govern **cost metering only**. Purchases grant
> fixed packs instead of running through that constant: `TOP_UP_PRICE_USD = 5` grants
> `TOP_UP_CREDITS = 250`. The effective sell rate is therefore **50 credits per $1** — not the
> 500/$1 or 250/$1 written below, which never shipped. Do not implement those numbers.

> **⚠️ Superseded — pending the iOS launch decision.** This document was written for web
> checkout and web signup. Distribution is now **iOS-first through TestFlight**, where digital
> credits require StoreKit and Apple is merchant of record — which changes who owns refunds,
> tax and chargebacks, and removes the anti-steering question this plan never considered.
>
> **Do not action §4 P0.3–P0.4 or §5 until that decision is recorded** (see
> [#201](https://github.com/lermanori/HealthyFlow/issues/201)). §1–§3, §6 and §7 are unaffected;
> they are judgment and market research, not claims about this codebase.
>
> See also `docs/superpowers/specs/2026-07-26-launch-prep-design.md` and `docs/ios.md`.

---

## 1. The honest frame

10 customers × $1–2/mo is $10–20/mo. The value of the first 10 is **not revenue — it's proof**: proof that strangers will pay, proof of which pitch converts, and 10 people who will tell you exactly what to build or pivot to. Optimize for *speed of learning per paying customer*, not for the $10.

Corollary: don't spend on ads, don't build growth infrastructure, don't launch on Product Hunt yet. The first 10 come from **conversations, not funnels**.

## 2. Competitive research — what actually worked for others

### The market at a glance

| App | Price | Model | Why it wins |
|---|---|---|---|
| **Motion** | $25/mo, no free tier | AI auto-scheduling | Auto-rebuilds your day around meetings; sells "AI does the planning" |
| **Sunsama** | $20/mo ($16 annual) | Daily planning ritual | Calm guided morning ritual; pulls tasks from Asana/Gmail/Slack/etc. |
| **Akiflow** | $19/mo ($15 annual) | Command-bar + universal inbox | Keyboard-driven speed; 30+ integrations into one inbox |
| **Structured** | Freemium, cheap Pro | Mobile-first visual timeline | Most pleasant iOS experience; simplicity |
| **Habitica** | Free + $48–60/yr sub | Gamified RPG | ~$5.3M/yr; multiplayer accountability (parties, guilds, bosses) |
| **Fabulous** | Subscription | Behavioral-science coaching | $5M+ ARR; born in Duke's behavioral econ lab, "science-based rituals" story |
| **Streaks** | One-time ~$5 (+ sub since 2024) | Minimalist iOS tracker | "Takes less time to use than the habit takes to do" |
| **Shelpful** | Subscription | Chat-based ADHD accountability coach | Raised $3M (Sam Altman's fund); started as WhatsApp HabitGPT bot |

### Lessons that transfer to HealthyFlow

1. **Winners charge real money.** The AI-planner tier is $19–25/mo with almost no discounting. Nobody successful competes on being cheap. Our $1–2/mo is fine as a *founding-member promo*, but the anchor story should be "worth $15+/mo, founding members lock in early pricing" — not "the cheap one."
2. **Each winner owns ONE ritual/story.** Motion = "AI plans for you." Sunsama = "calm morning ritual." Habitica = "it's a game." Fabulous = "science." HealthyFlow's story (committed, see §3): **the day is the unit — your whole day on one timeline.** One sentence, one demo, everywhere.
3. **The ADHD/executive-function angle is validated and monetizable** — Shelpful raised $3M on chat-based accountability, Focus Bear and Lunatask market explicitly to ADHD. It's crowded at the top but word-of-mouth-driven and underserved by rigid tools. Closest fit to our natural-language + auto-rollover wedge.
4. **Nobody combines planner + habits + meals/calories + workouts + weight in one flow.** Planners don't track health; habit trackers don't plan days. The "one app for the whole day" angle is genuinely open — but only marketable once those modules feel solid.
5. **How indie apps in this space actually got their first customers** (consistent across sources): (a) DM 5–20 people you know who fit the profile *before* launching; (b) journey/learning posts in communities — never "check out my app" (gets removed as spam); (c) founders with no audience take 2–6 months, founders who post while building take ~30 days. Typical trial→paid is 5–15%.

## 3. Positioning (committed 2026-07-05 — see `docs/superpowers/specs/2026-07-05-product-packaging-design.md`)

- **Thesis:** every other app's unit is a thing (task, meal, streak); **HealthyFlow's unit is the day.** Timeline, rollover, habits, calories, weight, and AI capture are all lenses on the same day.
- **One-liner:** *"Your whole day in one place. Tasks, food, training, weight — one timeline that rolls itself forward."*
- **AI's role in the story:** the brain-dump is the *opening move* (how a day starts), not the identity. The identity is the day.
- **Beachhead:** busy people juggling work + gym + diet — the founder's own profile, reachable via warm network. The ADHD/overwhelmed angle survives as a message variant for community posts, not as the identity.
- **Founding-member offer:** ~~"$1/mo founding price (will be $10–15/mo later), 500 AI credits…"~~ — **numbers stale, do not quote.** The code says $9/mo for the first 100 (anchored against $19) and 250 signup credits, not $1 and 500. The *shape* of the offer — founding price, credits, direct line to the founder, priority on feature requests — is still the intent; the figures and the whole paid/free question are open pending the iOS launch decision. Quote nothing from this line to a real person until it is rewritten.
- **Pivot triggers:** if after ~30 real conversations the day-story doesn't convert but a single module does (e.g. calories alone) — follow the money and re-package around that module.

## 4. Fix list — what must be true before charging strangers

Ordered. P0 blocks any outreach; P1 blocks scaling past friends; P2 is polish.

### P0 — revenue correctness & the paywall path
1. ~~**Implement the sell-rate split in `backend/src/credits.ts`**~~ — **done differently, 2026-08-16.** The trap this item described was real: granting credits through `APP_TOKENS_PER_USD`, the same constant used for cost metering, would have made the price cosmetic. It was closed with **fixed packs** rather than a second rate constant. `TOP_UP_PRICE_USD = 5` grants `TOP_UP_CREDITS = 250`; `APP_TOKENS_PER_USD = 1000` and `MARKUP_RATE = 0.25` are untouched and meter cost only. **The real sell rate is 50 credits per $1.** The "500/$1 promo, 250/$1 regular" figures originally written here never shipped — do not implement them.
2. ~~**A trial taste of the AI**~~ — **shipped.** `FOUNDING_SIGNUP_CREDITS = 250`, `STANDARD_SIGNUP_CREDITS = 50`, `FOUNDING_MEMBER_LIMIT = 100` in `backend/src/credits.ts`, matching this item exactly: the first 100 accounts get 250 one-time onboarding credits, later accounts get 50.
3. **A visible "get the plan" path in-app** — **blocked on the channel decision.** As written this item assumes a web payment link (Stripe / PayPal / Bit). That is not available inside the iOS app: credits are digital content consumed in-app, so Apple requires StoreKit. Today every purchase CTA in Settings is gated behind `!isNativeApp`, which means **a TestFlight user who exhausts their credits currently has no path to more, in-app or out**. Resolve #201 before rewriting this item.
4. **Smoke-test the paid path end-to-end as a fresh user** — **blocked on item 3.** The flow to test (signup → onboarding → trial parse → run out → pay → credits granted → parse again) has no "pay" step on any platform yet. Note the iOS variant of this test runs against the StoreKit **sandbox**, where purchases are free — so it can be proven before any real money moves.

### P1 — first-session credibility (what a stranger sees in minutes 0–10)
5. **Kill visible errors on the happy path**: [#125](https://github.com/lermanori/HealthyFlow/issues/125) Google-sync "sync failed" on task items (an error toast in the first session = instant churn), [#127](https://github.com/lermanori/HealthyFlow/issues/127) calorie quantity handling.
6. **Re-verify the old QA bugs** (timeline ordering after noon, drag-and-drop persistence, habit bar visibility) — the list is from July 2025 and may be stale; confirm fixed or fix.
7. ~~**Landing page refresh**~~ — **done 2026-07-28.** Screenshots are recaptured from the real app by `scripts/capture-landing-shots.mjs`; the page now shows the Health workspace and the timeline-as-record story, drops the flagged-off Week view, and leads with the waitlist rather than a "Start Free" CTA that dead-ends while public slots are 0.
8. ~~**Custom domain**~~ ([#19](https://github.com/lermanori/HealthyFlow/issues/19)) — **done.** `healthyflow.app` is the production domain and is what `README-DEPLOYMENT.md` configures across Google OAuth origins, Supabase redirect URLs and the iOS trusted-link list. (Issue state not re-confirmed — GitHub was unreachable when this was verified.)
9. ~~**Privacy policy + ToS pages**~~ — **done.** `src/pages/PrivacyPolicyPage.tsx` and `src/pages/TermsOfServicePage.tsx`, routed at `/privacy` and `/terms` for signed-out and signed-in users alike, and linked from the navigation drawer. Note App Store review will require the privacy policy URL and App Privacy disclosures regardless.

### P2 — measurement & polish
10. **Instrument the funnel in PostHog** (AnalyticsService already exists): signup → first parse success → D1 return → paywall hit → paid. You need to see where the 10 candidates fall out.
11. **Mobile pass on the golden path** — the ADHD/habit audience lives on phones; Structured wins on mobile feel alone. Now largely a **native iOS** concern rather than a PWA one: the Capacitor shell already owns safe areas, haptics, native navigation and a Today widget, and the mobile dock is deliberately just Today and Talk. The open question is the golden path *inside* that shell, not whether the PWA feels native.
12. **Product-shape items from the packaging design** (spec: `docs/superpowers/specs/2026-07-05-product-packaging-design.md`):
    - Feature-flag off the unwired **grocery and meal** surfaces — sell the unified model only when it's real. (Workout is no longer in this list: Workout sessions, Workout plans and exercise history all ship. Grocery and meal remain accepted by `ItemTypeSchema` and the daily-plan reference kinds with no UI behind either.)
    - ~~Make calories/weight **on by default**~~ — **done.** `calorieIntake`, `workoutTracker` and `achievementTracker` all default to `true` in `backend/src/settings-schema.ts`, and the three sections now sit under one Health workspace.
    - ~~Consolidate Ask + Assistant into one AI surface~~ ([#124](https://github.com/lermanori/HealthyFlow/issues/124)) — **done.** One surface, **Talk**, at `/talk`; `/assistant` redirects to it.
    - Onboarding first screen = one brain-dump question ("Tell me about your day tomorrow") → populated timeline. This moment is also the demo GIF and the landing hero.
    - Expenses (#97) and ideas dump (#96) are out of the product story — not day-shaped.

## 5. The 10-customer plan (channel by channel)

> **⚠️ Assumes web signup. Superseded pending the iOS launch decision.** Every motion below
> ends at a web landing page and a signup form. The install path is now a TestFlight link —
> which adds a step (install TestFlight, then the app), caps at 10,000 testers, requires Beta
> App Review for the first external build, and expires builds after 90 days. Public slots and
> the waitlist gate still sit in front of account creation regardless of how someone arrives.
> Rewrite this section once the channel is decided; the channel *mix* reasoning still holds.

| # | Channel | Motion |
|---|---|---|
| 1–4 | **Warm outreach** | DM ~20 people you know who fit (friends who juggle gym+work+life, anyone who's said "I can't stick to an app"). Offer: founding plan + 15-min walkthrough. Personal, not broadcast. |
| 4–7 | **Communities (Reddit et al.)** | r/ADHD, r/productivity, r/getdisciplined, r/indiehackers. Journey posts only: "I built a planner where you just type your day in plain words — here's what I learned about rollover/ADHD planning." Demo GIF of the brain-dump→plan moment. Never a sales pitch. |
| 7–9 | **Build-in-public (X/LinkedIn/Instagram)** | 2–3 posts/week while doing the fix list. The AI-harness architecture story doubles as content. Instagram matters since manual fulfillment already routes there. |
| 9–10 | **Directories & niche newsletters** | ADHD-tools lists, AlternativeTo, toolfinder.co etc. Low effort, slow drip. Product Hunt stays gated until the fix list is done and there's a repeatable pitch. |

**Weekly cadence (fits a solo founder, ~5–8 h/wk):** Mon — ship one fix-list item; Tue/Thu — one community or build-in-public post; Wed — 5 warm DMs; Fri — talk to every trial user personally (you'll have few enough that white-glove is a feature); track the funnel numbers.

**Sequencing:** Week 1–2 = P0 fixes + start warm DMs (they convert without polish). Week 3–4 = P1 fixes + first community posts. Week 5+ = iterate on whichever pitch got replies.

## 6. Metrics (only four numbers matter now)

| Metric | Target | Why |
|---|---|---|
| Real conversations with target users | 30+ | Learning engine; pivot fuel |
| Signup → first successful AI parse | >40% | The aha is the product |
| Trial → paid | 5–15% (category norm) | Below 5% = pitch or price is wrong → pivot |
| Paying customers | **10** | The goal |

Expectation-setting from the research: solo founders with no prior audience typically need 2–6 months for the first 10; warm-network-first founders often do it in ~30 days. Warm outreach is therefore step one, not a fallback.

## 7. After 10 — the money question

At 10 paying customers, run the pricing pivot review: interview all 10 on willingness to pay, then move regular pricing toward the category floor (~$5–10/mo, still half of Structured/Habitica territory) with founding members grandfathered. Automate billing only then (min top-up ~$5 to survive card fees). If the interviews say the value is in a different module (calories? the assistant?) — that's the pivot signal, and this doc gets rewritten again.
