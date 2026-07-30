# HealthyFlow for iOS

HealthyFlow ships the existing React application inside a Capacitor iOS shell.
The web application remains the product and source of business logic; native
code is used at the platform boundary where iOS adds meaningful value.

The current minimum deployment target is iOS 17.

## What is implemented

- Native iOS project and App icon under `ios/`
- Native router base (`/` on iOS, `/app` on the web)
- Trusted custom-scheme routing and validation for future universal links
- Google OAuth through the system browser with
  `healthyflow://oauth/callback`
- APNs registration, authenticated device storage, delivery, and stale-token
  pruning
- Native haptics, Share sheet, keyboard resizing, network state, splash screen,
  and theme-aware status bar
- A small and medium Today widget backed by an App Group
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
2. Enable Push Notifications and App Groups for the app identifier.
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

## App Store work still required

- Add Sign in with Apple or document why an App Review exception applies. The
  current app offers Google and password authentication; this decision should
  be resolved before submission.
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
