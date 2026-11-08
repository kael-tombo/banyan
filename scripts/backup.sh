#!/usr/bin/env sh
# Back up Banyan's Postgres from the Compose stack (blocker 10, US-068).
#
#   scripts/backup.sh [output-dir]        default: ./backups
#
# Writes a compressed custom-format dump (banyan-YYYYmmdd-HHMMSS.dump), checks
# it can be read back, and keeps the newest $BACKUP_KEEP (default 14).
# Ship the directory off the host (S3-compatible storage, rsync) with your
# scheduler; a backup that only lives next to the database is not a backup.
set -eu

OUT="${1:-./backups}"
KEEP="${BACKUP_KEEP:-14}"
DB_USER="${POSTGRES_USER:-banyan}"
DB_NAME="${POSTGRES_DB:-banyan}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="$OUT/banyan-$STAMP.dump"

mkdir -p "$OUT"
docker compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --compress=6 --no-owner > "$FILE.partial"
# A dump that cannot be listed is corrupt: fail loudly instead of keeping it.
docker compose exec -T postgres pg_restore --list < "$FILE.partial" > /dev/null
mv "$FILE.partial" "$FILE"
echo "Backup written: $FILE ($(wc -c < "$FILE") bytes)"

# Retention: newest $KEEP dumps survive.
ls -1t "$OUT"/banyan-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
  echo "Removed old backup: $old"
done
