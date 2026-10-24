#!/usr/bin/env bash
set -euo pipefail
mode="${1:-inspect}"
case "$mode" in inspect|apply) ;; *) exit 2 ;; esac
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?DEPLOY_HOST is required}"
task_dir="$(mktemp -d)"
remote_dir=""
cleanup() {
  rm -rf "$task_dir"
  if [[ -n "$remote_dir" ]]; then ssh "$server" "rm -rf '$remote_dir'" || true; fi
}
trap cleanup EXIT
python3 - "$task_dir/changes.json" <<'PY'
import json,os,sys
from pathlib import Path
value=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())['inputs']['employee_phone_changes']
changes=json.loads(value)
if not isinstance(changes,list) or not 1<=len(changes)<=20: raise SystemExit('Invalid batch')
Path(sys.argv[1]).write_text(json.dumps(changes))
os.chmod(sys.argv[1],0o600)
PY
remote_dir="$(ssh "$server" 'mktemp -d /tmp/reestr-phone-XXXXXXXX')"
[[ "$remote_dir" =~ ^/tmp/reestr-phone-[a-zA-Z0-9]+$ ]]
scp -q "$task_dir/changes.json" ops/change-employee-phones.cjs "$server:$remote_dir/"
ssh "$server" bash -s -- "$remote_dir" "$mode" <<'REMOTE'
set -euo pipefail
work="$1"
mode="$2"
if [[ "$mode" == apply ]]; then
  backup_output="$(APP_DIR=/opt/reestr/app bash /opt/reestr/app/ops/backup-reestr.sh)"
  backup_dir="${backup_output##*Backup completed: }"
  test -s "$backup_dir/postgres.dump"
  pg_restore --list "$backup_dir/postgres.dump" >/dev/null
  echo 'Backup verified'
fi
set -a
source /opt/reestr/app/backend/.env
set +a
cd /opt/reestr/app/backend
node "$work/change-employee-phones.cjs" "$work/changes.json" "$mode"
REMOTE
