#!/bin/sh
set -eu

root="$(cd "$(dirname "$0")/../../../.." && pwd)"

if [ -z "${MATOPS_PROD_READONLY_URL:-}" ]; then
  MATOPS_PROD_READONLY_URL="$(security find-generic-password -a "$USER" -s matops-prod-debug-db -w 2>/dev/null || true)"
fi

if [ -z "$MATOPS_PROD_READONLY_URL" ]; then
  echo "No MatOps production read-only URL was found in the macOS Keychain." >&2
  echo "Read .claude/skills/debug/references/database-setup.md." >&2
  exit 1
fi

export MATOPS_PROD_READONLY_URL
cd "$root"
exec pnpm db:debug -- "$@"
