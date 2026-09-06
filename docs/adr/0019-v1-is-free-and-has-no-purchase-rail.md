# ADR 0019 — v1 is free and has no purchase rail

**Status**: Accepted

**Decision date**: 2026-09-06

**Amends**: ADR-0015 for the v1 release boundary; it does not reverse the chosen
future rail

## Context

ADR-0015 chose Apple In-App Purchase through RevenueCat for an iPhone release
that sold Cloud and action packs. The purchase implementation, provider setup,
paid agreements, professional advice, and product review had not started. Making
all of that the gate for the first public listing delayed learning whether the
product itself deserved distribution.

The product already has a bounded free-action model. A free App Store release can
exercise the full Local day and Talk without inventing an interim checkout or
misrepresenting a purchase path that does not exist.

## Decision

### 1. HealthyFlow v1 is free

The App Store app price is Free. v1 contains no StoreKit product, RevenueCat SDK,
subscription, consumable, external checkout, price, Subscribe button, Buy button,
or purchase steering. No production sale is possible.

The free entitlements are:

- Guest: ten AI actions once, under ADR-0018;
- claimed account: fifteen AI actions per calendar month, under ADR-0017; and
- discretionary extra free actions requested through Founders Club.

### 2. Cloud cannot be held in v1

Cloud remains the future paid cross-device product, but no v1 path can create or
grant its subscription state. v1 is local-only: reinstalling the app or moving to
a new phone does not restore the Local day. The app, landing page, and App Store
description must say so plainly.

### 3. ADR-0015 is deferred to v1.1

Apple In-App Purchase through RevenueCat remains the accepted rail for the later
Cloud subscription and non-expiring action pack. Issues #222, #223, and #224 are
deferred v1.1 work. Lemon Squeezy, web checkout, and Android remain outside that
decision's immediate scope.

### 4. Free does not remove the App Store human gates

App Store submission still requires its current metadata, privacy, age-rating,
availability, review, and compliance steps. In particular, Apple's DSA guidance
checked on 2026-09-06 says every developer must declare trader status; Apple
cannot decide that legal status for the developer. If an individual declares as
a trader, Apple requires verified address or P.O. Box, phone, and email for public
display on EU product pages. Those choices remain human-owned.

## Consequences

- All v1 purchase and Cloud-acquisition surfaces are removed rather than hidden
  behind controls that cannot complete.
- Running out of actions is an inline refusal with Claim or Founders Club as the
  truthful next step. Nothing is offered for sale.
- Paid-sale setup, Israeli business/tax advice, RevenueCat configuration, and
  Apple product creation do not block v1. They must be completed before v1.1 can
  accept its first real payment.
- DSA status, public contact choices, privacy declarations, age rating, App Review
  contact, submission, and release remain v1 human gates.
- The decision is revisited for v1.1, not silently implemented under v1 copy or
  configuration.

## Source checked on 2026-09-06

- [Apple — Manage European Union Digital Services Act trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)
