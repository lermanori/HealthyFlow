# Free-v1 App Store release

This is the maintained release packet for HealthyFlow v1. It separates facts
verified from source and code, release-team inferences, and decisions only the
founder or an appropriate professional can make. Last verified: **2026-09-08**.

## Fixed v1 product contract

- App Store price: Free. There is no purchase rail in the app.
- A Guest receives 10 AI actions once.
- A claimed account receives 15 AI actions each calendar month.
- Cloud cannot be obtained in v1. Local data is not backed up or moved to a new
  device.
- Founders Club accepts feedback and requests for discretionary additional free
  actions.
- RevenueCat with Apple In-App Purchase is deferred to v1.1, not cancelled.

The iOS build must leave `VITE_CLOUD_SYNC_ENABLED` unset. Cloud code is retained
for v1.1 but is opt-in at build time. `src/utils/weekViewFeatureFlag.test.ts`
guards this release condition. `src/utils/iosRelease.test.ts` guards the iOS 17
floor, aligned app/widget versions and identifiers, and absence of payment SDKs.

## Verified build identity

| Property | Value |
|---|---|
| App bundle ID | `app.healthyflow.mobile` |
| Widget bundle ID | `app.healthyflow.mobile.widget` |
| App Group | `group.app.healthyflow.mobile` |
| Minimum iOS version | 17.0 everywhere |
| Marketing version | 1.0.1 |
| Build number | 2 |
| Xcode used for RC check | 26.4.1 (17E202) |

On 2026-09-08, `npm run build:ios` completed, Swift packages resolved, and a
credential-free Release simulator build succeeded for both App and widget. The
resolved remote packages were `capacitor-swift-pm` 8.4.2 and
`ion-ios-filesystem` 1.1.2; ten Capacitor plugins were wired from local packages.
Repeat the build from clean `main` before upload:

```sh
npm run build:ios
xcodebuild -resolvePackageDependencies \
  -project ios/App/App.xcodeproj \
  -scheme App
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

Signing, device installation, archive validation, and upload are deliberately
not part of the credential-free check.

## App Store copy draft

The limits below were rechecked against Apple's App Store Connect Help on
2026-09-08. The name limit is 30 characters, subtitle 30 characters,
description 4,000 characters, and keywords 100 bytes. The privacy-policy URL is
required for iOS. Sources: [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information),
[platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information).

**Name (11 characters)**

```text
HealthyFlow
```

**Subtitle (25 characters)**

```text
Your whole day, one clock
```

**Keywords (78 bytes)**

```text
day planner,habits,nutrition,workouts,capacity,voice,tasks,health,productivity
```

**Description**

```text
HealthyFlow turns the moving parts of your day into one calm, usable plan.

See tasks, habits, meals, workouts, goals, calendar events, and available capacity together. Talk naturally to HealthyFlow to capture plans, ask about your day, or turn an idea into structured actions.

Built for real days:
• See what matters now and what comes next
• Plan against the time you actually have
• Track habits, nutrition, workouts, and goals in context
• Capture and organize with text, voice, or photos
• Keep using your Local day when the network is unavailable
• See a compact Today view from the Home Screen widget

HealthyFlow v1 is free and contains no purchases. A Guest receives 10 AI actions once. Claim an account to receive 15 AI actions each calendar month. You can also contact the Founders Club to share feedback or request additional free actions.

Your Local day stays on this device in v1. Cloud backup and transfer are not available, so deleting the app or losing the device can lose Local data.
```

**Review notes draft**

```text
HealthyFlow v1 is free. It contains no In-App Purchases, subscriptions, external purchase links, or paid unlocks.

Tap “Start without an account” to enter as a Guest. A Guest receives 10 AI actions once. An account receives 15 AI actions per calendar month. The Founders Club contact form may grant additional actions manually; nothing is sold.

The day is Local in v1. Cloud backup, sync, and device transfer cannot be obtained. AI actions and account services require a network connection; the existing Local day remains readable offline.

