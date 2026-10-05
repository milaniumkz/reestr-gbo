#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/reestr/app}"
BACKUP_DIR="${BACKUP_DIR:-/opt/reestr/backups}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/$timestamp"
mkdir -p "$target"

pg_dump "${DATABASE_URL%%\?*}" --format=custom --no-owner --no-acl --file "$target/postgres.dump"

storage_root="${LOCAL_STORAGE_PATH:-/opt/reestr/storage}"
if [[ -d "$storage_root" ]]; then
  tar -C "$storage_root" -czf "$target/storage.tar.gz" .
else
  tar -czf "$target/storage.tar.gz" --files-from /dev/null
fi

cat > "$target/manifest.json" <<JSON
{
  "createdAt": "$timestamp",
  "appDir": "$APP_DIR",
  "database": "postgres",
  "storageRoot": "$storage_root",
  "retentionDays": $RETENTION_DAYS
}
JSON

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
echo "Backup completed: $target"
