#!/bin/sh
# #317: opt-in native Talk voice build. Never a release command.
set -eu
cd "$(dirname "$0")/.."
probe_target="${1:-simulator}"
probe_build_dir="${TMPDIR:-/tmp}/healthyflow-handsfree-probe"
npm run build:ios
case "$probe_target" in
  simulator)
    xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
      -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$probe_build_dir" \
      'SWIFT_ACTIVE_COMPILATION_CONDITIONS=DEBUG HANDSFREE_PROBE' \
      CODE_SIGNING_ALLOWED=NO build
    ;;
  device)
    xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
      -destination 'generic/platform=iOS' -derivedDataPath "$probe_build_dir" \
      'SWIFT_ACTIVE_COMPILATION_CONDITIONS=DEBUG HANDSFREE_PROBE' build
    ;;
  *) echo 'Usage: sh scripts/build-handsfree-probe.sh [simulator|device]' >&2; exit 2 ;;
esac
echo "Probe build: $probe_build_dir/Build/Products"
