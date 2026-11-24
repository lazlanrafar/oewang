#!/usr/bin/env bash
# Host side of the device flows on an Android emulator. Pipe `flutter drive`
# into it: every line is echoed, a screenshot cue (M2SHOT, M3SHOT, M4_SHOT,
# M5MARK) saves `adb exec-out screencap` to $SHOTS/<name>.png, and BACKKEY
# presses the system back key. The simulator loops use `xcrun simctl`
# instead; an emulator's files and keys are reached through adb.
#
#   fvm flutter drive -d emulator-5554 ... 2>&1 | integration_test/android_host.sh
set -u
adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
serial="${ANDROID_SERIAL:-emulator-5554}"
shots="${SHOTS:-/tmp/oew-android}"
mkdir -p "$shots"
while IFS= read -r line; do
  printf '%s\n' "$line"
  case "$line" in
    *M2SHOT\ * | *M3SHOT\ * | *M4_SHOT\ * | *M5MARK\ *)
      name="${line##* }"
      "$adb" -s "$serial" exec-out screencap -p > "$shots/$name.png" ;;
    *BACKKEY\ *)
      "$adb" -s "$serial" shell input keyevent KEYCODE_BACK ;;
  esac
done
