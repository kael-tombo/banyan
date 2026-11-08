#!/usr/bin/env sh
# Restore a Banyan backup made by scripts/backup.sh into the Compose Postgres.
#
#   scripts/restore.sh backups/banyan-20261102-030000.dump [--yes]
#
# This REPLACES the current database contents. Stop web and worker first:
#   docker compose stop web worker
# then run this, then `docker compose up -d web worker`.
set -eu

FILE="${1:?usage: scripts/restore.sh <dump-file> [--yes]}"
CONFIRM="${2:-}"
DB_USER="${POSTGRES_USER:-banyan}"
DB_NAME="${POSTGRES_DB:-banyan}"

[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }
docker compose exec -T postgres pg_restore --list < "$FILE" > /dev/null || { echo "Not a readable dump: $FILE" >&2; exit 1; }

if [ "$CONFIRM" != "--yes" ]; then
  printf 'This replaces database "%s" with %s. Type the database name to continue: ' "$DB_NAME" "$FILE"
  read -r answer
  [ "$answer" = "$DB_NAME" ] || { echo "Cancelled."; exit 1; }
fi

docker compose exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --single-transaction < "$FILE"
echo "Restored $FILE into $DB_NAME. Run 'docker compose run --rm migrate' if the dump predates newer migrations."
