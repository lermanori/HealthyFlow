# Launch prep: funnel, gated access, and repositioned landing page

**Date:** 2026-07-26
**Status:** Approved design, not yet implemented
**Supersedes for launch:** the `$1/mo promo → $2/mo regular` price in `MARKETING.md` and `docs/superpowers/specs/2026-07-05-product-packaging-design.md`

## Problem

HealthyFlow is about to receive paid ad traffic. Three things make that traffic worthless today:

1. **The marketing page is unreachable.** `netlify.toml` rewrites `/*` to the React app, so `healthyflow.app` serves a **login form**. `public/landing.html` exists only at `/landing.html`, and the sole link to it is a footer link on the login page (`src/pages/LoginPage.tsx:290`). Every landing CTA points back at `/`, i.e. back at the login form.
2. **There is no access control.** `POST /auth/signup` (`backend/src/routes/auth.ts:37`) is public and rate-limited only. There is no way to onboard a controlled first cohort, and no way to capture demand from people who can't get in yet.
3. **The page sells the wrong thing.** The hero reads *"Your life, organized by AI"* — generic, and it leads with AI, which the committed product thesis (2026-07-05) explicitly calls the opening move rather than the identity. Pricing still advertises a `$1/month` Launch Plan.

## Goals

- Ad traffic lands on the marketing page, not a login form.
- Demand is captured (waitlist) rather than lost.
- The owner controls exactly who gets in, one person at a time, plus a capped public opening.
- The page tells the committed story and shows the launch price.

## Non-goals

- **The ad on the landing page.** The ad drives traffic *to* the page; it does not live on it.
- Stripe or any automated billing. Fulfilment stays manual.
- Reworking the credit sell-rate vs cost-rate math.
- Visual redesign. The problem is the words and the funnel, not the pixels.

---

## A. Funnel routing — landing at `/`, app at `/app`

`netlify.toml` rewrites:

- `/` → `/landing.html`
- `/app/*` → `/index.html` (status 200)
- `/demo`, `/privacy`, `/terms` continue to resolve to the SPA

`src/main.tsx:26` sets `<BrowserRouter basename="/app">` so every in-app link keeps working unchanged.

**PWA breakage to handle.** `public/manifest.json` declares `start_url: "/"` and `scope: "/"`. Left alone, an installed PWA opens the marketing page instead of the app. Both move to `/app`. The service worker registers at `/sw.js` with root scope, which stays correct.

The landing nav gains a **Log in** link to `/app` so the owner and existing users are not stranded on a marketing page.

`/demo` stays public. `POST /auth/demo-session` (`backend/src/routes/auth.ts:65`) issues tokens for *pre-existing* persona users and creates nothing, so it is safe to leave open while registration is gated. It is the "try it right now" path for ad traffic that can't sign up.

**Verification:** `/` serves the landing page; `/app` loads the app; a deep link such as `/app/week` resolves; an installed PWA opens the app, not the landing page.

---

## B. Waitlist-centred access control

Registration is **closed by default**. Every visitor lands on the waitlist form. Two doors open it.

### Door 1 — individual invite

The owner opens the waitlist admin, picks a person, and clicks *Invite*. This generates a single-use link bound to that waitlist row and sets the row's status to `invited`. The holder can register regardless of whether public slots are open.

### Door 2 — open N public slots

The owner sets a slot count (**starts at 10**). While slots remain, new visitors see a real signup form instead of the waitlist form — they **skip the waitlist entirely**. Each public registration drains one slot. At zero, the form reverts to the waitlist.

The two counters are independent: an invited person never consumes a public slot.

### Data

`waitlist`
| column | notes |
| --- | --- |
| `id` | pk |
| `email` | unique |
| `name` | nullable |
| `status` | `pending` \| `invited` \| `registered` |
| `source`, `utm_source`, `utm_medium`, `utm_campaign` | attribution for ad spend |
| `created_at`, `invited_at` | |

`invites`
| column | notes |
| --- | --- |
| `token` | unique, unguessable |
| `waitlist_id` | FK → `waitlist.id` |
| `created_at`, `redeemed_at` | |
| `redeemed_by_user_id` | FK → users |

Public slot count lives in a settings row following the existing `billing_settings` pattern (`backend/src/credits.ts:345`), reusing the mechanism already in place rather than inventing a second one.

**People the owner knows who aren't on the waitlist** are handled by an *add email* button in the admin panel that inserts a waitlist row directly, which is then invited through the normal path. One mechanism, two cases.

### Endpoints

