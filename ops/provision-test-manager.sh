#!/usr/bin/env bash
set -euo pipefail
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?DEPLOY_HOST is required}"
task_dir="$(mktemp -d)"
remote_dir=""
cleanup(){ rm -rf "$task_dir"; if [[ -n "$remote_dir" ]]; then ssh "$server" "rm -rf '$remote_dir'" || true; fi; }
trap cleanup EXIT
python3 - "$task_dir/test-manager.json" <<'PY'
import json,os,sys
from pathlib import Path
value=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())['inputs']['test_manager']
Path(sys.argv[1]).write_text(json.dumps(json.loads(value)))
os.chmod(sys.argv[1],0o600)
PY
remote_dir="$(ssh "$server" 'mktemp -d /tmp/reestr-test-manager-XXXXXXXX')"
[[ "$remote_dir" =~ ^/tmp/reestr-test-manager-[a-zA-Z0-9]+$ ]]
scp -q "$task_dir/test-manager.json" ops/provision-test-manager.cjs "$server:$remote_dir/"
ssh "$server" bash -s -- "$remote_dir" <<'REMOTE'
set -euo pipefail
work="$1"
backup_output="$(APP_DIR=/opt/reestr/app bash /opt/reestr/app/ops/backup-reestr.sh)"
backup_dir="${backup_output##*Backup completed: }"
test -s "$backup_dir/postgres.dump"
pg_restore --list "$backup_dir/postgres.dump" >/dev/null
echo 'Backup verified'
set -a
source /opt/reestr/app/backend/.env
set +a
cd /opt/reestr/app/backend
node "$work/provision-test-manager.cjs" "$work/test-manager.json"
REMOTE
