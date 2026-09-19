# Free-v1 App Store release

This is the maintained release packet for HealthyFlow v1. It separates facts
verified from source and code, release-team inferences, and decisions only the
founder or an appropriate professional can make. Last verified: **2026-09-19**.

## Fixed v1 product contract

- App Store price: Free. There is no purchase rail in the app.
- A Guest receives 10 AI actions once.
- A claimed account receives 15 AI actions each calendar month.
- Cloud cannot be obtained in v1. Local data is not backed up or moved to a new
  device.
- Founders Club accepts feedback and requests for discretionary additional free
  actions.
- RevenueCat with Apple In-App Purchase is deferred to v1.1, not cancelled.

Direct Google Calendar is **not reachable from the iPhone at all** — not behind
a flag, structurally. A Google account added to iOS Calendar is already exposed
through EventKit, so reaching Google again through the backend would show one
meeting twice and write one Item as two events (ADR-0020 §4). The integration
remains for the web surface and is untouched there.

`src/utils/iosRelease.test.ts` guards the iOS 26 floor, aligned app/widget
versions and identifiers, and absence of payment SDKs.

**`VITE_CLOUD_SYNC_ENABLED` is set from 2026-09-11.** It is not an acquisition
path: no user can obtain Cloud in v1 (ADR-0019), and the only identity holding
the entitlement is the founder's legacy exception. The flag only lets the client
*attempt* an exchange; the entitlement is enforced on the server by
`CloudAccess.require` on every `POST /sync`, which answers 403 `cloud_not_active`
for everyone else (`backend/tests/sync/endpoint.test.ts`). The Local day remains
the source (ADR-0011) and the server is a replica, never a hosted substitute.
The founder's legacy Cloud state controls replication only; it neither replaces
nor blocks the claimed account's monthly AI actions or balance set in Admin.

**A build containing #308 was submitted on 2026-09-19.** The founder reports the
submitted archive was taken from that day's `main`, which carries
`ios/App/App/DeviceIdentityPlugin.swift` and the `users.device_id` write. The
published App Privacy answers still show identifier data as *not linked* to the
user, which was accurate only for a pre-#308 binary.

**Open action, founder only: switch Device ID to linked to the user in App
Privacy.** Device ID is already declared (for the push token) with App
Functionality; only the linkage answer changes, and App Privacy is editable
while a version is in review. Nothing else in the questionnaire changes. It is
a portal action: the submitted binary does not need replacing for it.

The device ID never blocks a session: `recordDevice` and `recordLogin` in
`backend/src/routes/auth.ts` log and continue when the write fails, and
`backend/src/credits.ts` does the same for an `ai_refusals` insert. Migration
`20260919100000_users_device_id.sql` and the 2026-09-18 Admin migrations are
therefore Admin correctness rather than a user-facing launch gate: until they
are applied, the Admin reads that depend on them report unavailable and the
bookkeeping is simply absent. Apply them with the backend deploy regardless.

For #237, the App Privacy answers were completed from the full code and
production-SDK inventory, including the legacy entitled-account sync path. The
listing copy accurately says that new v1 users cannot obtain Cloud backup,
cross-device sync, or device transfer.

## Verified build identity

| Property | Value |
|---|---|
| App bundle ID | `app.healthyflow.mobile` |
| Widget bundle ID | `app.healthyflow.mobile.widget` |
| App Group | `group.app.healthyflow.mobile` |
| Minimum iOS version | 26.0 everywhere |
| Marketing version | 1.0.1 |
| Build number | 5 |
| Xcode used for RC check | 26.4.1 (17E202) |

Those version/build values are the checked-in Xcode settings for the replacement
release candidate. App Store Connect also contains `1.0.1 (4)`, uploaded on
2026-09-16, but device verification showed that it still exposes the retired
personal support address. Build 4 is stale and must not be submitted.

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

A signed Debug build was installed on a physical iPhone 14 Pro running iOS 26
on 2026-09-14 for the native voice check. Archive validation and upload remain
outside the credential-free release check.

## Approved App Store listing copy

The founder approved the English (U.S.) listing on 2026-09-17. The exact copy is
in [the approved listing packet](../../output/app-store/v1/listing-draft.md),
which supersedes the earlier description and keywords in this section.