Account deletion is available inside Settings. Sign in with Apple is native. Reviewer credentials, if Apple requires an account-specific path, must be entered privately in App Store Connect and must never be committed here.
```

The founder must approve this copy before it is entered in App Store Connect.

## Screenshot set

Apple accepts 1–10 screenshots in JPG, JPEG, or PNG. A highest-resolution set
can be scaled for smaller displays when the UI is the same. For a 6.9-inch
iPhone set, use an accepted portrait size such as 1320 × 2868 with no alpha.
Sources rechecked 2026-09-08: [upload screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots),
[screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

Capture only synthetic, non-sensitive data on a fresh simulator:

1. Today: a believable mixed day and honest capacity.
2. Talk: a short assistant exchange about that synthetic day.
3. Week: tasks and habits in context across several days.
4. Health: synthetic nutrition and workout context.
5. Guest/Claim: exact free entitlements and Local-data warning.
6. Founders Club: feedback and additional-action request choices.

Uncropped simulator evidence already retained:
`output/app-store/v1/simulator/01-talk-response.png`. It is smoke evidence, not
the final 6.9-inch marketing asset. Final screenshots need founder approval and
must be captured from the final signed candidate.

## Code-derived data and SDK inventory

These are implementation facts, not completed App Privacy answers.

| Area | Data or access visible in source | Destination / SDK |
|---|---|---|
| Local day | goals, tasks, habits and progress, settings, food/calorie and weight history, workout plans/sessions/exercises, achievements | Capacitor Filesystem on the device |
| Account | name, email, role, authentication/provider identifiers | HealthyFlow backend and Supabase |
| AI | submitted text, optional images/files, assistant messages, structured results, usage and credit ledger | HealthyFlow backend, Supabase, OpenAI |
| Device Calendar (native v1) | Event title, time, all-day state, notes, location and opaque EventKit identifiers after permission | Processed in the iPhone app through EventKit; not sent to HealthyFlow by ordinary Calendar reading |
| Google Calendar (web only) | Google OAuth tokens, calendar event identifiers/content and sync state when connected | HealthyFlow backend, Supabase, Google Calendar APIs; native v1 does not call this path |
| Contact | request kind, message and reply-to address | HealthyFlow backend and Supabase |
| Notifications | native device token or Web Push subscription | HealthyFlow backend, Supabase, APNs/Web Push |
| Analytics | stable user ID; optional email/name/role/Guest state; typed product events and page paths | PostHog; production bundle points to the EU ingestion host |
| Nutrition lookup | food query and selected nutrition result | Open Food Facts / Fuder integration |

PostHog autocapture is disabled. Session recording is enabled with all inputs
masked; persistence uses local storage and a cookie. The typed catalog does not
send AI prompt text, but App Privacy must cover the actual SDK behavior and
current vendor terms, not only the intended event catalog.

The app and widget privacy manifests currently declare the shared App Group
`UserDefaults` required-reason API (`1C8F.1`), no tracking domains, and no
collected-data entries. That is not evidence that the App Privacy questionnaire
should say “no data collected”: Apple requires the developer to disclose both
first-party and third-party-partner collection and keep answers accurate.
[Apple App Privacy guidance](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
was rechecked on 2026-09-08.

Apple's App Privacy guidance says data processed only on the device is not
"collected" for the App Privacy answers. On that basis, the native Device
Calendar read is not itself a collected data type. This is an implementation
inference, not the founder's completed questionnaire: if Calendar-derived data
is included in an explicit AI request or otherwise transmitted later, that
transmission must be assessed separately. The guidance was rechecked on
2026-09-08 in
[App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/).

### Inferences for human review

- Account identifiers, AI submissions, contact requests, analytics identifiers,
  and connected-calendar data likely map to App Privacy data types.
- Whether each type is linked to identity, retained, or used for analytics or
  product personalization must be reconciled against production configuration,
  retention and each provider's current policy.
- Because Local day data can be sent to AI only when the user invokes an AI
  feature, local storage and server/AI processing need distinct answers.

Do not enter questionnaire answers from these inferences. The founder must
confirm the production configuration and, where appropriate, obtain privacy or
legal review.

## Public URL readiness and legal-content gate

HTTP behavior checked from production on 2026-09-08:

| Proposed field | URL | Technical status | Human gate |
|---|---|---|---|
| Privacy Policy URL | `https://healthyflow.app/app/privacy` | HTTP 200; `/privacy` redirects here | Privacy text says product data is saved and synced, which conflicts with Local-only v1. Human/legal approval is required before editing or submission. |
| Support URL | `https://healthyflow.app/app/support` | HTTP 200; `/support` redirects here | The page exposes a personal address while Terms uses `support@healthyflow.app`. Founder must choose and verify the public support address. |
| Privacy choices URL | none proposed | Optional in App Store Connect | Founder/legal decision; do not invent one. |

