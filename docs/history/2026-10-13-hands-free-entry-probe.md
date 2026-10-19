# Hands-free entry feasibility probe (#317)

This is a temporary native audio/entry test, not the conversational assistant or
the implementation of confirmed Tasks. It has no AI request, Salesforce request,
Task write or transcript persistence. Remove or absorb it after the entry/audio
question is answered. Ordinary builds do not compile the native entry plugin or
App Shortcut; its UI appears only when that plugin exists.

## Build

From the repository root:

```sh
sh scripts/build-handsfree-probe.sh simulator
# For a configured development signing identity and compatible physical device:
sh scripts/build-handsfree-probe.sh device
```

The script rebuilds and synchronizes the web bundle, then explicitly adds
`HANDSFREE_PROBE` to a Debug native build. It does not upload, submit, install or
change the release configuration. The default Xcode build does not enable it.
Use a disposable simulator for initial checks. The device build uses the existing
app identifier: installing it replaces that app's binary, so verify signing and
preserve its data; never uninstall the user's app to make this probe work.

## One-time setup (stationary, with the screen)

1. Install the probe build and open HealthyFlow. Finish normal app/session setup.
2. The voice-test panel offers English or Hebrew. Select the language and tap
   **Prepare microphone**. This requests microphone access and installs Apple's
   on-device model if supported. Captured setup audio is discarded.
3. A missing/unsupported model or denied permission is an explicit failure. There
   is no cloud or browser transcription fallback. Do not count an unsupported
   language as passing because English works.
4. Confirm Siri is enabled and the **Start Talk voice test** shortcut is visible
   in Shortcuts. A manually run Shortcut is useful debugging but is not a Siri
   invocation pass.

## Hands-free test

With the phone unlocked, say **“Siri, start Talk in HealthyFlow.”**

- Siri requests a foreground App Intent and records a one-use launch token.
- Once the authenticated app shell is ready, it consumes that token, opens the
  existing Talk route and speaks an explanation that no Tasks will be saved.
- Wait for the listening tone, then say “Call Maya tomorrow about the quote.”
- Pause for approximately 3.5 seconds. The app stops recording, finalizes the
  transcript and reads back the actual words it captured.
- It offers a second turn automatically. Say another sentence, or say **stop**
  (Hebrew: **עצור**) while listening.
- After two turns, or the spoken stop, it announces completion. No Tasks exist
  as a result of this probe.

The silence timer is deliberately a probe parameter, not the accepted natural
conversation policy. It must never be used as confirmation. This is turn-taking
audio: barge-in during playback, natural correction, AI responses and saving are
not implemented by this test. Siri trigger phrases are currently English; the
selected listening/readback locale may be Hebrew if supported on the device.

The token expires after 60 seconds and is consumed once. No token is encoded in
a general-purpose URL that arbitrary sites can use to start recording. Ordinary
launches do not start listening. Permission/model preparation is required before
the hands-free run. Backgrounding or stopping aborts the test; a new Siri
invocation is needed to restart. The visible Stop control is an emergency/manual
test control, not a required step in the successful route.

## Evidence to record

For each supported language and audio route, record build identity, device/iOS,
cold versus warm app state, whether Siri was recognized, whether any tap was
required, ready-tone audibility, first-word loss, transcript accuracy, automatic
second turn, stop behavior, interruption and error. Do not put personal speech
or business names in analytics. A simulator build cannot validate real Siri,
model availability, physical microphones, Bluetooth routing or zero-touch use.

Expected automated checks: frontend typecheck, probe endpoint/cancellation tests,
existing native-speech tests, frontend unit suite, production web build/native
sync, and opt-in native compilation including App Intents metadata extraction.
Record actual results in #317; do not mark the full issue complete on compilation.

## Initial device tooling observation

On 13 October 2026, the paired iPhone 14 Pro reported iOS 27.0. This Mac had
Xcode 26.4.1. `devicectl` reported that the developer disk image could not be
mounted and developer services were unavailable. Only Xcode.app was found under
/Applications. This is an observed physical testing blocker, not proof that the
Siri flow works. The Mac runs macOS 26.6.2 on Apple silicon, which meets Apple's
published host requirements for Xcode 27. Use compatible Xcode/device support or
a supported test iPhone, then repeat the real device checks. Apple's current
[Xcode requirements](https://developer.apple.com/xcode/system-requirements)
list Xcode 27 with iOS 27 device support.

## Verification observed on 13 October 2026

- `npm run typecheck`: pass.
- Focused probe and native speech tests: 13/13 pass (7 probe behavior checks and
  6 existing on-device dictation checks).
- `npm run build:ios`: pass, with current frontend assets copied into iOS.
- Opt-in Xcode simulator compilation: pass. App Intents metadata names
  `StartTalkProbeIntent`, includes both phrases, and requests foreground mode.
  The simulator app was compiled, not run through Siri.
- Ordinary Debug simulator compilation: pass. Its App Intents metadata contains
  no `StartTalkProbeIntent`, so the temporary Siri shortcut is absent without
  the explicit build flag.
- Full frontend unit run: 468/469 pass. The failing `iosRelease.test.ts`
  assertion expects four app/widget build-number `5` settings but finds two;
  the pre-spike project file already held two settings at `5` and two at `6`.
  This release identity issue belongs to the separate signed-release work and
  was not changed for this probe.
- No physical Siri invocation, microphone capture, Hebrew model check, Bluetooth
  test, conversation latency measurement or zero-touch success measurement was
  possible on the paired iOS 27 phone with the installed Xcode 26.4.1 tools.
- The test implements native Siri entry, tone, two turn-taking capture/readback
  cycles, spoken stop and background cancellation. It does not provide natural
  assistant inference, barge-in, Task review or Task creation. Issue #317 remains
  open until those measurements and the transport comparison are made.
