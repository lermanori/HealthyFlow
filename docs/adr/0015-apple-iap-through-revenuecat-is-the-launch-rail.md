# ADR 0015 — Apple IAP through RevenueCat is the launch rail

**Status**: Accepted
**Date**: 2026-09-02
**Decision**: Approved by the founder on GitHub issue #201

## Context

HealthyFlow launches on iPhone before the web reaches Guest parity. It sells two
digital products: a Cloud subscription and consumable AI credits. The backend
already owns subscription state, separate monthly and top-up balances, usage
charging, and the rule that a failed billing read is never an empty balance.

The launch decision compared Apple In-App Purchase, Lemon Squeezy web checkout,
and a staged combination. RevenueCat was also considered because the Capacitor
application would otherwise need to implement and continuously maintain StoreKit
purchase validation, subscription lifecycle handling, and server notifications
directly.

The provider question is two questions, not one:

- the **payment rail** takes the customer's money and defines the store rules;
- the **purchase-state broker** validates and normalises store events for the
  application.

RevenueCat is the second. It does not replace Apple as the iPhone payment rail,
merchant-facing counterparty, refund channel, or payout source.

## Confirmed facts on 2026-09-02

- Apple App Review Guideline 3.1.1 requires In-App Purchase when an App Store app
  unlocks subscriptions, digital functionality, or credits. Purchased credits
  may not expire.
- Guideline 3.1.3(b) lets a multiplatform app honour products bought on the web
  when those products are also available as In-App Purchases in the app.
- The United States storefront currently permits external-purchase calls to
  action without an entitlement. Other storefronts prohibit them unless a
  regional programme applies.
- Apple's unified EU terms take effect on 2026-10-01. Alternative payment and
  out-of-app offers carry entitlement, disclosure, reporting, support, tax, and
  commission duties in addition to the external processor's fees.
- An individual Apple developer may sign the Paid Apps agreement, provide a
  W-8BEN and individual bank details, and complete identity review without first
  forming a company.
- Apple pays no later than 45 days after the end of the fiscal month, subject to
  active agreements, completed bank and tax information, and thresholds.
- Lemon Squeezy supports bank payouts to Israel and has natural-person identity
  and non-US tax-form paths. Store approval is still discretionary.
- Lemon Squeezy acts as merchant of record for its customer transactions and
  handles checkout tax collection/remittance, PCI, refunds, and chargebacks. The
  founder remains responsible for tax on the payout and local registration.
- RevenueCat has a supported Capacitor SDK, signed at-least-once webhooks, and a
  documented path where an existing application backend remains the balance
  source of truth.
- RevenueCat is free through USD 2,500 in monthly tracked revenue and then
  charges 1% of tracked revenue under its published Pro pricing.
- RevenueCat Web does not list Lemon Squeezy as a billing engine. Its documented
  engines are RevenueCat Billing/Stripe, Stripe Billing, and Paddle Billing.
- Israeli Tax Authority guidance says the tax assessor must be notified no later
  than the day income-producing business activity begins. An individual may use
  the exempt-dealer registration path only if the occupation and turnover rules
  apply; the published 2026 ceiling is NIS 122,833.

## Surface comparison on 2026-09-02

| Surface | Permitted/default rail | Fees and cash timing | Responsibility | Implementation, review and migration risk |
|---|---|---|---|---|
| iOS App Store | Apple IAP is required for HealthyFlow's digital Cloud access and AI credits. RevenueCat may broker StoreKit state but does not change the rule. | Apple is normally 30%; 15% after Small Business Program approval. Apple pays no later than 45 days after fiscal-month close, subject to complete paperwork and thresholds. RevenueCat adds 1% after its published USD 2,500 monthly tracked-revenue threshold. No fixed routine reserve is published; Apple can hold or offset proceeds for tax, debt or compliance failures. | Apple collects the customer payment as agent or commissionaire under the territory contract and supplies the refund channel. HealthyFlow remains principal, delivers the service and supports the product. | Apple IAP through RevenueCat is medium implementation effort and the lowest review risk. Removing RevenueCat later is an engineering migration; the Apple subscription remains with Apple if store transaction identifiers and the application ledger are retained. |
| Web/PWA | A standalone web checkout may use Lemon Squeezy. It must not be promoted from non-eligible iOS storefronts. | Lemon publishes 5% + USD 0.50, plus 0.5% for subscriptions and 1.5% for international or PayPal transactions where applicable. Non-US bank payout adds 1%. Sales are held 13 days, payouts are created twice monthly, and the threshold is USD 50. No fixed routine reserve is published; risk review may delay a payout. | Lemon is merchant of record for the customer transaction and handles payment processing, indirect tax collection/remittance, PCI, refunds and chargebacks. HealthyFlow still owes local income tax, registration, bookkeeping and product support. | Hosted checkout is straightforward, but a second launch rail creates subscription ownership, duplicate-purchase and support complexity. Lemon is not a documented RevenueCat Web engine. Moving active subscriptions away may require provider assistance or customer re-checkout because an order export is not a portable payment credential. That migration statement is an inference from the documented export and migration paths. |
| Android / Google Play | If Android becomes a target, Google Play Billing is the default for the same digital products; current regional alternative-billing programmes are exceptions. RevenueCat can broker Play state. | The legacy first-USD-1-million tier is 15%; a different lower-fee model is rolling out by region through 2027. Google normally pays around the 15th of the following month. Exact launch-region fees must be re-checked. | Google owns the Play transaction path; customer-tax handling varies by territory. HealthyFlow remains responsible for the service, local income and its ledger. | No Android work belongs to this launch. Adding it later is medium effort through RevenueCat, but policy and fee assumptions dated here must not be reused without verification. |

