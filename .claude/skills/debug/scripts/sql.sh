#!/bin/sh
set -eu

target=dev
if [ "${1:-}" = "--prod" ]; then
  target=prod
  shift
fi

[ $# -eq 1 ] || { echo "usage: sql.sh [--prod] \"<select statement>\"" >&2; exit 2; }

root="$(cd "$(dirname "$0")/../../../.." && pwd)"

read_url() {
  grep '^POSTGRES_URL=' "$1" | head -1 | cut -d= -f2- | tr -d "'\""
}

if [ "$target" = prod ]; then
  POSTGRES_URL="${POSTGRES_URL_PROD:-$(security find-generic-password -s matops-prod-db -w 2>/dev/null || true)}"
  [ -n "$POSTGRES_URL" ] || {
    echo "No production URL. Store it once in the Keychain:" >&2
    echo "  security add-generic-password -a \"\$USER\" -s matops-prod-db -w" >&2
    echo "(it prompts for the value, so it never reaches shell history)" >&2
    exit 1
  }
elif [ -z "${POSTGRES_URL:-}" ] && [ -f "$root/.env" ]; then
  POSTGRES_URL="$(read_url "$root/.env")"
fi

[ -n "${POSTGRES_URL:-}" ] || {
  echo "No POSTGRES_URL for target '$target'." >&2
  exit 1
}

direct="$(printf %s "$POSTGRES_URL" | sed 's/-pooler\./\./')"
case "$direct" in
  *sslmode=*) direct="$(printf %s "$direct" | sed 's/sslmode=[A-Za-z-]*/sslmode=verify-full/')" ;;
  *\?*) direct="${direct}&sslmode=verify-full" ;;
  *) direct="${direct}?sslmode=verify-full" ;;
esac

host="$(printf %s "$direct" | sed -E 's|^[^@]*@([^/?]+).*|\1|')"
echo "target: $target  host: $host" >&2

exec psql "${direct}&sslrootcert=system" -X -P pager=off -v ON_ERROR_STOP=1 \
  -c "BEGIN READ ONLY; $1; COMMIT;"
