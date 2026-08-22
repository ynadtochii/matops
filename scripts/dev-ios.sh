#!/usr/bin/env bash
#
# One command to prepare and run the whole matops stack for iOS:
#   - the Next.js web + tRPC API on http://localhost:3004 (the mobile app calls it;
#     port 3000 is left free on purpose)
#   - the Expo student app in the iOS Simulator (Metro on :8081)
#
# It installs dependencies if needed, starts the web/API server, waits for it to
# answer, then hands off to apps/expo/scripts/run-ios.sh (boot simulator, start
# Metro, build+install the dev client the first time, launch the app).
#
# Env-tolerant: optional keys are never required. Missing email (Resend) / push
# (EAS) config just no-ops; the magic-link sign-in URL prints to THIS terminal.
#
# One Ctrl-C stops everything (web server + Metro).
#
# Usage:
#   pnpm dev:ios                 # an iPhone on the newest installed iOS
#   pnpm dev:ios "iPhone Air"    # pick a simulator
#
set -uo pipefail

WEB_PORT=3004
DEVICE="${1:-}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# ── 1. Prepare ──────────────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  echo "▶ Installing dependencies…"
  pnpm install
fi

if [ ! -f .env ]; then
  echo "⚠ No .env at repo root — sign-in and data need POSTGRES_URL + AUTH_SECRET."
  echo "  Email (RESEND_*) and push (EAS project id) are optional and just no-op."
fi

# Free the ports this script owns so a leftover from a previous run can't block
# the start (Next.js 16 allows only one dev server per project; a stale Metro
# shifts to a different port and confuses the launcher). We only touch 3004 and
# 8081 — never 3000, which is kept free on purpose.
free_port() {
  local pids
  pids="$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "▶ Freeing port $1 (stale process)…"
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1
  fi
}
free_port "$WEB_PORT"
free_port 8081

# ── Teardown: one Ctrl-C stops web + Metro ──────────────────────────────────
NEXT_PID=""
cleanup() {
  echo ""
  echo "▶ Shutting down…"
  [ -n "$NEXT_PID" ] && kill "$NEXT_PID" 2>/dev/null || true
  # Metro is started detached by the iOS script; stop it by its port.
  lsof -nP -iTCP:8081 -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── 2. Web + API on :$WEB_PORT ──────────────────────────────────────────────
# Stream UI (not the interactive TUI) so it runs cleanly in the background and
# the [auth] magic-link URL still prints for sign-in.
echo "▶ Starting web + API on http://localhost:${WEB_PORT}…"
pnpm exec turbo watch dev -F @matops/nextjs... --ui stream &
NEXT_PID=$!

echo "▶ Waiting for the API to answer…"
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://localhost:${WEB_PORT}"; then
    echo "  API is up."
    break
  fi
  sleep 1
done

# ── 3. iOS Simulator: boot, Metro, build/launch the dev client ──────────────
echo "▶ Booting the iOS app…"
bash "$ROOT_DIR/apps/expo/scripts/run-ios.sh" ${DEVICE:+"$DEVICE"}

echo ""
echo "✓ Web + API: http://localhost:${WEB_PORT}   ·   iOS app: running in the Simulator."
echo "  Sign in: copy the '[auth] magic link …' URL from the web logs above into"
echo "  Safari in the Simulator (no email provider needed — it prints to this terminal)."
echo "  Press Ctrl-C to stop everything."
echo ""

# Keep running so the web server stays up; Ctrl-C triggers cleanup.
wait "$NEXT_PID"