Terms still describes subscriptions, paid features, credits and payments. It
must receive human/legal review for the free-v1 product before submission. Do
not silently rewrite legal copy.

## Smoke and release gates

| Gate | Current evidence | Release condition |
|---|---|---|
| Guest first launch | Fresh isolated iOS 18.6 simulator entered without retained identity | Repeat on final signed build |
| Local Today | Guest reached Today; Local day survived terminate/relaunch | Repeat on physical device |
| Real AI action | Talk returned a production answer for a non-sensitive empty-day prompt | Repeat on final candidate; verify counter decrements |
| Cloud unavailable | Cloud code disabled unless explicit build flag is true; release test covers it | Confirm no Cloud status/offer in signed build |
| Offline Local day | Local day rendered during a transient disconnected launch | Deliberately test airplane mode, reconnect, and queued local edits on physical device |
| Claim/sign-in/recovery | Source/tests exist; transactional recovery delivery is not configured | Complete issue #235 and test fresh account plus returning Apple authorization |
| Exhaustion | Automated credit tests cover typed exhaustion | Exhaust a disposable Guest and account on the candidate without altering real users |
| Founders Club | Production request path verified in issue #232 | Repeat from candidate |
| Account deletion | Route and tests exist | Confirm through UI using a disposable account; permanent action requires human confirmation at execution time |
| Deep links | `healthyflow://app/talk` and `healthyflow://app/privacy` routed correctly after the simulator's OS confirmation | Repeat every supported link on the signed build |
| Push and widget | Native integration and automated boundaries exist | Physical-device notification and widget refresh required |
| Archive/upload | Not attempted without credentials | Human signing, Archive validation, TestFlight upload and App Store Connect processing required |

## Exact human handoff

Start from clean, current `main`. Stop immediately if any source file or generated
native asset changes unexpectedly.

1. Run the complete validation gate in `docs/runbooks/ios.md`, then
   `npm run build:ios` once more.
2. Open `ios/App/App.xcodeproj`; select the final Apple team for both targets.
3. Confirm app and widget identifiers, App Group, Sign in with Apple, Push, and
   production Supabase configuration. Do not change identifiers after upload.
4. Install a signed Release build on an iOS 17 physical device and execute every
   unresolved smoke gate above with disposable identities/data.
5. Archive and use Xcode Organizer validation. Resolve every warning or error;
   do not upload a different source state than the tested archive.
6. Upload to App Store Connect and wait for build processing. Select that exact
   build for the version.
7. In App Store Connect, enter founder-approved metadata and screenshots; set
   the app price to Free. Do not create an IAP, subscription, or external
   purchase rail.
8. Founder/legal completes privacy, age rating, export compliance, content
   rights, category, territories/availability, tax category, DSA/trader status,
   public contact, and release timing from current facts and professional advice
   where needed.
9. Add for Review, inspect the submission, then explicitly Submit for Review.
   Apple documents these as separate steps: [submit an app](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app).
10. After approval, verify the chosen release action and the public product page
    before enabling the server version gate. Apple notes availability can take
    up to 24 hours: [publishing overview](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/overview-of-publishing-your-app-on-the-app-store).

The repository work ends before steps that require Apple credentials, legal or
tax judgment, public-contact approval, destructive account deletion, build
upload, App Store submission, or release.
