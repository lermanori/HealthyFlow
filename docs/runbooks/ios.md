# HealthyFlow for iOS

HealthyFlow ships the existing React application inside a Capacitor iOS shell.
The web application remains the product and source of business logic; native
code is used at the platform boundary where iOS adds meaningful value.

The intended minimum deployment target is iOS 17, but **the Xcode project does
not currently agree with itself**: the `App` target declares
`IPHONEOS_DEPLOYMENT_TARGET = 15.0` in one build configuration and `17.0` in the
other, while `HealthyFlowWidget` is `17.0` in both. Debug and Release can
therefore build against different OS floors. Reconcile this before relying on
any OS-gated API.

## What is implemented

- Native iOS project and App icon under `ios/`
- Native router base (`/` on iOS, `/app` on the web)
- Trusted custom-scheme routing and validation for future universal links
- Google OAuth through the system browser with
  `healthyflow://oauth/callback`
- Native Sign in with Apple through AuthenticationServices and Supabase Auth
- APNs registration, authenticated device storage, delivery, and stale-token
  pruning
- Native haptics, Share sheet, keyboard resizing, network state, splash screen,
  and theme-aware status bar
- A server-controlled minimum-version gate that can require an App Store update
- A small and medium Today widget backed by an App Group
- App and widget privacy manifests declaring the shared App Group
  `UserDefaults` required-reason API
- PWA service-worker and Web Push registration disabled inside the native shell

The Today widget is intentionally a native feature rather than a duplicate
application. React builds a small validated summary from the canonical
`DaySummary`; a local Capacitor plugin writes that summary into the shared App
Group; WidgetKit renders it and deep-links back into HealthyFlow.

## Local workflow

Install dependencies and build/sync the web bundle into Xcode:

```sh
npm install
npm run build:ios
```

Open the project:

```sh
npm run ios:open
```

Or choose a simulator from the command line:

```sh
npm run ios:run
```

`ios/App/App.xcodeproj` is committed. `scripts/configure-ios-project.rb` is the
idempotent project-wiring script for the custom Swift bridge and widget target;
run it only after recreating the Capacitor project. It requires the `xcodeproj`
Ruby gem.

After adding or removing a Capacitor dependency, always run
`npm run build:ios` so the native Swift package and copied web bundle stay in
sync.

## Apple Developer setup

The checked-in project uses these identifiers:

| Component | Identifier |
|---|---|
| iOS app | `app.healthyflow.mobile` |
| Today widget | `app.healthyflow.mobile.widget` |
| Shared App Group | `group.app.healthyflow.mobile` |
| Custom URL scheme | `healthyflow` |

Before installing on a real device or creating an archive:

1. Create the app and widget identifiers in the Apple Developer portal.
2. Enable Push Notifications, App Groups, and Sign in with Apple for the app
   identifier.
3. Enable the shared App Group for both the app and widget identifiers.
4. In Xcode, select the same development team for the `App` and
   `HealthyFlowWidget` targets and let Xcode manage signing.
5. Confirm these identifiers are final. Changing them later requires updating
   Capacitor config, Xcode build settings, entitlements, the widget bridge,
   APNs configuration, and App Store Connect.

The router already accepts trusted `healthyflow.app` links. To make iOS launch
the app for those HTTPS URLs, separately enable Associated Domains, add the
domain entitlement, and publish a valid `apple-app-site-association` file after
the Apple Team ID is known.

## Google OAuth setup

Add this exact redirect URL to the Supabase Auth redirect allowlist:

```text
healthyflow://oauth/callback
```

Google continues to redirect through Supabase; Supabase returns the PKCE code to
the installed app. The app exchanges it for a short-lived Supabase session,
sends that access token to the existing HealthyFlow Google-session endpoint,
then clears the provider session.

Test this on a physical device before TestFlight. A simulator verifies routing,
but it does not prove the production provider configuration.

## Sign in with Apple setup

The native app uses Apple's AuthenticationServices API. The checked-in app
target includes the Sign in with Apple capability and entitlement, but the
Developer portal and Supabase project still have to match:

1. Enable Sign in with Apple for the `app.healthyflow.mobile` App ID and refresh
   the app provisioning profile in Xcode.
2. In Supabase Auth, enable the Apple provider and add
   `app.healthyflow.mobile` to the accepted client IDs.
3. Apply `supabase/migrations/20260730130000_add_apple_auth.sql`.
4. Test first authorization and returning authorization on a physical device
   signed into an Apple ID. Apple supplies the person's name only on first
   authorization, so that path must be included in the smoke test.

