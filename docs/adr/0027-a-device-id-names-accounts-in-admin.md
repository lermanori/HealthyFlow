# ADR 0027 — a device ID names accounts in Admin

**Status**: Accepted

**Decision date**: 2026-09-19

**Supersedes nothing.** Makes the decision ADR-0017 and ADR-0018 deferred ("no
Keychain id … without evidence and a later decision"), for one purpose only:
telling accounts apart in Admin. Grant eligibility is unchanged.

## Context

People in Admin listed dozens of Guests that were, in fact, one person: the
founder reinstalling the app and testing. Every install of a free app mints a
Guest row, and nothing on those rows says which device they came from, so the
founder could not tell their own rows from real people's or mark them test in
one go. Spend and the ledger inherited the same blur.

An install-scoped ID would not help: deleting the app is exactly how the rows
multiply. `identifierForVendor` resets when the vendor's only app is deleted.
ADR-0023 already named the right instrument as its upgrade path: an iOS Keychain
identifier, which survives reinstall and needs no Apple key.

## Decision

**The iPhone app keeps a random UUID in the Keychain as a this-device-only item**
(`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, not synchronizable). It
survives deleting and reinstalling the app, is never synced through iCloud
Keychain, and is never restored onto another phone. It is not the advertising
identifier and is derived from no hardware property. On the web the same role
is played by one random ID per browser.

**It travels only with auth requests**, as `X-HF-Device-Id`, and the server
records it on the account as `users.device_id` when a Guest starts, on sign-in
and Claim, and on every verified app open, so an existing Guest picks it up the
next time it opens the app. A missing or malformed header is ignored: it never
fails a request.

**It labels and groups accounts in Admin and does nothing else.** No grant reads
it; ADR-0017, ADR-0018 and ADR-0023 are unchanged. If device-based grant
eligibility is ever wanted, that is a separate decision with its own false-positive
analysis.

## Consequences

- People shows each account's device and how many accounts share it; the tag
  filters People to that device so they can be marked test together.
- Guest rows abandoned before this build never record a device; only rows that
  open the app again do.
- Device ID is already a declared App Privacy type (for the push token), but it
  must be answered as linked to the user before a build that sends this ID is
  submitted, because the ID is stored on the account. The app's privacy manifest
  keeps its documented position of declaring no collected-data entries (see
  `docs/runbooks/app-store-v1.md`).
- Verified on the iOS 26 simulator: the same ID came back after the app was
  deleted and reinstalled.