- Name: `HealthyFlow: Daily Planner` (26 characters).
- Subtitle: `Tasks, habits, food & fitness` (29 characters).
- Promotional text, description and keywords follow the approved packet.
- Marketing URL: `https://healthyflow.app`.
- Support URL: `https://healthyflow.app/app/support`.

Apple's version metadata limits were rechecked on 2026-09-17: promotional text
170 characters, description 4,000 characters, keywords 100 bytes.
[Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information).

**App Review notes entered 2026-09-18**

```text
No sign-in is required. Tap “Start without an account” to review HealthyFlow as a Guest.

Guest mode includes the complete Local day: tasks, habits, goals, nutrition, weight, workouts, calendar integration, and 10 AI actions. AI features require an internet connection. Manual planning and tracking remain available without AI.

HealthyFlow v1 is free and contains no In-App Purchases, subscriptions, external purchase links, or paid unlocks. Cloud backup, cross-device sync, and device transfer are not available in v1.

Account deletion is available in Settings for users who choose to create an account. Sign in with Apple is supported.
```

The founder authorized completion of the review form. The private contact fields
were entered directly in App Store Connect and are not recorded here.

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

The founder approved five marketing screenshots in this order: Today, Talk,
Health, Nutrition, and Workouts. The iPhone 6.5-inch and iPad 13-inch sets were
uploaded to version 1.0 on 2026-09-18. Source assets and previews are in
`output/app-store/v1/screenshots/`.

## Code-derived data and SDK inventory

These are implementation facts, not completed App Privacy answers.

