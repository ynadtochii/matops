#!/usr/bin/env bash
#
# Run the matops mobile app on the iOS Simulator — one command.
#
# It boots (or reuses) a simulator, opens the Simulator window, makes sure the
# Metro bundler is running, builds+installs the dev client the first time, then
# cold-launches the app straight into the bundle.
#
# We drive everything through `xcrun simctl` on purpose. `expo run:ios` uses an
# AppleScript to bring the Simulator to the front, and macOS blocks that unless
# the terminal has Automation permission — that block is what makes `pnpm ios`
# exit with an error even though the build succeeded. simctl does not need it.
#
# Usage:
#   pnpm -F @matops/expo mobile                 # default device
#   pnpm -F @matops/expo mobile "iPhone Air"    # pick a device
#
set -euo pipefail

DEVICE="${1:-iPhone 17 Pro}"
APP_ID="com.matops.app"                  # matches app.config.ts bundleIdentifier
APP_SCHEME="matops"                      # matches app.config.ts `scheme`
METRO_URL="http://localhost:8081"
# Launch the dev client into a specific Metro bundle. The scheme MUST be one the
# installed app registers — the app's own custom scheme (`matops`) or `exp+<slug>`.
# `exp+expo://` is Expo Go's scheme; nothing registers it here, so opening it
# fails with LSApplicationWorkspaceErrorDomain error 115. `url` is percent-encoded
# so the inner `://` isn't misparsed as part of the outer URL.
METRO_URL_ENC="http%3A%2F%2Flocalhost%3A8081"
DEEP_LINK="${APP_SCHEME}://expo-development-client/?url=${METRO_URL_ENC}"

# Repo root = two levels up from apps/expo/scripts.
EXPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$EXPO_DIR/../.." && pwd)"

echo "▶ Simulator: $DEVICE"
if xcrun simctl list devices booted | grep -q '(Booted)'; then
  echo "  already booted — reusing it"
else
  xcrun simctl boot "$DEVICE"
fi
open -a Simulator

# Start Metro only if nothing is already serving on 8081.
if lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "▶ Metro already running on :8081"
else
  echo "▶ Starting Metro…"
  ( cd "$ROOT_DIR" && nohup pnpm -F @matops/expo dev >/tmp/matops-metro.log 2>&1 & )
  for _ in $(seq 1 40); do
    lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 1
  done
  echo "  Metro log: /tmp/matops-metro.log"
fi

# First run only: build + install the native dev client. `expo run:ios` will
# still error at its final AppleScript step, so we ignore its exit code — the
# build + install both finish before that.
if xcrun simctl get_app_container booted "$APP_ID" >/dev/null 2>&1; then
  echo "▶ App already installed — skipping native build"
else
  echo "▶ First run: building the native dev client (a few minutes)…"
  ( cd "$ROOT_DIR" && pnpm -F @matops/expo ios --device "$DEVICE" ) || true
fi

echo "▶ Launching app into the Metro bundle…"
xcrun simctl terminate booted "$APP_ID" >/dev/null 2>&1 || true
sleep 1
xcrun simctl openurl booted "$DEEP_LINK"

echo "✓ Done. The app is bundling in the Simulator (first bundle takes ~20s)."
echo "  Backend must also be up for sign-in/data:  pnpm dev:next"
