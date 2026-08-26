# Paid apps and in-app purchases

How HealthyFlow goes from a TestFlight build to taking money: what Apple
requires, in the order Apple enforces it, for a **solo individual developer
based in Israel with no company entity**.

Bundle id `app.healthyflow.mobile`, team `PA7L4ZHG8D`. How the shell is built
and shipped is [`ios.md`](./ios.md); *what* we sell and why is the Money
section of [`TARGET.md`](../../TARGET.md). This is how Apple lets us sell it.

> Verified against App Store Connect Help, the App Review Guidelines and
> Schedule 2 **v126 (17 December 2025)** on **2026-08-20**. Apple changes this
> paperwork often. Re-check anything a decision rests on, and see
> [What is not confirmed](#what-is-not-confirmed) for the gaps.

## What is settled

**An individual account can do all of this.** No company is required. The
banking form has an *Individual* account-holder type, the tax path for a non-US
individual is the W-8BEN, and compliance review for an individual is satisfied
by a government-issued ID. A legal entity and D-U-N-S number are required only
to *enrol* as an Organization, which is a different thing from signing the Paid
Apps agreement.

**One switch gates everything.** The Paid Apps agreement must read **Active** —
which needs the signature, the bank account and the tax forms all in place —
before you can create in-app purchase products or test them in the sandbox.

**Apple's paperwork is not Israel's paperwork.** What Apple asks for is a US tax
form and a bank account. What you owe in Israel is a separate question and is
not answered here.

## The order Apple enforces

| # | Step | Who | Depends on | Elapsed |
|---|---|---|---|---|
| 0 | Write StoreKit against a local `.storekit` file | You | Nothing | Start now |
| 1 | Sign the Paid Apps agreement | **Account Holder only** | Active membership | Minutes |
| 2 | Add the bank account | Account Holder / Admin / Finance | Step 1 | Minutes |
| 3 | Complete the tax forms | Account Holder / Admin / Finance | Step 1 | Minutes |
| 4 | Clear compliance review | Apple | Steps 2 + 3 | Hours to 14 business days |
| 5 | Enrol in the Small Business Program | **Account Holder only** | Step 1 | Effect lands next fiscal month |
| 6 | Declare DSA trader status | Account Holder / Admin | Nothing | Document verification, no published SLA |
| 7 | Create the products | Account Holder / Admin / App Manager | Agreement **Active** | An afternoon |
| 8 | Test in the sandbox | You | Step 7 | Days of iteration |
| 9 | Submit with a new app version | You → App Review | Steps 7 + 8 | A day or two, not guaranteed |

Steps 1–6 are all waiting-period items and none of them depend on a line of
StoreKit code. Start them before writing the purchase flow, not after.

### 0 — Nothing blocks the code today

Xcode's StoreKit configuration file is a local test environment. Products,
prices and subscription groups defined in the file never touch App Store
Connect, and purchases resolve with no connection to App Store servers. Build
the purchase flow, the credit ledger and the entitlement logic against it while
the paperwork clears.

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

15% commission instead of 30%. Developers new to the App Store are
automatically eligible; you must have accepted the current Paid Apps agreement
and declare any associated developer accounts. The reduced rate takes effect
**15 days after the end of the fiscal month in which the enrolment is
approved** — so enrolling before shipping is worth real money, and enrolling
late costs a month of margin.

### 6 — DSA trader status

Every developer must declare trader status, EU distribution or not. Selling
in-app purchases makes you a trader. As an individual trader you supply an
address or P.O. box, a phone number and an email — verified by two-factor codes
plus uploaded documents — and Apple **publishes all three on the App Store
product page across the 27 EU territories**. Without it the app cannot be
distributed in the EU. The P.O. box route exists precisely because the
alternative is a home address; it needs supporting documentation.

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
| Israeli VAT on Israeli-storefront sales | Set by Exhibit B, visible in App Store Connect only after signing | Unconfirmed |
| Osek patur / murshe / company | Registration, VAT treatment, income tax, National Insurance | Accountant |
| Seller name on the App Store | Your personal legal name, because the enrolment is individual | Documented |

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

## Needs an accountant or a lawyer

Do not guess these.

- **Israeli registration** — osek patur or osek murshe, and where that choice
  breaks. It interacts with VAT invoicing, reporting cadence and National
  Insurance.
- **VAT treatment of Apple's payments** — whether they are zero-rated export of
  services, and how Israeli-storefront sales are treated if Apple is not the one
  remitting Israeli VAT.
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

- **Exhibit B for Israel.** The authoritative per-territory list of who remits
  sales tax is not published on the open web; Schedule 2 only points at App
  Store Connect. Israel appears in none of the Apple tax-change news items
  checked. Read Exhibit B in App Store Connect after signing.
- **ILS as a payout currency.** Apple documents that you are paid in your
  account's currency but publishes no list of supported payout currencies.
- **How long the agreement takes to reach Active.** Apple publishes no target.
  The commonly cited 24–48 hours is community reporting; the only Apple number
  is the 14-business-day escalation mark.
- **Current App Review turnaround.** No published figure was verified.
- **Israel's VAT regime for foreign digital-service providers.** Sources
  disagree on whether the foreign-supplier registration rules are in force. This
  affects Apple's obligations more than ours, but it is unresolved.

## Sources

- [Sign and update agreements](https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements)
- [Provide tax information](https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information/)
- [Banking information](https://developer.apple.com/help/app-store-connect/reference/banking-information/)
- [Compliance review](https://developer.apple.com/help/app-store-connect/reference/compliance-review/)
- [Overview for configuring In-App Purchases](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/)
- [Offer auto-renewable subscriptions](https://developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions/)
- [Overview of receiving payments](https://developer.apple.com/help/app-store-connect/getting-paid/overview-of-receiving-payments)
- [Minimum payment threshold](https://developer.apple.com/help/app-store-connect/reference/reporting/minimum-payment-threshold)
- [Schedule 2 and 3, v126](https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English.pdf)
- [App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/)
- [DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Enrollment](https://developer.apple.com/support/enrollment/)
- [Setting up StoreKit Testing in Xcode](https://developer.apple.com/documentation/Xcode/setting-up-storekit-testing-in-xcode)