This implementation is native-only: it exchanges Apple's identity token and
nonce directly with Supabase and does not expose an Apple OAuth button on the
web login page.

## APNs setup

Apply the native-device migration:

```text
supabase/migrations/20260730110000_add_native_push_devices.sql
```

Create an APNs token-signing key and configure the Railway backend:

```text
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_PRIVATE_KEY=
APNS_BUNDLE_ID=app.healthyflow.mobile
APNS_ENVIRONMENT=production
```

Use `sandbox` for a directly installed Debug build and `production` for
TestFlight/App Store builds. Store the `.p8` private key with literal `\n`
separators if the environment provider accepts only a single line.

Push registration must be tested on a physical device with signed entitlements.
The simulator build and backend tests validate the integration boundary but
cannot validate delivery from Apple's production service.

## Version gate and release order

The native shell checks `GET /api/mobile/version/ios` before starting the React
application and whenever iOS brings the app back to the foreground. If the
installed marketing version is lower than the configured minimum, HealthyFlow
shows a blocking update screen that links to the App Store. The web and PWA
builds do not run this gate.

Configure the Railway backend only after the App Store listing has its final
public URL:

```text
IOS_VERSION_GATE_ENABLED=true
IOS_MINIMUM_VERSION=1.0
IOS_LATEST_VERSION=1.0
IOS_APP_STORE_URL=https://apps.apple.com/app/healthyflow/id123456789
IOS_UPDATE_MESSAGE=A newer version of HealthyFlow is required to continue.
```

The gate is disabled unless `IOS_VERSION_GATE_ENABLED` is exactly `true`.
An enabled deployment with an invalid or incomplete policy returns an explicit
configuration error. If a launched app cannot reach the backend, it applies the
last enabled policy it received. A device with no cached policy is allowed to
start so a backend outage cannot lock out every installation. Receiving a live
disabled policy clears the cached policy.

An enabled policy resolves to one of three outcomes:

| Installed version | Outcome | Behaviour |
|---|---|---|
| Below `IOS_MINIMUM_VERSION` | blocked | Full-screen update screen; the app does not start |
| At or above the minimum, below `IOS_LATEST_VERSION` | outdated | The app runs; a dismissible banner offers the update |
| At or above `IOS_LATEST_VERSION` | supported | No update UI |

The soft banner is dismissed per released version, so raising
`IOS_LATEST_VERSION` asks again while a repeat dismissal of the same release
stays hidden. Setting `IOS_LATEST_VERSION` equal to `IOS_MINIMUM_VERSION`
disables the soft nudge without disabling the gate.

For every App Store release:

1. Increase `MARKETING_VERSION` for the user-visible release, for example
   `1.0` to `1.1`, and increase `CURRENT_PROJECT_VERSION` for every uploaded
   build. Keep the app and widget target values aligned.
2. Archive, upload, validate, and release the new build. Confirm it is available
   from the configured App Store URL.
3. Set `IOS_LATEST_VERSION` to the released marketing version. Older compatible
   clients keep working and start showing the dismissible update banner.
4. Raise `IOS_MINIMUM_VERSION` only when older clients are no longer compatible
   or must be retired. Never raise it before the replacement build is available.

Use numeric dot-separated marketing versions such as `1.2` or `1.2.3`; the
comparison is numeric, so `1.10` is newer than `1.9`. Test a forced update with
a TestFlight or locally signed build before enforcing a production minimum.

## App Store work still required

- Verify Sign in with Apple against the production App ID, provisioning
  profile, and Supabase provider configuration on a physical device.
- Decide how paid digital features are sold in the iOS app. The native shell
  currently hides HealthyFlow's manual purchase/contact CTAs; implement the
  approved StoreKit flow before offering iOS purchases.
- Create App Store Connect metadata, screenshots, privacy disclosures, support
  URL, age rating, and review notes.
- Test account creation, login, account deletion, notification opt-in, widget
  refresh, offline/reconnect behavior, and every deep link on a physical device.
- Run an archive validation in Xcode, distribute to internal TestFlight, and
  complete a fresh-account smoke test before external testing.

## Validation gate

Run:

```sh
npm run test:unit
npm run typecheck
npm run lint
npm --prefix backend run typecheck
npm --prefix backend test
npm run build:ios
```

Then build the `App` scheme for an iOS simulator and a signed physical device.
The simulator gate must include opening `healthyflow://app/privacy` and adding
the HealthyFlow Today widget from the widget gallery.
