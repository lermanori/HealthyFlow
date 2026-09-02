# Paid apps, in-app purchases and RevenueCat

How HealthyFlow goes from a TestFlight build to taking money: what Apple
requires, in the order Apple enforces it, for a **solo individual developer
based in Israel with no company entity**.

Bundle id `app.healthyflow.mobile`, team `PA7L4ZHG8D`. How the shell is built
and shipped is [`ios.md`](./ios.md); *what* we sell and why is the Money
section of [`TARGET.md`](../../TARGET.md). ADR-0015 chooses Apple In-App
Purchase through RevenueCat for the iPhone launch. This is how that choice gets
to a real sale.

> Re-verified against App Store Connect Help, the App Review Guidelines,
> Schedule 2 **v126 (17 December 2025)**, Apple's **18 August 2026** EU update,
> RevenueCat's product documentation and Israeli government guidance on
> **2026-09-02**. These terms change often. Re-check anything an implementation
> rests on, and see
> [What is not confirmed](#what-is-not-confirmed) for the gaps.

## What is settled

**An individual Apple account can do all of Apple's setup.** Apple does not
require a company. The banking form has an *Individual* account-holder type, the
tax path for a non-US individual is the W-8BEN, and compliance review for an
individual is satisfied by a government-issued ID. A legal entity and D-U-N-S
number are required only to *enrol* as an Organization, which is a different
thing from signing the Paid Apps agreement.

**One switch gates everything.** The Paid Apps agreement must read **Active** —
which needs the signature, the bank account and the tax forms all in place —
before you can create in-app purchase products or test them in the sandbox.

**Apple's paperwork is not Israel's paperwork.** Israeli Tax Authority guidance
says the assessor must be notified no later than the day income-producing
business activity begins. Before the first real payment, an accountant must
confirm and open the applicable self-employed, VAT, income-tax, invoicing and
National Insurance setup. A company is not the only registration form.

## The chosen system

| Responsibility | Launch owner |
|---|---|
| Customer payment, App Store price, refund channel and founder payout | Apple In-App Purchase |
| StoreKit client, purchase validation, subscription normalisation and signed lifecycle events | RevenueCat |
| Cloud access, monthly balance, non-expiring top-up balance, usage charging and audit trail | HealthyFlow backend |

RevenueCat is a purchase-state broker, not the payment rail or merchant of
record. Its Capacitor SDK wraps StoreKit; Apple still owns the customer
transaction and pays the founder. RevenueCat is free through its published USD
2,500 monthly tracked-revenue threshold and then costs 1% of tracked revenue.

The existing backend remains the source of truth. RevenueCat webhooks are signed,
at-least-once inputs and must be authenticated, deduplicated by event id, applied
atomically and reconciled. Do not make RevenueCat Virtual Currency a second
authoritative balance.

Use the stable, opaque HealthyFlow user-row id as RevenueCat's App User ID. Never
use an email address. Claim keeps the row and id; Sign in abandons the Guest row,
so RevenueCat alias and restore configuration must not silently move that Guest's
purchases to an unrelated existing account.

There is no Lemon Squeezy checkout or external-purchase steering in the launch
app. Lemon is deferred until the web is a demonstrated acquisition surface.
RevenueCat Web does not currently list Lemon as a supported billing engine, so a
future Lemon integration feeds HealthyFlow's provider-neutral ledger directly.

The launch work is tracked in dependency order: [#222](https://github.com/lermanori/HealthyFlow/issues/222)
clears human and provider prerequisites, [#223](https://github.com/lermanori/HealthyFlow/issues/223)
delivers Cloud purchase and lifecycle, and [#224](https://github.com/lermanori/HealthyFlow/issues/224)
adds the non-expiring AI-action consumable.

## The order Apple enforces

| # | Step | Who | Depends on | Elapsed |
|---|---|---|---|---|
| 0 | Model the products locally and create the RevenueCat project | You | Nothing | Start now |
| 1 | Sign the Paid Apps agreement | **Account Holder only** | Active membership | Minutes |
| 2 | Add the bank account | Account Holder / Admin / Finance | Step 1 | Minutes |
| 3 | Complete the tax forms | Account Holder / Admin / Finance | Step 1 | Minutes |
| 4 | Clear compliance review | Apple | Steps 2 + 3 | Hours to 14 business days |
| 5 | Enrol in the Small Business Program | **Account Holder only** | Step 1 | Effect lands next fiscal month |
| 6 | Declare DSA trader status | Account Holder / Admin | Nothing | Document verification, no published SLA |
| 7 | Create the Apple products and map them in RevenueCat | Account Holder / Admin / App Manager | Agreement **Active** | An afternoon |
| 8 | Test the RevenueCat purchase and webhook paths in the sandbox | You | Step 7 | Days of iteration |
| 9 | Submit with a new app version | You → App Review | Steps 7 + 8 | A day or two, not guaranteed |

Steps 1–6 are all waiting-period items and none of them depend on a line of
StoreKit code. Start them before writing the purchase flow, not after.

### 0 — Model before the external accounts are ready

Xcode's StoreKit configuration file is a local test environment. Products,
prices and subscription groups defined in the file never touch App Store
Connect, and purchases resolve with no connection to App Store servers. Model
the Cloud subscription and consumable pack there while the paperwork clears.
The production flow uses RevenueCat's Capacitor SDK, Apple product identifiers,
a RevenueCat entitlement for Cloud, and signed webhooks into the existing
backend ledger.

### 1 — The agreement

App Store Connect → **Business** → Agreements → Paid Apps → *View and Agree to
Terms*. You will be asked for a two-factor code. Accepting cannot be undone, and
when Apple publishes a new version of the agreement you cannot create apps or
in-app purchases until you accept it.

### 2 — Banking

Business → Agreements → Bank Accounts → *Add Bank Account*. Apple asks for bank
territory, bank code (branch or clearing number), account number with leading
zeros intact, **IBAN in its own separate field**, account-holder name exactly as
the bank has it, holder type *Individual*, the holder's address, account type,
and the currency you want to be paid in. It must be your own bank, not an
intermediary or correspondent.

### 3 — Tax

A US tax form is required of every developer. The App Store Connect
questionnaire routes a non-US individual to the **W-8BEN**. Israel is not on
Apple's list of regions that need an additional local form — that list is
Australia, Brazil, Canada, Ireland, Mexico, Singapore, South Korea, Taiwan and
Thailand — so for this account the US form is the whole of Apple's tax ask.

Most US forms cannot be edited after submission; corrections go through Apple.
A form filed before the end of a fiscal month applies to that month's earnings.

### 4 — Compliance review

Apple runs a bank-account review; for an individual it is satisfied by a
government-issued ID whose name matches the bank account holder. Until it
clears, the agreement does not go Active and no payment can be sent. Apple
publishes no target duration — only the instruction to contact Developer Support
if it is still pending after **14 business days**. Treat that as the worst case.

### 5 — Small Business Program

15% commission instead of 30%. New developers and developers below Apple's
proceeds ceiling may be eligible, but enrolment is not automatic; you must have
accepted the current Paid Apps agreement and declare any associated developer
accounts. The reduced rate takes effect
**15 days after the end of the fiscal month in which the enrolment is
approved** — so enrolling before shipping is worth real money, and enrolling
late costs a month of margin.

### 6 — DSA trader status

Every developer must declare trader status, EU distribution or not. Apple says
the developer must assess whether it is a trader; selling a consumer digital
subscription makes HealthyFlow likely to be one, but that classification is an
inference for a lawyer to confirm. As an individual trader you supply an address
or P.O. box, a phone number and an email — verified by two-factor codes plus
uploaded documents — and Apple **publishes all three on the App Store product
page across EU territories**. Without completed trader information the app
cannot be distributed there. The P.O. box path needs supporting documentation.

### 7 — The products

Credit packs are **Consumable** in-app purchases. Cloud backup and sync is an
**auto-renewable subscription**, which means a subscription group first, then
products inside it, then levels. Every product needs a reference name, product
id, price, availability, tax category and localizations. Every subscription
additionally needs a duration and a **required review screenshot**. Metadata
changes take up to an hour to reach the sandbox.

### 8 and 9 — Sandbox, then submission

Sandbox needs sandbox Apple Accounts created in App Store Connect, a
development-signed build, and Developer Mode enabled on the device.

Your **first in-app purchase must be submitted together with a new version of
the app**, and your **first subscription group must be submitted with a new app
version that includes a subscription**. After that first approval, later
products submit on their own.

## Two gates people confuse

**Sandbox unblocks on account plumbing only.** Agreement signed, bank on file,
tax filed, compliance cleared, status Active, products created and propagated,
sandbox account on a dev-signed build with Developer Mode. No App Review is
involved.

**Revenue unblocks on App Review.** Everything above, plus the app version and
its first in-app purchases approved and released. Then sales must exceed the
payment threshold — **40 USD**, the default that applies because neither Israel
nor ILS appears in Apple's per-region threshold table — and Apple pays within
**45 days of the last day of the fiscal month** of the transaction, one payment
per currency. First revenue realistically lands about two months after the first
sale.

## Israel, individual, no entity

| Item | What applies | Confidence |
|---|---|---|
| US tax form | W-8BEN via the App Store Connect questionnaire | Documented |
| Israel-specific Apple tax form | None | Documented |
| US withholding | App Store proceeds are reported to be commission-on-sales rather than royalties, so no withholding, no US TIN, no treaty claim | Reported, not read on an Apple page |
| Banking | Standard fields; Israeli accounts are IBAN-based and Apple keeps IBAN and account number separate | Documented |
| Payout currency | You are paid in the currency of the nominated account | ILS availability unconfirmed |
| Payment threshold | 40 USD | Documented |
| Israeli-storefront transaction tax | Israel is absent from the published 29 January 2026 Exhibit B list where Apple says it collects/remits the specified transaction taxes | Documented contract fact; the resulting Israeli VAT treatment is Accountant |
| Osek patur / murshe / company | Registration, VAT treatment, income tax, National Insurance | Accountant |
| Seller name on the App Store | Your personal legal name, because the enrolment is individual | Documented |

The Exhibit B fact is not a conclusion that no tax is due. It is the reason not
to assume Apple resolves Israeli VAT for us.

## Constraints that shape the product, not the paperwork

**Purchased credits may not expire.** App Review Guideline 3.1.1: "Any credits
or in-game currencies purchased via in-app purchase may not expire." A credit
pack bought for AI usage is the customer's indefinitely, so the credit ledger
needs no expiry logic and any monthly-allowance design has to come from the
subscription side.

**A subscription must span devices.** Guideline 3.1.2(a): at least seven days,
ongoing value, and it must work on all of the user's devices. Cloud backup and
sync fits, but the entitlement has to follow the Apple account rather than the
install.

**15% is not automatic.** The standard commission is 30%. The Small Business
Program's 15% must be applied for, and without it subscriptions only drop to 15%
after a customer's first paid year. Margin models should assume 30% until the
enrolment is approved.

## External-purchase links are not a launch shortcut

As checked on 2026-09-02, Apple permits purchase links without an entitlement in
the United States storefront. Outside the United States the general rule still
prohibits steering unless a regional entitlement applies.

Apple's unified EU terms take effect on **2026-10-01**. They allow Apple IAP and
alternative payment options together, but require an entitlement, StoreKit
disclosures, monthly transaction reporting, customer support, tax handling, and
a 12-month commitment to the selected payment combination. For a Small Business
Program participant the published rate is 15% for Apple IAP and 10% for
qualifying alternative in-app or attributable out-of-app transactions, before
the external processor's fee.

That saving does not justify a storefront-specific launch path. Ship Apple IAP
everywhere and no external-purchase call to action.

## RevenueCat and Lemon Squeezy economics

These figures were checked on 2026-09-02 and exclude consumer tax, exchange-rate
effects and bank fees:

| Path | Published provider cost | Cash timing | Routine reserve |
|---|---|---|---|
| Apple IAP through RevenueCat below RevenueCat's threshold | Apple 15% after Small Business Program approval; RevenueCat USD 0 | Apple pays no later than 45 days after fiscal-month close, subject to threshold and complete paperwork | No fixed reserve published; Apple may hold or offset for tax, debt or compliance problems |
| Apple IAP through RevenueCat above the threshold | Apple commission plus RevenueCat 1% of tracked revenue | Still paid by Apple | RevenueCat does not hold the sale proceeds |
| Deferred Lemon web checkout | 5% + USD 0.50; +0.5% subscription; +1.5% international or PayPal where applicable; non-US bank payout 1% | Net sales held 13 days, payout created on the 1st or 15th, then normally 1–5 bank days; USD 50 minimum | No fixed reserve published; risk review may delay payouts |

At a USD 5 top-up, Lemon's fixed fee makes the published US-card cost 15%
before payout fees and an international-card example 16.5%. Apple Small
Business pricing is therefore competitive for the small launch SKU while also
removing a second checkout and entitlement path.

## Needs an accountant or a lawyer

Do not guess these.

- **Israeli registration** — osek patur or osek murshe, and where that choice
  breaks. It interacts with VAT invoicing, reporting cadence and National
  Insurance.
- **VAT treatment of Apple's payments** — whether they are zero-rated export of
  services, and how Israeli-storefront sales are treated if Apple is not the one
  remitting Israeli VAT.
- **When registration must be active** — the Tax Authority says no later than
  the day income-producing activity begins; confirm the operational sequence
  before enabling the first production product.
- **The W-8BEN line items** — which foreign TIN to give, and whether to claim
  treaty benefits at all.
- **Individual now versus company later** — Apple asks you to contact Developer
  Support to convert an individual account to an organization, and apps carrying
  auto-renewable subscriptions transfer only with a shared-secret handover.
  Decide before there are paying subscribers.
- **What the DSA publishes about you** (lawyer) — a home address and personal
  phone on every EU product page is a real exposure; the P.O. box path and its
  documentation are worth advice.
- **Consumer terms for a subscription** (lawyer) — refunds, cancellation and
  disclosure duties for EU and UK buyers sit on top of Apple's rules, not inside
  them.

## What is not confirmed

- **ILS as a payout currency.** Apple documents that you are paid in your
  account's currency but publishes no list of supported payout currencies.
- **How long the agreement takes to reach Active.** Apple publishes no target.
  The commonly cited 24–48 hours is community reporting; the only Apple number
  is the 14-business-day escalation mark.
- **Current App Review turnaround.** No published figure was verified.
- **Israel's VAT regime for foreign digital-service providers.** Sources
  disagree on whether the foreign-supplier registration rules are in force. This
  affects Apple's obligations more than ours, but it is unresolved.
- **RevenueCat's MTR treatment of consumables.** Its public pricing page describes
  active subscriptions and a tracked-revenue threshold but does not make the
  launch credit pack's treatment explicit. Ask RevenueCat before forecasting the
  fee above the threshold.
- **Account conversion.** Confirm with Apple and RevenueCat how the individual
  account, customer identifiers and credentials move if the founder incorporates.

## Sources

- [Sign and update agreements](https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements)
- [Provide tax information](https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information/)
- [Banking information](https://developer.apple.com/help/app-store-connect/reference/reporting/banking-information)
- [Compliance review](https://developer.apple.com/help/app-store-connect/reference/account-management/compliance-review)
- [Overview for configuring In-App Purchases](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/)
- [Offer auto-renewable subscriptions](https://developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions/)
- [Overview of receiving payments](https://developer.apple.com/help/app-store-connect/getting-paid/overview-of-receiving-payments)
- [Minimum payment threshold](https://developer.apple.com/help/app-store-connect/reference/reporting/minimum-payment-threshold)
- [Schedule 2 and 3, v126](https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English-UK.pdf)
- [Exhibits to Schedule 2 and 3, 29 January 2026](https://developer.apple.com/support/downloads/terms/exhibits/Exhibits-to-Schedule-2-and-3-English-UK.pdf)
- [App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/)
- [DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [EU payment options effective 1 October 2026](https://developer.apple.com/support/payment-options-on-the-app-store-in-the-eu/)
- [Enrollment](https://developer.apple.com/support/enrollment/)
- [Setting up StoreKit Testing in Xcode](https://developer.apple.com/documentation/Xcode/setting-up-storekit-testing-in-xcode)
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
- [Israel business-opening guidance](https://www.gov.il/en/pages/income-tax-guide-open-business?chapterindex=6)
- [Israel exempt-dealer registration](https://www.gov.il/en/service/request-open-exempt-dealer-via-internet)
- [Israel National Insurance self-employed registration](https://www.btl.gov.il/English%20Homepage/Insurance/National%20Insurance/Detailsoftypes/SelfEmployedPerson/Pages/HowtoRegister.aspx)
