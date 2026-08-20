# Mission: Siri Capture for HealthyFlow

## Why
Make HealthyFlow fast to capture into when someone cannot or does not want to
open the app, while preserving Talk's editable, human-in-the-loop review.

## Success looks like
- Explain how a Siri utterance crosses the Swift, App Group, Capacitor, and React boundaries.
- Implement and test an “Add to HealthyFlow” App Shortcut on a physical iPhone.
- Never turn dictated text directly into an Item or spend AI credits without review.

## Constraints
- HealthyFlow remains a React application inside a Capacitor iOS shell.
- The iOS deployment target is intended to be iOS 17. Note the Xcode project
  currently declares 15.0 in one `App` build configuration and 17.0 in the other
  — confirm the real floor before depending on a 17-only App Intents API.
- Captures must work offline and should work while the device is locked.
- Existing App Group `group.app.healthyflow.mobile` is the native shared store.

## Out of scope
- Cross-device capture synchronization.
- Direct Siri creation of Tasks, Habits, or other records.
- A broad App Entity or Spotlight indexing system.
