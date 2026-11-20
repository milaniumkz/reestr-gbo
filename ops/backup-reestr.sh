#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>"${BACKUP_LOCK_FILE:-/run/lock/reestr-backup.lock}"
flock -n 9 || { echo "Backup already in progress" >&2; exit 1; }

APP_DIR="${APP_DIR:-/opt/reestr/app}"
BACKUP_DIR="${BACKUP_DIR:-/opt/reestr/backups}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_SCOPE="${BACKUP_SCOPE:-full}"
[[ "$BACKUP_SCOPE" == full || "$BACKUP_SCOPE" == database ]] || exit 1

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$BACKUP_DIR"
target="$BACKUP_DIR/$timestamp"
mkdir -p "$target"

pg_dump "${DATABASE_URL%%\?*}" --format=custom --no-owner --no-acl --file "$target/postgres.dump"

storage_root="${LOCAL_STORAGE_PATH:-/opt/reestr/storage}"
if [[ "$BACKUP_SCOPE" == database ]]; then
  : # Policy/session operations change PostgreSQL only; existing full backups remain intact.
elif [[ -d "$storage_root" ]]; then
  # Freeze the entry list after pg_dump. New uploads are not referenced by that
  # database snapshot. Avoid recursive directory reads while uploads add files,
  # but still fail if a listed object disappears, cannot be read or changes.
  file_list="$(mktemp "$target/.storage-files.XXXXXX")"
  trap 'rm -f "$file_list"' EXIT
  (cd "$storage_root" && find . -print0) > "$file_list"
  tar -C "$storage_root" --no-recursion --null --verbatim-files-from \
    --files-from "$file_list" -czf "$target/storage.tar.gz"
  rm -f "$file_list"
  trap - EXIT
else
  tar -czf "$target/storage.tar.gz" --files-from /dev/null
fi

cat > "$target/manifest.json" <<JSON
{
  "createdAt": "$timestamp",
  "appDir": "$APP_DIR",
  "database": "postgres",
  "scope": "$BACKUP_SCOPE",
  "storageRoot": "$storage_root",
  "retentionDays": $RETENTION_DAYS
}
JSON

if [[ "$BACKUP_SCOPE" == full ]]; then
  python3 "$APP_DIR/ops/prune-backups.py" "$BACKUP_DIR"
fi
echo "Backup completed: $target"