Fee examples before consumer tax and currency effects: Apple's approved 15% is
USD 1.35 on a USD 9 subscription and USD 0.75 on a USD 5 pack. Lemon's published
US-card fees are about USD 0.995 and USD 0.75 respectively; international-card
examples are about USD 1.13 and USD 0.825 before its non-US payout fee. The fixed
USD 0.50 makes Lemon no cheaper for the small top-up.

## Decision

### 1. Apple In-App Purchase is the only launch payment rail

The iPhone app offers:

- Cloud as an Apple auto-renewable subscription; and
- AI-credit top-ups as Apple consumable In-App Purchases.

Every launch storefront uses the same Apple purchase path. The app and its App
Store metadata contain no Lemon Squeezy checkout, web-purchase steering, or
regional external-purchase link.

### 2. RevenueCat brokers Apple purchase state

The Capacitor app uses RevenueCat's Purchases SDK rather than building direct
StoreKit infrastructure. RevenueCat validates and normalises Apple purchase
state and sends signed lifecycle events to the backend.

Cloud products attach to a RevenueCat entitlement. HealthyFlow uses a stable,
opaque user-row id as the RevenueCat App User ID; it never uses an email address.
The Claim path keeps that id. The Sign in path must preserve ADR-0010's explicit
abandonment boundary rather than letting RevenueCat alias a Guest's purchases to
an unrelated existing account.

### 3. HealthyFlow remains authoritative for access and credits

The existing backend subscription and credit records remain the application's
source of truth. RevenueCat events are authenticated inputs to that ledger, not
a replacement ledger.

Webhook processing must be idempotent, retain provider transaction identifiers,
and reconcile missed or delayed events. A consumable purchase grants its credits
exactly once. Refund and revocation policy is explicit; provider failure is
unavailable, never a zero balance or inactive subscription.

RevenueCat Virtual Currency is not the launch balance source. It is early-stage,
would create a second authoritative balance, and cannot represent negative
balances. This may be reconsidered only through another architecture decision.

### 4. Lemon Squeezy and Android are deferred

Web checkout is not part of the iPhone launch. Lemon Squeezy may be added as a
web merchant of record when the web becomes a demonstrated acquisition surface.
Because it has no documented RevenueCat Web connector, Lemon events would feed
HealthyFlow's provider-neutral backend ledger directly.

Android is not a launch platform. A future Google Play release must re-check the
then-current regional billing rules and should use Google Play Billing through
RevenueCat unless a later decision replaces this one.

### 5. Individual launch is conditional on local registration

No company is required merely to activate Apple, RevenueCat, or Lemon Squeezy as
an individual. That does not authorise unregistered trading in Israel.

Before the first real sale, the founder must obtain Israeli accountant advice
and complete the applicable self-employed, VAT, income-tax, invoicing, and
National Insurance setup. App Store Connect's forms do not replace it.

## Minimal launch checkout

