# App Review reply: business model (Guideline 2.1(b)), draft

Prepared 2026-09-28 and updated 2026-10-17 under #313 (parent #238) for the founder to review.
**Nothing here has been sent to Apple or entered in App Store Connect.** It
answers the business-model questions in Apple's 2026-09-22 review of HealthyFlow
1.0.1 (6). #314 folds it into the full response to all five rejection items,
and the founder sends that response under #238.

The reply below has been checked against Apple's five numbered business-model
questions in the 2026-09-22 review message.

## Reply

Bracketed text is conditional. Keep it only if its condition, listed under
[Before sending](#before-sending), is true at resubmission. Otherwise delete it.

> Thank you for reviewing HealthyFlow. HealthyFlow is free. It has no
> subscriptions, In-App Purchases, paid content or paid features, and nothing
> related to HealthyFlow is sold anywhere else.
>
> **1. Who are the users that will use the paid subscriptions in the app?**
> No one, because HealthyFlow has no paid subscriptions. Anyone can use it free
> of charge, with or without an account.
>
> **2. Where can users purchase the subscriptions that can be accessed in the app?**
> Nowhere. Nothing can be purchased in the app, on our website
> (healthyflow.app), or anywhere else. The app has no In-App Purchase products,
> prices, purchase buttons, or links to outside purchases.
>
> **3. What specific types of previously purchased subscriptions can a user access in the app?**
> None. We have never sold a subscription or any other paid access to
> HealthyFlow, so no user holds a previously purchased subscription.
> [An earlier version of our App Store description said Cloud backup was "not
> available to new users". "Cloud" is an internal sync setting that is enabled
> only on the developer's own account. It has never been sold and is not offered
> to users. Cloud backup and sync are not available to users in this version,
> and the description now says so without implying that existing users have
> it.]
>
> **4. What paid content, subscriptions, or features are unlocked within your app that do not use in-app purchase?**
> None. Nothing in the app is unlocked by payment. AI features draw on a free
> allowance of "AI actions". Someone who starts without an account receives 10
> once, and to prevent abuse this free Guest allowance is given once per network
> per day. A free account with a verified email address receives 15 each
> calendar month. Actions are a usage limit and cannot be bought. When they run
> out, planning and tracking keep working without AI. "Founders Club" in Settings
> is a free feedback form, not a membership. Anyone can use it to send feedback
> or to ask the developer for extra AI actions, which the developer may grant
> free of charge. We do not ask for or accept payments, donations or tips.
> [The Settings section formerly titled "Account & Billing" never contained
> billing and is now titled "Account & AI actions".]
>
> **5. Are the enterprise services in your app sold to single users, consumers, or for family use?**
> HealthyFlow has no enterprise services. It is a free app for individual
> consumers, and nothing is sold to individuals, families or organizations.
>
> [If we add paid features in a future version, they will use In-App Purchase
> and be submitted for review.]

## Before sending

Each item below is a statement in the reply that this session could not verify
alone.

- [ ] **Nothing was ever sold.** The July 2026 model planned manual
  fulfilment: users contacted the founder and were granted a plan. Confirm that
  no one ever paid for a plan, Cloud, actions or anything else, through any
  channel. If anyone did, questions 3 and 4 must change before sending.
- [ ] **Only the founder's account holds Cloud.** The production read that would
  confirm this was blocked in this session. Confirm it in Admin (People, Cloud
  column) or allow the read-only check. Also confirm that no production ledger
  grant from Founders Club or Admin is recorded as a sale (see audit item 10).
- [ ] **Founders Club never takes payment.** Confirm that no reply to a Founders
  Club request has asked for, or accepted, money, and that none will.
- [ ] **Reviewer identity.** The review notes entered on 2026-09-18 say sign-in
  is not required and send Apple to Guest mode. Confirm that the build-6
  submission offered no demo account, and in particular not the founder's
  account. That account has the admin role and the legacy Cloud state, so the
  reviewer would have seen Admin, Spend, the Ledger and Cloud replication.
- [ ] **App Store Connect still has no IAP or subscription products**, and the
  Paid Apps Agreement is still unsigned. Both were last checked on 2026-09-18.
- [ ] **Bracket in question 3.** Keep it only if the description is changed
  before resubmission (audit item 3) and Cloud is confirmed to be founder-only.
  If the description is not changed, fix the description instead of explaining
  it.
- [ ] **Bracket in question 4.** Keep it only if the resubmitted build ships the
  Settings rename (audit item 1).
- [ ] **Closing bracket.** Keep it only if the founder wants to state the future
  intent. It matches ADR-0015 and ADR-0019.

## What each statement rests on

| Statement | Evidence | Status |
|---|---|---|
| Free, with no IAP or subscription products | `docs/runbooks/app-store-v1.md`, App Store Connect declarations table: no in-app purchases or subscription groups, zero price in all 175 storefronts, Paid Apps Agreement `New` and unsigned | Checked in the portal on 2026-09-18. Recheck before sending |
| No purchase code in the app | No StoreKit, RevenueCat or payment package in `package.json` or the Xcode project. `src/utils/iosRelease.test.ts` guards against payment SDKs. No Stripe, Lemon Squeezy, Paddle, RevenueCat or StoreKit anywhere in `backend/src` | Verified in source on 2026-09-28 |
| Nothing sold on the website | Live `https://healthyflow.app` fetched on 2026-09-28 is identical to `public/landing.html`. It shows no prices and says "There is no purchase path in v1" | Verified live on 2026-09-28 |
| Terms say v1 is free | `src/pages/TermsOfServicePage.tsx:42`: "no purchases, paid subscriptions, or paid AI-action packs". Published 2026-09-16 according to the runbook | Verified in source |
| Guest receives 10 once, one grant per network per day | `GUEST_INITIAL_CREDITS = 10`, granted lazily on the first AI action (`backend/src/credits.ts:72`, ADR-0018). The grant is reserved per network for 24 hours (ADR-0023); the migration and secret were applied on 2026-09-10 according to the runbook | Verified in source. Production not re-read this session |
| Verified account receives 15 per calendar month | `MONTHLY_FREE_CREDITS = 15` (`credits.ts:59`, ADR-0017). Accounts created from 2026-09-15 need a proven address (`VERIFICATION_REQUIRED_FROM`, ADR-0026) | Verified in source. Verified on device on 2026-09-15 (#238 comment) |
| Founders Club grants are free | Settings, Founders Club: *Send feedback* and *Request more actions* post a contact message. Extra actions are set through the admin-only balance control, which records the actor and a note (`backend/src/routes/admin.ts:120`) | Verified in source. The absence of any payment request needs founder confirmation |
| Manual use continues after exhaustion | `src/utils/actionExhaustion.ts`, the exhaustion card in Settings, the Talk refusal copy, and TARGET.md (Money). Guest mode and the Local day never end | Verified in source |
| Cloud is an operator setting, not an offer | `PATCH /admin/users/:userId/cloud` is admin-only. Its comment says v1 sells no Cloud and the route exists for the legacy founder exception (`routes/admin.ts:147`). `CloudAccess.require` gates every `POST /sync`. The runbook says the founder is the only holder | Verified in source. The production holder check is pending |
| No enterprise offering | No organisation, team, seat or licensing concept in the product. The only roles are `user` and `admin` | Verified in source |

## Language that can read as paid

This audit identified user-facing language that could suggest payment. Items
1–7 have now been corrected in the release source and listing draft. The live
App Store description still needs to be updated before resubmission.

| # | Where, and who sees it | Text | Why it reads as paid | Suggested correction | When |
|---|---|---|---|---|---|
| 1 | Settings category list, seen by everyone including Guests. It is in the bundled iOS assets | Formerly "Account & Billing" / "Profile, AI credits, and subscription status." | "Billing" and "subscription status" in a free app were the clearest paid signals in the build | Now "Account & AI actions" / "Profile, free AI actions, and Founders Club." The internal route id remains stable | Fixed in release source 2026-10-17 |
| 2 | Global Cloud banner | It formerly appeared before an active entitlement was known | It told people who cannot hold Cloud about a Cloud service | Cloud failures now surface only after the current session has confirmed the legacy entitlement | Fixed in release source 2026-10-17 |
| 3 | App Store description (`listing-draft.md`) | Formerly "Cloud backup and transfer are not available to new users in this release." | "New users" implied that existing users have it, which is exactly Apple's question 3 | Draft now says "Cloud backup, sync, and device transfer are not available in this version." | Source fixed; live App Store metadata still pending |
| 4 | App Store description and `public/landing.html` | Formerly "premium models 10" / "premium models use ten" | "Premium" usually names a paid tier | Both drafts now say "advanced models" | Source fixed; live App Store metadata and website deployment still pending |
| 5 | Privacy policy, on the web and in the app | Formerly described an "existing legacy Cloud entitlement" unavailable to new users | Same implication as item 3 | Now identifies one developer-operated legacy account and says Cloud is not offered to users | Fixed in release source 2026-10-17 |
| 6 | Talk and Settings exhaustion | Formerly "Confirm your email to unlock your 15 AI actions a month." | "Unlock" is In-App Purchase vocabulary | Now "Confirm your email to receive 15 free AI actions each month." | Fixed in release source 2026-10-17 |
| 7 | Claim page and Login | Formerly promised the monthly allowance before mentioning verification | A new password account receives nothing until its email is verified (ADR-0026) | Both surfaces now say the allowance follows email verification | Fixed in release source 2026-10-17 |
| 8 | Public `GET /api/auth/signup-status` | The response includes `foundingPriceUsd` 9, `regularPriceUsd` 19, and `topUpPriceUsd` 5 for 300 credits (`routes/auth.ts:144-146`, `credits.ts:52-56`) | No screen renders these values; the Login page reads only `monthlyFreeCredits`. They are still a price list served by the product | Make the client fields optional first: `LaunchOfferSchema` requires them, so removing them from the server breaks shipped clients. Then drop them from the server | After release |
| 9 | Landing page, Terms and listing | "Free v1", "in v1", "Cloud cannot be obtained in v1" | These signal a later paid tier. They do not violate anything, and they are accurate | Optional: "in this version" | Optional |
| 10 | Internal ledger | `grantTopUp` writes the reason `topup_<phase>_<dollars>_usd` (`backend/src/credits.ts`, around line 1048). No route in `routes/admin.ts` calls it | Internal only, but any such row reads as a sale | Check production for these rows. If Founders Club grants go through the balance control (#299), consider removing `grantTopUp` | After release |

## Reviewer path: a risk worth planning for

This is an inference and has not been observed. App Review devices probably
share egress networks. Under ADR-0023, the first reviewer Guest on a network
takes the 10-action grant. A second Guest on that network within 24 hours sees
"Free Guest AI actions have already been used on this network today. Create a
free account…". A new password account then sees "Confirm your email to unlock
your 15 AI actions a month." That sequence can read as gated access, and it
would also stop a reviewer from exercising the new AI-consent flow (#311).

Recommendation for #238 and #314: supply a dedicated, verified demo account
that holds a discretionary action balance in the App Review sign-in fields, and
mention it in the notes. It must not be the founder's account.

## Matching review notes (draft)

This replaces the business-model part of the notes entered on 2026-09-18. The
AI-consent review steps belong to #311, are recorded in
`docs/runbooks/ios.md` under "App Review: AI data-sharing permission", and are
assembled by #314. Adjust the Settings label to match what ships.

```text
No sign-in is required. Tap "Start without an account" to review HealthyFlow as a Guest. [A verified demo account with AI actions is provided in the sign-in fields, in case free Guest actions were already used on your network today.]

HealthyFlow is free. It has no In-App Purchases, subscriptions, paid content, paid unlocks, prices, or external purchase links, and nothing related to it is sold anywhere else.

AI features use a free allowance of AI actions: 10 once for a Guest (one free Guest allowance per network per day), and 15 each calendar month for an account with a verified email address. Actions cannot be bought. When they run out, planning and tracking continue without AI. Settings → Account & AI actions → Founders Club is a free feedback form where users can also ask for extra free actions, granted at the developer's discretion.

Cloud backup, sync, and device transfer are not available in this version.

Account deletion is available in Settings for users who create an account. Sign in with Apple is supported.
```
