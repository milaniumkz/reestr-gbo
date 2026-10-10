#!/usr/bin/env bash
set -euo pipefail
mode="${1:-inventory}"
case "$mode" in inventory|apply) ;; *) exit 2;; esac
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?DEPLOY_HOST is required}"
if [[ "$mode" == inventory ]]; then
 ssh "$server" 'bash -se' <<'REMOTE'
set -a
source /opt/reestr/app/backend/.env
set +a
psql "${DATABASE_URL%%\?*}" -X -v ON_ERROR_STOP=1 -c 'SELECT type, count(*) FROM "Organization" GROUP BY type; SELECT count(*) AS certificates FROM "Certificate"; SELECT count(*) AS inspections FROM "Inspection";'
REMOTE
 exit
fi
remote_dir="$(ssh "$server" 'mktemp -d /tmp/reestr-purge.XXXXXXXX')"
scp "$script_dir/purge-inspection-data.sql" "$server:$remote_dir/purge.sql"
ssh "$server" bash -se -- "$remote_dir" <<'REMOTE'
set -euo pipefail
remote_dir="$1"
trap 'systemctl start reestr-backend reestr-admin; rm -rf -- "$remote_dir"' EXIT
systemctl stop reestr-backend reestr-admin
backup_output="$(APP_DIR=/opt/reestr/app bash /opt/reestr/app/ops/backup-reestr.sh)"
printf '%s\n' "$backup_output"
backup_dir="${backup_output##*Backup completed: }"
test -s "$backup_dir/postgres.dump"
pg_restore --list "$backup_dir/postgres.dump" >/dev/null
tar -tzf "$backup_dir/storage.tar.gz" >/dev/null
set -a
source /opt/reestr/app/backend/.env
set +a
psql "${DATABASE_URL%%\?*}" -X -v ON_ERROR_STOP=1 -f "$remote_dir/purge.sql"
systemctl start reestr-backend reestr-admin
for attempt in {1..30}; do
 if curl -fsS http://127.0.0.1:3000/api/v1/health; then exit 0; fi
 sleep 2
done
exit 1
REMOTE
