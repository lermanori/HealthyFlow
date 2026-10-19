#!/bin/sh
set -eu

test_dir=$(mktemp -d "${TMPDIR:-/tmp}/healthyflow-camera-tests.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
xcrun swiftc -module-cache-path "$test_dir/modules" \
  ios/App/App/TalkAttachmentsPlugin.swift tests/native/CameraAccessTests.swift \
  -o "$test_dir/camera-tests"
"$test_dir/camera-tests"
