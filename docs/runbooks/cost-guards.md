# Cost guards — how a bug cannot become a bill

Every service HealthyFlow pays for, what bounds it, and what to set by hand in each
vendor console. The code-side guards below are real and tested; **the vendor-side
limits are not set by this repository and must be set by a person.** An unset
vendor limit is the only one of these that can produce an unbounded bill.

Money model and prices: [ADR-0013](../adr/0013-a-credit-is-an-action.md) and
`TARGET.md` (Money).

---

## The one service billed by usage

OpenAI is the only cost that grows with what users do. Everything else is a flat
subscription with a known ceiling, which is why this document is mostly about one
API key.

**What an action costs us** (measured, `backend/src/credits.ts` model pricing):

| Action | Serving cost | Charged |
|---|---|---|
| Text — parse, Talk turn, question | $0.00031 | 1 credit |
| Photo — meal, list, label | $0.0039 | 5 credits |
| Premium model — gpt-5.4 / 5.5 | $0.0195 | 10 credits |

### Guards in code

Each is enforced in `Credits.authorizeAction` **before any tokens are spent**, and
each returns its own refusal code so the app can say what actually happened.

| Guard | Constant | Value | Stops |
|---|---|---|---|
| Global daily ceiling | `GLOBAL_DAILY_COST_CEILING_USD` | **$25**/day, all users | The disaster case: a loop, a leaked token, a bug in a retry. Sums `ai_usage_log.cost_usd` for the UTC day and refuses everything past it. |
| Per-account daily cap | `FREE_DAILY_ACTION_CAP` | **200** actions/day | One account draining itself or the ceiling. ~60× a heavy day. |
| Prompt size | `MAX_PROMPT_CHARS` | **24,000** chars | One paste buying an unbounded call. Counts the system prompt too. |
| Images per request | `MAX_IMAGES_PER_REQUEST` | **4** | A batch upload multiplying the most expensive call class. |
| Model allowlist | `loadModelPricing` | — | A model we cannot cost is a model we refuse to call. `UnpricedModelError` fires before the request. |
| Cloud fair use | `SUB_TEXT_DAILY_CAP` | **100** text/day | Unmetered text staying affordable. Past it, a subscriber falls through to their balance rather than being refused. |
| Cloud photo cap | `SUB_PHOTO_MONTHLY_CAP` | **100**/month | The expensive class, on the tier that does not meter. |
| Cloud premium cap | `SUB_PREMIUM_MONTHLY_CAP` | **50**/month | Same, for the 63×-cost model tier. |

**The arithmetic these are chosen against:**

- One account at its daily cap, all premium: 200 × $0.0195 = **$3.90** — well under
  the global ceiling, so no single account can spend the day's budget.
- A thousand subscribers on a typical day: 1,000 × $0.20/30 ≈ **$6.70** — comfortably
  under the ceiling, so honest use never trips it.
- Raise `GLOBAL_DAILY_COST_CEILING_USD` (env var) before a launch push, not after
  the refusals start.

`backend/tests/credits/action-pricing.test.ts` pins all of this. If those tests
fail, a price or a guard moved — decide whether you meant it before updating them.

### What to set in the OpenAI console — by hand, today

The code ceiling protects against our own bugs. **It does not protect against a
leaked API key**, because a stolen key is used outside our code. Only the vendor
limit does that.

1. **Billing → Limits → Hard limit.** Set a monthly hard cap. Suggested: **$50**
   while pre-revenue. A hard limit stops the account; a soft limit only emails.
2. **Billing → Limits → Soft limit.** Set to about half the hard limit so warning
   emails arrive with room to react.
3. **Usage alerts** to the founder's email.
4. **Project-scoped API key**, not an organisation key, so the blast radius of a
   leak is one project.
5. **Rotate the key** if it has ever been in a `.env` that reached a shared machine.

---

## Flat services — known ceilings

Prices are vendor list prices checked 2026-08-26. Verify against actual invoices.

| Service | Plan | Cost | The thing that can surprise you |
|---|---|---|---|
| **Railway** — API | Hobby | $5/mo, includes $5 usage | Usage above the included credit bills per second for RAM, vCPU and egress. Set a **usage alert**; consider a spend limit if the plan offers one. |
| **Supabase** — Postgres | Free → Pro | $0 → $25/mo | Free projects **pause after a week of inactivity** and have no daily backups. Move to Pro before the first paying subscriber, not after. |
| **Netlify** — web | Free → Pro | $0 → $20/mo | Credit-based usage. Build minutes and bandwidth are the overage risk; a runaway redeploy loop is the failure mode. |
| **Apple Developer** | — | $99/yr | Renews annually. An expired membership pulls the app from sale. |

**Why Supabase can wait:** a day lives on the device and the server is a replica,
not the source (ADR-0011, ADR-0012). A paused free project degrades Cloud sync; it
does not take anyone's day away. That is an architectural property worth keeping —
it is what makes the cheap tier survivable.

### Total fixed cost

| Stage | Monthly | Subscribers to break even at $9 |
|---|---|---|
| Pre-revenue | **$13.25** | 2 |
| Paying users, production posture | **$38.25** | 6 |
| ~1,000 subscribers | **$128.25** | 18 |

---

## What is deliberately not guarded

Naming these is the point — an unlisted gap is the one that surprises you.

- **A leaked OpenAI key.** Code guards cannot see traffic that does not pass through
  our server. The vendor hard limit is the only guard; set it.
- **Egress on Railway and Supabase.** Bounded by plan alerts, not by our code. A
  runaway client polling loop would show up here first.
- **Payment fraud and chargebacks.** No payment rail exists yet (issue #201). When
  one lands, this section needs a row — a merchant of record absorbs chargebacks,
  direct Stripe does not.
- **The monthly free refill at scale.** 10,000 free accounts cost about $46/month in
  refills. Fine now, worth a look if free signups ever outrun paid ones by 100:1.

## When a guard fires

| Code | HTTP | What it means | What to do |
|---|---|---|---|
| `insufficient_credits` | 402 | This account is out | Nothing — working as intended |
| `account_daily_cap` | 429 | One account hit 200 actions today | Check `ai_usage_log` for that user. A human does not do this by hand. |
| `global_ceiling` | 503 | **All AI is off for the day** | Investigate immediately: `SELECT user_id, count(*), sum(cost_usd) FROM ai_usage_log WHERE created_at > current_date GROUP BY 1 ORDER BY 3 DESC`. Raise the env var only once you know why. |
| `prompt_too_large` | 413 | A paste over 24k chars | Nothing, unless legitimate use hits it often |
| `too_many_images` | 413 | More than 4 images | As above |
| `unpriced_model` | 500 | A model with no cost entry was requested | A deploy configured a model we cannot bill. Add it to the pricing table or revert. |

A tripped `global_ceiling` is a real incident: it means either an attack, a loop, or
that the product grew faster than the ceiling. All three want a human.