- `POST /api/waitlist` — public, Zod-validated, rate-limited like signup. **A duplicate email returns 200, not 409** — an "already on the list" error leaks membership and reads badly to a genuine returning visitor.
- `GET /auth/signup-status` — public, returns `{ mode: 'open' | 'waitlist', remaining }`. Never exposes invite tokens or waitlist contents.
- `POST /auth/signup` — accepts three cases:
  1. Valid unredeemed invite token → allow; mark token redeemed; set the waitlist row to `registered`.
  2. No token, slots remaining → allow; **atomically** decrement the slot counter.
  3. Otherwise → `403` with a payload directing the caller to the waitlist.
- Admin endpoints (JWT + `requireAdminRole`): list/search waitlist, add email, create invite, remove row, read/update slot count.

**Concurrency.** Case 2 must be an atomic check-and-decrement (unique constraint or transactional update), not read-then-write. Two people submitting against the last slot must not both succeed. This is the failure that only appears under real launch traffic.

**Counter correctness.** The slot counter must count public signups only. The owner's account and the demo persona users already exist and must never consume slots. `FREE_SIGNUP_CREDITS` is already `0`, so no credit grant needs unwinding.

### Admin panel

Lives in the in-app **Token Manager** (`src/pages/TokenManagerPage.tsx`), *not* the legacy `admin.html`. Token Manager already authenticates with JWT + `requireAdminRole`; `admin.html` passes `adminToken` as a **query parameter**, which puts an admin credential into server logs and browser history.

The panel provides: a waitlist table with status filter and search, per-row *Invite* and *Remove*, an *add email manually* button, and a slots control displaying `open / claimed / remaining`.

### Frontend

`src/pages/LoginPage.tsx` reads `?invite=` from the URL and renders one of three states, driven by `GET /auth/signup-status`:

- **invited** — signup form with a "You've been invited" note
- **open** — signup form with "3 of 10 spots left"
- **full** — waitlist form only

Login itself stays fully open throughout.

`backend/tests/auth/signup.test.ts` is extended to cover all three signup cases plus the concurrent-last-slot race.

---

## D. Landing rewrite around the day thesis

Per the committed thesis (2026-07-05): the unit is **the day**, and the founder's validated daily loop is timeline + rollover and calories + weight — not the AI dump.

- **Hero** → the committed one-liner: *"Your whole day in one place. Tasks, food, training, weight — one timeline that rolls itself forward."*
- **Section order** leads with timeline + rollover; AI is demoted to the capture step rather than the identity.
- **Pricing** (`public/landing.html:846`): keep the **Free** tier; replace the `$1/month` Launch Plan card with **$9/mo — first 100 members, locked in**. Delete the "access is enabled manually for early adopters" note; the CTA is the waitlist or signup depending on `signup-status`.
- **Feature grid** ("Everything in one place") is filtered through the day-razor — anything that doesn't live on the day comes out of the story.
- `<title>`, `og:title`, and `og:description` (`public/landing.html:6-10`) all still carry the old line and must be rewritten with it.
- Landing CTAs swap between "Start Free" and "Join the waitlist" based on `GET /auth/signup-status`, putting real scarcity in front of ad traffic.

---

## E. Ad-traffic readiness

- **`og:image` is a relative path** (`public/landing.html:10`). Most scrapers reject relative OG images, so every share of the ad link renders without a preview image. Must become an absolute URL.
- **Landing images total ~1.9 MB of JPEG**, predominantly desktop screenshots, on a page whose ad traffic will be mostly mobile. Convert to WebP and add `srcset` with the mobile shot.
- PostHog already captures UTM on the landing pageview (`public/landing.html:600-622`). Add a `waitlist_submitted` event and persist the UTM fields onto the waitlist row so ad creative can be attributed to actual conversions.

---

## F. Housekeeping

`MARKETING.md` gets a note that the `$1/$2` model is superseded by `$9/mo` for launch. No code change — fulfilment is manual, so $9 is a promise honoured by hand.

---

## Sequencing

1. **A** (routing) — unblocks everything; nothing else matters until traffic reaches the page.
2. **B** (waitlist + gate) — blocks the landing CTAs, so it comes before D.
3. **D** and **E** — parallel and independent of each other.
4. **F** — one line, any time.

## Risks

| Risk | Mitigation |
| --- | --- |
| Installed PWAs open the landing page after the `/app` move | `manifest.json` `start_url`/`scope` change; landing nav has a Log in link |
| Concurrent signups oversubscribe the last public slot | Atomic decrement, covered by a test |
| Static landing page can't reach the API | CORS origin entry for the landing origin — easy to miss, breaks the waitlist form silently |
| Demo persona users or the owner's account consume public slots | Counter increments only on public signup, never on invite redemption or persona sessions |
| Ad links share without a preview image | Absolute `og:image` URL |