Delivery is tracked as three dependency-ordered slices: account and professional
readiness in [#222](https://github.com/lermanori/HealthyFlow/issues/222), the
Cloud subscription in [#223](https://github.com/lermanori/HealthyFlow/issues/223),
and consumable AI-action purchases in
[#224](https://github.com/lermanori/HealthyFlow/issues/224).

1. Complete the Apple Paid Apps agreement, individual bank and W-8BEN details,
   compliance review and DSA declaration; apply to the Small Business Program.
2. Obtain accountant confirmation and activate the required Israeli registration
   before enabling production purchases.
3. Create one Cloud subscription group/product and one consumable credit pack in
   App Store Connect, then map both products in RevenueCat.
4. Add the RevenueCat Capacitor SDK. Use the stable HealthyFlow user-row id and
   preserve the Claim versus Sign in boundary.
5. Authenticate and deduplicate RevenueCat webhooks into the existing subscription
   and credit services. Add reconciliation, restore, cancellation, expiry, refund
   and revocation coverage; never turn an unavailable provider read into zero.
6. Show the Apple purchase sheet in the iPhone app. Include no web checkout or
   external-purchase copy. Test locally, in Apple sandbox, and through App Review.

## Later scalable path

When web-originated demand is demonstrated, add Lemon Squeezy as a web-only
merchant of record and feed its signed lifecycle events into the same backend.
The provider-neutral ledger records source, product, original transaction,
renewal, refund and ownership. It prevents simultaneous Cloud subscriptions and
sends each customer to Apple or Lemon to manage the subscription they bought.

The iPhone app continues to offer the equivalent Apple products. A future
Android app uses Google Play Billing through RevenueCat. Regional iOS steering
is a separate decision and must re-check the current Apple terms immediately
before implementation.

## Why this combination

| Option | Outcome |
|---|---|
| Direct StoreKit | Rejected for launch. It avoids RevenueCat's later 1% fee but makes a solo team own more validation, lifecycle, notification, and cross-platform infrastructure. |
| Apple IAP through RevenueCat | Chosen. It is the universal App Store-compliant path, has the lowest review risk, fits Capacitor, and preserves Apple as the underlying subscription owner. |
| Lemon Squeezy from day one | Rejected. The web is not the launch surface, Lemon cannot replace IAP globally inside iOS, and a second rail creates duplicate-subscription and support risk before demand exists. |
| Regional iOS external links | Rejected for launch. The rules and EU terms are changing, the implementation must be storefront-aware, and Apple fees/reporting can remain in addition to processor fees. |

At the current small product prices, Apple's 15% Small Business commission is
also competitive with Lemon Squeezy's fixed USD 0.50 plus percentage and payout
fees. The economic case does not justify a second launch rail.

## Consequences

- Apply to the App Store Small Business Program before paid release. Until
  approval, forecasts must tolerate Apple's standard commission.
- RevenueCat adds a vendor dependency and a 1% fee after its current USD 2,500
  monthly tracked-revenue threshold. It does not affect Apple payout timing.
- Removing RevenueCat later is an engineering migration, while the underlying
  Apple subscriptions remain Apple subscriptions. HealthyFlow must retain store
  transaction identifiers and its own ledger so that exit remains possible.
- Adding Lemon later is a second commercial relationship. Subscription ownership,
  cancellation, refund, and management UI must remain provider-specific even
  though access is unified.
- Seller identity remains the founder's legal name while the Apple membership is
  individual. If HealthyFlow is treated as a DSA trader, public EU contact
  disclosure may justify a P.O. box or earlier incorporation.
- Review the provider mix when the web produces paying demand, at 100 paying
  customers, and when RevenueCat reaches USD 2,500 monthly tracked revenue.
  These are operational review points, not legal thresholds.

## Professional confirmation still required

An Israeli accountant must determine:

- exempt dealer versus authorised dealer status for this activity;
- whether turnover uses customer gross sales or provider payouts;
- VAT treatment of Apple agency proceeds, Israeli-storefront purchases, and a
  future foreign merchant-of-record payout;
- the invoices, receipts, withholding documents, and books that must be kept.

A lawyer must confirm DSA trader disclosure, Israeli subscription cancellation
and consumer terms, and the suitability of the paid-service terms and privacy
notices.

Apple must confirm account approval, Small Business Program status, product
review, and the available payout currency. RevenueCat must confirm how its
current monthly tracked-revenue calculation treats consumable purchase volume.

## Primary sources checked on 2026-09-02

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Small Business Program](https://developer.apple.com/app-store/small-business-program/)
- [Apple EU payment options effective 2026-10-01](https://developer.apple.com/support/payment-options-on-the-app-store-in-the-eu/)
- [Apple Schedule 2 and 3](https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English-UK.pdf)
- [Apple tax collection exhibits](https://developer.apple.com/support/downloads/terms/exhibits/Exhibits-to-Schedule-2-and-3-English-UK.pdf)
- [RevenueCat Capacitor SDK](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
- [RevenueCat pricing](https://www.revenuecat.com/pricing)
- [RevenueCat customer identity](https://www.revenuecat.com/docs/customers/identifying-customers)
- [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks)
- [RevenueCat balance source of truth](https://www.revenuecat.com/docs/offerings/virtual-currency/faq/balance-source-of-truth)
- [RevenueCat Web billing engines](https://www.revenuecat.com/docs/web/payment-integrations)
- [Lemon Squeezy supported countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries)
- [Lemon Squeezy fees](https://docs.lemonsqueezy.com/help/getting-started/fees)
- [Lemon Squeezy payouts](https://docs.lemonsqueezy.com/help/getting-started/getting-paid)
- [Lemon Squeezy merchant of record](https://docs.lemonsqueezy.com/help/payments/merchant-of-record)
- [Lemon Squeezy refunds and chargebacks](https://docs.lemonsqueezy.com/help/payments/refunds-chargebacks)
- [Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)
- [Google Play first-USD-1-million service-fee tier](https://support.google.com/googleplay/android-developer/answer/10632485?hl=en)
- [Google Play lower-fee rollout](https://support.google.com/googleplay/android-developer/answer/16954621?hl=en)
- [Google Play payout schedule](https://support.google.com/googleplay/android-developer/answer/137997?hl=en)
- [Israel business-opening guidance](https://www.gov.il/en/pages/income-tax-guide-open-business?chapterindex=6)
- [Israel exempt-dealer registration](https://www.gov.il/en/service/request-open-exempt-dealer-via-internet)
- [Israel National Insurance self-employed registration](https://www.btl.gov.il/English%20Homepage/Insurance/National%20Insurance/Detailsoftypes/SelfEmployedPerson/Pages/HowtoRegister.aspx)
