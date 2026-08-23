#!/bin/sh
set -eu
[ $# -eq 1 ] || { echo "usage: sql.sh \"<select statement>\"" >&2; exit 2; }
root="$(cd "$(dirname "$0")/../../../.." && pwd)"
if [ -z "${POSTGRES_URL:-}" ] && [ -f "$root/.env" ]; then
  POSTGRES_URL="$(grep '^POSTGRES_URL=' "$root/.env" | head -1 | cut -d= -f2- | tr -d "'\"")"
fi
[ -n "${POSTGRES_URL:-}" ] || { echo "POSTGRES_URL not set and not found in $root/.env" >&2; exit 1; }

direct="$(printf %s "$POSTGRES_URL" | sed 's/-pooler\./\./')"

exec psql "${direct}&sslrootcert=system" -X -P pager=off -v ON_ERROR_STOP=1 \
  -c "BEGIN READ ONLY; $1; COMMIT;"