| Area | Data or access visible in source | Destination / SDK |
|---|---|---|
| Local day | goals, tasks, habits and progress, settings, food/calorie and weight history, workout plans/sessions/exercises, achievements | Capacitor Filesystem on the device |
| Account | name, email, role, authentication/provider identifiers | HealthyFlow backend and Supabase |
| AI | submitted text, optional images/files, assistant messages, structured results, usage and credit ledger | HealthyFlow backend, Supabase, OpenAI |
| Device Calendar (native v1) | External event title, time, all-day state, notes and location; timed Item title, date, time, duration and location; opaque EventKit identifiers after permission | Read and written in the iPhone app through EventKit; not sent to HealthyFlow by the Device Calendar path |
| Google Calendar (claimed Cloud only; web in the current build) | Google OAuth tokens, calendar event identifiers/content and sync state when connected | HealthyFlow backend, Supabase, Google Calendar APIs; Guest and claimed-free native v1 do not call this path |
| Contact | In-app form: request kind, message and reply-to address. Public support email: sender/reply address, message and attachments | Form: HealthyFlow backend and Supabase. Email: Resend, transient backend forwarding and the privately configured support inbox; not stored in the app database |
| Notifications | native device token or Web Push subscription | HealthyFlow backend, Supabase, APNs/Web Push |
| Device ID (from #308) | a random UUID kept in the iOS Keychain as a this-device-only item (survives reinstall, never synced or restored to another phone); one random ID per browser on the web. Sent with auth requests only; labels accounts in Admin, never read by a grant (ADR-0027) | HealthyFlow backend and Supabase (`users.device_id`) |
| Analytics | stable user ID; optional email/name/role/Guest state; typed product events, page paths, and session recordings that can include displayed text | PostHog; production bundle points to the EU ingestion host |
| Nutrition lookup | food query and selected nutrition result | Backend query to Open Food Facts. Fuder is a curated source link, not a query recipient in the current lookup implementation |

PostHog autocapture is disabled. Session recording is enabled with all inputs
masked; persistence uses local storage and a cookie. General displayed text is
not masked by the current source configuration: there is no `maskTextSelector`
or `ph-no-capture` protection. The typed catalog does not send AI prompt text,
but session recordings can include displayed chat, task and health text. App
Privacy must cover actual SDK behavior and current vendor terms, not only the
intended event catalog. See [PostHog's distinct input/text masking controls](https://posthog.com/docs/session-replay/privacy),
checked 2026-09-15. Production project settings were inspected on 2026-09-17:
recording is enabled for all sessions at 100% sampling, with normal masking
(inputs masked; displayed text/images unmasked). Console capture and network
timing capture are enabled; request/response header and body capture are off.
Recording retention is 30 days. Exception autocapture is off. The project's
public ingestion token matches the locally bundled native and web assets.
Native `capacitor://localhost` events were also visible in this project.
Client IP discarding is enabled, but a native event still contains city/country
and GeoIP coordinates with a 5 km accuracy radius: approximate location is
collected despite discarding the original IP. No analytics settings were changed.

The app and widget privacy manifests currently declare the shared App Group
`UserDefaults` required-reason API (`1C8F.1`), no tracking domains, and no
collected-data entries. That is not evidence that the App Privacy questionnaire
should say “no data collected”: Apple requires the developer to disclose both
first-party and third-party-partner collection and keep answers accurate.
[Apple App Privacy guidance](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
was rechecked on 2026-09-08.

Apple's App Privacy guidance says data processed only on the device is not
"collected" for the App Privacy answers. On that basis, the native Device
Calendar read/write path is not itself a collected data type. This is an
implementation inference, not the founder's completed questionnaire: if
Calendar-derived data is included in an explicit AI request or otherwise
transmitted later, that transmission must be assessed separately. The guidance
was rechecked on 2026-09-09 in
[App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/).

### Inferences for human review

- Account identifiers, AI submissions, contact requests, analytics identifiers,
  and connected-calendar data likely map to App Privacy data types.
- Whether each type is linked to identity, retained, or used for analytics or
  product personalization must be reconciled against production configuration,
  retention and each provider's current policy.
- Local storage, AI processing, and analytics need distinct answers. Invoking AI
  can transmit Local content, and session recording can transmit displayed
  content independently of an AI request.

Do not enter questionnaire answers from these inferences. The founder must
confirm the production configuration and, where appropriate, obtain privacy or
legal review.

## Public URL readiness and legal-content gate

Public routes were initially checked on 2026-09-08; the dated updates below
record subsequent content and delivery verification.

| Proposed field | URL | Technical status | Human gate |
|---|---|---|---|
| Privacy Policy URL | `https://healthyflow.app/app/privacy` | HTTP 200; `/privacy` redirects here | Founder authorized the free-v1 wording update on 2026-09-15. Copy distinguishes Local storage from AI, account, support, notifications and analytics processing; remaining submission decisions are recorded below. |
| Support URL | `https://healthyflow.app/app/support` | HTTP 200; `/support` redirects here | Founder selected `support@healthyflow.app` on 2026-09-15. Resend receiving and forwarding verified; web contact changes published and the Support/Privacy links checked in the browser. Shared iOS source uses the same address; an updated native build is still required. |
| Privacy choices URL | none proposed | Optional in App Store Connect | Founder/legal decision; do not invent one. |

Terms at `https://healthyflow.app/app/terms` now describes free v1 and its AI
allowances, with no purchase or non-refundable-fee clause. The founder explicitly
authorized this factual Terms/Privacy alignment on 2026-09-15. It does not
complete the App Store Connect declarations or certify legal compliance.

### Public support contact — 2026-09-15

- Founder approved `support@healthyflow.app` as the public contact for support,
  privacy and Terms questions.
- Resend receiving forwards support mail to the founder-selected private inbox.
  Netlify DNS now publishes MX priority 10 to
  `inbound-smtp.eu-west-1.amazonaws.com`; Resend reports receiving **verified**.
  The signature secret and forwarding destination are configured in Railway.
- Backend deployment `ecaca434-c3db-4778-b2a9-85d1765ee45e` is **SUCCESS**.
  A synthetic message to the support address arrived in the destination inbox
  on 2026-09-15 with its attachment and original Reply-To. Gmail's received
  headers show SPF, DKIM and DMARC passing. No reply was sent to a third party.
  The existing privacy alias is also handled and covered by automated tests.
- Frontend deployment `6aa99cd8b83fb81e1ed50357` published the contact changes.
  The live Support and Privacy pages show the working address; Terms already
  used it, and Settings now agrees. The shared source will reach iOS with the
  next native build; no new iOS binary was produced for this change.
- Verification: frontend typecheck/build and four relevant frontend tests;
  backend typecheck/build and 34 support-forwarding/account-email tests passed.
  The public webhook rejects unsigned requests. See
  [incoming support mail](deploy.md#incoming-support-mail) for operation,
  retry limits and the Gmail sending-identity limitation.
- At the time of the contact-only deployment, Privacy still said "save and sync
  your items", contrary to the issue comment. The separately authorized wording
  update below removes that claim.

### Free-v1 Terms and Privacy wording — 2026-09-15

- Founder authorized aligning and publishing the public Terms and Privacy pages
  with the shipped free-v1 behavior. Both carry the effective date 2026-09-15.
- Terms states that v1 has no purchases, explains the free AI allowances and
  discretionary Founders Club grants, and distinguishes Claim from Cloud backup
  or transfer. The existing general legal clauses were retained.
- Privacy distinguishes the iPhone Local day from server-held account and AI
  records, legacy Cloud, PostHog identity/events/replay, support email forwarding,
  in-app contact requests, notifications and optional integrations. It also
  describes native on-device voice transcription and browser-provided speech.
- Deletion/export wording follows the current implementation: Settings exports
  the server archive, not Local-only records; archived Talk remains stored;
  account deletion does not call PostHog or erase support email. The policy gives
  the support route for those requests instead of promising automatic erasure.
- Evidence: `src/pages/AssistantPage.tsx`, `src/services/api.ts`,
  `src/context/AuthContext.tsx`, `src/lib/local/services.ts`,
  `src/lib/analytics/posthogProvider.ts`, `ios/App/App/NativeSpeechPlugin.swift`,
  and backend account, AI, contact, mail and nutrition implementations.
- Remaining submission work: confirm provider retention settings and the
  process for external deletion requests; assess analytics/replay consent and
  the explicit permission flow for third-party AI. The current app has no
  dedicated analytics opt-out or AI-sharing consent gate in the reviewed source.
  Updating policy text does not implement those controls. Apple's
  [privacy requirements](https://developer.apple.com/app-store/review/guidelines/#privacy),
  checked 2026-09-15, require disclosure and explicit permission for personal-data
  sharing with third-party AI. These are separate implementation follow-ups;
  #237 remains the declaration/portal task, whose App Privacy answers must
  accurately reflect the implementation that ships.
- Published on 2026-09-16 in Netlify deployment
  `6aaa3f4051e407a6e4e920f5`. The production Privacy and Terms pages show the
  updated copy and effective date; their cross-link and support address were
  verified in the browser. The shared components are used in both web and native
  routes; no new native binary was built or uploaded for this copy update.
- Verification: `npm run typecheck`, `npm run build`, six existing iOS release
  checks, the existing browser startup test, and `git diff --check` passed.
  The browser test first hit the sandbox's local-server restriction; its approved
  rerun passed on 2026-09-16. Existing Browserslist and bundle-size/import warnings
  remain. Changes are uncommitted; #237's portal declarations remain open.

### App Store Connect declarations — updated 2026-09-18

HealthyFlow app record `6796305059` was inspected in the founder's authenticated
browser. The product version was aligned to **1.0.1** and remains **Prepare for
Submission**. Processed build `1.0.1 (4)` was temporarily selected on 2026-09-18,
then rejected during physical-device smoke because it contains the retired
personal support address. No Add for Review or Submit for Review action was taken.

| Declaration / field | Verified status |
|---|---|
| Privacy Policy URL | Saved `https://healthyflow.app/app/privacy` for English (U.S.) |
| Support URL | Saved `https://healthyflow.app/app/support` on version 1.0 |
| Listing copy | Founder-approved September 17: saved name `HealthyFlow: Daily Planner`, subtitle `Tasks, habits, food & fitness`, promotional text, description, keywords and marketing URL. Exact copy is in `output/app-store/v1/listing-draft.md`. Copyright is `2026 Ori Lerman`; primary category is Health & Fitness and secondary category is Productivity |
| Price | Saved zero-price schedule for all 175 storefront currencies, using the default US base. Pricing does not enable territory availability |
| In-app purchases / subscriptions | No in-app purchases, auto-renewable subscription groups, or non-renewing subscriptions present |
| Tax category | Saved `Fitness and Health`, matching the app's healthy-living focus |
| DSA | Founder directly selected the non-trader/no-EU option. Verified September 17: account-level Digital Services Act compliance is `Active`, and HealthyFlow App Information explicitly states non-trader for this app. The earlier trader-document workflow is no longer pending |
| Developer agreement | Verified September 17: Free Apps Agreement is `Active` and the prior license-agreement update warning is absent on the Business page. No agreement accepted by the agent. Paid Apps Agreement is `New` and unsigned |
| Territories | Saved September 17 with founder approval: all 175 countries or regions, including the EU, plus automatic inclusion of future storefronts. Portal shows `Available on App Release`. The app has not been released |
| Age rating / content rights / regulated medical device | Completed September 18. Calculated rating is 9+ in 172 regions (Vietnam 12+). Health or Wellness Topics is Yes; Medical or Treatment Information is None. Content Rights says the app has the necessary rights to third-party content. The app is declared not a regulated medical device in any country or region |
| App Privacy answers | Published September 18 with 14 collected data types. The public preview shows data linked to the user and diagnostics/identifier data not linked to the user; no type is declared as tracking |
| Release method | Saved `Manually release this version`, so approval cannot publish the app automatically |
| Review contact / demo account | Private contact information saved September 18. Sign-in is not required; review notes direct Apple to `Start without an account` and explain the Guest path. No private contact value or credential is committed here |
| Build candidate | `1.0.1 (4)` is stale and must not be submitted. Replacement build `1.0.1 (5)` is being prepared from the current source. `Add for Review` was not clicked |

The #237 portal declarations are complete. No private identity, contact details,
or credentials are recorded here.

**Submitted 2026-09-19, founder-reported, not portal-verified here.** The founder
submitted a build archived that day from `main`. What that leaves open is the
Device ID linkage answer above, the launch-day switches below, and the post-approval
verification in #238 — public product page, download and first launch, the Guest
and claimed entitlements, no purchase surface, the Local-only disclosure, and the
support and privacy links. Release is manual, so approval publishes nothing until
the founder acts. If review comes back with a request, it returns to its own P0
issue and repeats release-candidate verification before a new build goes up.

App Privacy publication, September 18: the saved types are Name, Email Address,
Health, Fitness, Coarse Location, Photos or Videos, Customer Support, Other User
Content, Search History, User ID, Device ID, Product Interaction, Performance
Data, and Other Diagnostic Data. Search History covers retained AI lookup/search
arguments in conversation tool events. Performance and diagnostics cover the
verified PostHog network timings and console logs. Name/email are sent through
analytics identification; native push registration also sends a device token.

All 14 types have purpose, linkage, and tracking answers. User ID and Device ID
use Analytics and App Functionality; Product Interaction uses Analytics. None
is marked as tracking because the reviewed implementation uses PostHog as a
first-party analytics processor and does not link the data with third-party
advertising data or share it with a data broker. The published preview was
reopened after publication. No App Review submission action was taken.

September 17 follow-up: the earlier trader setup reached document upload but
was not finalized before the session expired. After signing back in, the
founder directly completed the non-trader declaration instead. The agent read
the saved selection and `Active` compliance status without changing them.
This is the founder's self-assessment; company registration alone does not
determine trader status. HealthyFlow's app-specific non-trader status was also
verified, and worldwide availability was subsequently saved with founder approval.

## Smoke and release gates

| Gate | Current evidence | Release condition |
|---|---|---|
| Guest first launch | Fresh isolated iOS 18.6 simulator entered without retained identity | Repeat on final signed build |
| Local Today | Guest reached Today; Local day survived terminate/relaunch | Repeat on physical device |
| Real AI action | Talk returned a production answer for a non-sensitive empty-day prompt | Repeat on final candidate; verify counter decrements |
| Cloud unavailable | Cloud code disabled unless explicit build flag is true; release test covers it | Confirm no Cloud status/offer in signed build |
| Offline Local day | Local day rendered during a transient disconnected launch. Writing offline was broken until #279 — React Query paused every mutation while offline, so the day could be read but not changed | In airplane mode **add, complete, edit, delete and reorder** an Item and confirm each takes effect immediately, then reconnect and confirm they sync. Rendering offline is not evidence that writing works |
| Claim/sign-in/recovery | Source/tests exist; transactional recovery delivery is not configured | Complete issue #235 and test fresh account plus returning Apple authorization |
| Guest action grant | Reserved per network for 24 hours (ADR-0023). Migration applied and `GUEST_GRANT_IP_SECRET` set 2026-09-10 | Exhaust a disposable Guest on the candidate; confirm a second Guest on the same network is told the network reason and offered Claim |
| Device Calendar two-way | Reconciles both directions since #267; verified on a physical iPhone 2026-09-10 for move, rename, delete either side, and edit-while-quit | Repeat on the signed candidate. Deleting a HealthyFlow event in iOS Calendar deletes the linked Item — deliberate, and worth confirming the reviewer will not read it as data loss |
| Exhaustion | Automated credit tests cover typed exhaustion | Exhaust a disposable Guest and account on the candidate without altering real users |
| Founders Club | Production request path verified in issue #232 | Repeat from candidate |
| Account deletion | Route and tests exist | Confirm through UI using a disposable account; permanent action requires human confirmation at execution time |
| Deep links | `healthyflow://app/talk` and `healthyflow://app/privacy` routed correctly after the simulator's OS confirmation | Repeat every supported link on the signed build |
| Push and widget | Native integration and automated boundaries exist | Physical-device notification and widget refresh required |
| Archive/upload | Not attempted without credentials | Human signing, Archive validation, TestFlight upload and App Store Connect processing required |

## Order of work to launch

The board is the live state ([open P0s](https://github.com/lermanori/HealthyFlow/issues?q=is%3Aissue+is%3Aopen+label%3AP0));
this is the sequence and what each step waits on.

| # | Work | Who | Waits on |
|---|---|---|---|
| 1 | [#237](https://github.com/lermanori/HealthyFlow/issues/237) — App Store Connect declarations | **Founder only.** DSA trader status, territories, Free price and tax category, age rating, the regulated-medical-device declaration, App Privacy, review contact and demo account. Several need legal judgment; Apple will not decide trader status for you. | nothing — start here |
| 2 | [#290](https://github.com/lermanori/HealthyFlow/issues/290) — fail the build on a stale iOS bundle | Agent | nothing; run alongside #237 |
| 3 | [#289](https://github.com/lermanori/HealthyFlow/issues/289) — make the backend suite order-independent | Agent | nothing; run alongside #237 |
| 4 | Decide `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` | Founder | before any archive |
| 5 | [#238](https://github.com/lermanori/HealthyFlow/issues/238) — release candidate, upload, submit | Agent builds and smokes; founder submits | #237, and #290 first so the archive cannot ship a stale bundle |
| 6 | Turn on the iOS version gate | Founder | App Store approval |

Steps 2 and 3 are not launch blockers, but both exist because a silent failure
already cost real time, and step 5 is exactly where that failure is most
expensive. #238 carries a comment recording what is already verified, so the
smoke list is not repeated blindly.

## Launch-day switches

Nothing here happens on its own, and nothing else will remind you.

| Switch | Where | Value |
|---|---|---|
| Version gate | Railway | `IOS_VERSION_GATE_ENABLED`, `IOS_MINIMUM_VERSION`, `IOS_APP_STORE_URL`. Deliberately unset until an App Store URL exists (`backend/src/mobile-version.ts`) |
| Landing page App Store surface | `public/landing.html` | `data-ios-release="pending"` → `"live"` on the `<html>` element, then redeploy Netlify |
| Migrations | Supabase | Everything from `20260918120000` to `20260919100000` applied before the backend deploy |

The landing page carries a complete iPhone surface that one attribute reveals:
the `#iphone` section, its navigation link, and three App Store links — hero,
section and final band. While the attribute says `pending`, CSS hides all of it,
so no store link is reachable and Safari's Smart App Banner meta is never
inserted; both states were verified in a browser on 2026-09-19. The links carry
`utm_campaign` (or `utm_source`) over as Apple's own `ct` campaign token and
report `signup_cta_clicked` with `destination: 'app_store'`.
`src/utils/landingHeader.test.ts` guards the dark state, the single app record
`6796305059`, and that no store link claims the day is backed up.

Two deliberate omissions there, both founder decisions rather than oversights:

- The CTA is a plain button in the site's own style. Apple requires its badge
  artwork to be used unmodified from Apple's marketing resources, so the badge
  is a drop-in swap if it is wanted, never a redrawing.
- `Start free` stays the page's primary action and the store link is secondary,
  because the web app serves every device. On an iPhone, once the app is live,
  the reverse is arguably right — a copy decision for the day, not a code
  change.

## Exact human handoff

Start from clean, current `main`. Stop immediately if any source file or generated
native asset changes unexpectedly.

1. Run the complete validation gate in `docs/runbooks/ios.md`, then
   `npm run build:ios` once more.
2. Open `ios/App/App.xcodeproj`; select the final Apple team for both targets.
3. Confirm app and widget identifiers, App Group, Sign in with Apple, Push, and
   production Supabase configuration. Do not change identifiers after upload.
4. Install a signed Release build on an iOS 26 physical device and execute every
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
